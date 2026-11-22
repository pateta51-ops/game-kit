// Plain-node worker commands, no install and no tsx: node kit.mjs worktree|finish|teardown (also: node scripts/agent.mjs <cmd> ...).
//   worktree --branch <b> [--repo .] [--dir d] [--base origin/main] [--shared <dir with node_modules>] [--no-fetch]   new worktree + node_modules link
//   worktree --here [--branch <b>] [--shared d]   for a worker already inside a worktree: link node_modules from the main checkout (or --shared); --branch also switches to a new branch
//   finish [--repo .] [--check "npm run check"] [--install "npm ci"] [--tail 15] [--comment] [--detach] | finish --result   clone + install + check in WSL (bash on Linux); prints PASS <sha> or FAIL <sha>; refuses (exit 3) while the queue holds `finish <branch>`; a line a minute while it waits and runs; --detach returns at once, --result reads the stored outcome (exit 4 while running) (K572); with --check the line is check passed|failed <sha> (check: <command>), never PASS, so it cannot pass for the gate (K416)
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
const realBg = {
  start(dir, win) { const c = spawn(win ? 'wsl' : 'bash', win ? ['-e', 'bash', toWsl(path.join(dir, 'run.sh'))] : [path.join(dir, 'run.sh')], { detached: true, stdio: 'ignore', windowsHide: true }); c.on('error', () => {}); c.unref() },
  sleep: (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) },
  now: () => Date.now(),
  home: os.homedir(),
}
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
const stored = (dir, m, io, repo, f) => {
  const rc = Number(fs.readFileSync(path.join(dir, 'rc'), 'utf8').trim())
  const line = report(m, rc, fs.existsSync(path.join(dir, 'out.log')) ? fs.readFileSync(path.join(dir, 'out.log'), 'utf8') : '', io)
  if (f.comment) comment(repo, m.branch, line, io)
  return rc === 0 ? 0 : 1
}
export function finish(args, io, exec = real, win = process.platform === 'win32', bg = exec === real ? realBg : null) {
  const f = parse(args, ['comment', 'detach', 'result'])
  if (!f) { io.err('usage: finish [--repo <worktree>] [--check "npm run check"] [--install "npm ci"] [--tail 15] [--comment] [--detach] | finish --result [--repo <worktree>] [--comment]'); return 2 }
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
    if (!fs.existsSync(path.join(dir, 'rc'))) { io.out(`${life(branch, queueJob(exec, win, m.label), m.started, (bg ?? realBg).now())}; result: ${dir}`); return 4 }
    return stored(dir, m, io, repo, f)
  }
  const dirty = git(repo, ['status', '--porcelain']).split('\n').filter(Boolean)
  if (dirty.length) { io.err(`REFUSED: ${dirty.length} uncommitted change(s); commit first:\n${dirty.slice(0, 10).join('\n')}`); return 1 }
  const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === 'HEAD') { io.err('REFUSED: detached HEAD; switch to the batch branch first'); return 1 }
  const sha = git(repo, ['rev-parse', 'HEAD'])
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
  const dir = stateDir(bg.home, repo, branch), W = (p) => q(win ? toWsl(p) : p), rc = path.join(dir, 'rc')
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  m.started = bg.now()
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(m))
  fs.writeFileSync(path.join(dir, 'in.sh'), sh)
  fs.writeFileSync(path.join(dir, 'run.sh'), `bash ${W(path.join(dir, 'in.sh'))} > ${W(path.join(dir, 'out.log'))} 2>&1; echo $? > ${W(rc + '.tmp')}; mv ${W(rc + '.tmp')} ${W(rc)}\n`)
  bg.start(dir, win)
  if (f.detach) { io.out(`started ${label} in the background; result file: ${dir}; read it with: node kit.mjs finish --result`); return 0 }
  let last = m.started
  while (!fs.existsSync(rc)) { bg.sleep(2000); const now = bg.now(); if (now - last >= 60000) { last = now; io.out(life(branch, queueJob(exec, win, label), m.started, now)) } }
  return stored(dir, m, io, repo, f)
}

const cmds = { worktree, finish, teardown }
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = cmds[process.argv[2]]?.(process.argv.slice(3), { out: (l) => console.log(l), err: (l) => console.error(l) }) ?? 2
