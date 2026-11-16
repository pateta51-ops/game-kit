// Plain-node worker commands, no install and no tsx: node kit.mjs worktree|finish|teardown (also: node scripts/agent.mjs <cmd> ...).
//   worktree --branch <b> [--repo .] [--dir d] [--base origin/main] [--shared <dir with node_modules>] [--no-fetch]   new worktree + node_modules link
//   worktree --here [--branch <b>] [--shared d]   for a worker already inside a worktree: link node_modules from the main checkout (or --shared); --branch also switches to a new branch
//   finish [--repo .] [--check "npm run check"] [--install "npm ci"] [--tail 15] [--comment]   clone + install + check in WSL (bash on Linux); prints PASS <sha> or FAIL <sha>
//   teardown --worktree <dir> [--repo .] [--force]
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
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
  return `d=${d}; rm -rf "$d"; mkdir -p "$HOME/tmp"; git -c safe.directory='*' clone -q --depth 20 --branch ${q(branch)} ${q('file://' + src)} "$d" && cd "$d" && mkdir -p "$d-tmp" && export TMPDIR="$d-tmp" && { ${install}; } </dev/null && { ${check}; } </dev/null; rc=$?; cd "$HOME"; rm -rf "$d" "$d-tmp"; exit $rc`
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
export function finish(args, io, exec = real, win = process.platform === 'win32') {
  const f = parse(args, ['comment'])
  if (!f) { io.err('usage: finish [--repo <worktree>] [--check "npm run check"] [--install "npm ci"] [--tail 15] [--comment]'); return 2 }
  const repo = path.resolve(f.repo ?? '.')
  if (!win) {
    let gf = ''
    try { gf = fs.readFileSync(path.join(repo, '.git'), 'utf8') } catch { /* a real .git folder */ }
    if (/^gitdir:\s*[A-Za-z]:[/\\]/m.test(gf)) { io.err('REFUSED: this is a Windows worktree (its .git file holds a Windows path); run `node kit.mjs finish` from Windows node in the worktree'); return 2 }
  }
  const dirty = git(repo, ['status', '--porcelain']).split('\n').filter(Boolean)
  if (dirty.length) { io.err(`REFUSED: ${dirty.length} uncommitted change(s); commit first:\n${dirty.slice(0, 10).join('\n')}`); return 1 }
  const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === 'HEAD') { io.err('REFUSED: detached HEAD; switch to the batch branch first'); return 1 }
  const sha = git(repo, ['rev-parse', 'HEAD'])
  const common = path.resolve(repo, git(repo, ['rev-parse', '--git-common-dir']))
  const sh = script(win ? toWsl(common) : common, branch, `finish-${branch.replace(/[^\w.-]/g, '-')}-${Date.now()}`, f.install ?? 'npm ci', f.check ?? 'npm run check')
  const r = win ? exec('wsl', ['-e', 'bash', '-s'], sh) : exec('bash', ['-s'], sh)
  if (r.status === null || r.error) { io.out(`FAIL ${sha} (${branch}; could not run the check: ${win ? 'WSL is unavailable' : 'bash is unavailable'}${r.error ? ' - ' + r.error.message : ''}; the check never runs on local Windows)`); return 1 }
  const ok = r.status === 0
  const line = `${ok ? 'PASS' : 'FAIL'} ${sha}`
  io.out(`${line} (${branch}; check ${ok ? 'passed' : 'exit ' + r.status}, clone removed)\n${r.output.split('\n').filter((l) => l.trim()).slice(-Number(f.tail ?? 15)).join('\n')}`)
  if (f.comment) try { execFileSync('gh', ['pr', 'comment', branch, '--body', line], { cwd: repo, stdio: 'pipe' }) } catch { io.err('warning: could not comment on the PR (gh missing or no PR yet)') }
  return ok ? 0 : 1
}

const cmds = { worktree, finish, teardown }
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = cmds[process.argv[2]]?.(process.argv.slice(3), { out: (l) => console.log(l), err: (l) => console.error(l) }) ?? 2
