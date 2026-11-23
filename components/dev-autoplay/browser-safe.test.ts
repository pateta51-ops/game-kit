// K723: dev-autoplay runs in the browser (vite dev): nothing it reaches through relative imports may use a `node:` module.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { expect, it } from 'vitest';

const re = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|^import\s*['"](\.[^'"]+)['"]/gm;

it('K723: dev-autoplay import graph reaches no node: module', () => {
  const seen = new Set<string>();
  const bad: string[] = [];
  const walk = (f: string): void => {
    if (seen.has(f)) return;
    seen.add(f);
    const src = readFileSync(f, 'utf8');
    if (/['"]node:/.test(src)) bad.push(f);
    for (const m of src.matchAll(re)) {
      const t = resolve(dirname(f), (m[1] ?? m[2] ?? m[3])!);
      if (existsSync(t)) walk(t);
    }
  };
  walk(resolve(import.meta.dirname, 'index.ts'));
  walk(resolve(import.meta.dirname, 'ui.ts'));
  expect(bad).toEqual([]);
  expect(seen.size).toBeGreaterThan(3);
});
