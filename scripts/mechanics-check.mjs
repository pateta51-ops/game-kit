// K524: the gate on docs/mechanics.json (the mechanics map behind docs/recipes/mechanics.md).
//   node scripts/mechanics-check.mjs [root]   root defaults to this checkout
// Fails when: a line's part is not a component (unless the line says `pending: K<n>` and that row is not done);
// a line says `pending` and that row is done; a `.md` a line tells you to read is not in the part's folder or docs/recipes;
// a backticked name in `read` is in no file of the part's folder (or of an `also` part); a component or candidate row is named by no line
// and has no `mechanics: "none: <reason>"` (catalog-notes.json entry, or the row's front matter);
// a search of `searches` does not print a `mechanic:` line first that names the expected part.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRows, isCandidate } from './plan.mjs'

const top = path.resolve(process.argv[2] ?? path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const J = (...p) => path.join(top, ...p)
const { lines, searches = {} } = JSON.parse(fs.readFileSync(J('docs', 'mechanics.json'), 'utf8'))
const notes = JSON.parse(fs.readFileSync(J('docs', 'catalog-notes.json'), 'utf8'))
const names = fs.readdirSync(J('components'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
const rows = loadRows(top)
const row = (id) => rows.find((r) => r.id === id)
const none = (v) => /^none: \S/.test(v ?? '')
const bad = []
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : /\.(md|[mc]?[jt]sx?|json|py|css|tpl)$/.test(e.name) ? [path.join(d, e.name)] : [])
const texts = {}
const textOf = (p) => texts[p] ??= walk(J('components', p)).map((f) => fs.readFileSync(f, 'utf8')).join('\n')
const named = new Set()
for (const m of lines) {
  const w = '"' + m.words + '"'
  if (!m.words?.trim()) { bad.push('a line has no words'); continue }
  if (m.row && !row(m.row)) bad.push(`${w}: row ${m.row} is not in docs/plan`)
  if (m.row) named.add(m.row)
  if (m.pending && !row(m.pending)) bad.push(`${w}: pending row ${m.pending} is not in docs/plan`)
  const open = m.pending && row(m.pending) && !/^done/i.test(row(m.pending).state ?? '')
  if (m.pending && row(m.pending) && !open) bad.push(`${w}: row ${m.pending} is done: drop pending and name what it built`)
  for (const p of [m.part, ...(m.also ?? [])].filter(Boolean)) {
    named.add(p)
    if (names.includes(p)) continue
    if (!m.pending) bad.push(`${w}: ${p} is not a component (name an open row with pending: K<n>, or drop the part)`)
    else if (!open) bad.push(`${w}: row ${m.pending} is done and ${p} is still not a component`)
  }
  if (m.part && names.includes(m.part) && /`/.test(m.read ?? '')) {
    const text = [m.part, ...(m.also ?? [])].filter((p) => names.includes(p)).map(textOf).join('\n')
    for (const [, c] of m.read.matchAll(/`([^`]+)`/g)) if (!text.includes(c)) for (const t of c.match(/[A-Za-z_$][\w$]{2,}/g) ?? []) if (!text.includes(t)) bad.push(`${w}: \`${t}\` is not in components/${m.part}/ (guide, README or code)`)
  }
  if (m.part && names.includes(m.part)) for (const [f] of (m.read ?? '').matchAll(/[\w-]+\.md\b/g)) {
    if (!fs.existsSync(J('components', m.part, f)) && !fs.existsSync(J('docs', 'recipes', f))) bad.push(`${w}: ${f} is not in components/${m.part}/ or docs/recipes/`)
  }
}
for (const n of names) if (!named.has(n) && !none(notes[n]?.mechanics)) bad.push(`${n}: no line of docs/mechanics.json names this component; add one, or "mechanics": "none: <reason>" to its entry in docs/catalog-notes.json`)
for (const r of rows.filter(isCandidate)) if (!named.has(r.id) && !none(r.mechanics)) bad.push(`${r.id}: no line of docs/mechanics.json names this candidate row; add one (row: "${r.id}"), or "mechanics: none: <reason>" to docs/plan/${r.file}`)
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mech-'))
for (const [q, part] of Object.entries(searches)) {
  const out = spawnSync('node', [J('kit.mjs'), 'search', ...q.split(' ')], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } }).stdout ?? ''
  const first = out.split('\n')[0]
  if (!first.startsWith('mechanic: ') || !first.split(' -> ')[1]?.includes('`' + part + '`')) bad.push(`search "${q}": the first line must be a mechanic: line naming \`${part}\`; got: ${first.slice(0, 120) || '(nothing)'}`)
}
fs.rmSync(home, { recursive: true, force: true })
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log(`mechanics ok: ${lines.length} lines, ${Object.keys(searches).length} searches`)
