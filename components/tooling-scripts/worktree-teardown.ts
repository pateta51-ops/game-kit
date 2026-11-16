// Removes a worker's worktree: first its node_modules link (unlink, or rmdir for a Windows junction; never recursive, so the
// target stays), then `git worktree remove` (refuses uncommitted changes unless --force). Exit 0 done, 2 usage or git failure.
import { execFileSync } from 'node:child_process';
import { lstatSync, rmdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args';

/** Removes `<worktree>/node_modules` when it is a link; a real folder is left to git. Returns whether it removed one. */
export function unlinkModules(worktree: string): boolean {
  const p = join(worktree, 'node_modules');
  let st;
  try {
    st = lstatSync(p);
  } catch {
    return false;
  }
  if (!st.isSymbolicLink()) return false;
  try {
    unlinkSync(p);
  } catch {
    rmdirSync(p);
  }
  return true;
}

export function run(args: readonly string[], io: Io = stdio): number {
  const f = flags(args, ['repo', 'worktree'], ['force']);
  const wt = f?.['worktree']?.[0];
  if (f === null || wt === undefined) {
    io.err('usage: worktree-teardown --worktree <dir> [--repo .] [--force]');
    return 2;
  }
  const dir = resolve(wt);
  try {
    const cut = unlinkModules(dir);
    execFileSync('git', ['-c', 'safe.directory=*', 'worktree', 'remove', ...(f['force'] === undefined ? [] : ['--force']), dir], { cwd: resolve(f['repo']?.[0] ?? '.'), stdio: 'pipe' });
    io.out(`removed ${dir}${cut ? ' (node_modules link cut, target kept)' : ''}`);
    return 0;
  } catch (e) {
    io.err(`git failed: ${(e as Error).message.split('\n')[0] ?? ''}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
