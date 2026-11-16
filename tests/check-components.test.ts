import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(import.meta.dirname, '..', 'scripts', 'check-components.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const make = (comps: Record<string, { needs?: string[]; packages?: string[]; files?: Record<string, string> }>) => {
  const root = path.join(tmp, 'r' + String(++n));
  for (const [name, c] of Object.entries(comps)) {
    const d = path.join(root, 'components', name);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'component.json'), JSON.stringify({ name, source: { game: 'g', commit: 'c', paths: [] }, needs: c.needs ?? [], packages: c.packages ?? [] }));
    for (const [f, s] of Object.entries(c.files ?? {})) fs.writeFileSync(path.join(d, f), s);
  }
  return spawnSync('node', [SCRIPT, root], { encoding: 'utf8' });
};

describe('check-components', () => {
  it('a clean component passes', () => {
    expect(make({ a: { files: { 'x.ts': "import { y } from './y'\n" } } }).status).toBe(0);
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
