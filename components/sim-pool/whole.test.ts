import { describe, expect, it } from 'vitest';
import { fuzz, fuzzMain, wholeGame } from './index.ts';

const module = new URL('./fake/clauses.ts', import.meta.url).href;
const settings = (seed: string): Record<string, string> => ({ mode: 'solo', tier: seed.startsWith('long') ? 'hard' : 'easy' });

describe('K490 whole-game report', () => {
  it('merges resolved clause ids across workers and names the ones never resolved', async () => {
    const run = await fuzz(module, { games: 2, prefix: 't', workers: 2 });
    expect(run.records.map((r) => r.resolved)).toEqual([['c0'], ['c1']]);
    const w = wholeGame(run, { clauses: ['c0', 'c1', 'c2'] });
    expect(w.resolved).toEqual(['c0', 'c1']);
    expect(w.neverResolved).toEqual(['c2']);
    expect(w.failures).toEqual(['never resolved: c2']);
    expect(wholeGame(run, { clauses: ['c0', 'c1'] }).failures).toEqual([]);
  });

  it('fails with the games that did not finish per mode and tier', async () => {
    const run = await fuzz(module, { games: 3, prefix: 'long', settings });
    const w = wholeGame(run);
    expect(w.groups).toEqual([{ group: 'solo/hard', started: 3, finished: 0, unfinished: ['long-0', 'long-1', 'long-2'] }]);
    expect(w.byKind.endless?.map((f) => f.seed)).toEqual(['long-0', 'long-1', 'long-2']);
    expect(w.failures).toEqual(['solo/hard: 3 of 3 games did not finish (seeds long-0, long-1, long-2)']);
  });

  it('fuzzMain prints the report and exits 1 on a never-resolved clause, 0 when all ran; off unless asked', async () => {
    const lines: string[] = [];
    expect(await fuzzMain(['--games', '2', '--prefix', 't', '--workers', '2'], module, { whole: { clauses: ['c0', 'c1', 'c2'] }, settings }, (l) => void lines.push(l))).toBe(1);
    expect(lines).toContain('  solo/easy: 2 of 2 games finished');
    expect(lines.at(-1)).toBe('never resolved: c2');
    const ok: string[] = [];
    expect(await fuzzMain(['--games', '2', '--prefix', 't'], module, { whole: { clauses: ['c0', 'c1'] } }, (l) => void ok.push(l))).toBe(0);
    expect(ok).toContain('  -/-: 2 of 2 games finished');
    const off: string[] = [];
    expect(await fuzzMain(['--games', '2', '--prefix', 't'], module, {}, (l) => void off.push(l))).toBe(0);
    expect(off).toHaveLength(1);
  });

  it('prints findings by kind with seed and replay line', async () => {
    const lines: string[] = [];
    expect(await fuzzMain(['--games', '1', '--prefix', 'long'], module, { whole: true }, (l) => void lines.push(l))).toBe(1);
    expect(lines).toContain('  endless: 1');
    expect(lines).toContain('    seed long-0 step 40: replay --seed long-0 --driver random --until 40');
    expect(lines.at(-1)).toBe('-/-: 1 of 1 games did not finish (seeds long-0)');
  });

  it('counts a timed-out game (gameTimeoutMs) and a crashed game as not finished, with their seeds', async () => {
    const good = new URL('./fake/game.ts', import.meta.url).href;
    const hung = await fuzz(good, { seed: 'loop', gameTimeoutMs: 500 });
    expect(hung.records[0]?.errorName).toBe('timeout');
    expect(wholeGame(hung).failures).toEqual(['-/-: 1 of 1 games did not finish (seeds loop)']);
    const died = await fuzz(good, { seed: 'die', gameTimeoutMs: 30_000 });
    expect(died.records[0]?.error).toMatch(/^crash in game 0/);
    expect(wholeGame(died).failures).toEqual(['-/-: 1 of 1 games did not finish (seeds die)']);
    const lines: string[] = [];
    expect(await fuzzMain(['--seed', 'loop'], good, { whole: true, gameTimeoutMs: 500 }, (l) => void lines.push(l))).toBe(1);
    expect(lines.at(-1)).toBe('-/-: 1 of 1 games did not finish (seeds loop)');
  });
});
