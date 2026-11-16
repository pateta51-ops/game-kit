import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const KIT = path.resolve(import.meta.dirname, '..', 'kit.mjs');
let tmp: string;
let src: string;
let n = 0;
const git = (cwd: string, ...a: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8' });
const commit = (msg: string) => {
  git(src, 'add', '-A');
  git(src, 'commit', '-qm', msg);
  git(src, 'tag', '-f', msg);
};
const run = (cwd: string, ...a: string[]) => spawnSync('node', [KIT, ...a], { cwd, encoding: 'utf8' });
const game = () => {
  const d = path.join(tmp, 'game' + String(++n));
  fs.mkdirSync(d);
  return d;
};
const put = (f: string, s: string) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, s);
};

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-test-'));
  src = path.join(tmp, 'src');
  fs.mkdirSync(src);
  git(src, 'init', '-q');
  git(src, 'config', 'core.autocrlf', 'false');
  fs.copyFileSync(KIT, path.join(src, 'kit.mjs'));
  put(path.join(src, 'components/alpha/a.txt'), 'one\n');
  put(path.join(src, 'components/alpha/sub/b.txt'), 'two\n');
  put(path.join(src, 'components/beta/c.txt'), 'three\n');
  commit('v1');
  put(path.join(src, 'components/alpha/a.txt'), 'one changed\n');
  commit('v2');
  put(path.join(src, 'components/gamma/component.json'), '{"needs":["beta"]}');
  put(path.join(src, 'components/beta/component.json'), '{"needs":["alpha"]}');
  put(path.join(src, 'docs/CATALOG.md'), '# Component catalog\n\n## alpha\n\nThe first letter.\n\n- **Use it when:** you need letters.\n\n## beta\n\nDice maker. More text.\n\n- **Use it when:** you roll.\n');
  commit('v3');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('kit.mjs', () => {
  it('list and search read the catalogue pulled with the components', () => {
    const g = game();
    expect(run(g, 'pull', src, 'v3', 'alpha').status).toBe(0);
    const kit = (...a: string[]) => spawnSync('node', [path.join(g, 'kit/kit.mjs'), ...a], { cwd: g, encoding: 'utf8' }).stdout;
    expect(kit('list')).toBe('alpha: The first letter. (use when: you need letters.)\nbeta: Dice maker. (use when: you roll.)\n');
    expect(kit('search', 'DICE')).toBe('beta: Dice maker. (use when: you roll.)\n');
  });

  it('pull then check passes', () => {
    const g = game();
    const p = run(g, 'pull', src, 'v1', 'alpha', 'beta');
    expect(p.status).toBe(0);
    expect(fs.readFileSync(path.join(g, 'kit/alpha/sub/b.txt'), 'utf8')).toBe('two\n');
    const c = run(g, 'check');
    expect(c.status).toBe(0);
    expect(c.stdout).toContain('alpha@v1');
  });

  it('a changed file fails check', () => {
    const g = game();
    run(g, 'pull', src, 'v1', 'alpha');
    fs.appendFileSync(path.join(g, 'kit/alpha/a.txt'), 'x');
    const c = run(g, 'check');
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('changed kit/alpha/a.txt');
  });

  it('an added file fails check', () => {
    const g = game();
    run(g, 'pull', src, 'v1', 'alpha');
    put(path.join(g, 'kit/alpha/new.txt'), 'n');
    const c = run(g, 'check');
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('added   kit/alpha/new.txt');
  });

  it('a missing file fails check', () => {
    const g = game();
    run(g, 'pull', src, 'v1', 'alpha');
    fs.rmSync(path.join(g, 'kit/alpha/sub/b.txt'));
    const c = run(g, 'check');
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('missing kit/alpha/sub/b.txt');
  });

  it('pull with no names re-pulls the locked components', () => {
    const g = game();
    run(g, 'pull', src, 'v1', 'alpha', 'beta');
    fs.appendFileSync(path.join(g, 'kit/alpha/a.txt'), 'x');
    const p = run(g, 'pull', src, 'v2');
    expect(p.status).toBe(0);
    expect(fs.readFileSync(path.join(g, 'kit/alpha/a.txt'), 'utf8')).toBe('one changed\n');
    const lock = JSON.parse(fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8')) as { components: Record<string, { ref: string }> };
    expect(Object.keys(lock.components).sort()).toEqual(['alpha', 'beta']);
    expect(lock.components['beta']?.ref).toBe('v2');
    expect(run(g, 'check').status).toBe(0);
  });

  it('pull brings the needs transitively; check fails when a need is absent', () => {
    const g = game();
    run(g, 'pull', src, 'v3', 'gamma');
    expect(fs.existsSync(path.join(g, 'kit/alpha/a.txt'))).toBe(true);
    const lock = JSON.parse(fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8')) as { components: Record<string, { ref: string }> };
    expect(Object.keys(lock.components).sort()).toEqual(['alpha', 'beta', 'gamma']);
    expect(run(g, 'check').status).toBe(0);
    delete lock.components['alpha'];
    fs.writeFileSync(path.join(g, 'kit/kit.lock.json'), JSON.stringify(lock));
    fs.rmSync(path.join(g, 'kit/alpha'), { recursive: true });
    const c = run(g, 'check');
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('beta needs alpha');
  });

  it('a need already locked is kept at its ref, never overwritten', () => {
    const g = game();
    run(g, 'pull', src, 'v1', 'alpha');
    const p = run(g, 'pull', src, 'v3', 'gamma');
    expect(p.stdout).toContain('alpha kept at v1');
    expect(fs.readFileSync(path.join(g, 'kit/alpha/a.txt'), 'utf8')).toBe('one\n');
    expect(run(g, 'check').status).toBe(0);
  });

  it('a cycle of needs ends', () => {
    put(path.join(src, 'components/alpha/component.json'), '{"needs":["gamma"]}');
    commit('v4');
    const g = game();
    const p = run(g, 'pull', src, 'v4', 'gamma');
    expect(p.status).toBe(0);
    expect(run(g, 'check').status).toBe(0);
  });
});
