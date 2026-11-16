// Ends a worker's batch: refuses (exit 1) when the worktree has uncommitted changes, else runs the repo's check in a fresh WSL
// clone of the branch (tests never run on local Windows) and prints a short result. The clone is made from the repo's shared git dir (a worktree's .git file holds a Windows path WSL cannot follow)
// (file://, no GitHub) and deleted afterwards. On Linux/WSL the same steps run in a local temp clone.
// The script goes to `bash -s` on stdin (wsl.exe would re-parse quotes in an argument). Exit 0 check passed, 1 uncommitted changes or check failed, 2 usage.
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args';

const git = (cwd: string, args: string[]): string => execFileSync('git', ['-c', 'safe.directory=*', ...args], { cwd, encoding: 'utf-8' }).trim();
const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/** `C:\x\y` as `/mnt/c/x/y`; other paths unchanged. */
export function toWsl(p: string): string {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  return m === null ? p.replace(/\\/g, '/') : `/mnt/${(m[1] ?? '').toLowerCase()}/${(m[2] ?? '').replace(/\\/g, '/')}`;
}

/** The bash script that clones, installs, checks and removes the clone; its exit code is the check's. */
export function script(src: string, branch: string, id: string, install: string, check: string): string {
  const d = `"$HOME/tmp/${id}"`;
  return `d=${d}; rm -rf "$d"; mkdir -p "$HOME/tmp"; git -c safe.directory='*' clone -q --depth 20 --branch ${q(branch)} ${q(`file://${src}`)} "$d" && cd "$d" && { ${install}; } </dev/null && { ${check}; } </dev/null; rc=$?; cd "$HOME"; rm -rf "$d"; exit $rc`;
}

export type Exec = (cmd: string, args: string[], input: string) => { status: number | null; output: string };
const real: Exec = (cmd, args, input) => {
  const r = spawnSync(cmd, args, { input, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
};

export function run(args: readonly string[], io: Io = stdio, exec: Exec = real, win = process.platform === 'win32'): number {
  const f = flags(args, ['repo', 'check', 'install', 'tail']);
  if (f === null) {
    io.err('usage: worker-finish [--repo <worktree>] [--check "npm run check"] [--install "npm ci"] [--tail 15]');
    return 2;
  }
  const repo = resolve(f['repo']?.[0] ?? '.');
  const dirty = git(repo, ['status', '--porcelain']).split('\n').filter((l) => l !== '');
  if (dirty.length > 0) {
    io.err(`REFUSED: ${String(dirty.length)} uncommitted change(s); commit first:\n${dirty.slice(0, 10).join('\n')}`);
    return 1;
  }
  const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === 'HEAD') {
    io.err('REFUSED: detached HEAD; switch to the batch branch first');
    return 1;
  }
  const common = resolve(repo, git(repo, ['rev-parse', '--git-common-dir']));
  const id = `finish-${branch.replace(/[^\w.-]/g, '-')}-${String(Date.now())}`;
  const sh = script(win ? toWsl(common) : common, branch, id, f['install']?.[0] ?? 'npm ci', f['check']?.[0] ?? 'npm run check');
  const r = win ? exec('wsl', ['-e', 'bash', '-s'], sh) : exec('bash', ['-s'], sh);
  const tail = r.output.split('\n').filter((l) => l.trim() !== '').slice(-Number(f['tail']?.[0] ?? 15));
  io.out(`${r.status === 0 ? 'PASS' : 'FAIL'} ${branch} @ ${git(repo, ['rev-parse', '--short', 'HEAD'])} (check ${r.status === 0 ? 'passed' : `exit ${String(r.status)}`}, clone removed)\n${tail.join('\n')}`);
  return r.status === 0 ? 0 : 1;
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
