import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CONTENT } from '../engine-core/fake/counter.ts';
import type { AnswerAction, GameTypes } from '../engine-core/index.ts';
import { simGame } from './fake/game.ts';
import { bySeat, findingOf, formatFuzz, fuzz, DriverRng, legalAnswers, playOne, replayStep, runGames, runInThread, report, formatReport, runResumable, type Driver, type GameSpec, type SimGame, type SimRecord } from './index.ts';
const content = CONTENT;

const module = new URL('./fake/game.ts', import.meta.url).href;
const specs = (n: number, driver = 'random'): GameSpec[] => Array.from({ length: n }, (_, i) => ({ index: i, seed: `s${String(i)}`, driver }));
const dir = mkdtempSync(path.join(tmpdir(), 'sim-pool-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('K222 bySeat', () => {
  const fixed = (name: string): Driver => ({ name, reasons: () => [name], choose: (_s, a) => a[0] as AnswerAction });
  const at = (seat?: string | number) => ({ prompt: { id: 1, options: [], min: 0, max: 0, ...(seat === undefined ? {} : { seat }) } }) as unknown as GameTypes['state'];
  it('answers with the driver of the prompt seat, else `other`, else throws', () => {
    const d = bySeat({ a: fixed('A'), 1: fixed('B') }, fixed('R'));
    const ans = [{ kind: 'answer', promptId: 1, picks: [] }] as const;
    d.choose(at('a'), ans, new DriverRng('x'));
    expect(d.reasons()).toEqual(['A']);
    d.choose(at(1), ans, new DriverRng('x'));
    expect(d.reasons()).toEqual(['B']);
    d.choose(at(), ans, new DriverRng('x'));
    expect(d.reasons()).toEqual(['R']);
    expect(() => bySeat({ a: fixed('A') }).choose(at('z'), ans, new DriverRng('x'))).toThrow(RangeError);
  });
});

describe('driver random numbers', () => {
  it('are a function of the key only', () => {
    const a = new DriverRng('k');
    const b = new DriverRng('k');
    expect([a.int(100), a.int(100), a.int(100)]).toEqual([b.int(100), b.int(100), b.int(100)]);
    expect(Array.from({ length: 8 }, () => new DriverRng('k').int(1000))).toEqual(Array(8).fill(new DriverRng('k').int(1000)));
  });

  it('an order prompt also lists the other orders (A8)', () => {
    const options = ['a', 'b', 'c'].map((id) => ({ id, enabled: true }));
    const all = legalAnswers({ id: 6, kind: 'order', options, min: 3, max: 3 }, new DriverRng('k')).map((a) => a.picks.join(''));
    expect(all.sort()).toEqual(['abc', 'acb', 'bac', 'bca', 'cab', 'cba']);
    const big = Array.from({ length: 8 }, (_, i) => ({ id: String(i), enabled: true }));
    const some = legalAnswers({ id: 7, kind: 'order', options: big, min: 8, max: 8 }, new DriverRng('k'), 16);
    expect(some).toHaveLength(16);
    expect(new Set(some.map((a) => a.picks.join(''))).size).toBeGreaterThan(1);
  });

  it('list every answer of a multi-pick prompt, or cap samples of a huge one', () => {
    const options = ['a', 'b', 'c', 'x'].map((id) => ({ id, enabled: id !== 'x' }));
    const alone = legalAnswers({ id: 8, options: [...'abcd'].map((id): { id: string; enabled: boolean; alone?: true } => ({ id, enabled: true })).concat([{ id: 'back', enabled: true, alone: true }]), min: 3, max: 3 }, new DriverRng('k')).map((a) => a.picks.join(''));
    expect(alone).toEqual(['abc', 'abd', 'acd', 'bcd', 'back']);
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

describe('K273 watchdog and report', () => {
  it('records a looping game as timeout and finishes the rest', async () => {
    const list = specs(5);
    list[2] = { index: 2, seed: 'loop', driver: 'random' };
    const r = await runGames({ module, specs: list, gameTimeoutMs: 500 }, 2);
    expect(r.map((x) => x.index)).toEqual([0, 1, 2, 3, 4]);
    expect(r[2]?.errorName).toBe('timeout');
    expect(r[2]?.error).toMatch(/^timeout in game 2 \(seed loop\)/);
    expect(r.filter((x) => x.error === undefined)).toHaveLength(4);
    expect(report(r).failures.timeout).toBe(1);
  });

  it('reports fixed records', () => {
    const rec = (index: number, actions: number, result: unknown, extra: Partial<SimRecord> = {}): SimRecord => ({ index, seed: `s${String(index)}`, driver: 'd', result, actions, hash: 'h', ...extra });
    const records = [
      rec(0, 10, { winner: 'a' }),
      rec(1, 20, { winner: 'b' }),
      rec(2, 30, { winner: 'a' }),
      rec(3, 40, {}),
      rec(4, 0, null, { error: 'x', errorName: 'timeout', hash: 'crashed' }),
      rec(5, 0, null, { error: 'crash in game 5', hash: 'crashed' }),
      rec(6, 5, null, { error: 'boom' }),
    ];
    const r = report(records, { first: (x) => (x.index % 2 === 0 ? 'a' : 'b') });
    expect(r.games).toBe(7);
    expect(r.completed).toBe(4);
    expect(r.completedShare).toBeCloseTo(4 / 7);
    expect(r.failures).toEqual({ timeout: 1, crash: 1, violation: 0, error: 1 });
    expect(r.length).toEqual({ min: 10, median: 25, max: 40 });
    expect(r.winsBySeat).toEqual({ a: 2, b: 1 });
    expect(r.winShareBySeat).toEqual({ a: 0.5, b: 0.25 });
    expect(r.firstPlayer).toEqual({ a: { games: 2, wins: 2, share: 1 }, b: { games: 2, wins: 1, share: 0.5 } });
    expect(formatReport(r).split('\n')).toHaveLength(5);
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

describe('K101 view on every step, hasten, one-step replay', () => {
  const play = (seed: string, until?: number, opts = {}): SimRecord => {
    const r = playOne(simGame as unknown as SimGame<GameTypes>, content, { index: 0, seed, driver: 'random' }, until, opts);
    return r;
  };
  it('renders the view only when asked, and a broken view fails the game at its step', () => {
    expect(play('view').error).toBeUndefined();
    const bad = play('view', undefined, { view: true });
    expect(bad.error).toMatch(/^view after \d+ action\(s\): view broke$/);
    expect(bad.result).toBeNull();
    const cyc = play('cyc', undefined, { view: true });
    expect(cyc.error).toMatch(/^view after 0 action\(s\): /);
    const ok = play('s1', undefined, { view: true });
    expect(ok.error).toBeUndefined();
    expect(ok.viewBytes).toBeGreaterThan(10);
    expect(play('s1').viewBytes).toBeUndefined();
  });

  it('K238 A10: a view holding a secret id or an rng key fails the game', () => {
    expect(play('leak', undefined, { view: true }).error).toMatch(/^view after 0 action\(s\): view leak: 42$/);
    expect(play('leakkey', undefined, { view: true }).error).toMatch(/view leak: key:rng$/);
    expect(play('leakstack', undefined, { view: true }).error).toBeUndefined();
    expect(play('leak').error).toBeUndefined();
    expect(play('s1', undefined, { view: true }).error).toBeUndefined();
  });

  it('hastens after every N actions, off by default, the same on worker threads', async () => {
    const plain = play('s2');
    const fast = play('s2', undefined, { hasten: 1 });
    expect((fast.summary as { adds: number }).adds).toBeGreaterThanOrEqual(fast.actions - 1);
    expect(play('s2', undefined, {}).hash).toBe(plain.hash);
    const req = { module, specs: specs(3), hasten: 1, view: true };
    expect(await runGames(req, 2)).toEqual(await runGames(req, 1));
    expect((await runGames(req, 1))[0]?.viewBytes).toBeGreaterThan(0);
  });

  it('replays one step and reports its timings and the slowest steps', () => {
    const r = replayStep(simGame as unknown as SimGame<GameTypes>, content, { index: 0, seed: 'view', driver: 'random' }, 5, { view: true }, 3);
    expect(r.record.error).toMatch(/view broke/);
    expect(r.slowest.length).toBeLessThanOrEqual(3);
    expect(r.lines[0]).toMatch(/^seed view \(random\) to step 5: view after/);
    expect(r.lines[1]).toMatch(/^last step: answers [\d.]+ ms, choose [\d.]+ ms, apply [\d.]+ ms, view [\d.]+ ms/);
    const ok = replayStep(simGame as unknown as SimGame<GameTypes>, content, { index: 0, seed: 's1', driver: 'random' }, 3, { view: true });
    expect(ok.record.actions).toBe(3);
    expect(ok.viewBytes).toBeGreaterThan(0);
    expect(ok.slowest).toHaveLength(3);
  });
});

describe('K274 hidden-shuffle check (G06/T9)', () => {
  const run = (driver: string, seed: string, hidden?: boolean | number): SimRecord => playOne(simGame as unknown as SimGame<GameTypes>, content, { index: 0, seed, driver }, undefined, { hidden });
  const seeds = Array.from({ length: 40 }, (_, i) => `h-${String(i)}`);

  it('reports a bot that reads the hidden pile, with seed and step', async () => {
    const bad = seeds.map((s) => run('peek', s, true)).filter((r) => r.error?.startsWith('hidden-info:'));
    expect(bad.length).toBeGreaterThan(0);
    const f = findingOf(bad[0] as SimRecord);
    expect(f?.kind).toBe('hidden-info');
    expect(f?.seed).toBe(bad[0]?.seed);
    const fz = await fuzz(module, { games: 20, prefix: 'h', driver: 'peek', hidden: true });
    expect(fz.findings.length).toBeGreaterThan(0);
    expect(fz.findings.every((x) => x.kind === 'hidden-info')).toBe(true);
    expect(formatFuzz(fz).at(-1)).toMatch(/hidden-info \d+$/);
    expect(seeds.map((s) => run('peek', s, 0.5)).some((r) => r.error?.startsWith('hidden-info:'))).toBe(true);
  });

  it('passes an honest bot over many seeds, skips a stateful driver, and leaves the records alone', () => {
    for (const s of seeds) {
      const on = run('honest', s, true);
      expect(on.error).toBeUndefined();
      expect(on).toEqual(run('honest', s));
      expect(run('random', s, true)).toEqual(run('random', s));
      expect(run('peek', s)).toEqual(run('peek', s, false));
      expect(run('peekstateful', s, true).error).toBeUndefined();
    }
  });
  it('fails the game when `hidden` is set but the game has no reshuffleHidden', () => {
    const bare = { ...simGame, reshuffleHidden: undefined };
    const r = playOne(bare as unknown as SimGame<GameTypes>, content, { index: 0, seed: 'h-0', driver: 'honest' }, undefined, { hidden: true });
    expect(r.error).toMatch(/^hidden: the game has no reshuffleHidden/);
    expect(r.result).toBeNull();
  });
});
