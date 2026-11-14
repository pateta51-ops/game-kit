#!/usr/bin/env node
// Run from a game's repo root.
//   node <kit>/kit.mjs pull <path to game-kit checkout> <tag or commit> [component...]   copies components into ./kit and locks them
//   node kit/kit.mjs check                                                              fails if ./kit differs from kit/kit.lock.json
import { execFileSync as x } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
const [cmd, ...a] = process.argv.slice(2)
const LOCK = 'kit/kit.lock.json'
const sha = (f) => {
  const b = fs.readFileSync(f)
  return createHash('sha256').update(b.includes(0) ? b : b.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')
}
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name])).sort()
const readLock = () => (fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : { components: {} })
if (cmd === 'pull') {
  const [src, ref, ...names] = a
  const commit = x('git', ['-C', src, 'rev-parse', ref + '^{commit}'], { encoding: 'utf8' }).trim()
  const lock = readLock()
  for (const n of names.length ? names : Object.keys(lock.components)) {
    fs.rmSync('kit/' + n, { recursive: true, force: true })
    fs.mkdirSync('kit/' + n, { recursive: true })
    const tar = x('git', ['-C', src, 'archive', commit, 'components/' + n], { maxBuffer: 1 << 30 })
    x('tar', ['-xf', '-', '--strip-components=2', '-C', 'kit/' + n], { input: tar })
    lock.components[n] = { ref, commit, files: Object.fromEntries(walk('kit/' + n).map((f) => [f, sha(f)])) }
  }
  fs.writeFileSync('kit/kit.mjs', x('git', ['-C', src, 'show', commit + ':kit.mjs']))
  fs.writeFileSync(LOCK, JSON.stringify(lock, null, 1) + '\n')
  console.log('pulled ' + Object.entries(lock.components).map(([n, c]) => n + '@' + c.ref).join(', '))
} else if (cmd === 'check') {
  const lock = readLock()
  const bad = []
  for (const [n, c] of Object.entries(lock.components)) {
    const have = fs.existsSync('kit/' + n) ? walk('kit/' + n) : []
    for (const f of have) if (c.files[f] !== sha(f)) bad.push((f in c.files ? 'changed ' : 'added   ') + f)
    for (const f of Object.keys(c.files)) if (!have.includes(f)) bad.push('missing ' + f)
  }
  if (bad.length) {
    console.error('kit/ differs from kit/kit.lock.json. Change the code in the game-kit repo and pull a new version; never edit this copy.\n' + bad.join('\n'))
    process.exit(1)
  }
  console.log('kit ok: ' + (Object.entries(lock.components).map(([n, c]) => n + '@' + c.ref).join(', ') || 'no components'))
} else {
  console.error('usage: kit.mjs pull <game-kit checkout> <ref> [component...] | kit.mjs check')
  process.exit(2)
}
