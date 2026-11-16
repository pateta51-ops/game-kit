import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.argv[2] ?? '.', 'components')
const bad = []
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/
const REL = /['"`](\.\.(?:\/[^'"`\n]*)?)['"`]/g
const NAME = String.raw`((?:@[\w~.-]+\/)?[A-Za-z][\w~.-]*(?:\/[\w./-]*)?)`
const BARE = new RegExp(String.raw`^(?:\s*(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?|\s*\}\s*from\s*)['"]` + NAME + `['"]`, 'gm')
const TESTISH = /(\.test\.|\.e2e\.|[\\/]fake[\\/]|[\\/]examples?[\\/]|\.d\.ts$)/
const BUILTIN = new Set(['fs', 'path', 'os', 'child_process', 'url', 'crypto', 'util', 'worker_threads', 'zlib', 'http', 'net', 'readline', 'stream', 'events', 'assert', 'buffer', 'module'])
const pkgOf = (x) => (x.startsWith('@') ? x.split('/').slice(0, 2).join('/') : x.split('/')[0])
const dirs = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []
for (const n of dirs) {
  const dir = path.resolve(root, n)
  let meta
  try {
    meta = JSON.parse(fs.readFileSync(path.join(dir, 'component.json'), 'utf8'))
  } catch {
    bad.push(`${n}: component.json missing or not valid JSON`)
    continue
  }
  const s = meta.source
  if (typeof meta.name !== 'string' || !meta.name) bad.push(`${n}: name missing`)
  if (!s || typeof s.game !== 'string' || typeof s.commit !== 'string' || !Array.isArray(s.paths)) bad.push(`${n}: source needs game, commit, paths`)
  if (!Array.isArray(meta.needs) || meta.needs.some((x) => typeof x !== 'string')) bad.push(`${n}: needs must be an array of component names`)
  if ('licence' in meta && typeof meta.licence !== 'string') bad.push(`${n}: licence must be a string`)
  const needs = Array.isArray(meta.needs) ? meta.needs : []
  for (const x of needs) if (!dirs.includes(x)) bad.push(`${n}: needs ${x}, which is not a component folder`)
  const pk = meta.packages ?? []
  if (!Array.isArray(pk) || pk.some((x) => typeof x !== 'string' || !/^(@[a-z0-9~._-]+\/)?[a-z0-9~._-]+$/.test(x))) bad.push(`${n}: packages must be bare package names`)
  const used = new Set()
  for (const f of walk(dir).filter((f) => CODE.test(f))) {
    if (!TESTISH.test(f)) for (const m of fs.readFileSync(f, 'utf8').matchAll(BARE)) if (!m[1].startsWith('node:') && !BUILTIN.has(m[1])) used.add(pkgOf(m[1]))
    for (const m of fs.readFileSync(f, 'utf8').matchAll(REL)) {
      const target = path.resolve(path.dirname(f), m[1])
      const rel = path.relative(dir, target)
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) continue
      const top = path.relative(path.resolve(root), target).split(path.sep)
      const ok = !top[0].startsWith('..') && top[0] !== '' && needs.includes(top[0])
      if (!ok) bad.push(`${n}: ${path.relative(dir, f)} imports ${m[1]} outside its folder`)
    }
  }
  if (Array.isArray(pk)) for (const u of used) if (!pk.includes(u)) bad.push(`${n}: imports package ${u} that component.json packages does not list`)
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log(`components ok: ${dirs.length}`)
