// Plain-node worker commands, no install and no tsx: node kit.mjs worktree|finish|teardown (also: node scripts/agent.mjs <cmd> ...).
//   worktree --branch <b> [--repo .] [--dir d] [--base origin/main] [--shared <dir with node_modules>] [--no-fetch]   new worktree + node_modules link
//   worktree --here [--branch <b>] [--shared d]   for a worker already inside a worktree: link node_modules from the main checkout (or --shared); --branch also switches to a new branch
//   finish [--repo .] [--check "npm run check"] [--install "npm ci"] [--tail 15] [--comment] [--detach] | finish --result   clone + install + check in WSL (bash on Linux); prints PASS <sha> or FAIL <sha>; refuses (exit 3) while the queue holds `finish <branch>`; a line a minute while it waits and runs; --detach returns at once, --result reads the stored outcome (exit 4 while running) (K572); the WSL run writes a start marker first: if it is not there after 45 s finish exits 6 with `the run did not start` and the command to run by hand (K644); with --check the line is check passed|failed <sha> (check: <command>), never PASS, so it cannot pass for the gate (K416)
//   finish also reads the PR body (gh pr view, or --body <file>) and fails before any run unless every file added under src/ since the merge base with main (not tests, *.d.ts, or package.json kit.builtNew.ignore globs) is named in a "Built new" section, one line each: - <file or folder> | search: <words>; <other words> | nearest: <kit part or none> | why: <reason> (K684; not with --check; renames are not new; a folder line covers files only two levels below src/; no merge base fails). K688: each line's two searches run again with the game's kit/kit.mjs search, and when a search's first 3 lines name parts and none is the line's nearest it fails (check: search finds <part>); kit.builtNew.ignore entries are { glob, why } (no bare string, no empty why, no glob covering most of src/ such as src/** or src/**/*.ts, at most 10); a new top-level export or top-level setTimeout/setInterval/createMachine added to a changed src/ file needs a line naming <file>#<export> or the file (renames, edits and newly exported old names do not count). K698: also (not with --check) every added or changed line, since the merge base, of docs/experience/**, docs/BUILD_PLAN.md, docs/handoff/** (plus package.json kit.claimDocs globs) that claims the kit lacks something (CLAIM_WORDS: kit gap, not in the kit, Built new, new effect, game-own, kit ships no, not covered by the kit ..., or a Gap: label;; headings skipped) needs search: <words>; <other words>; each phrasing runs with kit/kit.mjs search and effects, and when the first 3 lines name a part (after "not in the kit by that name" only the guesses sharing a word) the line needs nearest: <that part> and a why of six words or more (check: search finds <part>); a K<n> on a claim line whose row is done in kit/plan or the sibling game-kit/docs/plan fails (the kit row is done: pull it)
//   teardown --worktree <dir> [--repo .] [--force]
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const git = (cwd, args) => execFileSync('git', ['-c', 'safe.directory=*', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
export function parse(args, bools = []) {
  const f = {}
  for (let i = 0; i < args.length; i++) {
    const n = args[i].replace(/^--/, '')
    if (!args[i].startsWith('--')) return null
    if (bools.includes(n)) f[n] = true
    else if (args[i + 1] === undefined) return null
    else f[n] = args[++i]
  }
  return f
}
export const toWsl = (p) => { const m = /^([A-Za-z]):[\\/](.*)$/.exec(p); return m ? `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, '/')}` : p.replace(/\\/g, '/') }
const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`
export const script = (src, branch, id, install, check) => {
  const d = `"$HOME/tmp/${id}"`
  return `d=${d}; rm -rf "$d"; mkdir -p "$HOME/tmp"; git -c safe.directory='*' clone -q --depth 20 --branch ${q(branch)} ${q('file://' + src)} "$d" && cd "$d" && mkdir -p "$d-tmp" && export TMPDIR="$d-tmp" && { ${install}; } </dev/null && { H=$(command -v heavy || { [ -x "$HOME/.local/bin/heavy" ] && echo "$HOME/.local/bin/heavy"; }); if [ -n "$H" ]; then "$H" run --label ${q('finish ' + branch)} -- bash -c ${q(check)}; else ${check}; fi; } </dev/null; rc=$?; cd "$HOME"; rm -rf "$d" "$d-tmp"; exit $rc`
}
export const mainOf = (repo) => path.dirname(path.resolve(repo, git(repo, ['rev-parse', '--git-common-dir'])))
const link = (wt, target) => {
  const l = path.join(wt, 'node_modules')
  if (fs.existsSync(l)) return 'node_modules already there'
  fs.symlinkSync(target, l, process.platform === 'win32' ? 'junction' : 'dir')
  const ex = path.resolve(wt, git(wt, ['rev-parse', '--git-path', 'info/exclude']))
  const old = fs.existsSync(ex) ? fs.readFileSync(ex, 'utf8') : ''
  if (!/^\/?node_modules\/?$/m.test(old)) fs.appendFileSync(ex, (old === '' || old.endsWith('\n') ? '' : '\n') + 'node_modules\n')
  return `node_modules -> ${target}`
}
const find = (dirs) => dirs.filter(Boolean).map((d) => path.join(d, 'node_modules')).find((p) => fs.existsSync(p))
const none = (repo) => `NO node_modules to link: ${path.basename(repo)} has none. Run \`npm ci\` in the main checkout, or pass --shared <base with node_modules> (WSL: ~/codex/<key>-base).`

export function worktree(args, io) {
  const f = parse(args, ['here', 'no-fetch'])
  if (!f || (!f.here && !f.branch)) { io.err('usage: worktree --branch <name> [--repo .] [--dir d] [--base origin/main] [--shared d] [--no-fetch] | worktree --here [--branch <name>] [--shared d]'); return 2 }
  const repo = path.resolve(f.repo ?? '.')
  const base = f.base ?? 'origin/main'
  let dir = repo
  try {
    if (!f['no-fetch']) git(repo, ['fetch', '-q', base.split('/')[0]])
    if (f.here) { if (f.branch) git(repo, ['switch', '-c', f.branch, base]) }
    else { dir = path.resolve(repo, f.dir ?? path.join('.claude', 'worktrees', f.branch.replace(/[\\/]/g, '-'))); git(repo, ['worktree', 'add', '-q', '-b', f.branch, dir, base]) }
    const mods = find([f.here ? mainOf(repo) : repo, f.shared])
    io.out(`worktree ${dir}${f.branch ? ` (${f.branch} from ${base})` : ''}; ` + (mods ? link(dir, path.resolve(mods)) : none(repo)))
    return 0
  } catch (e) { io.err('git failed: ' + String(e.message).split('\n')[0]); return 2 }
}

export function teardown(args, io) {
  const f = parse(args, ['force'])
  if (!f?.worktree) { io.err('usage: teardown --worktree <dir> [--repo .] [--force]'); return 2 }
  const dir = path.resolve(f.worktree)
  try {
    let cut = false
    const l = path.join(dir, 'node_modules')
    let st = null
    try { st = fs.lstatSync(l) } catch { /* no node_modules */ }
    if (st?.isSymbolicLink()) { try { fs.unlinkSync(l) } catch { fs.rmdirSync(l) } cut = true }
    git(path.resolve(f.repo ?? '.'), ['worktree', 'remove', ...(f.force ? ['--force'] : []), dir])
    io.out(`removed ${dir}${cut ? ' (node_modules link cut, target kept)' : ''}`)
    return 0
  } catch (e) { io.err('git failed: ' + String(e.message).split('\n')[0]); return 2 }
}

const real = (cmd, args, input) => { const r = spawnSync(cmd, args, { input, encoding: 'utf8', maxBuffer: 1 << 28 }); return { status: r.status, error: r.error, output: `${r.stdout ?? ''}${r.stderr ?? ''}` } }
export const realBg = {
  start(cmd, args, _dir, env, sp = spawn) { const c = sp(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ...env } }); c.on('error', () => {}); c.unref() },
  sleep: (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) },
  now: () => Date.now(),
  home: os.homedir(),
}
// K644: WSL tears down a `setsid nohup ... &` child when wsl.exe exits at once, so the launch stays until the run writes `started` (<= 20 s); Git Bash must not rewrite the /mnt paths
export const launch = (win, dir) => {
  const W = (p) => q(win ? toWsl(p) : p)
  const bgc = `setsid nohup bash ${W(path.join(dir, 'run.sh'))} > /dev/null 2>&1 < /dev/null & i=0; while [ ! -e ${W(path.join(dir, 'started'))} ] && [ $i -lt 100 ]; do sleep 0.2; i=$((i+1)); done`
  return { cmd: win ? 'wsl' : 'bash', args: win ? ['-e', 'bash', '-c', bgc] : ['-c', bgc], env: { MSYS_NO_PATHCONV: '1', MSYS2_ARG_CONV_EXCL: '*' } }
}
export const byHand = (win, dir) => win ? `wsl -e bash -c "bash ${q(toWsl(path.join(dir, 'run.sh')))}"` : `bash ${q(path.join(dir, 'run.sh'))}`
const HQ = `H=$(command -v heavy || { [ -x "$HOME/.local/bin/heavy" ] && echo "$HOME/.local/bin/heavy"; }); [ -n "$H" ] || exit 9; "$H" status`
const mmss = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
// K572: the queue's job labelled `finish <branch>`; null when the queue is not reachable or not installed; {down} when WSL/bash cannot start
export function queueJob(exec, win, label) {
  const r = win ? exec('wsl', ['-e', 'bash', '-s'], HQ) : exec('bash', ['-s'], HQ)
  if (r.status === null || r.error) return { down: true, error: r.error }
  try {
    const o = r.output, s = JSON.parse(o.slice(o.indexOf('{'), o.lastIndexOf('}') + 1)), w = s.waiting ?? []
    const j = (s.running ?? []).find((l) => l.label === label)
    if (j) return { job: j, state: 'running', ms: j.runningMs ?? 0 }
    const k = w.find((l) => l.label === label)
    if (k) return { job: k, state: 'waiting', ms: k.waitedMs ?? 0, ahead: w.filter((x) => x !== k && ((x.priority === 'high' && k.priority !== 'high') || (x.priority === k.priority && x.queuedAt < k.queuedAt))).length }
    return {}
  } catch { return null }
}
const life = (branch, qj, since, now) => `finish ${branch}: ${qj?.state === 'waiting' ? `queued, ${qj.ahead} ahead` : qj?.state === 'running' ? `running, ${mmss(qj.ms)}` : `started, ${mmss(now - since)} (cloning or installing)`}`
const stateDir = (home, repo, branch) => { const m = mainOf(repo); return path.join(home, '.game-kit', 'finish', `${path.basename(m)}-${createHash('sha1').update(m).digest('hex').slice(0, 8)}`, branch.replace(/[^\w.-]/g, '-')) }
const report = (m, status, output, io) => {
  const ok = status === 0
  const line = m.check ? `check ${ok ? 'passed' : 'failed'} ${m.sha} (check: ${m.check.replace(/\s+/g, ' ')})` : `${ok ? 'PASS' : 'FAIL'} ${m.sha}`
  io.out(`${line} (${m.branch}; check ${ok ? 'passed' : 'exit ' + status}, clone removed)\n${output.split('\n').filter((l) => l.trim()).slice(-Number(m.tail ?? 15)).join('\n')}`)
  return line
}
const comment = (repo, branch, line, io) => { try { execFileSync('gh', ['pr', 'comment', branch, '--body', line], { cwd: repo, stdio: 'pipe' }) } catch { io.err('warning: could not comment on the PR (gh missing or no PR yet)') } }
// K572: a run in progress = meta without rc, and a heartbeat (written every 20 s by run.sh) or its start less than 120 s ago; older = dead
const DEAD = 120000
const lastSign = (dir) => { try { const m = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); if (fs.existsSync(path.join(dir, 'rc'))) return null; let hb = 0; try { hb = Number(fs.readFileSync(path.join(dir, 'hb'), 'utf8').trim()) * 1000 || 0 } catch { /* no heartbeat yet */ } return Math.max(m.started ?? 0, hb) } catch { return null } }
const stored = (dir, m, io, repo, f) => {
  let tested = ''
  try { tested = fs.readFileSync(path.join(dir, 'sha'), 'utf8').trim() } catch { /* clone failed before writing it */ }
  if (tested && tested !== m.sha) { io.err(`STALE: the stored result is for ${tested}, not the recorded head ${m.sha} (an older run wrote it); run finish again`); return 5 }
  const rc = Number(fs.readFileSync(path.join(dir, 'rc'), 'utf8').trim())
  const line = report(m, rc, fs.existsSync(path.join(dir, 'out.log')) ? fs.readFileSync(path.join(dir, 'out.log'), 'utf8') : '', io)
  if (f.comment) comment(repo, m.branch, line, io)
  return rc === 0 ? 0 : 1
}
// K684: files added under src/ since the merge base with main must each be named in the PR body's "Built new" section
export const BUILT_NEW_LINE = '- <file or folder> | search: <words>; <other words> | nearest: <kit part or none> | why: <reason it could not do it>'
const globRe = (g) => new RegExp('^' + g.split(/(\*\*\/?|\*|\?)/).map((t) => t === '**/' ? '(.*/)?' : t === '**' ? '.*' : t === '*' ? '[^/]*' : t === '?' ? '[^/]' : t.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('') + '$')
// K688: kit.builtNew.ignore entries are { glob, why }; at most 10; none may cover all of src/
export function builtNewIgnore(repo) {
  let ign = []
  try { ign = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).kit?.builtNew?.ignore ?? [] } catch { /* no package.json */ }
  if (!Array.isArray(ign)) return { globs: [], probs: ['kit.builtNew.ignore: must be a list of { "glob": ..., "why": ... }'] }
  const probs = ign.length > 10 ? [`kit.builtNew.ignore: ${ign.length} entries, at most 10`] : [], globs = []
  for (const e of ign) {
    if (typeof e?.glob !== 'string' || !e.glob.trim()) { probs.push(`kit.builtNew.ignore: ${JSON.stringify(e)} needs { "glob": ..., "why": ... }`); continue }
    if (typeof e.why !== 'string' || !e.why.trim()) { probs.push(`kit.builtNew.ignore: ${e.glob} needs a non-empty why`); continue }
    if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'zz'].some((x) => [`src/q9.${x}`, `src/q9/q9.${x}`].some((y) => globRe(e.glob).test(y)))) { probs.push(`kit.builtNew.ignore: ${e.glob} covers most of src/ (any folder, or all code files); name a narrower glob`); continue }
    globs.push(e.glob)
  }
  return { globs, probs }
}
const skip = (f, ign) => /\.(test|spec)\.[^/]+$/.test(f) || /(^|\/)(tests?|__tests__)\//.test(f.slice(4)) || f.endsWith('.d.ts') || ign.some((g) => globRe(g).test(f))
const mergeBase = (repo) => { for (const r of ['origin/main', 'main']) { try { return git(repo, ['merge-base', 'HEAD', r]) } catch { /* try the next */ } } return '' }
export function newSrcFiles(repo, ign = builtNewIgnore(repo).globs) {
  const base = mergeBase(repo)
  if (!base) return null
  return git(repo, ['diff', '--name-only', '--diff-filter=A', '-M', base, 'HEAD', '--', 'src']).split('\n').filter(Boolean).filter((f) => !skip(f, ign))
}
// K688: in a changed file under src/, a new top-level export (function, class, const, let, var) or a new top-level setTimeout/setInterval/createMachine; edits, renames and newly exported old names do not count
export const TIMERS = ['setTimeout', 'setInterval', 'createMachine']
const DECL = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|const\s+enum|enum|const|let|var)\s+(\w+)/
const declNames = (l) => { const m = l.match(DECL); if (m) return [m[1]]; const d = l.match(/^(?:export\s+)?(?:const|let|var)\s+[{[]([^}\]]*)/); if (d) return d[1].split(',').map((x) => x.split('=')[0].split(':').pop().replace('...', '').trim()).filter((x) => /^\w+$/.test(x)); return /^export\s+default\b/.test(l) ? ['default'] : [] }
export function newExports(repo, ign = builtNewIgnore(repo).globs) {
  const base = mergeBase(repo)
  if (!base) return null
  const out = []
  for (const f of git(repo, ['diff', '--name-only', '--diff-filter=M', base, 'HEAD', '--', 'src']).split('\n').filter(Boolean)) {
    if (skip(f, ign) || !/\.[mc]?[jt]sx?$/.test(f)) continue
    const d = git(repo, ['diff', '-U0', base, 'HEAD', '--', f]).split('\n').filter((l) => !/^(\+\+\+|---) /.test(l))
    const add = d.filter((l) => l[0] === '+').map((l) => l.slice(1)), del = d.filter((l) => l[0] === '-').map((l) => l.slice(1))
    const names = (ls, ex) => ls.flatMap((l) => (ex && !/^export\s/.test(l)) ? [] : declNames(l))
    const was = new Set(names(del, false)), now = new Set(names(add, false))
    let fresh = names(add, true).filter((n) => !was.has(n))
    // a rename pairs only a removed export with an added one
    fresh = fresh.slice(names(del, true).filter((n) => !now.has(n)).length)
    for (const n of new Set(fresh)) out.push(f + '#' + n)
    const top = (ls, t) => ls.filter((l) => { const i = l.search(new RegExp('\\b' + t + '\\(')); return /^\S/.test(l) && i >= 0 && !/=>|\bfunction\b|\)\s*\{/.test(l.slice(0, i)) }).length
    for (const t of TIMERS) if (top(add, t) > top(del, t)) out.push(f + '#' + t)
  }
  return out
}
// K688: the part a search line names, or null for a candidate, a "not in the kit" mechanic or another line
export function searchPart(l0) {
  if (!l0 || /^candidate K\d+/.test(l0)) return null
  if (l0.startsWith('mechanic: ')) { const a = l0.split(' -> ').slice(1).join(' -> '); return a.startsWith('not in the kit') ? null : (a.match(/`([^`]+)`/) ?? [])[1] ?? null }
  return (l0.match(/\(`([^`]+)`\)/) ?? l0.match(/^([a-z0-9][\w./-]*)(?=: | \(was )/) ?? [])[1] ?? null
}
// K688: the parts the first 3 lines of a search name; none for a miss
export const searchParts = (o) => o.includes('not in the kit by that name') ? [] : o.split(/\r?\n/).filter(Boolean).slice(0, 3).map(searchPart).filter(Boolean)
// K698: many searches at once, 12 in parallel, in one helper process: keys are "<cmd>\t<words>"
const MANY = `const { spawn } = require('node:child_process'); const [k, ...keys] = JSON.parse(require('node:fs').readFileSync(0, 'utf8')); const out = {}; let i = 0, live = 0
const next = () => { if (i >= keys.length) { if (!live) process.stdout.write(JSON.stringify(out)); return } const key = keys[i++], [cmd, q] = key.split('\\t'); live++; let o = ''; const c = spawn(process.execPath, [k, cmd, ...q.split(/\\s+/)], { stdio: ['ignore', 'pipe', 'ignore'] }); c.stdout.on('data', (d) => { o += d }); c.on('close', () => { out[key] = o; live--; next() }) }
for (let j = 0; j < 12; j++) next(); if (!keys.length) process.stdout.write('{}')`
const kitSearch = (repo, k = path.join(repo, 'kit', 'kit.mjs')) => {
  if (!fs.existsSync(k)) return undefined
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-search-')), env = { ...process.env, HOME: home, USERPROFILE: home }
  const one = (q, cmd = 'search') => spawnSync(process.execPath, [k, cmd, ...q.split(/\s+/)], { cwd: repo, encoding: 'utf8', env }).stdout ?? ''
  one.many = (keys) => { try { return new Map(Object.entries(JSON.parse(spawnSync(process.execPath, ['-e', MANY], { cwd: repo, encoding: 'utf8', env, input: JSON.stringify([k, ...keys]), maxBuffer: 1 << 28 }).stdout))) } catch { return new Map() } }
  return one
}
export function builtNew(files, body, search) {
  const lines = body.split(/\r?\n/), at = lines.findIndex((l) => /^\s*(#{1,6}\s*)?\**\s*built new\s*:?\s*\**\s*:?\s*$/i.test(l))
  const sec = []
  if (at >= 0) for (const l of lines.slice(at + 1)) { if (/^\s*#{1,6}\s/.test(l)) break; if (/^\s*[-*]\s/.test(l)) sec.push(l.trim()) }
  const bad = [], named = []
  for (const l of sec) {
    const c = l.replace(/^[-*]\s*/, '').split('|').map((x) => x.trim()), get = (k) => (c.find((x) => x.toLowerCase().startsWith(k + ':')) ?? '').slice(k.length + 1).trim()
    const f = c[0].replace(/`/g, '').replace(/^\.\//, '').replace(/\/$/, ''), ph = get('search').split(';').map((x) => x.trim()).filter(Boolean)
    const why = [ph.length < 2 && 'two search phrasings separated by ;', !get('nearest') && 'nearest: <kit part or none>', !get('why') && 'why: <reason>', !f && 'the file or folder first'].filter(Boolean)
    if (why.length) { bad.push(`malformed: ${l} (needs ${why.join(', ')})`); continue }
    named.push(f)
    // K688: each phrasing is searched again; when its first 3 lines name parts, one must be the line's nearest
    const near = (get('nearest').replace(/`/g, '').match(/[\w./-]+/g) ?? []).filter((t) => t !== 'none')
    if (search) for (const p of ph) { const ps = searchParts(search(p)), part = ps[0]; if (part && !ps.some((q) => near.some((t) => t === q || q.startsWith(t + '/') || t.startsWith(q + '/')))) bad.push(`check: search finds ${part} for "${p}" (line ${f}, nearest: ${get('nearest')}); use ${part}, or name it as nearest with a why`) }
  }
  const full = named.map((n) => n === 'src' || n.startsWith('src/') ? n : 'src/' + n)
  for (const n of full) if (n.split('/').length < 3 && !n.includes('#') && !files.some((x) => x === n || x.startsWith(n + '#'))) bad.push(`too broad: ${n}/ (name a file, or a folder at least two levels below src/, such as src/ui/motion/)`)
  const missing = files.filter((x) => { const [file, name] = x.split('#'); return !full.some((n) => x === n || (name && n === file) || (name && TIMERS.includes(name) && n.startsWith(file + '#')) || (n.split('/').length >= 3 && x.startsWith(n + '/'))) })
  return [...(at < 0 ? ['no "Built new" section in the PR body'] : []), ...bad, ...missing.map((x) => 'missing: ' + x + (x.includes('#') ? ' (new in a changed file; name <file>#<export> or the file)' : ''))]
}
// K698: role documents where the build-own decision is made; a claim that the kit lacks something must carry two searches
export const CLAIM_DOCS = ['docs/experience/**', 'docs/BUILD_PLAN.md', 'docs/handoff/**']
// plain claim words; "kit gap", "Gap:", "Built new", "new effect" and "game-own" have their own rules in isClaim
export const CLAIM_WORDS = ['not in the kit', 'the kit lacks', 'kit has no', 'build our own', 'missing from the kit', 'kit does not have', "kit doesn't have", 'no kit part', 'build it ourselves', 'kit ships no', 'not covered by the kit']
export function claimDocs(repo) {
  let x = []
  try { x = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).kit?.claimDocs ?? [] } catch { /* no package.json */ }
  if (!Array.isArray(x) || x.some((g) => typeof g !== 'string' || !g.trim())) return { globs: CLAIM_DOCS, probs: ['kit.claimDocs: must be a list of glob strings (added to ' + CLAIM_DOCS.join(', ') + ')'] }
  return { globs: [...CLAIM_DOCS, ...x], probs: [] }
}
// every line of a document: { n, text, code (inside a fenced block), built (a list item under a "Built new" heading) }
export function docLines(t) {
  let code = false, built = false
  return t.split(/\r?\n/).map((text, i) => {
    const fence = /^\s*(```|~~~)/.test(text)
    if (fence) code = !code
    if (!code && /^\s*#{1,6}\s/.test(text)) built = /^\s*#{1,6}\s*\**\s*built new\b/i.test(text)
    return { n: i + 1, text, code: code || fence, built: built && /^\s*[-*+]\s/.test(text) }
  })
}
// the changed or added lines of the claim documents since the merge base: [{ file, n, text, code, built }]; null without a merge base
export function claimLines(repo, globs = claimDocs(repo).globs) {
  const base = mergeBase(repo)
  if (!base) return null
  const out = []
  for (const f of git(repo, ['diff', '--name-only', '--diff-filter=AMR', base, 'HEAD']).split('\n').filter(Boolean)) {
    if (!globs.some((g) => globRe(g).test(f))) continue
    const ch = new Set()
    let n = 0
    for (const l of git(repo, ['diff', '-U0', base, 'HEAD', '--', f]).split('\n')) {
      const h = l.match(/^@@ -\S+ \+(\d+)/)
      if (h) { n = Number(h[1]); continue }
      if (l.startsWith('+') && !l.startsWith('+++ ')) ch.add(n++)
    }
    for (const l of docLines(git(repo, ['show', 'HEAD:' + f]))) if (ch.has(l.n)) out.push({ file: f, ...l })
  }
  return out
}
const DONE = /\b(closed|done|fixed|resolved|pulled|merged|shipped|landed)\b/i
const LACKS = /not in the kit|kit (lacks|has no|does not have|doesn't have|ships no)|missing from the kit|no kit (part|effect)|not covered by the kit/i
// a line that claims the kit lacks something; code, quotes, checked items and headings never do (string, or a docLines entry)
export function isClaim(l) {
  const { text, code, built } = typeof l === 'string' ? { text: l } : l
  if (code || built) return !code
  if (/^\s*(#|>)/.test(text) || /^\s*[-*+]\s+\[[xX]\]/.test(text)) return false
  const t = text.replace(/`[^`]*`/g, ' '), s = t.replace(/[*_]/g, '').toLowerCase()
  if (/^\s*([-+]\s+|\d+\.\s+)?gap\s*:(?!\s*\d)/.test(s)) return true
  if (/^\s*([-+]\s+|\d+\.\s+)?built new\s*:/.test(s)) return true
  const kg = s.indexOf('kit gap')
  if (kg >= 0 && !DONE.test(s.slice(kg))) return true
  if (/game-own/.test(s) && /\b(because|instead) of the kit\b|\binstead of the kit\b/.test(s)) return true
  return CLAIM_WORDS.some((w) => s.includes(w)) || (/new effect/.test(s) && LACKS.test(s))
}
// the parts the first 3 lines name; after "not in the kit by that name" the 3 guesses count only when they share a word with the phrasing
export function claimParts(o, p) {
  const L = o.split(/\r?\n/).filter(Boolean).filter((l) => !/^(not in the kit by that name|not built yet)$/.test(l)).slice(0, 3)
  const ws = p.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
  return L.filter((l) => !o.includes('not in the kit by that name') || ws.some((w) => l.toLowerCase().includes(w))).map(searchPart).filter(Boolean)
}
const doneRow = (dirs, id) => { for (const d of dirs) { try { return /^state:\s*done/im.test(fs.readFileSync(path.join(d, id + '.md'), 'utf8').split(/^---\s*$/m)[1] ?? '') } catch { /* not in this folder */ } } return false }
export const planDirs = (repo) => { let m = repo; try { m = mainOf(repo) } catch { /* not a git repo */ } return [path.join(repo, 'kit', 'plan'), path.join(path.dirname(m), 'game-kit', 'docs', 'plan')].filter((d) => fs.existsSync(d)) }
export function claims(lines, search, dirs = []) {
  const bad = [], todo = []
  for (const l of lines) {
    if (!isClaim(l)) continue
    const c = l.text.split('|').map((x) => x.trim().replace(/^[-*]\s*/, '')), get = (k) => (c.find((x) => x.toLowerCase().startsWith(k + ':')) ?? '').slice(k.length + 1).trim()
    todo.push({ ...l, get, ph: get('search').split(';').map((x) => x.trim()).filter(Boolean) })
  }
  // each distinct phrasing runs once per command, all of them in one batch when the search can
  const keys = [...new Set(todo.flatMap((t) => t.ph.length < 2 ? [] : t.ph.flatMap((p) => ['search', 'effects'].map((cmd) => cmd + '\t' + p))))]
  const got = search?.many ? search.many(keys) : new Map()
  const out = (p, cmd) => { const k = cmd + '\t' + p; if (!got.has(k)) got.set(k, search(p, cmd)); return got.get(k) }
  for (const { file, n, text, get, ph } of todo) {
    const at = `${file}:${n}: ${text.trim().slice(0, 160)}`
    for (const id of new Set(text.match(/\bK\d+\b/g) ?? [])) if (doneRow(dirs, id)) bad.push(`${at}\n  the kit row is done: pull it (${id})`)
    if (ph.length < 2) { bad.push(`${at}\n  a claim needs search: <words>; <other words> (two phrasings run with kit/kit.mjs search and effects)`); continue }
    const near = (get('nearest').replace(/`/g, '').match(/[\w./-]+/g) ?? []).filter((t) => t !== 'none'), why = get('why').split(/\s+/).filter(Boolean).length
    if (search) for (const p of ph) for (const cmd of ['search', 'effects']) {
      const ps = claimParts(out(p, cmd), p)
      if (!ps.length) continue
      const hit = ps.some((q) => near.some((t) => t === q || q.startsWith(t + '/') || t.startsWith(q + '/')))
      if (!hit || why < 6) bad.push(`${at}\n  check: search finds ${ps[0]} (${cmd} "${p}"); use it, or write nearest: ${ps[0]} | why: <reason of six words or more>`)
    }
  }
  return bad
}
export function finish(args, io, exec = real, win = process.platform === 'win32', bg = exec === real ? realBg : null) {
  const f = parse(args, ['comment', 'detach', 'result'])
  if (!f) { io.err('usage: finish [--repo <worktree>] [--check "npm run check"] [--install "npm ci"] [--tail 15] [--comment] [--detach] [--body <PR body file>] | finish --result [--repo <worktree>] [--comment]'); return 2 }
  const repo = path.resolve(f.repo ?? '.')
  if (!win) {
    let gf = ''
    try { gf = fs.readFileSync(path.join(repo, '.git'), 'utf8') } catch { /* a real .git folder */ }
    if (/^gitdir:\s*[A-Za-z]:[/\\]/m.test(gf)) { io.err('REFUSED: this is a Windows worktree (its .git file holds a Windows path); run `node kit.mjs finish` from Windows node in the worktree'); return 2 }
  }
  if (f.result) {
    const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']), dir = stateDir((bg ?? realBg).home, repo, branch)
    if (!fs.existsSync(path.join(dir, 'meta.json'))) { io.err(`no finish run stored for ${branch} (${dir})`); return 2 }
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'))
    if (!fs.existsSync(path.join(dir, 'rc'))) { io.err(`${life(branch, queueJob(exec, win, m.label), m.started, (bg ?? realBg).now())}; result: ${dir}`); return 4 }
    return stored(dir, m, io, repo, f)
  }
  const dirty = git(repo, ['status', '--porcelain']).split('\n').filter(Boolean)
  if (dirty.length) { io.err(`REFUSED: ${dirty.length} uncommitted change(s); commit first:\n${dirty.slice(0, 10).join('\n')}`); return 1 }
  const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === 'HEAD') { io.err('REFUSED: detached HEAD; switch to the batch branch first'); return 1 }
  const sha = git(repo, ['rev-parse', 'HEAD'])
  if (!f.check) {
    const ig = builtNewIgnore(repo)
    if (ig.probs.length) { io.out(`FAIL ${sha} (${branch}; Built new: package.json kit.builtNew.ignore is not valid; nothing was run)\n${ig.probs.join('\n')}\neach entry: { "glob": "src/data/*.json", "why": "<reason>" }`); return 1 }
    const nf = newSrcFiles(repo, ig.globs), ne = nf && newExports(repo, ig.globs)
    if (nf === null) { io.out(`FAIL ${sha} (${branch}; Built new: no merge base with origin/main or main, so the new files under src/ cannot be listed; fetch origin main or base the branch on main; nothing was run)`); return 1 }
    const files = [...nf, ...ne]
    if (files.length) {
      let body = null
      if (f.body) { try { body = fs.readFileSync(path.resolve(f.body), 'utf8') } catch { /* named file missing */ } }
      else { const r = exec('gh', ['pr', 'view', branch, '--json', 'body', '-q', '.body'], ''); if (r.status === 0) body = r.output }
      const probs = body === null ? [f.body ? `cannot read --body ${f.body}` : 'no PR body (no PR yet?): pass --body <file> with the PR body'] : builtNew(files, body, kitSearch(repo))
      if (probs.length) { io.out(`FAIL ${sha} (${branch}; Built new: ${nf.length} new file(s) and ${ne.length} new export(s) or timer(s) in changed files under src/ not all listed, or a search finds a kit part; nothing was run)\n${probs.join('\n')}\nexpected under a "## Built new" heading, one line per new file, folder or <file>#<export>:\n${BUILT_NEW_LINE}`); return 1 }
    }
  }
  if (!f.check) {
    // K698: claim lines in the role documents
    const cd = claimDocs(repo), cl = cd.probs.length ? [] : claimLines(repo, cd.globs) ?? []
    const probs = cd.probs.length ? cd.probs : cl.some((l) => isClaim(l)) ? claims(cl, kitSearch(repo), planDirs(repo)) : []
    if (probs.length) { io.out(`FAIL ${sha} (${branch}; kit claims: a line in ${cd.globs.join(', ')} says the kit lacks something; nothing was run)\n${probs.join('\n')}\neach claim line carries: search: <words>; <other words> | nearest: <kit part or none> | why: <reason of six words or more>`); return 1 }
  }
  const label = 'finish ' + branch
  const unavailable = (e) => { io.out(`FAIL ${sha} (${branch}; could not run the check: ${win ? 'WSL is unavailable' : 'bash is unavailable'}${e ? ' - ' + e.message : ''}; the check never runs on local Windows)`); return 1 }
  const q0 = queueJob(exec, win, label)
  if (q0?.down) return unavailable(q0.error)
  if (q0?.job) { io.err(`REFUSED: the queue already holds job ${q0.job.id} "${label}", ${q0.state} for ${mmss(q0.ms)}; wait for it (node kit.mjs finish --result reads a --detach run)`); return 3 }
  const common = path.resolve(repo, git(repo, ['rev-parse', '--git-common-dir']))
  const sh = script(win ? toWsl(common) : common, branch, `finish-${branch.replace(/[^\w.-]/g, '-')}-${Date.now()}`, f.install ?? 'npm ci', f.check ?? 'npm run check')
  const m = { sha, branch, check: f.check, tail: f.tail, label }
  if (!bg) {
    const r = win ? exec('wsl', ['-e', 'bash', '-s'], sh) : exec('bash', ['-s'], sh)
    if (r.status === null || r.error) return unavailable(r.error)
    const line = report(m, r.status, r.output, io)
    if (f.comment) comment(repo, branch, line, io)
    return r.status === 0 ? 0 : 1
  }
  const dir = stateDir(bg.home, repo, branch), W = (p) => q(win ? toWsl(p) : p), rc = path.join(dir, 'rc'), seen = lastSign(dir)
  if (seen !== null && bg.now() - seen < DEAD) { io.err(`REFUSED: a finish run for ${branch} is in progress (last sign ${Math.round((bg.now() - seen) / 1000)} s ago, ${dir}); read it with node kit.mjs finish --result`); return 3 }
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  m.started = bg.now()
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(m))
  fs.writeFileSync(path.join(dir, 'in.sh'), sh.replace('cd "$d" && ', `cd "$d" && git rev-parse HEAD > ${W(path.join(dir, 'sha'))} && `))
  fs.writeFileSync(path.join(dir, 'run.sh'), `date +%s > ${W(path.join(dir, 'started'))}; ( while :; do date +%s > ${W(path.join(dir, 'hb'))}; sleep 20; done ) & h=$!; bash ${W(path.join(dir, 'in.sh'))} > ${W(path.join(dir, 'out.log'))} 2>&1; r=$?; kill $h; echo $r > ${W(rc + '.tmp')}; mv ${W(rc + '.tmp')} ${W(rc)}\n`)
  const l = launch(win, dir)
  bg.start(l.cmd, l.args, dir, l.env)
  const t0 = bg.now()
  while (!fs.existsSync(path.join(dir, 'started'))) {
    if (bg.now() - t0 >= 45000) {
      fs.rmSync(path.join(dir, 'meta.json'), { force: true })
      io.err(`finish ${branch}: the run did not start (no start marker after 45 s); run it by hand: ${byHand(win, dir)}`)
      return 6
    }
    bg.sleep(500)
  }
  if (f.detach) { io.out(`started ${label} in the background; result file: ${dir}; read it with: node kit.mjs finish --result`); return 0 }
  let last = m.started
  while (!fs.existsSync(rc)) { bg.sleep(2000); const now = bg.now(); if (now - last >= 60000) { last = now; io.err(life(branch, queueJob(exec, win, label), m.started, now)) } }
  return stored(dir, m, io, repo, f)
}

// K698: node kit.mjs claims <file> [--repo <game repo>] [--before <old file>]: the claim rules of finish on one file as it is on disk; with --before only its new or changed lines
const EACH = 'each claim line carries: search: <words>; <other words> | nearest: <kit part or none> | why: <reason of six words or more>'
export function claimsCmd(args, io, fallback = 'C:/projects/game-kit/kit.mjs') {
  const file = args[0], f = file && !file.startsWith('--') ? parse(args.slice(1)) : null
  if (!f || Object.keys(f).some((k) => !['repo', 'before'].includes(k))) { io.err('usage: claims <file> [--repo <game repo>] [--before <old file>]'); return 2 }
  try {
    let t
    try { t = fs.readFileSync(path.resolve(file), 'utf8') } catch { io.err('cannot read ' + file); return 2 }
    const isRepo = (d) => { try { return git(d, ['rev-parse', '--show-toplevel']) } catch { return '' } }
    const repo = path.resolve((f.repo && isRepo(path.resolve(f.repo))) || isRepo(path.dirname(path.resolve(file))) || path.dirname(path.resolve(file)))
    const rel = path.relative(repo, path.resolve(file)).replace(/\\/g, '/')
    let lines = docLines(t).map((l) => ({ file: rel, ...l }))
    if (f.before) {
      let old = null
      try { old = fs.readFileSync(path.resolve(f.before), 'utf8') } catch { /* a new file: every line is new */ }
      if (old !== null) {
        const seen = new Map()
        for (const l of old.split(/\r?\n/)) seen.set(l.trim(), (seen.get(l.trim()) ?? 0) + 1)
        lines = lines.filter((l) => { const c = seen.get(l.text.trim()) ?? 0; if (c) seen.set(l.text.trim(), c - 1); return !c })
      }
    }
    const k = [path.join(repo, 'kit', 'kit.mjs'), fallback].find((p) => p && fs.existsSync(p))
    const bad = claims(lines, k && kitSearch(repo, k), planDirs(repo))
    if (bad.length) { io.out(bad.join('\n') + '\n' + EACH); return 1 }
    io.out('claims ok: ' + rel)
    return 0
  } catch (e) { io.err('claims: ' + String(e?.message ?? e).split('\n')[0]); return 2 }
}
const cmds = { worktree, finish, teardown, claims: claimsCmd }
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = cmds[process.argv[2]]?.(process.argv.slice(3), { out: (l) => console.log(l), err: (l) => console.error(l) }) ?? 2
