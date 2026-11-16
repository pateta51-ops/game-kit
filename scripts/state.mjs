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

// open PRs and the component each touches (needs gh; skipped offline)
let prs = []
const pj = args.indexOf('--prs-json')
const pr = pj >= 0 ? { status: 0, stdout: fs.readFileSync(args[pj + 1], 'utf8') } : spawnSync('gh', ['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,isDraft,files'], { cwd: top, encoding: 'utf8' })
if (pr.status === 0) try { prs = JSON.parse(pr.stdout).map((p) => `- #${p.number}${p.isDraft ? ' (draft)' : ''}: ${short(p.title)} [${[...new Set(p.files.map((f) => f.path.match(/^components\/([^/]+)\//)?.[1]).filter(Boolean))].join(', ') || 'no component'}]`) } catch { /* bad json */ }
// each game's kit pin against the latest tag: games are the folders beside the main checkout (or --games <dir>...) holding kit/kit.lock.json
const gi = args.indexOf('--games')
const mainCo = path.dirname(path.resolve(top, spawnSync('git', ['-C', top, 'rev-parse', '--git-common-dir'], { encoding: 'utf8' }).stdout.trim() || '.git'))
const gdirs = gi >= 0 ? args.slice(gi + 1) : (() => { try { return fs.readdirSync(path.dirname(mainCo)).map((d) => path.join(path.dirname(mainCo), d)) } catch { return [] } })()
const pins = []
for (const d of gdirs) try {
  const lk = JSON.parse(fs.readFileSync(path.join(d, 'kit', 'kit.lock.json'), 'utf8'))
  const refs = lk.ref ? [lk.ref] : Object.values(lk.components).map((c) => c.ref)
  const num = (r) => (r.match(/\d+/g) ?? []).map(Number)
  const old = refs.sort((x, y) => { const a = num(x), b = num(y); return (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]) || 0 })[0]
  pins.push(`- ${path.basename(d)}: oldest pin ${old ?? 'none'} (latest ${tag || 'none'})`)
} catch { /* not a game with a kit */ }

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
  ...(prs.length ? ['## Open pull requests (one per component)', '', ...prs, ''] : []),
  ...(pins.length ? ['## Games: kit pin', '', ...pins, ''] : []),
  '## Watch (GAPS.md)',
  '',
  ...(watch.length ? watch : ['None.']),
  '',
].join('\n')

process.stdout.write(text)
