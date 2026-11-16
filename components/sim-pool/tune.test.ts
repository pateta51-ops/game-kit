import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DriverRng, poolBatch, tune, validate, type PlayFn, type WeightSpace, type WeightsFile } from './index.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'sim-tune-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// A toy game whose best weights are known: a = 3 and b = 0.5 (setup `hard` halves the chance); `c` does nothing.
const play: PlayFn = (w, seed, setup) => {
  const p = Math.exp(-(((w['a'] ?? 0) - 3) ** 2) - 4 * Math.log((w['b'] ?? 1) / 0.5) ** 2) * (setup === 'hard' ? 0.5 : 0.9);
  return { win: new DriverRng(`${seed}|${setup}`).nextUint32() / 4294967296 < p, score: -Math.abs((w['a'] ?? 0) - 3) };
};
const space: WeightSpace = { a: { start: 0, step: 2, min: -10, max: 10 }, b: { start: 2, step: 0.8, scale: true, min: 0.01 }, c: { start: 7, step: 1, fixed: true } };
const options = { space, setups: ['easy', 'hard'], play, tag: 'toy', version: 'v1', generations: 10, population: 24, elite: 6, games: 150 };

describe('the weight tuner', () => {
  it('finds the known best weights of a toy game, keeps a fixed weight, and writes a weights file and a report per generation', async () => {
    const out = path.join(dir, 'full');
    const best = await tune({ ...options, out });
    expect(best.weights['a']).toBeCloseTo(3, 0);
    expect(Math.abs((best.weights['b'] ?? 0) - 0.5)).toBeLessThan(0.15);
    expect(best.weights['c']).toBe(7);
    expect(best).toMatchObject({ version: 'v1', seed: 'tune:toy', generation: 9, bounds: { a: { min: -10, max: 10 }, b: { min: 0.01 } } });
    expect(JSON.parse(readFileSync(path.join(out, 'best.json'), 'utf8'))).toEqual(best);
    const last = JSON.parse(readFileSync(path.join(out, 'gen-9.json'), 'utf8')) as { eliteWin: number; baselineWin: number; games: number };
    expect(last.eliteWin).toBeGreaterThan(last.baselineWin + 0.3);
    expect(last.games).toBe(150 * 2 * 25);
  });

  it('a stopped run resumes from its last generation and ends where an unbroken run ends; another version is refused', async () => {
    const out = path.join(dir, 'resume');
    await tune({ ...options, out, generations: 4 });
    const resumed = await tune({ ...options, out });
    expect(resumed).toEqual(JSON.parse(readFileSync(path.join(dir, 'full', 'best.json'), 'utf8')));
    await expect(tune({ ...options, out, version: 'v2', generations: 12 })).rejects.toThrow(/version/);
  });
});

describe('paired validation', () => {
  it('plays candidate and baseline on the same fresh seeds, per setup, with the difference and its confidence', async () => {
    const tuned = JSON.parse(readFileSync(path.join(dir, 'full', 'best.json'), 'utf8')) as WeightsFile;
    const v = await validate({ candidate: tuned, baseline: { a: 0, b: 2, c: 7 }, setups: ['easy', 'hard'], games: 3000, seed: 'check', play, out: path.join(dir, 'v.json') });
    expect(Object.keys(v.setups)).toEqual(['easy', 'hard']);
    expect(v.setups['easy']?.candidate).toBeGreaterThan(0.8);
    expect(v.all.diff).toBeCloseTo(v.all.candidate - v.all.baseline, 9);
    expect(v.all.low).toBeGreaterThan(0.3);
    expect(v.all.z).toBeGreaterThan(10);
    const same = await validate({ candidate: tuned, baseline: tuned.weights, setups: ['easy'], games: 100, seed: 'check', play });
    expect(same.all).toMatchObject({ diff: 0, se: 0 });
    await expect(validate({ candidate: tuned, baseline: {}, setups: ['easy'], games: 10, seed: 'tune:toy:3', play })).rejects.toThrow(/training/);
  });

  it('runs on the sim-pool workers with the weights and setup in each game`s settings', async () => {
    const batch = poolBatch<{ adds: number }>({ module: new URL('./fake/game.ts', import.meta.url).href, driver: 'random', workers: 2, outcome: (r) => ({ win: (r.result as { kind?: string } | null)?.kind === 'won' && r.actions <= 4, score: r.actions }) });
    const v = await validate({ candidate: { target: 4 }, baseline: { target: 12 }, setups: ['x'], games: 6, seed: 'pool', batch });
    expect(v.setups['x']?.candidate).toBeGreaterThan(v.setups['x']?.baseline ?? 1);
  });
});
