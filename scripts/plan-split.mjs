// One-off (K281): splits docs/PLAN.md into docs/plan/K<n>.md rows and docs/plan/_template.md. Kept for the record; do not run again.
import fs from 'node:fs'
import { key } from './plan.mjs'

const lines = fs.readFileSync('docs/PLAN.md', 'utf8').replace(/\r\n/g, '\n').split('\n')
const out = [], seen = new Set()
let sec = '', order = 0, cols = null, ph = false
fs.mkdirSync('docs/plan', { recursive: true })
for (const l of lines) {
  const h = l.match(/^#{2,3}\s+(.*)/)
  if (h) { sec = h[1].trim(); cols = null; ph = false }
  if (/^\|\s*(Batch|Row|#)\s*\|/.test(l)) cols = l.replace(/^\||\|$/g, '').split('|').map(key)
  const c = l.replace(/^\||\|$/g, '').split('|').map((x) => x.trim())
  if (cols && /^\|\s*(K\d+[a-z]?|-)\s*\|/.test(l) && cols[1] !== 'row') {
    if (c.length !== cols.length) throw new Error('cells ' + l.slice(0, 40))
    const dup = seen.has(c[0]), fn = c[0] === '-' ? 'open-' + order : dup ? c[0] + '-2' : c[0]
    seen.add(c[0])
    fs.writeFileSync('docs/plan/' + fn + '.md', ['---', ...(dup || c[0] === '-' ? ['id: ' + c[0]] : []), 'section: ' + sec, 'order: ' + (order += 10), ...cols.slice(2).map((k, j) => k + ': ' + c[j + 2]), '---', c[1], ''].join('\n'))
    if (!ph) { out.push('<!-- rows: ' + sec + ' -->'); ph = true }
    continue
  }
  out.push(l)
}
fs.writeFileSync('docs/plan/_template.md', out.join('\n'))
console.log(seen.size + ' rows')
