import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(import.meta.dirname, '..', 'scripts', 'check-components.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const make = (comps: Record<string, { needs?: string[]; packages?: string[]; files?: Record<string, string>; bare?: boolean; readme?: string }>) => {
  const root = path.join(tmp, 'r' + String(++n));
  for (const [name, c] of Object.entries(comps)) {
    const d = path.join(root, 'components', name);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'component.json'), JSON.stringify({ name, source: { game: 'g', commit: 'c', paths: [] }, needs: c.needs ?? [], packages: c.packages ?? [] }));
    if (!c.bare) {
      fs.writeFileSync(path.join(d, 'README.md'), c.readme ?? '# ' + name + '\n\n## Rules for agents\n');
      fs.writeFileSync(path.join(d, 'a.test.ts'), '');
    }
    for (const [f, s] of Object.entries(c.files ?? {})) fs.writeFileSync(path.join(d, f), s);
  }
  return spawnSync('node', [SCRIPT, root], { encoding: 'utf8' });
};

describe('check-components', () => {
  it('a clean component passes', () => {
    expect(make({ a: { files: { 'x.ts': "import { y } from './y'\n" } } }).status).toBe(0);
  });
  it('a README without the Rules for agents heading fails', () => {
    const r = make({ a: { readme: '# a\n\nUse it.\n' } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Rules for agents');
  });
  it('an escaping static import fails', () => {
    const r = make({ a: { files: { 'x.ts': "import { y } from '../b/y'\n" } }, b: {} });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('outside its folder');
  });
  it('an escaping new URL fails', () => {
    expect(make({ a: { files: { 'x.ts': "const u = new URL('../x', import.meta.url)\n" } } }).status).toBe(1);
  });
  it('an unknown needs name fails', () => {
    const r = make({ a: { needs: ['ghost'] } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ghost');
  });
  it('an import into a listed need passes', () => {
    expect(make({ a: { needs: ['b'], files: { 'x.ts': "import { y } from '../b/y'\n" } }, b: {} }).status).toBe(0);
  });
});

describe('K256 README and tests', () => {
  it('a component without README.md fails', () => {
    const r = make({ a: { bare: true, files: { 'a.test.ts': '' } } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('README.md missing');
  });
  it('an empty first README line fails', () => {
    expect(make({ a: { files: { 'README.md': '\n' } } }).status).toBe(1);
  });
  it('a component without a test file fails', () => {
    const r = make({ a: { bare: true, files: { 'README.md': '# a\n' } } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no test file');
  });
  it('a test_*.py counts as a test', () => {
    expect(make({ a: { bare: true, files: { 'README.md': '# a\n', 'test_x.py': '' } } }).status).toBe(0);
  });
});

describe('K238 packages (GAPS-3 tooling A10)', () => {
  it('lists every package the code imports, as a bare name', () => {
    const r = make({ a: { files: { 'x.ts': "import { z } from 'zod'\nimport fs from 'node:fs'\n" } } });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('imports package zod');
    expect(make({ a: { packages: ['zod'], files: { 'x.ts': "import { z } from 'zod'\n", 'x.test.ts': "import { it } from 'vitest'\n" } } }).status).toBe(0);
    const bad = make({ a: { packages: ['react (ui only)'] } });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('bare package names');
  });
});

describe('catalog.mjs --check', () => {
  it('passes on the repository', () => {
    expect(spawnSync('node', [path.resolve(import.meta.dirname, '..', 'scripts', 'catalog.mjs'), '--check'], { encoding: 'utf8' }).status).toBe(0);
  });
});

describe('ARCHITECTURE.md', () => {
  it('check fails when a component needs changes', () => {
    const top = path.resolve(import.meta.dirname, '..');
    const root = path.join(tmp, 'arch');
    fs.cpSync(path.join(top, 'components'), path.join(root, 'components'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.mkdirSync(path.join(root, 'docs'));
    fs.copyFileSync(path.join(top, 'scripts', 'catalog.mjs'), path.join(root, 'scripts', 'catalog.mjs'));
    fs.copyFileSync(path.join(top, 'scripts', 'plan.mjs'), path.join(root, 'scripts', 'plan.mjs'));
    fs.cpSync(path.join(top, 'docs', 'plan'), path.join(root, 'docs', 'plan'), { recursive: true });
    for (const f of ['catalog-notes.json', 'CATALOG.md', 'ARCHITECTURE.md', 'PLAN.md']) fs.copyFileSync(path.join(top, 'docs', f), path.join(root, 'docs', f));
    const run = () => spawnSync('node', [path.join(root, 'scripts', 'catalog.mjs'), '--check'], { encoding: 'utf8' });
    expect(run().status).toBe(0);
    const f = path.join(root, 'components', 'achievements', 'component.json');
    const j = JSON.parse(fs.readFileSync(f, 'utf8')) as { needs: string[] };
    j.needs = [];
    fs.writeFileSync(f, JSON.stringify(j));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('ARCHITECTURE.md is stale');
  });
});
