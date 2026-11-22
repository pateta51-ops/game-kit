import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
// every file an entry reaches (static, type and dynamic imports) that names `three`
const threeFiles = (entry: string): string[] => {
  const seen = new Set<string>();
  const hit: string[] = [];
  const walk = (f: string): void => {
    if (seen.has(f)) return;
    seen.add(f);
    const info = ts.preProcessFile(readFileSync(f, 'utf8'), true, true);
    for (const i of info.importedFiles) {
      if (/^(three|@types\/three)(\/|$)/.test(i.fileName)) hit.push(f);
      else if (i.fileName.startsWith('.')) walk(resolve(dirname(f), i.fileName));
    }
  };
  walk(join(here, entry));
  return hit;
};

describe('K702 token-bag without three', () => {
  it.each(['stock.ts', 'index.ts', 'ui2d.ts'])('%s reaches no three.js import', (f) => {
    expect(threeFiles(f)).toEqual([]);
  });
  it('the check can fail: the 3D entry needs three', () => {
    expect(threeFiles('ui.ts').map((f) => f.replace(/.*[\\/]/, ''))).toEqual(['scene.ts']);
  });
});
