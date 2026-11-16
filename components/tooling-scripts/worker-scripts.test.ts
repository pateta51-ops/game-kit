import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { pickModules, run as setup } from './worktree-setup';
import { run as teardown } from './worktree-teardown';
import { run as finish, script, toWsl } from './worker-finish';

const root = mkdtempSync(join(tmpdir(), 'worker-scripts-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const g = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf-8' });
const lines: string[] = [];
const io = { out: (l: string) => void lines.push(l), err: (l: string) => void lines.push(l) };

function repo(name: string, modules: boolean): string {
  const bare = join(root, `${name}.git`);
  const main = join(root, name);
  g(root, 'init', '-q', '--bare', '-b', 'main', bare);
  g(root, 'clone', '-q', bare, main);
  writeFileSync(join(main, 'a.txt'), 'a');
  g(main, 'add', '.');
  g(main, 'commit', '-qm', 'init');
  g(main, 'push', '-q', 'origin', 'HEAD:main');
  if (modules) {
    mkdirSync(join(main, 'node_modules'));
    writeFileSync(join(main, 'node_modules', 'x.js'), '1');
  }
  return main;
}

describe('worktree-setup (K209)', () => {
  it('links node_modules from the main checkout and keeps the link out of git', () => {
    const main = repo('with', true);
    expect(setup(['--repo', main, '--branch', 'feat/one'], io)).toBe(0);
    const wt = join(main, '.claude', 'worktrees', 'feat-one');
    expect(lstatSync(join(wt, 'node_modules')).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(wt, 'node_modules', 'x.js'), 'utf8')).toBe('1');
    expect(g(wt, 'status', '--porcelain', '--', 'node_modules').trim()).toBe('');
    expect(g(wt, 'branch', '--show-current').trim()).toBe('feat/one');
  });
  it('falls back to --shared, and with none says how to get one', () => {
    const main = repo('without', false);
    const shared = join(root, 'base');
    mkdirSync(join(shared, 'node_modules'), { recursive: true });
    expect(pickModules(main)).toBeNull();
    expect(pickModules(main, shared)).toBe(join(shared, 'node_modules'));
    lines.length = 0;
    expect(setup(['--repo', main, '--branch', 'b1'], io)).toBe(0);
    expect(lines.join('\n')).toMatch(/NO node_modules.*npm ci/);
    expect(setup(['--repo', main, '--branch', 'b2', '--shared', shared], io)).toBe(0);
    expect(lstatSync(join(main, '.claude', 'worktrees', 'b2', 'node_modules')).isSymbolicLink()).toBe(true);
  });
  it('removes the link only and the worktree, leaving the target intact (K209)', () => {
    const main = repo('td', true);
    setup(['--repo', main, '--branch', 'td1'], io);
    const wt = join(main, '.claude', 'worktrees', 'td1');
    expect(teardown(['--repo', main, '--worktree', wt], io)).toBe(0);
    expect(existsSync(wt)).toBe(false);
    expect(readFileSync(join(main, 'node_modules', 'x.js'), 'utf8')).toBe('1');
  });
  it('is a usage error without a branch', () => expect(setup([], io)).toBe(2));
});

describe('worker-finish (K209)', () => {
  it('refuses with uncommitted changes and never runs the check', () => {
    const main = repo('dirty', false);
    writeFileSync(join(main, 'a.txt'), 'changed');
    let ran = false;
    lines.length = 0;
    expect(finish(['--repo', main], io, () => ((ran = true), { status: 0, output: '' }))).toBe(1);
    expect(ran).toBe(false);
    expect(lines.join('\n')).toMatch(/REFUSED: 1 uncommitted/);
  });
  it('runs the check in a WSL clone on Windows and reports the result', () => {
    const main = repo('clean', false);
    const calls: string[][] = [];
    lines.length = 0;
    const ok = finish(['--repo', main, '--check', 'npm test'], io, (c, a, i) => (calls.push([c, ...a, i]), { status: 0, output: 'a\nall good\n' }), true);
    expect(ok).toBe(0);
    expect(calls[0]?.slice(0, 3)).toEqual(['wsl', '-e', 'bash']);
    expect(calls[0]?.[4]).toMatch(/--branch 'main'.*npm test/);
    expect(lines.join('\n')).toMatch(/^PASS main/);
    expect(finish(['--repo', main], io, () => ({ status: 3, output: 'boom' }), true)).toBe(1);
    expect(lines.at(-1)).toMatch(/^FAIL .*exit 3.*\nboom/);
  });
  it('refuses a detached HEAD', () => {
    const main = repo('det', false);
    g(main, 'checkout', '-q', '--detach');
    lines.length = 0;
    expect(finish(['--repo', main], io, () => ({ status: 0, output: '' }))).toBe(1);
    expect(lines.join(' ')).toMatch(/detached/);
  });
  it('turns a Windows path into a WSL one and quotes the clone script', () => {
    expect(toWsl('C:\\projects\\game kit')).toBe('/mnt/c/projects/game kit');
    expect(script("/mnt/c/it's", 'b', 'id', 'i', 'c')).toContain(`'file:///mnt/c/it'\\''s'`);
  });
});
