// Writes docs/CATALOG.md, docs/ARCHITECTURE.md and docs/recipes/mechanics.md (from docs/mechanics.json) from components/*/component.json, README.md and docs/catalog-notes.json.
//   node scripts/catalog.mjs          write the file
//   node scripts/catalog.mjs --check  fail when the file is stale or a component has no note
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from './plan.mjs'

const top = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const J = (...p) => path.join(top, ...p)
const rd = (f) => fs.readFileSync(f, 'utf8')
const arg = process.argv[2]

const notes = JSON.parse(rd(J('docs', 'catalog-notes.json')))
const names = fs.readdirSync(J('components'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
const bad = []

const EXP = /^export\s+(?:declare\s+)?(?:async\s+)?(?:default\s+)?(function\*?|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm
const LIST = /^export\s+(type\s+)?\{([^}]*)\}(?:\s+from\s+['"]([^'"]+)['"])?/gm
const STAR = /^export\s+(?:type\s+)?\*\s+from\s+['"]([^'"]+)['"]/gm
function exportsOf(file, seen = new Set()) {
  if (seen.has(file) || !fs.existsSync(file)) return []
  seen.add(file)
  const src = rd(file)
  const out = []
  for (const m of src.matchAll(EXP)) out.push({ n: m[2], t: m[1] === 'type' || m[1] === 'interface' })
  for (const m of src.matchAll(LIST)) for (const p of m[2].split(',')) {
    const s = p.trim().replace(/^type\s+/, '')
    if (s) out.push({ n: s.split(/\s+as\s+/).pop(), t: !!m[1] || /^type\s/.test(p.trim()) })
  }
  for (const m of src.matchAll(STAR)) {
    const base = path.resolve(path.dirname(file), m[1])
    const f = [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')].find((x) => fs.existsSync(x) && fs.statSync(x).isFile())
    if (f) out.push(...exportsOf(f, seen))
  }
  return out
}

const purpose = (readme) => {
  const lines = readme.split(/\r?\n/)
  const i = lines.findIndex((l) => l.trim() && !l.startsWith('#'))
  return i < 0 ? '' : lines[i].trim()
}
const one = (s) => s.replace(/\s+/g, ' ').trim()

const parts = []
const deps = {}
const table = []
for (const n of names) {
  const dir = J('components', n)
  let meta
  try { meta = JSON.parse(rd(path.join(dir, 'component.json'))) } catch { bad.push(`${n}: component.json unreadable`); continue }
  const note = notes[n]
  if (!note || !note.use || !note.not) { bad.push(`${n}: add use and not to docs/catalog-notes.json`); continue }
  if (!note.title || !Array.isArray(note.tags) || note.tags.length < 3) { bad.push(`${n}: add title and at least 3 tags to docs/catalog-notes.json`); continue }
  if (note.title.trim().split(/\s+/).length > 8) { bad.push(`${n}: title is over 8 words`); continue }
  if (typeof note.visible !== 'boolean' || ![1, 1.1, 1.2, 1.3].includes(note.release)) { bad.push(`${n}: add visible (true or false) and release (1.0, 1.1, 1.2 or 1.3) to docs/catalog-notes.json`); continue }
  const readme = fs.existsSync(path.join(dir, 'README.md')) ? 'components/' + n + '/README.md' : null
  const text = readme ? purpose(rd(J(readme))) : (note.what ?? '')
  let ex
  if (note.exports) ex = note.exports
  else {
    const entry = (note.entry ?? ['index.ts']).map((f) => path.join(dir, f))
    const all = entry.flatMap((f) => exportsOf(f))
    const seen = new Set()
    const vals = all.filter((e) => !seen.has(e.n) && seen.add(e.n))
    const v = vals.filter((e) => !e.t).map((e) => e.n)
    const t = vals.filter((e) => e.t).map((e) => e.n)
    const shown = [...v, ...t].slice(0, 14)
    ex = shown.map((s) => '`' + s + '`').join(', ') + (v.length + t.length > 14 ? `, and ${v.length + t.length - 14} more` : '')
    if (!shown.length) bad.push(`${n}: no exports found; give "exports" or "entry" in docs/catalog-notes.json`)
  }
  deps[n] = meta.needs ?? []
  const needs = (meta.needs ?? []).map((x) => `[\`${x}\`](#${x})`).join(', ') || 'nothing'
  const origin = one(String(meta.source?.game ?? ''))
  parts.push(
    `## ${n}\n\n` +
    `${one(text)}\n\n` +
    `- **Also called:** ${note.title}\n` +
    (note.looks ? `- **Looks like:** ${note.looks}\n` : '') +
    `- **Words:** ${note.tags.join(', ')}\n` +
    `- **Release:** ${note.release.toFixed(1)}; ${note.visible ? 'seen on screen' : 'not seen'}\n` +
    (note.gameSupplies ? `- **The game supplies:** ${note.gameSupplies}\n` : '') +
    `- **Use it when:** ${note.use}\n` +
    `- **Not for:** ${note.not}\n` +
    `- **Key exports:** ${ex}\n` +
    `- **Needs:** ${needs}\n` +
    `- **Came from:** ${origin.length > 160 ? origin.slice(0, 157) + '...' : origin}\n` +
    `- **Docs:** ${readme ? `[README](../${readme}) ([rules for agents](../${readme}#rules-for-agents))` : `[component.json](../components/${n}/component.json)`}\n` +
    Object.keys(notes).filter((k) => k.startsWith(n + '/')).map((k) => {
      const p = notes[k]
      if (!p.title || !p.use || !Array.isArray(p.tags) || p.tags.length < 3 || !p.guide || !fs.existsSync(path.join(dir, p.guide))) { bad.push(`${k}: a part inside a component needs title, use, at least 3 tags and guide (a file in components/${n}/)`); return '' }
      return `\n### ${k}\n\n- **Also called:** ${p.title}\n- **Words:** ${p.tags.join(', ')}\n- **Use it when:** ${p.use}\n- **Guide:** [${p.guide}](../components/${n}/${p.guide})\n`
    }).join(''),
  )
  table.push(`| [\`${n}\`](#${n}) | ${note.use.split(/[.;]/)[0]} |`)
}
for (const k of Object.keys(notes)) if (!names.includes(k) && !names.includes(k.split('/')[0])) bad.push(`${k}: in docs/catalog-notes.json but not a component`)
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }

const body =
  '# Component catalog\n\nGenerated by `node scripts/catalog.mjs` (run by `npm run check`; do not edit). Facts come from each `component.json` and README; the use/not-for lines from `docs/catalog-notes.json`; `release` is the first game release that uses the part (motion that games run at speed 0 in 1.0 is 1.0; 1.1 only for effects, 1.2 sound and music, 1.3 voice); which games pulled what: `node scripts/state.mjs --games`. Start at [AGENTS.md](../AGENTS.md); task guides are in [recipes](recipes/).\n\n' +
  '| Component | Use it when |\n|---|---|\n' + table.join('\n') + '\n\n' + parts.join('\n')
const id = (x) => x.replace(/\W/g, '_')
const used = new Set(Object.values(deps).flat())
const arch =
  '# Architecture\n\nGenerated by `node scripts/catalog.mjs` (do not edit). Built from each `component.json` `needs` only, not from actual imports (`npm run check` fails an import that escapes a component folder). Components have no layer field. An arrow `a --> b` means a needs b. Details: [CATALOG.md](CATALOG.md).\n\n' +
  '```mermaid\ngraph LR\n' + names.filter((n) => deps[n]).map((n) => deps[n].length ? deps[n].map((d) => `  ${id(n)}["${n}"] --> ${id(d)}["${d}"]`).join('\n') : `  ${id(n)}["${n}"]`).join('\n') + '\n```\n\n' +
  '## Leaf parts nothing needs\n\n' + (names.filter((n) => deps[n] && !used.has(n)).map((n) => `- \`${n}\``).join('\n') || 'none') + '\n'
// K524: docs/mechanics.json -> docs/recipes/mechanics.md, the page `kit.mjs search` reads in the kit and in a game
const mechFile = J('docs', 'mechanics.json')
const q = (x) => '`' + x + '`'
const answer = (m) => m.tool ? 'tool ' + q(m.tool) + ' (tools/' + m.tool + ')' + (m.read ? ': read ' + m.read : '') : !m.part ? 'not in the kit' + (m.row ? ' (candidate ' + m.row + ')' : '') + (m.note ? ': ' + m.note : '')
  : (m.missing ? 'partly: ' : '') + q(m.part) + (m.read ? ': read ' + m.read : '') + (m.also?.length ? '; also ' + m.also.map(q).join(', ') : '') + (m.missing ? '; missing: ' + m.missing : '') + (m.row ? '; candidate ' + m.row : '') + (m.pending ? ' (pending: ' + m.pending + ')' : '')
const cell = (t) => t.replace(/\|/g, '\\|')
const pages = [['CATALOG.md', body], ['ARCHITECTURE.md', arch], ['PLAN.md', render(top)]]
if (fs.existsSync(mechFile)) pages.push(['recipes/mechanics.md', '# Mechanics map\n\nGenerated by `node scripts/catalog.mjs` from `docs/mechanics.json` (do not edit). One line per mechanic in the words a planner types; `node kit.mjs search <words>` prints the matching line first. The answer is the part and what to read (a `.md` named alone sits in the part\'s folder), "partly" with what is missing, or "not in the kit" with its candidate row. "pending: K<n>" means an open row is building the part: it is not in the kit yet.\n\n| Mechanic | Answer |\n|---|---|\n' +
  JSON.parse(rd(mechFile)).lines.map((m) => `| ${cell(m.words)} | ${cell(answer(m))} |`).join('\n') + '\n'])
let stale = 0
for (const [f, text] of pages) {
  const file = J('docs', ...f.split('/'))
  if (arg === '--check') {
    if (!fs.existsSync(file) || rd(file).replace(/\r\n/g, '\n') !== text) { console.error(`docs/${f} is stale: run node scripts/catalog.mjs`); stale = 1 }
  } else if (fs.existsSync(path.dirname(file))) fs.writeFileSync(file, text)
}
if (stale) process.exit(1)
console.log(`catalog ${arg === '--check' ? 'ok' : 'written'}: ${names.length}`)
