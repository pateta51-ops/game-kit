// K524: the gate on docs/mechanics.json (the mechanics map behind docs/recipes/mechanics.md).
//   node scripts/mechanics-check.mjs [root]   root defaults to this checkout
// Fails when: a line's part is not a component (unless the line says `pending: K<n>` and that row is not done);
// a line says `pending` and that row is done; a `.md` a line tells you to read is not in the part's folder or docs/recipes;
// a backticked name in `read` is not a name of the part (or of an `also` part): an exported name, a member of an exported type, or a file,
// tests, comments and prose not counted (K585); a component or candidate row is named by no line
// and has no `mechanics: "none: <reason>"` (catalog-notes.json entry, or the row's front matter);
// a line has no `sheet` key, or one that is no id of SHEET_QUESTIONS in components/plan-checker/plancheck.py (K584);
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
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
// K585: the names a line may put in backticks: every file of the part, and from its code files that are not tests (comments removed)
// each exported name and each member (key, method, string value) of an exported type or interface
const known = {}
const namesOf = (p) => known[p] ??= (() => {
  const s = new Set()
  for (const f of walk(J('components', p))) {
    const b = path.basename(f)
    s.add(b).add(b.replace(/\.[^.]+$/, ''))
    if (/\.py$/.test(b) && !/^test_/.test(b)) for (const m of fs.readFileSync(f, 'utf8').matchAll(/^(?:def|class)\s+(\w+)/gm)) s.add(m[1])
    if (!/\.[mc]?[jt]sx?$/.test(b) || /\.(test|spec)\./.test(b)) continue
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    for (const chunk of code.split(/^(?=[A-Za-z@])/m)) {
      const d = chunk.match(/^export\s+(?:declare\s+)?(?:default\s+)?(?:async\s+)?(function\*?|const|let|var|class|type|interface)\s+([A-Za-z_$][\w$]*)/)
      if (d) s.add(d[2])
      for (const n of chunk.match(/^export\s+(?:type\s+)?\{([^}]*)\}/)?.[1].split(',') ?? []) { const w = n.trim().split(/\s+as\s+/).pop().replace(/^type\s+/, '').trim(); if (w) s.add(w) }
      if (d && /^(type|interface)$/.test(d[1])) for (const m of chunk.matchAll(/([A-Za-z_$][\w$]*)\??\s*[:(]|'([A-Za-z_$][\w$]*)'|"([A-Za-z_$][\w$]*)"/g)) s.add(m[1] ?? m[2] ?? m[3])
    }
  }
  return s
})()
const named = new Set()
// K584: every line names a question of the game sheet (SHEET_QUESTIONS in plancheck.py, the one place they are written)
const qids = JSON.parse(fs.readFileSync(J('components', 'plan-checker', 'plancheck.py'), 'utf8').match(/^SHEET_QUESTIONS = (\[[\s\S]*?\]\])/m)[1]).map(([k]) => k)
for (const m of lines) {
  const w = '"' + m.words + '"'
  if (!m.words?.trim()) { bad.push('a line has no words'); continue }
  if (!qids.includes(m.sheet)) bad.push(`${w}: ${m.sheet ? `sheet "${m.sheet}" is no question of the game sheet` : 'no sheet key'} (name one of: ${qids.join(', ')})`)
  if (m.tool &&!fs.existsSync(J('tools', m.tool, 'README.md'))) bad.push(`${w}: tools/${m.tool}/README.md is missing`)
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
    const sets = [m.part, ...(m.also ?? [])].filter((p) => names.includes(p)).map(namesOf)
    for (const [, c] of m.read.matchAll(/`([^`]+)`/g)) for (const t of c.match(/[A-Za-z_$][\w$]{2,}/g) ?? []) if (!sets.some((k) => k.has(t))) bad.push(`${w}: \`${t}\` is not in components/${m.part}/ (an exported name, a member of an exported type, or a file)`)
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
