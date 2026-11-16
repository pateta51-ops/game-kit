// Makes a git worktree of a game or kit repo for a worker: a new branch from origin/main, and node_modules linked from the main
// checkout (a Windows junction, a symlink elsewhere) so the worker can run types and lint. The link is kept out of git (info/exclude).
// A main checkout with no node_modules falls back to --shared <dir> (a base with node_modules, e.g. ~/codex/<key>-base in WSL);
// with neither it says how to get one and still makes the worktree. Exit 0 done, 2 usage or git failure.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args';

const git = (cwd: string, args: string[]): string => execFileSync('git', ['-c', 'safe.directory=*', ...args], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The node_modules to link: the checkout's own, else the shared base's, else null. */
export function pickModules(repo: string, shared?: string): string | null {
  for (const d of [repo, ...(shared === undefined ? [] : [shared])]) if (existsSync(join(d, 'node_modules'))) return join(d, 'node_modules');
  return null;
}

/** Links `target` as `<worktree>/node_modules` and adds it to info/exclude (a link is not a folder: `node_modules/` would miss it). */
export function linkModules(worktree: string, target: string): void {
  symlinkSync(target, join(worktree, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const file = resolve(worktree, git(worktree, ['rev-parse', '--git-path', 'info/exclude']));
  const old = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (!/^\/?node_modules\/?$/m.test(old)) appendFileSync(file, `${old === '' || old.endsWith('\n') ? '' : '\n'}node_modules\n`);
}

export function run(args: readonly string[], io: Io = stdio): number {
  const f = flags(args, ['repo', 'branch', 'dir', 'base', 'shared'], ['no-fetch']);
  const branch = f?.['branch']?.[0];
  if (f === null || branch === undefined) {
    io.err('usage: worktree-setup --branch <name> [--repo .] [--dir <worktree>] [--base origin/main] [--shared <dir with node_modules>] [--no-fetch]');
    return 2;
  }
  const repo = resolve(f['repo']?.[0] ?? '.');
  const dir = resolve(repo, f['dir']?.[0] ?? join('.claude', 'worktrees', branch.replace(/[\\/]/g, '-')));
  const base = f['base']?.[0] ?? 'origin/main';
  try {
    if (f['no-fetch'] === undefined) git(repo, ['fetch', '-q', base.split('/')[0] ?? 'origin']);
    git(repo, ['worktree', 'add', '-q', '-b', branch, dir, base]);
  } catch (e) {
    io.err(`git failed: ${(e as Error).message.split('\n')[0] ?? ''}`);
    return 2;
  }
  const mods = pickModules(repo, f['shared']?.[0]);
  if (mods === null) {
    io.out(`worktree ${dir} (${branch}) made, but NO node_modules to link: ${basename(repo)} has none. Run \`npm ci\` in ${repo}, or pass --shared <base with node_modules> (WSL: ~/codex/<key>-base), then link by hand.`);
    return 0;
  }
  linkModules(dir, resolve(mods));
  io.out(`worktree ${dir} (${branch} from ${base}); node_modules -> ${resolve(mods)}`);
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
