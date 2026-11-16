import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONTENT, COUNTER, type CounterState } from '../engine-core/fake/counter.ts';
import { hashValue, isChecking, setInvariantChecking, type AnswerAction } from '../engine-core/index.ts';
import { playOne, type GameSpec } from '../sim-pool/play.ts';
import { run } from './cli.ts';
import { perfGame } from './fake/game.ts';
import { distribution, expectBudgets, formatReport, measure, overBudget, percentile, reportOf, timeGame, type PerfReport, type Sample } from './perf.ts';

const spec = (index: number, seed: string): GameSpec => ({ index, seed, driver: 'random' });
/** A clock whose timed spans last 5, 1, 3, 5, 1, 3... ms. */
const clock = (): (() => number) => {
  let t = 0;
  let calls = 0;
  return () => {
    if (calls % 2 === 1) t += [5, 1, 3][((calls - 1) / 2) % 3] as number;
    calls += 1;
    return t;
  };
};
const sample = (ms: number, bucket = 'apply', index = 0): Sample => ({ game: 'g', index, prompt: 'prompt', bucket, ms });

describe('perf: the distribution', () => {
  it('takes nearest-rank percentiles and is 0 for no samples', () => {
    expect(percentile([], 0.95)).toBe(0);
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(distribution([2, 4])).toEqual({ samples: 2, p50: 2, p95: 4, p99: 4, max: 4 });
    expect(distribution([]).max).toBe(0);
  });

  it('reports each bucket and the ten slowest calls, slowest first', () => {
    const r = reportOf(2, [...Array.from({ length: 12 }, (_, i) => sample(i + 1, 'apply', i)), sample(40, 'draw', 12)]);
    expect(r.buckets.apply).toEqual({ samples: 12, p50: 6, p95: 12, p99: 12, max: 12 });
    expect(r.buckets.draw?.samples).toBe(1);
    expect(r.slowest).toHaveLength(10);
    expect(r.slowest[0]).toEqual({ game: 'g', index: 12, prompt: 'prompt', bucket: 'draw', ms: 40 });
    expect(r.slowest.map((s) => s.ms)).toEqual([40, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
    expect(formatReport(r).join('\n')).toContain('40.000 ms  draw  game g  action 12  prompt');
  });
});

describe('perf: timing games', () => {
  it('times every call of a whole game and keeps the fastest of the repeats', () => {
    const once = timeGame(perfGame, CONTENT, spec(0, 'a'), { repeats: 1, now: clock() });
    expect(once.length).toBeGreaterThan(1);
    expect(once.map((s) => s.index)).toEqual(once.map((_, i) => i));
    expect(once.map((s) => s.ms)).toEqual(once.map((_, i) => [5, 1, 3][i % 3]));
    expect(once.every((s) => s.game === 'a' && s.prompt === 'prompt' && (s.bucket === 'apply' || s.bucket === 'draw'))).toBe(true);
    const thrice = timeGame(perfGame, CONTENT, spec(0, 'a'), { repeats: 3, now: clock() });
    expect(thrice.map((s) => s.ms)).toEqual(once.map(() => 1));
  });

  it('leaves out calls with no bucket and names the prompt kind the game gives', () => {
    expect(timeGame({ ...perfGame, bucket: () => null }, CONTENT, spec(0, 'a'))).toEqual([]);
    expect(timeGame({ ...perfGame, promptKind: (s: CounterState) =>`turn${String(s.turn)}` }, CONTENT, spec(0, 'a'))[0]?.prompt).toBe('turn1');
  });

  it('plays the same game with 1 or 3 repeats, and the game sim-pool plays for the seed', () => {
    const traced = (): { game: typeof perfGame; actions: AnswerAction[]; state: () => unknown } => {
      const actions: AnswerAction[] = [];
      let last: unknown;
      const game: typeof perfGame = {
        ...perfGame,
        driver(name, s, content) {
          const d = perfGame.driver(name, s, content);
          return {
            name: d.name,
            reasons: () => d.reasons(),
            choose(state, answers, rng) {
              const a = d.choose(state, answers, rng);
              actions.push(a);
              return a;
            },
          };
        },
        bucket(_before, r) {
          last = r.state;
          return 'apply';
        },
      };
      return { game, actions, state: () => last };
    };
    const one = traced();
    const three = traced();
    const sim = traced();
    const n1 = timeGame(one.game, CONTENT, spec(0, 'same'), { repeats: 1 }).length;
    const n3 = timeGame(three.game, CONTENT, spec(0, 'same'), { repeats: 3 }).length;
    let end: unknown;
    const record = playOne({ ...sim.game, summary: (s: CounterState) => (end = s) }, CONTENT, spec(0, 'same'));
    expect(record.error).toBeUndefined();
    expect(n1).toBe(record.actions);
    expect(n3).toBe(record.actions);
    expect(one.actions).toEqual(sim.actions);
    expect(three.actions).toEqual(sim.actions);
    expect(hashValue(one.actions)).toBe(record.hash);
    expect(hashValue(three.actions)).toBe(record.hash);
    expect(hashValue(one.state())).toBe(hashValue(end));
    expect(hashValue(three.state())).toBe(hashValue(end));
  });

  it('stops on an invariant violation at setup, as sim-pool fails the game', () => {
    const was = isChecking();
    setInvariantChecking(true);
    try {
      const game: typeof perfGame = { ...perfGame, rules: { ...COUNTER, invariants: () => [{ id: 'X-01', message: 'bad' }] } };
      expect(() => timeGame(game, CONTENT, spec(0, 'a'))).toThrow('seed a setup: X-01 bad');
    } finally {
      setInvariantChecking(was);
    }
  });

  it('plays the warm-up games first and does not count them', () => {
    const seeds: string[] = [];
    const game: typeof perfGame = {
      ...perfGame,
      start(s, content) {
        seeds.push(s.seed);
        return perfGame.start(s, content);
      },
    };
    const specs = [spec(0, 'a'), spec(1, 'b')];
    const r = measure(game, CONTENT, specs, { warmup: 2, repeats: 1 });
    expect(seeds).toEqual(['a-warm0', 'a-warm1', 'a', 'b']);
    expect(r.games).toBe(2);
    const counted = specs.flatMap((s) => timeGame(perfGame, CONTENT, s, { repeats: 1 }));
    expect(Object.values(r.buckets).reduce((n, d) => n + d.samples, 0)).toBe(counted.length);
    expect(r.slowest.every((s) => s.game === 'a' || s.game === 'b')).toBe(true);
  });
});

describe('perf: budgets', () => {
  const fast = reportOf(1, [sample(1), sample(2)]);
  const slow = reportOf(1, [sample(1), sample(9)]);

  it('fails a value at or over its limit and a budgeted bucket with no sample', () => {
    expect(overBudget(fast, { apply: { p95: 5, max: 5 } })).toEqual([]);
    expect(overBudget(slow, { apply: { p95: 5, p50: 5 } })).toEqual(['apply: p95 9.000 ms, budget under 5 ms']);
    expect(overBudget(fast, { apply: { max: 2 } })).toHaveLength(1);
    expect(overBudget(fast, { draw: { max: 50 } })).toEqual(['draw: no call was timed']);
  });

  it('measures again when over budget, and throws after the last attempt', () => {
    const runs: PerfReport[] = [slow, fast];
    const lines: string[] = [];
    expect(expectBudgets(() => runs.shift() as PerfReport, { apply: { p95: 5 } }, 3, (l) => lines.push(l))).toBe(fast);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('attempt 1: apply: 2 calls');
    let n = 0;
    const again = (): PerfReport => {
      n += 1;
      return slow;
    };
    expect(() => expectBudgets(again, { apply: { p95: 5 } }, 3, () => undefined)).toThrow('apply: p95 9.000 ms');
    expect(n).toBe(3);
  });

  it('holds on the fake game', () => {
    const r = expectBudgets(() => measure(perfGame, CONTENT, [spec(0, 'a'), spec(1, 'b'), spec(2, 'c')]), { apply: { p95: 10_000 } }, 3, () => undefined);
    expect(r.buckets.apply?.samples).toBeGreaterThan(0);
  });
});

describe('perf: the command line', () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const fake = join(here, 'fake', 'game.ts');
  const quiet = (): { lines: string[]; out: (l: string) => void } => {
    const lines: string[] = [];
    return { lines, out: (l) => lines.push(l) };
  };

  it('exits 2 on bad usage or a module it cannot use', async () => {
    const q = quiet();
    expect(await run([], q.out, q.out)).toBe(2);
    expect(await run(['--module', fake, '--games', '0'], q.out, q.out)).toBe(2);
    expect(await run(['--module', fake, '--budget', 'apply.mean=5'], q.out, q.out)).toBe(2);
    expect(await run(['--module', fake, '--games'], q.out, q.out)).toBe(2);
    expect(await run(['--module', join(here, 'no-such-game.ts')], q.out, q.out)).toBe(2);
    expect(await run(['--module', join(here, 'perf.ts')], q.out, q.out)).toBe(2);
  });

  it('exits 0 within the budgets of the module and writes the report', async () => {
    const q = quiet();
    const json = join(mkdtempSync(join(tmpdir(), 'perf-')), 'perf.json');
    expect(await run(['--module', fake, '--games', '3', '--seed', 's', '--json', json], q.out, q.out)).toBe(0);
    expect(q.lines.at(-1)).toBe('within budget');
    expect(q.lines).toContain('slowest:');
    const saved = JSON.parse(readFileSync(json, 'utf8')) as PerfReport & { over: string[]; budgets: unknown };
    expect(saved.games).toBe(3);
    expect(saved.over).toEqual([]);
    expect(saved.budgets).toEqual({ apply: { p95: 10_000 } });
    expect(saved.slowest[0]?.game).toMatch(/^s-[012]$/);
  });

  it('exits 1 over a budget given by flag, after every attempt', async () => {
    const q = quiet();
    expect(await run(['--module', fake, '--games', '2', '--attempts', '2', '--budget', 'apply.max=0'], q.out, q.out)).toBe(1);
    expect(q.lines.at(-1)).toContain('apply: max');
  });

  it('exits 1 when a budgeted bucket has no timed call', async () => {
    const q = quiet();
    expect(await run(['--module', fake, '--games', '2', '--budget', 'none.max=50'], q.out, q.out)).toBe(1);
    expect(q.lines.at(-1)).toContain('none: no call was timed');
  });

  it('merges a flagged budget into the limits of the module stat by stat', async () => {
    const q = quiet();
    const json = join(mkdtempSync(join(tmpdir(), 'perf-')), 'perf.json');
    expect(await run(['--module', fake, '--games', '2', '--budget', 'apply.max=20000', '--budget', 'apply.p99=20000', '--json', json], q.out, q.out)).toBe(0);
    expect((JSON.parse(readFileSync(json, 'utf8')) as { budgets: unknown }).budgets).toEqual({ apply: { p95: 10_000, max: 20_000, p99: 20_000 } });
    expect(await run(['--module', join(here, 'fake', 'broken.ts'), '--games', '2', '--seed', 'ok', '--budget', 'apply.max=20000', '--json', json], q.out, q.out)).toBe(0);
    expect((JSON.parse(readFileSync(json, 'utf8')) as { budgets: unknown }).budgets).toEqual({ apply: { p95: 10_000, max: 20_000 } });
  });

  it('exits 2 when a game fails', async () => {
    const q = quiet();
    expect(await run(['--module', join(here, 'fake', 'broken.ts'), '--games', '2', '--seed', 'boom'], q.out, q.out)).toBe(2);
    expect(q.lines).toEqual(['boom']);
  });
});
