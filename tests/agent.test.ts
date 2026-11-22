import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { finish, teardown, type Bg } from '../scripts/agent.mjs';

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
    expect(sent[1]).toContain('npm run check'); // sent[0] is the K572 queue status query
    expect(sent[1]).toContain(`"$H" run --label 'finish `); // K399: through the heavy queue when installed
    expect(finish(['--repo', main, '--check', 'echo hi'], io, () => ({ status: 3, output: 'boom' }), false)).toBe(1);
    expect(out[1]!.startsWith(`check failed ${sha} (check: echo hi) `)).toBe(true); // K416
    expect(out[1]).toContain('exit 3');
    expect(out[1]).toContain('boom');
    expect(finish(['--repo', main, '--check', 'echo hi'], io, () => ({ status: 0, output: '' }), false)).toBe(0);
    expect(out[2]!.startsWith(`check passed ${sha} (check: echo hi) `)).toBe(true);
    expect(out[2]).not.toContain(`PASS ${sha}`);
    expect(out[2]).not.toMatch(/^PASS [0-9a-f]{40}/);
    expect(out[0]).not.toContain('check:');
    expect(out[0]!.startsWith(`PASS ${sha} `)).toBe(true);
  });
  it('finish: TMPDIR inside the clone; a Windows worktree seen from non-Windows is refused; no WSL is FAIL, never a local run (K228)', () => {
    const main = repo('w7');
    fs.rmSync(path.join(main, 'node_modules'), { recursive: true });
    const out: string[] = [];
    const io = { out: (l: string) => void out.push(l), err: (l: string) => void out.push(l) };
    const sent: string[] = [];
    finish(['--repo', main], io, (_c, _a, input) => (sent.push(input), { status: 0, output: '' }), false);
    expect(sent[1]).toContain('export TMPDIR="$d-tmp"');
    const cmds: string[] = [];
    expect(finish(['--repo', main], io, (c) => (cmds.push(c), { status: null, output: '' }), true)).toBe(1);
    expect(cmds).toEqual(['wsl']);
    expect(out.at(-1)).toMatch(/^FAIL [0-9a-f]{40} .*WSL is unavailable/);
    const wt = path.join(root, 'w7-wt');
    g(main, 'worktree', 'add', '-q', '-b', 'winwt', wt, 'origin/main');
    fs.rmSync(path.join(wt, '.git'), { force: true });
    fs.writeFileSync(path.join(wt, '.git'), 'gitdir: C:/projects/x/.git/worktrees/winwt\n');
    out.length = 0;
    expect(finish(['--repo', wt], io, () => ({ status: 0, output: '' }), false)).toBe(2);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('Windows node');
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

describe('finish: one run per branch, sign of life, --detach and --result (K572)', () => {
  const io = () => { const out: string[] = []; const err: string[] = []; return { out, err, io: { out: (l: string) => void out.push(l), err: (l: string) => void err.push(l) } }; };
  const isStatus = (input: string) => input.includes('"$H" status');
  const job = (o: Record<string, unknown>) => ({ id: 'j9', label: 'finish main', priority: 'normal', queuedAt: 5, ...o });
  const st = (running: unknown[], waiting: unknown[]) => ({ status: 0, output: JSON.stringify({ slots: 1, running, waiting, history: [] }) });
  function fresh(name: string) { const main = repo(name); fs.rmSync(path.join(main, 'node_modules'), { recursive: true }); return { main, sha: g(main, 'rev-parse', 'HEAD').trim() }; }
  function fakeBg(home: string, onSleep: (t: number) => void = () => {}) {
    const b = { t: 1000, starts: [] as string[], home, start: (dir: string) => void b.starts.push(dir), sleep: (ms: number) => { b.t += ms; onSleep(b.t); }, now: () => b.t };
    return b;
  }

  it('a second run is refused while the queue holds finish <branch>: job named, exit 3, nothing cloned', () => {
    const { main } = fresh('k1');
    for (const [s, word] of [[st([job({ runningMs: 125000 })], []), 'running for 02:05'], [st([], [job({ waitedMs: 61000 })]), 'waiting for 01:01']] as const) {
      const o = io(); const sent: string[] = [];
      expect(finish(['--repo', main], o.io, (_c, _a, input) => (sent.push(input), isStatus(input) ? s : { status: 0, output: '' }), false)).toBe(3);
      expect(o.err[0]).toContain('job j9 "finish main"');
      expect(o.err[0]).toContain(word);
      expect(sent.filter((x) => !isStatus(x))).toHaveLength(0);
      expect(o.out.join('\n')).not.toMatch(/PASS/);
    }
  });

  it('queue unreachable or not installed: the run goes ahead as before', () => {
    const { main, sha } = fresh('k2');
    for (const s of [{ status: 3, output: 'no queue at http://127.0.0.1:1' }, { status: 9, output: '' }]) {
      const o = io(); const sent: string[] = [];
      expect(finish(['--repo', main], o.io, (_c, _a, input) => (sent.push(input), isStatus(input) ? s : { status: 0, output: 'all good' }), false)).toBe(0);
      expect(sent).toHaveLength(2);
      expect(o.out[0]!.startsWith(`PASS ${sha} `)).toBe(true);
    }
  });

  it('prints queued, N ahead then running, mm:ss about once a minute, then PASS as before', () => {
    const { main, sha } = fresh('k3');
    const home = path.join(root, 'k3-home');
    let rcDir = '';
    const b = fakeBg(home, (t) => { if (t >= 201000 && rcDir) { fs.writeFileSync(path.join(rcDir, 'out.log'), 'all good\n'); fs.writeFileSync(path.join(rcDir, 'rc'), '0\n'); } });
    b.start = (dir: string) => { rcDir = dir; b.starts.push(dir); };
    const exec = (_c: string, _a: string[], input: string) => b.t < 101000 ? st([job({ id: 'o', label: 'other' })], [job({ id: 'a', label: 'x', queuedAt: 1 }), job({ id: 'b', label: 'y', priority: 'high', queuedAt: 9 }), job({ waitedMs: 1 }), job({ id: 'c', label: 'z', queuedAt: 7 })]) : isStatus(input) ? st([job({ runningMs: b.t - 101000 })], []) : { status: 0, output: '' };
    // the first status query (before the run) must not see our own job: a queue with only others
    let first = true;
    const o = io();
    expect(finish(['--repo', main], o.io, (c, a, input) => { if (first) { first = false; return st([], []); } return exec(c, a, input); }, false, b as Bg)).toBe(0);
    expect(o.out.slice(0, 3)).toEqual(['finish main: queued, 2 ahead', 'finish main: running, 00:20', 'finish main: running, 01:20']);
    expect(o.out[3]!.startsWith(`PASS ${sha} `)).toBe(true);
    expect(o.out[3]).toContain('all good');
    expect(fs.readFileSync(path.join(rcDir, 'run.sh'), 'utf8')).toContain('in.sh');
    expect(fs.readFileSync(path.join(rcDir, 'in.sh'), 'utf8')).toContain(`--label 'finish main'`);
  });

  it('--detach returns at once; --result says running, then gives the stored PASS and exit 0, or a failure and non-zero', () => {
    const { main, sha } = fresh('k4');
    const home = path.join(root, 'k4-home');
    const b = fakeBg(home);
    let queue = st([], []);
    const exec = (_c: string, _a: string[], input: string) => isStatus(input) ? queue : { status: 0, output: '' };
    const o = io();
    expect(finish(['--repo', main, '--detach'], o.io, exec, false, b as Bg)).toBe(0);
    expect(b.starts).toHaveLength(1);
    const dir = b.starts[0]!;
    expect(dir.startsWith(path.join(home, '.game-kit', 'finish'))).toBe(true);
    expect(o.out[0]).toContain(dir);
    queue = st([job({ runningMs: 65000 })], []);
    expect(finish(['--repo', main, '--result'], o.io, exec, false, b as Bg)).toBe(4);
    expect(o.out[1]).toMatch(/^finish main: running, 01:05; result: /);
    fs.writeFileSync(path.join(dir, 'out.log'), 'tests ok\n');
    fs.writeFileSync(path.join(dir, 'rc'), '0\n');
    expect(finish(['--repo', main, '--result'], o.io, exec, false, b as Bg)).toBe(0);
    expect(o.out[2]!.startsWith(`PASS ${sha} `)).toBe(true);
    expect(o.out[2]).toContain('tests ok');
    queue = st([], []);
    expect(finish(['--repo', main, '--detach'], o.io, exec, false, b as Bg)).toBe(0);
    expect(fs.existsSync(path.join(dir, 'rc'))).toBe(false);
    fs.writeFileSync(path.join(dir, 'out.log'), 'boom\n');
    fs.writeFileSync(path.join(dir, 'rc'), '2\n');
    expect(finish(['--repo', main, '--result'], o.io, exec, false, b as Bg)).toBe(1);
    expect(o.out.at(-1)!.startsWith(`FAIL ${sha} `)).toBe(true);
    expect(o.out.at(-1)).toContain('exit 2');
    expect(o.out.at(-1)).toContain('boom');
  });
});
