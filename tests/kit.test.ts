import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  git(src, 'tag', '-f', '-a', msg, '-m', msg);
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
  put(path.join(src, 'components/gamma/component.json'), '{"needs":["beta"],"packages":["left-pad"]}');
  commit('v4');
  put(path.join(src, 'scripts/agent.mjs'), '// worker commands\n');
  put(path.join(src, 'components/alpha/README.md'), 'Alpha. [recipe](../../docs/recipes/guide.md#setup)\n');
  put(path.join(src, 'components/beta/README.md'), 'Beta.\n');
  put(path.join(src, 'docs/patterns/p.md'), 'Pattern.\n');
  put(path.join(src, 'docs/worker-rules.md'), 'Use seeded examples.\n');
  put(path.join(src, 'docs/recipes/guide.md'), '[installed](../../components/alpha/README.md#use) [available](../../components/beta/README.md#use) [catalog](../CATALOG.md) [pattern][p]\n\n[p]: ../patterns/p.md\n\n    [literal](../../components/alpha/README.md)\n');
  commit('k751');
  git(src, 'reset', '--hard', 'v4');
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

  it('K238: check warns about packages the game lacks, and passes', () => {
    const g = game();
    put(path.join(g, 'package.json'), '{"dependencies":{}}');
    expect(run(g, 'pull', src, 'v4', 'gamma').status).toBe(0);
    const c = run(g, 'check');
    expect(c.status).toBe(0);
    expect(c.stderr).toContain('gamma needs package(s) this game lacks: left-pad');
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
    const lock = JSON.parse(fs.readFileSync(f, 'utf8')) as { ref?: string; support?: unknown; components: Record<string, { ref?: string }> };
    for (const c of Object.values(lock.components)) c.ref = 'v1';
    delete lock.ref;
    delete lock.support;
    fs.writeFileSync(f, JSON.stringify(lock));
    put(path.join(g, 'kit/kit.mjs'), '// Legacy CLI fixture.');
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
    const pf = spawnSync('node', [KIT, 'pull', src, 'v2'], { cwd: g, encoding: 'utf8', env: { ...process.env, KIT_TEST_FAULT: 'rename-eperm,fallback' } });
    expect(pf.status).toBe(1);
    expect(pf.stderr).toContain('swap: forced');
    expect(fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8')).toBe(before);
    expect(fs.readFileSync(path.join(g, 'kit/alpha/a.txt'), 'utf8')).toBe('one\n');
    expect(fs.existsSync(path.join(g, 'kit.new')) || fs.existsSync(path.join(g, 'kit.old'))).toBe(false);
    expect(run(g, 'check').status).toBe(0);
    const p2 = spawnSync('node', [KIT, 'pull', src, 'v2'], { cwd: g, encoding: 'utf8', env: { ...process.env, KIT_TEST_FAULT: 'rename2,fallback' } });
    expect(p2.status).toBe(1);
    expect(fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8')).toBe(before);
    expect(fs.readFileSync(path.join(g, 'kit/alpha/a.txt'), 'utf8')).toBe('one\n');
    expect(fs.existsSync(path.join(g, 'kit.new')) || fs.existsSync(path.join(g, 'kit.old'))).toBe(false);
    expect(run(g, 'check').status).toBe(0);
    const p3 = spawnSync('node', [KIT, 'pull', src, 'v2'], { cwd: g, encoding: 'utf8', env: { ...process.env, KIT_TEST_FAULT: 'rename2' } });
    expect(p3.status).toBe(0);
    expect(p3.stdout).toContain('replaced by copy');
    expect(run(g, 'check').status).toBe(0);
    fs.rmSync(path.join(g, 'kit'), { recursive: true, force: true });
    run(g, 'pull', src, 'v1', 'alpha');
    const pe = spawnSync('node', [KIT, 'pull', src, 'v2'], { cwd: g, encoding: 'utf8', env: { ...process.env, KIT_TEST_FAULT: 'rename-eperm' } });
    expect(pe.status).toBe(0);
    expect(pe.stdout).toContain('replaced by copy');
    expect(fs.readFileSync(path.join(g, 'kit/alpha/a.txt'), 'utf8')).not.toBe('one\n');
    expect(fs.existsSync(path.join(g, 'kit.new')) || fs.existsSync(path.join(g, 'kit.old'))).toBe(false);
    expect(run(g, 'check').status).toBe(0);
    fs.rmSync(path.join(g, 'kit'), { recursive: true, force: true });
    run(g, 'pull', src, 'v1', 'alpha');
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

  it('K233: pull copies docs/recipes to kit/recipes; check guards it', () => {
    put(path.join(src, 'docs/recipes/r.md'), 'recipe');
    commit('v-rec');
    const g = game();
    expect(run(g, 'pull', src, 'v-rec', 'alpha').status).toBe(0);
    expect(fs.readFileSync(path.join(g, 'kit/recipes/r.md'), 'utf8')).toBe('recipe');
    expect(run(g, 'check').status).toBe(0);
    put(path.join(g, 'kit/recipes/r.md'), 'edited');
    put(path.join(g, 'kit/recipes/new.md'), 'x');
    const c = run(g, 'check');
    expect(c.status).toBe(1);
    expect(c.stderr).toContain('changed kit/recipes/r.md');
    expect(c.stderr).toContain('added   kit/recipes/new.md');
    const h = game();
    run(h, 'pull', src, 'v1', 'alpha');
    put(path.join(h, 'kit/recipes/r.md'), 'x');
    expect(run(h, 'check').stderr).toContain('stray   kit/recipes');
  });

  it.each([
    ['CATALOG.md', 'changed'], ['CATALOG.md', 'missing'], ['kit.mjs', 'changed'], ['kit.mjs', 'missing'],
    ['agent.mjs', 'changed'], ['recipes/guide.md', 'changed'],
  ])('K751: an external checker catches %s %s', (file, kind) => {
    const g = game();
    expect(run(g, 'pull', src, 'k751', 'alpha').status).toBe(0);
    expect(run(g, 'check', '--source', src).status).toBe(0);
    const target = path.join(g, 'kit', file);
    if (kind === 'missing') fs.rmSync(target);
    else fs.appendFileSync(target, '\n<!-- harmless edit -->\n');
    for (const args of [[], ['--source', src]]) {
      const result = run(g, 'check', ...args);
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain(kind + ' kit/' + file);
    }
  });

  it('K751: pinned docs point to installed guides and pinned source for other reads', () => {
    const g = game();
    const h = game();
    expect(run(g, 'pull', src, 'k751', 'alpha').status).toBe(0);
    expect(run(h, 'pull', src, 'k751', 'alpha').status).toBe(0);
    const commit = git(src, 'rev-parse', 'k751^{commit}').trim();
    const guide = (root: string) => fs.readFileSync(path.join(root, 'kit/recipes/guide.md'), 'utf8');
    const readme = fs.readFileSync(path.join(g, 'kit/alpha/README.md'), 'utf8');
    expect(guide(g)).toContain('[installed](../alpha/README.md#use)');
    expect(guide(g)).toContain('[available](https://github.com/pateta51-ops/game-kit/blob/' + commit + '/components/beta/README.md#use)');
    expect(guide(g)).toContain('[pattern][p]');
    expect(guide(g)).toContain('[p]: https://github.com/pateta51-ops/game-kit/blob/' + commit + '/docs/patterns/p.md');
    expect(guide(g)).toContain('[catalog](../CATALOG.md)');
    expect(guide(g)).toContain('    [literal](../../components/alpha/README.md)');
    expect(readme).toContain('[recipe](../recipes/guide.md#setup)');
    expect(git(src, 'show', 'k751:docs/recipes/guide.md')).toContain('[installed](../../components/alpha/README.md#use)');
    expect(guide(g)).toBe(guide(h));
    expect(fs.readFileSync(path.join(g, 'kit/kit.lock.json'), 'utf8')).toBe(fs.readFileSync(path.join(h, 'kit/kit.lock.json'), 'utf8'));
    expect(fs.existsSync(path.join(g, 'kit/beta'))).toBe(false);
    expect(run(g, 'check', '--source', src).status).toBe(0);
  });

  it('K751: source checking rejects an edited rendered doc with a matching local digest', () => {
    const g = game();
    expect(run(g, 'pull', src, 'k751', 'alpha').status).toBe(0);
    const file = 'kit/recipes/guide.md';
    const lockFile = path.join(g, 'kit/kit.lock.json');
    const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')) as { support?: { files: Record<string, { hash: string }> }; recipes?: { files: Record<string, string> } };
    put(path.join(g, file), 'arbitrary local text');
    const hash = createHash('sha256').update('arbitrary local text').digest('hex');
    if (lock.support) (lock.support.files[file] as { hash: string }).hash = hash;
    if (lock.recipes) lock.recipes.files[file] = hash;
    fs.writeFileSync(lockFile, JSON.stringify(lock));
    expect(run(g, 'check').status).toBe(0);
    const result = run(g, 'check', '--source', src);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(file);
  });

  it('K751: verifies the managed worker rules while allowing game-owned instructions', () => {
    const g = game();
    const file = path.join(g, 'AGENTS.md');
    put(file, '# Game instructions\n');
    expect(run(g, 'pull', src, 'k751', 'alpha').status).toBe(0);
    const rules = fs.readFileSync(file, 'utf8');
    expect(rules).toContain('Use seeded examples.');
    fs.appendFileSync(file, '\n## Game instructions\nRead the game rules.\n');
    expect(run(g, 'check', '--source', src).status).toBe(0);
    put(file, rules.replace('Use seeded examples.', 'Edit the examples.'));
    const changed = run(g, 'check');
    expect(changed.status, changed.stderr).toBe(1);
    expect(changed.stderr).toContain('changed AGENTS.md worker rules');
  });

  it('K751: legacy pins keep their files and report the limits of their lock', () => {
    const g = game();
    const h = game();
    const old = path.join(src, 'kit.mjs');
    const cli = fs.readFileSync(old, 'utf8');
    try {
      put(old, '// Legacy CLI fixture.\n');
      commit('k751-legacy');
    } finally {
      git(src, 'reset', '--hard', 'v4');
      put(old, cli);
    }
    expect(run(g, 'pull', src, 'k751-legacy', 'alpha').status).toBe(0);
    expect(fs.readFileSync(path.join(g, 'kit/kit.mjs'), 'utf8')).toBe('// Legacy CLI fixture.\n');
    const legacy = run(g, 'check', '--source', src);
    expect(legacy.status, legacy.stderr).toBe(0);
    expect(legacy.stderr).toContain('legacy lock');
    expect(legacy.stderr).toContain('kit.mjs and CATALOG.md');
    expect(run(h, 'pull', src, 'k751', 'alpha').status).toBe(0);
    const file = path.join(h, 'kit/kit.lock.json');
    const lock = JSON.parse(fs.readFileSync(file, 'utf8')) as { support?: unknown };
    delete lock.support;
    put(file, JSON.stringify(lock));
    const missing = run(h, 'check', '--source', src);
    expect(missing.status, missing.stderr).toBe(1);
    expect(missing.stderr).toContain('re-pull the same ref');
    expect(run(h, 'pull', src, 'k751').status).toBe(0);
    expect(run(h, 'check', '--source', src).status).toBe(0);
  });

  it('K751: a failed support-file verification preserves an existing pin', () => {
    const g = game();
    expect(run(g, 'pull', src, 'v4', 'alpha').status).toBe(0);
    const lock = path.join(g, 'kit/kit.lock.json');
    const catalog = path.join(g, 'kit/CATALOG.md');
    const original = [lock, catalog].map((file) => fs.readFileSync(file, 'utf8'));
    const failed = spawnSync('node', [KIT, 'pull', src, 'k751'], {
      cwd: g, encoding: 'utf8', env: { ...process.env, KIT_TEST_FAULT: 'verify-support' },
    });
    expect(failed.status, failed.stderr).toBe(1);
    expect(failed.stderr).toContain('file kit/kit.mjs did not verify');
    expect([lock, catalog].map((file) => fs.readFileSync(file, 'utf8'))).toEqual(original);
    expect(fs.existsSync(path.join(g, 'kit/recipes'))).toBe(false);
    expect(fs.existsSync(path.join(g, 'AGENTS.md'))).toBe(false);
    expect(run(g, 'check', '--source', src).status).toBe(0);
  });

  it('K751: an interrupted stamp restores the original tree after adding a component', () => {
    const g = game();
    expect(run(g, 'pull', src, 'v4', 'alpha').status).toBe(0);
    const kit = path.join(g, 'kit');
    const snapshot = (dir: string) => fs.readdirSync(dir, { recursive: true }).sort().map((file) => {
      const full = path.join(dir, file);
      return [file, fs.statSync(full).isFile() ? fs.readFileSync(full) : null];
    });
    const original = snapshot(kit);
    const shim = path.join(g, 'fail-stamp.mjs');
    put(shim, `import fs from 'node:fs';
const rename = fs.renameSync;
fs.renameSync = (from, to) => {
  if (from === 'AGENTS.md.kit-tmp' && to === 'AGENTS.md') throw new Error('forced stamp failure');
  return rename(from, to);
};
`);
    const upgrade = () => spawnSync('node', ['--import', shim, KIT, 'pull', src, 'k751', 'beta'], { cwd: g, encoding: 'utf8' });
    const failed = upgrade();
    expect(failed.status, failed.stderr).toBe(1);
    expect(failed.stderr).toContain('forced stamp failure');
    expect(snapshot(kit)).toEqual(original);
    expect(fs.existsSync(path.join(g, 'kit.old'))).toBe(false);
    expect(fs.existsSync(path.join(g, 'AGENTS.md.kit-tmp'))).toBe(false);
    expect(run(g, 'check', '--source', src).status).toBe(0);

    fs.appendFileSync(shim, `const remove = fs.rmSync;
fs.rmSync = (file, options) => {
  if (file === 'kit/beta') throw new Error('forced rollback failure');
  return remove(file, options);
};
`);
    const interrupted = upgrade();
    expect(interrupted.status, interrupted.stderr).toBe(1);
    expect(interrupted.stderr).toContain('forced rollback failure');
    const backup = path.join(g, 'kit.old');
    expect(snapshot(backup)).toEqual(original);
    const retry = run(g, 'pull', src, 'k751', 'beta');
    expect(retry.status, retry.stderr).toBe(1);
    expect(retry.stderr).toContain('kit.old');
    expect(snapshot(backup)).toEqual(original);
  });

  it('K751: a successful copy swap prunes retired support directories', () => {
    const g = game();
    expect(run(g, 'pull', src, 'k751', 'alpha').status).toBe(0);
    expect(fs.existsSync(path.join(g, 'kit/recipes'))).toBe(true);
    const copied = spawnSync('node', [KIT, 'pull', src, 'v4'], {
      cwd: g, encoding: 'utf8', env: { ...process.env, KIT_TEST_FAULT: 'rename-eperm' },
    });
    expect(copied.status, copied.stderr).toBe(0);
    expect(copied.stdout).toContain('kit/ replaced by copy');
    expect(fs.existsSync(path.join(g, 'kit/recipes'))).toBe(false);
    expect(run(g, 'check', '--source', src).status).toBe(0);
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

  it('K257: check --source passes, then fails when the annotated tag moved or a file differs', () => {
    git(src, 'tag', '-f', '-a', 'k257', '-m', 'k257');
    const g = game();
    expect(run(g, 'pull', src, 'k257', 'alpha').status).toBe(0);
    expect(run(g, 'check', '--source', src).status).toBe(0);
    put(path.join(src, 'components/alpha/moved.txt'), 'x\n');
    git(src, 'add', '-A'); git(src, 'commit', '-qm', 'K257 later');
    expect(run(g, 'check', '--source', src).status).toBe(0);
    git(src, 'tag', '-f', '-a', 'k257', '-m', 'k257');
    const m = run(g, 'check', '--source', src);
    expect(m.status).toBe(1);
    expect(m.stderr).toContain('tag k257 moved');
    expect(run(g, 'check').status).toBe(0);
    const h = game();
    run(h, 'pull', src, 'k257', 'alpha');
    const lf = path.join(h, 'kit/kit.lock.json');
    const lock = JSON.parse(fs.readFileSync(lf, 'utf8')) as { components: { alpha: { files: Record<string, string> } } };
    fs.writeFileSync(path.join(h, 'kit/alpha/a.txt'), 'edited\n');
    lock.components.alpha.files['kit/alpha/a.txt'] = createHash('sha256').update('edited\n').digest('hex');
    fs.writeFileSync(lf, JSON.stringify(lock));
    const d = run(h, 'check', '--source', src);
    expect(d.status).toBe(1);
    expect(d.stderr).toContain('content differs from the tagged commit: kit/alpha/a.txt');
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
    put(path.join(d, 'plan', 'K300.md'), '---\nsection: x\n---\nrow\n');
    put(path.join(d, 'plan', 'K301-2.md'), '---\nid: K301\n---\nrow\n');
    expect(run(d, 'next-id', '--from', 'plan').stdout.trim()).toBe('K302');
  });
});
