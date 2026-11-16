#!/usr/bin/env node
// Run from a game's repo root.
//   node <kit>/kit.mjs pull <path to game-kit checkout> <tag or commit> [component...]   copies components into ./kit and locks them
//   node kit/kit.mjs list | search <word>                                              the catalogue of every component (pulled or not), from kit/CATALOG.md
//   node kit.mjs state                                                                  (game-kit checkout) prints what is open (PLAN rows not done, waiting, watch)
//   node kit.mjs next-id [n] [--from <PLAN.md>...]                                     (game-kit checkout) the next free K number(s): origin/main and every open PR's docs/PLAN.md
//   node kit.mjs next-id [n] --reserve                                                 also reserves the ids on origin (refs/kit-reserved/K<n>) so no other session gets them
//   node kit.mjs worktree --branch <b> | worktree --here | finish [--comment] | teardown --worktree <dir>   worker commands, plain node (scripts/agent.mjs, pulled as kit/agent.mjs); finish prints PASS|FAIL <sha>
//   node kit/kit.mjs check                                                              fails if ./kit differs from kit/kit.lock.json
import { execFileSync as x, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
  const todo = names.length ? [...names] : Object.keys(lock.components)
  for (let i = 0; i < todo.length; i++) {
    const n = todo[i]
    fs.rmSync('kit/' + n, { recursive: true, force: true })
    fs.mkdirSync('kit/' + n, { recursive: true })
    const tar = x('git', ['-C', src, 'archive', commit, 'components/' + n], { maxBuffer: 1 << 30 })
    x('tar', ['-xf', '-', '--strip-components=2', '-C', 'kit/' + n], { input: tar })
    const cj = 'kit/' + n + '/component.json'
    if (fs.existsSync(cj)) for (const m of JSON.parse(fs.readFileSync(cj, 'utf8')).needs ?? []) if (!todo.includes(m)) { if (lock.components[m]) console.log(m + ' kept at ' + lock.components[m].ref + ' (needed by ' + n + ')'); else todo.push(m) }
    lock.components[n] = { ref, commit, files: Object.fromEntries(walk('kit/' + n).map((f) => [f, sha(f)])) }
  }
  fs.writeFileSync('kit/kit.mjs', x('git', ['-C', src, 'show', commit + ':kit.mjs']))
  try { fs.writeFileSync('kit/agent.mjs', x('git', ['-C', src, 'show', commit + ':scripts/agent.mjs'], { stdio: ['ignore', 'pipe', 'ignore'] })) } catch { /* a ref before the worker commands */ }
  if (fs.existsSync('kit/agent.mjs')) lock.agent = sha('kit/agent.mjs')
  fs.writeFileSync(LOCK, JSON.stringify(lock, null, 1) + '\n')
  try { fs.writeFileSync('kit/CATALOG.md', x('git', ['-C', src, 'show', commit + ':docs/CATALOG.md'], { stdio: ['ignore', 'pipe', 'ignore'] })) } catch { /* a ref with no catalogue */ }
  console.log('pulled ' + Object.entries(lock.components).map(([n, c]) => n + '@' + c.ref).join(', '))
} else if (cmd === 'state') {
  x('node', [dirname(fileURLToPath(import.meta.url)) + '/scripts/state.mjs'], { stdio: 'inherit' })
} else if (cmd === 'worktree' || cmd === 'finish' || cmd === 'teardown') {
  process.exit(spawnSync('node', [[dirname(fileURLToPath(import.meta.url)) + '/agent.mjs', dirname(fileURLToPath(import.meta.url)) + '/scripts/agent.mjs'].find((p) => fs.existsSync(p)), cmd, ...a], { stdio: 'inherit' }).status ?? 2)
} else if (cmd === 'next-id') {
  const ff = a.indexOf('--from')
  const cnt = Number(a.find((v, i) => /^\d+$/.test(v) && (ff < 0 || i < ff)) ?? 1)
  let texts
  if (ff >= 0) texts = a.slice(ff + 1).map((f) => fs.readFileSync(f, 'utf8'))
  else {
    const plan = (r) => x('git', ['show', r + ':docs/PLAN.md'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    try { x('git', ['fetch', '-q', 'origin']) } catch { console.error('warning: fetch failed, using the local origin/main') }
    texts = [plan('origin/main')]
    try {
      for (const { number } of JSON.parse(x('gh', ['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number'], { encoding: 'utf8' }))) {
        try { x('git', ['fetch', '-q', 'origin', 'pull/' + number + '/head:refs/kit-next-id/' + number, '--force']); texts.push(plan('refs/kit-next-id/' + number)) } catch { /* PR without docs/PLAN.md */ }
      }
    } catch { console.error('warning: gh missing or offline, only origin/main was read: an open PR may already use the number') }
  }
  const top = Math.max(0, ...texts.flatMap((t) => [...t.matchAll(/^\|\s*K(\d+)\s*\|/gm)].map((m) => Number(m[1]))))
  let ids = Array.from({ length: cnt }, (_, i) => top + 1 + i)
  let res = 0
  try { res = Math.max(0, ...x('git', ['ls-remote', 'origin', 'refs/kit-reserved/*'], { encoding: 'utf8' }).split(/\r?\n/).map((l) => Number(l.match(/refs\/kit-reserved\/K(\d+)$/)?.[1] ?? 0))) } catch { /* no origin */ }
  if (res >= ids[0]) ids = ids.map((n) => n + res + 1 - ids[0])
  if (a.includes('--reserve')) {
    // a reservation is a ref refs/kit-reserved/K<n> on origin, pushed only if absent (empty lease): the second session's push fails, it takes the next number
    const out = []
    for (let n = ids[0]; out.length < cnt; n++) {
      try { x('git', ['push', '-q', '--force-with-lease=refs/kit-reserved/K' + n + ':', 'origin', 'origin/main:refs/kit-reserved/K' + n], { stdio: 'pipe' }); out.push(n) } catch (e) {
        if (!/stale info|already exists|rejected/i.test(String(e.stderr))) { console.error('reserve failed: ' + String(e.stderr).trim()); process.exit(1) }
      }
    }
    ids = out
  }
  console.log(ids.map((n) => 'K' + n).join(' '))
} else if (cmd === 'check') {
  const lock = readLock()
  const bad = []
  for (const [n, c] of Object.entries(lock.components)) {
    const have = fs.existsSync('kit/' + n) ? walk('kit/' + n) : []
    for (const f of have) if (c.files[f] !== sha(f)) bad.push((f in c.files ? 'changed ' : 'added   ') + f)
    for (const f of Object.keys(c.files)) if (!have.includes(f)) bad.push('missing ' + f)
    const cj = 'kit/' + n + '/component.json'
    if (fs.existsSync(cj)) for (const m of JSON.parse(fs.readFileSync(cj, 'utf8')).needs ?? []) if (!lock.components[m]) bad.push(n + ' needs ' + m + ' (not pulled)')
  }
  if (lock.agent && (!fs.existsSync('kit/agent.mjs') || sha('kit/agent.mjs') !== lock.agent)) bad.push('changed kit/agent.mjs')
  if (bad.length) {
    console.error('kit/ differs from kit/kit.lock.json. Change the code in the game-kit repo and pull a new version; never edit this copy.\n' + bad.join('\n'))
    process.exit(1)
  }
  console.log('kit ok: ' + (Object.entries(lock.components).map(([n, c]) => n + '@' + c.ref).join(', ') || 'no components'))
} else if (cmd === 'list' || cmd === 'search') {
  const d = dirname(fileURLToPath(import.meta.url))
  const f = [d + '/CATALOG.md', d + '/docs/CATALOG.md'].find((p) => fs.existsSync(p))
  if (!f || (cmd === 'search' && !a.length)) { console.error(f ? 'usage: kit.mjs search <word>' : 'no CATALOG.md beside kit.mjs: pull again'); process.exit(2) }
  const secs = fs.readFileSync(f, 'utf8').split(/^## /m).slice(1).map((t) => t.split(/\r?\n/))
  const words = a.map((w) => w.toLowerCase())
  const exportsOf = (n) => {
    const out = new Set()
    const seen = new Set()
    const scan = (file) => {
      if (seen.has(file)) return
      seen.add(file)
      const src = fs.readFileSync(file, 'utf8')
      for (const m of src.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|class|interface|type|enum)\s+(\w+)/gm)) out.add(m[1])
      for (const m of src.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/gm)) {
        for (const e of m[1].split(',')) { const w = e.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop(); if (w) out.add(w) }
        if (m[2]) next(file, m[2])
      }
      for (const m of src.matchAll(/^export\s+\*(?:\s+as\s+(\w+))?\s*from\s*['"]([^'"]+)['"]/gm)) { if (m[1]) out.add(m[1]); else next(file, m[2]) }
    }
    const next = (from, rel) => {
      if (!rel.startsWith('.')) return
      const b = resolve(dirname(from), rel)
      const f = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js'].map((e) => b + e).find((q) => fs.existsSync(q) && fs.statSync(q).isFile())
      if (f) scan(f)
    }
    for (const c of [d + '/components/' + n, d + '/' + n]) {
      const f = ['index.ts', 'index.tsx', 'index.js', 'index.mjs'].map((e) => c + '/' + e).find((q) => fs.existsSync(q))
      if (f) { scan(f); break }
    }
    return [...out]
  }
  for (const [n, , purpose, , use] of secs) {
    let hit = []
    if (cmd === 'search') {
      const text = (n + purpose + use).toLowerCase()
      const ex = exportsOf(n)
      if (!words.every((w) => text.includes(w) || ex.some((e) => e.toLowerCase().includes(w)))) continue
      hit = ex.filter((e) => words.some((w) => !text.includes(w) && e.toLowerCase().includes(w)))
    }
    console.log(n + ': ' + (cmd === 'list' ? '' : (purpose ?? '').split(/(?<=\.)\s/)[0].slice(0, 200) + ' ') + (use ?? '').replace('- **Use it when:** ', '(use when: ') + (use ? ')' : '') + (hit.length ? ' [export: ' + hit.slice(0, 8).join(', ') + ']' : ''))
  }
} else if (cmd === 'new') {
  // node <kit>/kit.mjs new <dir> <id> "<Name>" [--ref r] [--repo owner/name] [--runner label] [--link <node_modules>] [--no-install] [--no-remote] [--ports file] [--existing]
  const flags = {}
  const pos = []
  for (let i = 0; i < a.length; i++) if (a[i] === '--no-install') flags.install = false; else if (a[i] === '--no-remote') flags.remote = false; else if (a[i] === '--existing') flags.existing = true; else if (a[i].startsWith('--')) flags[a[i].slice(2)] = a[++i]; else pos.push(a[i])
  const [dir, id, name] = pos
  const d = dirname(fileURLToPath(import.meta.url))
  if (!name || !fs.existsSync(d + '/components/scaffold/scaffold.js')) { console.error('usage (from the game-kit checkout): node kit.mjs new <dir> <id> "<Name>" [--ref r] [--repo owner/name] [--runner label] [--link <node_modules>] [--no-install] [--no-remote] [--existing] [--ports file]'); process.exit(2) }
  const { newGame } = await import(pathToFileURL(d + '/components/scaffold/newgame.js').href)
  try { newGame({ dir, id, name, kit: d, ...flags, remote: flags.remote !== false }) } catch (e) { console.error(e.message); process.exit(1) }
} else {
  console.error('usage: kit.mjs pull <game-kit checkout> <ref> [component...] | kit.mjs check | kit.mjs next-id [n] [--reserve] | kit.mjs state | kit.mjs worktree|finish|teardown | kit.mjs list | kit.mjs search <word> | kit.mjs new <dir> <id> "<Name>"')
  process.exit(2)
}
