import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { finish, teardown } from '../scripts/agent.mjs';

const KIT = path.resolve(import.meta.dirname, '..', 'kit.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-test-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
const g = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd, encoding: 'utf8' });
const kit = (cwd: string, ...a: string[]) => spawnSync('node', [KIT, ...a], { cwd, encoding: 'utf8' });

function repo(name: string): string {
  const bare = path.join(root, `${name}.git`);
  const main = path.join(root, name);
  g(root, 'init', '-q', '--bare', '-b', 'main', bare);
  g(root, 'clone', '-q', bare, main);
  fs.writeFileSync(path.join(main, 'a.txt'), 'a');
  g(main, 'add', '.');
  g(main, 'commit', '-qm', 'init');
  g(main, 'push', '-q', 'origin', 'HEAD:main');
  fs.mkdirSync(path.join(main, 'node_modules'));
  fs.writeFileSync(path.join(main, 'node_modules', 'x.js'), '1');
  return main;
}

describe('agent commands (K216): plain node, no tsx', () => {
  it('worktree --branch links node_modules; teardown cuts the link only', () => {
    const main = repo('w1');
    expect(kit(main, 'worktree', '--branch', 'b1').status).toBe(0);
    const wt = path.join(main, '.claude', 'worktrees', 'b1');
    expect(fs.readFileSync(path.join(wt, 'node_modules', 'x.js'), 'utf8')).toBe('1');
    expect(g(wt, 'status', '--porcelain').trim()).toBe('');
    expect(kit(main, 'teardown', '--worktree', wt).status).toBe(0);
    expect(fs.existsSync(wt)).toBe(false);
    expect(fs.existsSync(path.join(main, 'node_modules', 'x.js'))).toBe(true);
  });
  it('worktree --here links the main checkout inside an existing worktree and can switch to a new branch', () => {
    const main = repo('w2');
    const wt = path.join(root, 'w2-wt');
    g(main, 'worktree', 'add', '-q', '-b', 'harness', wt, 'origin/main');
    const r = kit(wt, 'worktree', '--here', '--branch', 'k1-x');
    expect(r.status).toBe(0);
    expect(fs.readFileSync(path.join(wt, 'node_modules', 'x.js'), 'utf8')).toBe('1');
    expect(g(wt, 'branch', '--show-current').trim()).toBe('k1-x');
    expect(g(wt, 'status', '--porcelain').trim()).toBe('');
  });
  it('finish refuses a dirty tree and prints no PASS', () => {
    const main = repo('w3');
    fs.writeFileSync(path.join(main, 'new.txt'), 'x');
    const r = kit(main, 'finish');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/REFUSED/);
    expect(r.stdout).not.toMatch(/PASS/);
  });
  it('next-id --reserve takes ids on origin once: a second session gets the next ones', () => {
    const main = repo('w4');
    fs.mkdirSync(path.join(main, 'docs'));
    const plan = path.join(main, 'docs', 'PLAN.md');
    fs.writeFileSync(plan, '| K5 | x | S | done |\n');
    const a = kit(main, 'next-id', '2', '--reserve', '--from', plan);
    expect(a.stdout.trim()).toBe('K6 K7');
    expect(kit(main, 'next-id', '--reserve', '--from', plan).stdout.trim()).toBe('K8');
    expect(kit(main, 'next-id', '--from', plan).stdout.trim()).toBe('K9');
    expect(g(main, 'ls-remote', 'origin', 'refs/kit-reserved/*').split('\n').filter(Boolean)).toHaveLength(3);
  });
  it('finish prints PASS or FAIL with the full head sha, from an injected exec (K216)', () => {
    const main = repo('w5');
    fs.rmSync(path.join(main, 'node_modules'), { recursive: true });
    const sha = g(main, 'rev-parse', 'HEAD').trim();
    const out: string[] = [];
    const io = { out: (l: string) => void out.push(l), err: (l: string) => void out.push(l) };
    const sent: string[] = [];
    expect(finish(['--repo', main], io, (_c, _a, input) => (sent.push(input), { status: 0, output: 'all good' }), false)).toBe(0);
    expect(out[0]).toMatch(new RegExp(`^PASS ${sha} `));
    expect(sent[0]).toContain('npm run check');
    expect(finish(['--repo', main, '--check', 'echo hi'], io, () => ({ status: 3, output: 'boom' }), false)).toBe(1);
    expect(out[1]).toMatch(new RegExp(`^FAIL ${sha} .*exit 3[^]*boom`));
  });
  it('teardown cuts a dangling node_modules link before removing the worktree', () => {
    const main = repo('w6');
    const wt = path.join(root, 'w6-wt');
    g(main, 'worktree', 'add', '-q', '-b', 'dang', wt, 'origin/main');
    const gone = path.join(root, 'gone');
    fs.mkdirSync(gone);
    fs.symlinkSync(gone, path.join(wt, 'node_modules'), 'junction');
    fs.rmdirSync(gone);
    const out: string[] = [];
    expect(teardown(['--repo', main, '--worktree', wt], { out: (l) => void out.push(l), err: (l) => void out.push(l) })).toBe(0);
    expect(fs.existsSync(wt)).toBe(false);
  });
  it('pull records kit/agent.mjs in the lock and check catches an edit; an old lock without it passes', () => {
    const src = path.join(root, 'ksrc');
    fs.mkdirSync(path.join(src, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(src, 'components', 'a'), { recursive: true });
    fs.copyFileSync(KIT, path.join(src, 'kit.mjs'));
    fs.writeFileSync(path.join(src, 'scripts', 'agent.mjs'), '// agent');
    fs.writeFileSync(path.join(src, 'components', 'a', 'f.txt'), 'f');
    g(root, 'init', '-q', src);
    g(src, 'add', '-A');
    g(src, 'commit', '-qm', 'v1');
    g(src, 'tag', 'v1');
    const game = path.join(root, 'kgame');
    fs.mkdirSync(game);
    expect(kit(game, 'pull', src, 'v1', 'a').status).toBe(0);
    expect(kit(game, 'check').status).toBe(0);
    fs.appendFileSync(path.join(game, 'kit', 'agent.mjs'), 'x');
    const c = kit(game, 'check');
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('changed kit/agent.mjs');
    const lock = path.join(game, 'kit', 'kit.lock.json');
    const j = JSON.parse(fs.readFileSync(lock, 'utf8')) as Record<string, unknown>;
    delete j['agent'];
    fs.writeFileSync(lock, JSON.stringify(j));
    expect(kit(game, 'check').status).toBe(0);
  });
});
