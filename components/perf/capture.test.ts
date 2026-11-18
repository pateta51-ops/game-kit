import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { capture, compare, formatComparison, stat, type PerfPage } from './capture.ts';
import { flag, runCapture } from './capture-cli.ts';
import { run } from './compare-cli.ts';

const LOAD = { ttfb: 5, domContentLoaded: 50, loadEnd: 80, firstPaint: 40, firstContentfulPaint: 45, longTasks: 1, longTaskMs: 60, longTaskMax: 60 };
/** A fake page: counters grow by 2 per dispatch, each dispatch costs 2 ms synchronous, 3 ms to paint. */
function fakePage(): PerfPage {
  let renders = 10;
  return {
    addInitScript: (s) => Promise.resolve(s),
    goto: () => Promise.resolve(),
    waitForFunction: () => Promise.resolve(),
    evaluate: <T,>(s: string) => {
      if (s.includes('getEntriesByType')) return Promise.resolve(LOAD as T);
      if (s.includes('var d=')) {
        renders += 2;
        return Promise.resolve({ s: 2, p: 3 } as T);
      }
      if (s.includes('requestAnimationFrame')) return Promise.resolve(undefined as T);
      return Promise.resolve({ renders } as T);
    },
  };
}

describe('perf capture (K371)', () => {
  it('records load, counters and dispatch cost on a fake page', async () => {
    const r = await capture(fakePage(), { url: 'http://x/', counters: 'window.c', dispatch: 'window.d', actions: ['a', 'b'] });
    expect(r.version).toBe(1);
    expect(r.load).toEqual(LOAD);
    expect(r.counters).toEqual({ renders: 10 });
    expect(r.dispatch).toEqual({ actions: 2, syncMs: { n: 2, p50: 2, p95: 2, max: 2 }, paintMs: { n: 2, p50: 3, p95: 3, max: 3 }, counters: { renders: 4 } });
  });
  it('skips dispatch without a hook or actions', async () => {
    expect((await capture(fakePage(), { url: 'u' })).dispatch).toBeUndefined();
  });
  it('runCapture takes the median load over runs', async () => {
    let closed = 0;
    const r = await runCapture({ url: 'u', runs: 3 }, () => Promise.resolve({ page: fakePage(), close: () => { closed++; return Promise.resolve(); } }));
    expect(closed).toBe(3);
    expect(r.load.loadEnd).toBe(80);
  });
  it('stat gives percentiles', () => {
    expect(stat([4, 1, 3, 2])).toEqual({ n: 4, p50: 3, p95: 4, max: 4 });
    expect(stat([])).toEqual({ n: 0, p50: 0, p95: 0, max: 0 });
  });
});

describe('perf compare (K371)', () => {
  const base = { load: { loadEnd: 100 }, counters: { renders: 10 }, dispatch: { actions: 5, paintMs: { n: 5, p95: 10 } } };
  it('finds nothing in equal results', () => {
    const c = compare(base, structuredClone(base));
    expect(c.changes).toEqual([]);
    expect(c.same).toBe(5);
  });
  it('flags a timing over the threshold, not under it', () => {
    expect(compare(base, { ...base, load: { loadEnd: 109 } }).regressions).toEqual([]);
    const c = compare(base, { ...base, load: { loadEnd: 111 } });
    expect(c.regressions.map((x) => x.path)).toEqual(['load.loadEnd']);
    expect(compare(base, { ...base, load: { loadEnd: 111 } }, { thresholdPct: 20 }).regressions).toEqual([]);
    expect(compare(base, { ...base, load: { loadEnd: 106 } }, { thresholds: { 'load.loadEnd': 5 } }).regressions).toHaveLength(1);
  });
  it('ignores growth under minMs', () => {
    expect(compare({ a: { ms: 0.2 } }, { a: { ms: 0.9 } }).regressions).toEqual([]);
  });
  it('a counter regresses on any increase, only changes on a decrease', () => {
    expect(compare(base, { ...base, counters: { renders: 11 } }).regressions).toHaveLength(1);
    const d = compare(base, { ...base, counters: { renders: 9 } });
    expect(d.changes).toHaveLength(1);
    expect(d.regressions).toEqual([]);
  });
  it('lists added and missing numbers', () => {
    const c = compare({ a: 1 }, { b: 2 });
    expect(c.changes.map((x) => [x.path, x.before, x.after])).toEqual([['a', 1, null], ['b', null, 2]]);
    expect(c.regressions.map((x) => x.path)).toEqual(['a']);
  });
  it('flag returns undefined for a missing flag', () => {
    expect(flag(['--config', 'c.json'], '--out')).toBeUndefined();
    expect(flag(['--config', 'c.json'], '--config')).toBe('c.json');
  });
  it('formats and exits by regression', () => {
    expect(formatComparison(compare(base, { ...base, counters: { renders: 11 } }))).toContain('REGRESSION counters.renders: 10 -> 11 (+10%)');
    const d = mkdtempSync(join(tmpdir(), 'perfcmp-'));
    const [a, b, c] = ['a', 'b', 'c'].map((n) => join(d, `${n}.json`)) as [string, string, string];
    writeFileSync(a, JSON.stringify(base));
    writeFileSync(b, JSON.stringify(base));
    writeFileSync(c, JSON.stringify({ ...base, counters: { renders: 12 } }));
    const out: string[] = [];
    expect(run([a, b], (s) => out.push(s))).toBe(0);
    expect(run([a, c], (s) => out.push(s))).toBe(1);
    expect(run([a], (s) => out.push(s))).toBe(2);
    expect(run([a, b, '--limit', 'bad'], (s) => out.push(s))).toBe(2);
  });
});
