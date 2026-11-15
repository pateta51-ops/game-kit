import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DriverRng, legalAnswers, runGames, runInThread, runResumable, type GameSpec, type SimRecord } from './index';

const module = new URL('./fake/game.ts', import.meta.url).href;
const specs = (n: number, driver = 'random'): GameSpec[] => Array.from({ length: n }, (_, i) => ({ index: i, seed: `s${String(i)}`, driver }));
const dir = mkdtempSync(path.join(tmpdir(), 'sim-pool-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('driver random numbers', () => {
  it('are a function of the key only', () => {
    const a = new DriverRng('k');
    const b = new DriverRng('k');
    expect([a.int(100), a.int(100), a.int(100)]).toEqual([b.int(100), b.int(100), b.int(100)]);
    expect(Array.from({ length: 8 }, () => new DriverRng('k').int(1000))).toEqual(Array(8).fill(new DriverRng('k').int(1000)));
  });

  it('list every answer of a multi-pick prompt, or cap samples of a huge one', () => {
    const options = ['a', 'b', 'c', 'x'].map((id) => ({ id, enabled: id !== 'x' }));
    const all = legalAnswers({ id: 4, options, min: 1, max: 2 }, new DriverRng('k')).map((a) => a.picks.join(''));
    expect(all).toEqual(['a', 'ab', 'ac', 'b', 'bc', 'c']);
    const big = Array.from({ length: 20 }, (_, i) => ({ id: String(i), enabled: true }));
    const some = legalAnswers({ id: 5, options: big, min: 0, max: 20 }, new DriverRng('k'), 16);
    expect(some).toHaveLength(16);
    expect(some.every((a) => new Set(a.picks).size === a.picks.length)).toBe(true);
  });
});

describe('the pool', () => {
  it('plays whole games with the game summary, the same every run', async () => {
    const a = await runInThread({ module, specs: specs(20) });
    const b = await runInThread({ module, specs: specs(20) });
    expect(a).toEqual(b);
    expect(a.every((r) => r.error === undefined && r.result !== null && r.log === undefined)).toBe(true);
    expect(a.every((r) => typeof (r.summary as { adds: number }).adds === 'number')).toBe(true);
  });

  it('gives a driver its own random numbers: another driver plays other games from the same seeds', async () => {
    const a = await runInThread({ module, specs: specs(20) });
    const b = await runInThread({ module, specs: specs(20, 'adder') });
    expect(a.map((r) => r.hash)).not.toEqual(b.map((r) => r.hash));
  });

  it('gives the same records on 3 workers as in this thread', async () => {
    const one = await runGames({ module, specs: specs(12) }, 1);
    const three = await runGames({ module, specs: specs(12) }, 3);
    expect(three).toEqual(one);
  });

  it('turns a thrown game and a dead worker into failed records, and plays the rest', async () => {
    const list = specs(8);
    list[2] = { index: 2, seed: 'boom', driver: 'random' };
    list[5] = { index: 5, seed: 'die', driver: 'random' };
    const r = await runGames({ module, specs: list }, 2);
    expect(r.map((x) => x.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(r[2]?.error).toBe('boom');
    expect(r[5]?.error).toMatch(/^crash in game 5 \(seed die\)/);
    expect(r.filter((x) => x.error === undefined)).toHaveLength(6);
  });
});

describe('a module that fails to load', () => {
  it('gives crash records, not a thrown run', async () => {
    const r = await runGames({ module: new URL('./fake/broken.ts', import.meta.url).href, specs: specs(3) }, 2);
    expect(r.map((x) => x.error?.startsWith('crash in game'))).toEqual([true, true, true]);
  });
});

describe('resume', () => {
  it('skips a corrupt line and plays its game again', async () => {
    const file = path.join(dir, 'corrupt.jsonl');
    await runResumable({ module, specs: specs(2) }, 1, file, 'c');
    const [first, second] = readFileSync(file, 'utf8').trim().split('\n');
    writeFileSync(file, `${String(first)}\n{not json}\n`);
    const played: SimRecord[] = [];
    const r = await runResumable({ module, specs: specs(2) }, 1, file, 'c', (x) => played.push(x));
    expect(played.map((x) => x.index)).toEqual([1]);
    expect(JSON.stringify(r[1])).toBe(JSON.stringify((JSON.parse(String(second)) as { record: SimRecord }).record));
  });

  it('continues a stopped run, cuts a partial line, never keeps a crash, refuses other settings', async () => {
    const file = path.join(dir, 'run.jsonl');
    const full = await runInThread({ module, specs: specs(6) });
    await runResumable({ module, specs: specs(3) }, 1, file, 'mix');
    writeFileSync(file, `${readFileSync(file, 'utf8')}{"settings":"mix","rec`);
    const played: SimRecord[] = [];
    const r = await runResumable({ module, specs: specs(6) }, 1, file, 'mix', (x) => played.push(x));
    expect(r).toEqual(full);
    expect(played.map((x) => x.index)).toEqual([3, 4, 5]);
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(6);
    await expect(runResumable({ module, specs: specs(6) }, 1, file, 'other')).rejects.toThrow(/other settings/);
    const crash = path.join(dir, 'crash.jsonl');
    await runResumable({ module, specs: [{ index: 0, seed: 'die', driver: 'random' }, ...specs(3).slice(1)] }, 2, crash, 'x');
    expect(readFileSync(crash, 'utf8').trim().split('\n')).toHaveLength(2);
  });
});
