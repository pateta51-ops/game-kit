import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] ?? 'components'
const bad = []
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/
const REL = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"](\.{1,2}(?:\/[^'"]*)?)['"]/g
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
  for (const f of walk(dir).filter((f) => CODE.test(f))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(REL)) {
      const target = path.resolve(path.dirname(f), m[1])
      const rel = path.relative(dir, target)
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) continue
      const top = path.relative(path.resolve(root), target).split(path.sep)
      const ok = !top[0].startsWith('..') && top[0] !== '' && needs.includes(top[0])
      if (!ok) bad.push(`${n}: ${path.relative(dir, f)} imports ${m[1]} outside its folder`)
    }
  }
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log(`components ok: ${dirs.length}`)
