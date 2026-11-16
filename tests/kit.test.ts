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
    expect(kit('list')).toBe('alpha: (use when: you need letters.)\nbeta: (use when: you roll.)\n');
    expect(kit('search', 'DICE')).toBe('beta: Dice maker. (use when: you roll.)\n');
    fs.mkdirSync(path.join(g, 'kit/alpha'), { recursive: true });
    fs.writeFileSync(path.join(g, 'kit/alpha/index.ts'), "export * from './z';\nexport { a as renamed, type T } from './y';\n");
    fs.writeFileSync(path.join(g, 'kit/alpha/z.ts'), 'export function withZones() {}\nexport const slots = 1;\n');
    expect(kit('search', 'withzones')).toBe('alpha: The first letter. (use when: you need letters.) [export: withZones]\n');
    expect(kit('search', 'renamed')).toContain('[export: renamed]');
    expect(kit('search', 'letter')).not.toContain('[export');
  });

  it('pull then check passes', () => {
    const g = game();
    const p = run(g, 'pull', src, 'v1', 'alpha', 'beta');
    expect(p.status).toBe(0);
    expect(fs.readFileSync(path.join(g, 'kit/alpha/sub/b.txt'), 'utf8')).toBe('two\n');
    const c = run(g, 'check');
    expect(c.status).toBe(0);
    expect(c.stdout).toContain('kit ok at v1: alpha, beta');
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
    const lock = JSON.parse(fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8')) as { ref: string; components: Record<string, unknown> };
    expect(Object.keys(lock.components).sort()).toEqual(['alpha', 'beta']);
    expect(lock.ref).toBe('v2');
    expect(run(g, 'check').status).toBe(0);
  });

  it('pull brings the needs transitively; check fails when a need is absent', () => {
    const g = game();
    run(g, 'pull', src, 'v3', 'gamma');
    expect(fs.existsSync(path.join(g, 'kit/alpha/a.txt'))).toBe(true);
    const lock = JSON.parse(fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8')) as { components: Record<string, unknown> };
    expect(Object.keys(lock.components).sort()).toEqual(['alpha', 'beta', 'gamma']);
    expect(run(g, 'check').status).toBe(0);
    delete lock.components['alpha'];
    fs.writeFileSync(path.join(g, 'kit/kit.lock.json'), JSON.stringify(lock));
    fs.rmSync(path.join(g, 'kit/alpha'), { recursive: true });
    const c = run(g, 'check');
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('beta needs alpha');
  });

  it('K227: pull <tag> with names moves the whole kit to that tag and adds them', () => {
    const g = game();
    run(g, 'pull', src, 'v1', 'alpha');
    const p = run(g, 'pull', src, 'v3', 'gamma');
    expect(p.status).toBe(0);
    expect(fs.readFileSync(path.join(g, 'kit/alpha/a.txt'), 'utf8')).toBe('one changed\n');
    const lock = JSON.parse(fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8')) as { ref: string };
    expect(lock.ref).toBe('v3');
    expect(run(g, 'check').status).toBe(0);
  });

  it('K227: an old per-component lock still checks, and the next pull converts it', () => {
    const g = game();
    run(g, 'pull', src, 'v1', 'alpha');
    const f = path.join(g, 'kit/kit.lock.json');
    const lock = JSON.parse(fs.readFileSync(f, 'utf8')) as { ref?: string; commit?: string; components: Record<string, { ref?: string }> };
    for (const c of Object.values(lock.components)) c.ref = 'v1';
    delete lock.ref;
    fs.writeFileSync(f, JSON.stringify(lock));
    const c = run(g, 'check');
    expect(c.status).toBe(0);
    expect(c.stdout).toContain('alpha@v1');
    const p = run(g, 'pull', src, 'v2');
    expect(p.stdout).toContain('converted');
    expect((JSON.parse(fs.readFileSync(f, 'utf8')) as { ref: string }).ref).toBe('v2');
    expect(run(g, 'check').status).toBe(0);
  });

  it('K227: a failed pull leaves kit/ exactly as it was and says what failed', () => {
    const g = game();
    run(g, 'pull', src, 'v1', 'alpha');
    const before = fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8');
    const p = run(g, 'pull', src, 'v1', 'nosuch');
    expect(p.status).toBe(1);
    expect(p.stderr).toContain('component nosuch is not in v1');
    expect(run(g, 'pull', src, 'v99').stderr).toContain('no tag or commit v99');
    expect(fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8')).toBe(before);
    expect(fs.existsSync(path.join(g, 'kit.new'))).toBe(false);
    expect(run(g, 'check').status).toBe(0);
  });

  it('K227: a failed swap restores kit/; a file that does not verify and a ref with no kit.mjs fail the pull', () => {
    const g = game();
    run(g, 'pull', src, 'v1', 'alpha');
    const before = fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8');
    for (const fault of ['swap', 'verify']) {
      const p = spawnSync('node', [KIT, 'pull', src, 'v2'], { cwd: g, encoding: 'utf8', env: { ...process.env, KIT_TEST_FAULT: fault } });
      expect(p.status).toBe(1);
      expect(p.stderr).toContain(fault === 'swap' ? 'swap: forced' : 'did not verify');
      expect(fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8')).toBe(before);
      expect(fs.readFileSync(path.join(g, 'kit/alpha/a.txt'), 'utf8')).toBe('one\n');
      expect(fs.existsSync(path.join(g, 'kit.new')) || fs.existsSync(path.join(g, 'kit.old'))).toBe(false);
      expect(run(g, 'check').status).toBe(0);
    }
    const bare = path.join(tmp, 'bare' + String(++n));
    fs.mkdirSync(bare);
    git(bare, 'init', '-q');
    put(path.join(bare, 'components/alpha/a.txt'), 'x');
    git(bare, 'add', '-A');
    git(bare, 'commit', '-qm', 'nokit');
    const p = run(g, 'pull', bare, 'HEAD');
    expect(p.status).toBe(1);
    expect(p.stderr).toContain('no kit.mjs in HEAD');
    expect(fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8')).toBe(before);
  });

  it('K227: outdated says so when the game is on a tag newer than the latest', () => {
    const g = game();
    run(g, 'pull', src, 'v1', 'alpha');
    const f = path.join(g, 'kit/kit.lock.json');
    const lock = JSON.parse(fs.readFileSync(f, 'utf8')) as { ref: string };
    lock.ref = 'v99.0.0';
    fs.writeFileSync(f, JSON.stringify(lock));
    const o = run(g, 'outdated', src);
    expect(o.status).toBe(0);
    expect(o.stdout).toContain('v99.0.0 is newer than the latest tag');
    expect(o.stdout).not.toContain('PLAN rows');
  });

  it('K227: check reports a stray folder or file in kit/', () => {
    const g = game();
    run(g, 'pull', src, 'v1', 'alpha');
    put(path.join(g, 'kit/other/x.txt'), 'x');
    put(path.join(g, 'kit/notes.md'), 'x');
    const c = run(g, 'check');
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('stray   kit/other');
    expect(c.stderr).toContain('stray   kit/notes.md');
  });

  it('K227: outdated shows the tag, the latest, the rows and breaking notes between', () => {
    const g = game();
    run(g, 'pull', src, 'v1', 'alpha');
    put(path.join(src, 'components/alpha/README.md'), '# alpha\n');
    git(src, 'add', '-A'); git(src, 'commit', '-qm', 'K900 alpha grows');
    put(path.join(src, 'components/alpha/README.md'), '# alpha\nBreaking: a renamed.\n');
    git(src, 'add', '-A'); git(src, 'commit', '-qm', 'K901 breaking alpha rename');
    git(src, 'tag', 'v9.9.9');
    const o = run(g, 'outdated', src);
    expect(o.status).toBe(0);
    expect(o.stdout).toContain('game kit: v1; latest: v9.9.9');
    expect(o.stdout).toContain('K900 alpha grows');
    expect(o.stdout).toContain('K901 breaking alpha rename   <- BREAKING');
    expect(o.stdout).toContain('README alpha: Breaking: a renamed.');
  });

  it('a cycle of needs ends', () => {
    put(path.join(src, 'components/alpha/component.json'), '{"needs":["gamma"]}');
    commit('v4');
    const g = game();
    const p = run(g, 'pull', src, 'v4', 'gamma');
    expect(p.status).toBe(0);
    expect(run(g, 'check').status).toBe(0);
  });

  it('next-id: highest K number over all given plans + 1, n of them (K208)', () => {
    const d = game();
    put(path.join(d, 'a.md'), '| K9 | x | L |\n| K207 | y | S | done |\n| Kx | z |\n');
    put(path.join(d, 'b.md'), '| K210 | open PR row | S |\n');
    expect(run(d, 'next-id', '--from', 'a.md', 'b.md').stdout.trim()).toBe('K211');
    expect(run(d, 'next-id', '3', '--from', 'a.md').stdout.trim()).toBe('K208 K209 K210');
  });
});
