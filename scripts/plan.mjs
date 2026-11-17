// docs/plan/K<n>.md (one file per plan row) + docs/plan/_template.md -> docs/PLAN.md.
//   node scripts/plan.mjs          write docs/PLAN.md
//   node scripts/plan.mjs --check  fail when it is stale
// Row file: front matter (`section`, `order`, then one key per extra table column, lowercase, spaces as '-'), then the content line.
// Template: PLAN.md with `<!-- rows: <heading> -->` where a table's K rows go; the header line above says the columns.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const key = (h) => h.trim().toLowerCase().replace(/\s+/g, '-')
export function loadRows(top) {
  const dir = path.join(top, 'docs', 'plan')
  const rows = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n')
    const m = t.match(/^---\n([\s\S]*?)\n---\n([\s\S]*?)\n?$/)
    if (!m) throw new Error('docs/plan/' + f + ': no front matter (--- ... --- then the content line)')
    const r = { file: f, id: f.replace(/(-\d+)?\.md$/, ''), content: m[2].trim() }
    for (const l of m[1].split('\n')) { const i = l.indexOf(':'); r[l.slice(0, i)] = l.slice(i + 1).trim() }
    r.n = Number(r.id.replace(/\D/g, '') || 0)
    return r
  })
  const rank = {}
  for (const r of rows) if (r.order) rank[r.section] = Math.min(rank[r.section] ?? Infinity, Number(r.order))
  const k = (r) => [rank[r.section] ?? Infinity, r.order ? Number(r.order) : Infinity, r.n]
  return rows.sort((a, b) => { const p = k(a), q = k(b); return p[0] !== q[0] ? (p[0] < q[0] ? -1 : 1) : p[1] !== q[1] ? (p[1] < q[1] ? -1 : 1) : p[2] !== q[2] ? p[2] - q[2] : a.file.localeCompare(b.file) })
}
export function render(top) {
  const rows = loadRows(top)
  const tpl = fs.readFileSync(path.join(top, 'docs', 'plan', '_template.md'), 'utf8').replace(/\r\n/g, '\n').split('\n')
  return tpl.flatMap((l, i) => {
    const m = l.match(/^<!-- rows: (.*) -->$/)
    if (!m) return [l]
    const cols = tpl[i - 2].replace(/^\||\|$/g, '').split('|').map(key)
    return rows.filter((r) => r.section === m[1]).map((r) => '| ' + [r.id, r.content, ...cols.slice(2).map((c) => r[c] ?? '')].join(' | ') + ' |')
  }).join('\n')
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const top = path.dirname(path.dirname(fileURLToPath(import.meta.url))), f = path.join(top, 'docs', 'PLAN.md'), text = render(top)
  if (process.argv[2] === '--check') {
    if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n') !== text) { console.error('docs/PLAN.md is stale: run node scripts/plan.mjs'); process.exit(1) }
  } else fs.writeFileSync(f, text)
}
