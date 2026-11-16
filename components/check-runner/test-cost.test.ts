import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { testCost, wholeGames } from './test-cost.ts';

const root = mkdtempSync(join(tmpdir(), 'tc-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const put = (f: string, s: string): void => { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), s); };
put('test/s/game.ts', 'export function playGolden() {}\nexport const playSeed = 1;');
put('src/a.test.ts', 'import { playGolden as hai } from "x"; hai(); playSeed(1); x.playSeed(2); playCost();');
put('src/golden.test.ts', 'playGolden(); playGolden();');
put('src/b.test.ts', 'playOut(); playOut();');
const base = { players: ['playOut'], playerFiles: ['test/*/game.ts'], skip: ['golden.test.ts'] };

describe('test-cost', () => {
  it('counts calls under the player name or another, not methods or other names', () => {
    expect(wholeGames('import { a as b } from "x"; b(); a(); x.a(); ab();', new Set(['a']))).toBe(2);
  });
  it('fails a file over its listed count (none listed means 0), skipping golden tests', () => {
    expect(testCost({ ...base, allow: { 'src/b.test.ts': 1 } }, root).sort()).toEqual([
      expect.stringContaining('src/a.test.ts: 2 whole games'),
      expect.stringContaining('src/b.test.ts: 2 whole games'),
    ]);
  });
  it('passes when the list holds, and flags a stale entry', () => {
    expect(testCost({ ...base, allow: { 'src/a.test.ts': 2, 'src/b.test.ts': 2 } }, root)).toEqual([]);
    expect(testCost({ ...base, allow: { 'src/a.test.ts': 2, 'src/b.test.ts': 3, 'src/c.test.ts': 1 } }, root)).toEqual([
      expect.stringContaining('src/b.test.ts: 2, listed at 3'),
      expect.stringContaining('src/c.test.ts: 0, listed at 1'),
    ]);
  });
});
