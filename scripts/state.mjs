// Prints the state of the kit from docs/PLAN.md (rows not done, by section) and docs/evaluation/GAPS.md (watch items).
//   node scripts/state.mjs [root]   prints the page (also: node kit.mjs state)
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const top = args.find((a) => !a.startsWith('--')) ?? path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const rd = (...p) => fs.readFileSync(path.join(top, ...p), 'utf8')
const isDone = (s) => /^(done|covered|closed)\b/i.test(s)
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
const short = (s) => {
  s = s.replace(/^\([^)]*\)\s*/, '').replace(/`/g, '')
  const m = s.match(/^.*?(?:[:.;]|\s-\s)/)
  s = (m ? m[0].slice(0, -1) : s).trim()
  return s.length > 70 ? s.slice(0, 67).trimEnd() + '...' : s
}

const sections = [], waiting = []
let cur = null, st = -1, done = 0, total = 0
for (const line of rd('docs', 'PLAN.md').split(/\r?\n/)) {
  const h = line.match(/^#{2,3}\s+(.*)/)
  if (h) { cur = { name: h[1].replace(/\s*\(.*$/, '').trim(), rows: [] }; sections.push(cur); st = -1; continue }
  if (!line.startsWith('|') || !cur) continue
  const c = cells(line)
  if (/^[-:\s|]+$/.test(line)) continue
  const si = c.findIndex((x) => x.toLowerCase() === 'state')
  if (si >= 0) { st = si; continue }
  if (st < 0 || !/^[A-Za-z]*\d+/.test(c[0])) continue
  const state = c[st] ?? ''
  if (/^reopened as/i.test(state)) continue
  total++
  if (isDone(state)) done++
  else (/waits? for|when a game/i.test(state) ? waiting : cur.rows).push(`- ${c[0]}: ${short(c[1] ?? "")} (${state.split(/[.;(]/)[0].trim() || "open"})`)
}

let watch = []
try { watch = rd('docs', 'evaluation', 'GAPS.md').split(/\r?\n/).filter((l) => /\*\*watch\*\*/i.test(l)).map((l) => l.replace(/^\s*-\s*/, '- ').replace(/\*\*/g, '')) } catch { /* no GAPS.md */ }

let tag = ''
const g = spawnSync('git', ['-C', top, 'describe', '--tags', '--abbrev=0'], { encoding: 'utf8' })
if (g.status === 0) tag = g.stdout.trim()

const open = sections.filter((s) => s.rows.length)
const nOpen = open.reduce((n, s) => n + s.rows.length, 0)
const text = [
  '# State of the kit',
  '',
  'From docs/PLAN.md and docs/evaluation/GAPS.md (`node kit.mjs state`).',
  '',
  `Latest tag: ${tag || 'none'}`,
  `Rows done: ${done} of ${total}. Open: ${nOpen}.`,
  '',
  '## Open rows',
  '',
  ...open.flatMap((s) => [`### ${s.name}`, '', ...s.rows, '']),
  ...(nOpen ? [] : ['None.', '']),
  ...(waiting.length ? ['## Waiting on a game', '', ...waiting, ''] : []),
  '## Watch (GAPS.md)',
  '',
  ...(watch.length ? watch : ['None.']),
  '',
].join('\n')

process.stdout.write(text)
