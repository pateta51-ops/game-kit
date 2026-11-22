import { describe, expect, it } from 'vitest';
import { drawPieces, gainPieces, makeStocks, moveIds, piecesIn, type ShortBag, type Stocks, type StockRng } from './stock.ts';

// K593 comparison: an independent model (plain counts per place and kind) beside the part, on random sequences of
// gain, move, draw and return. The total of each kind never changes and no piece is ever in two places.
const PLACES = ['supply', 'bag', 'hand', 'aside', 'discard', 'removed'];
const KINDS = ['die', 'cube', 'gem'];
type Model = Record<string, Record<string, number>>;

const lcg = (seed: number) => {
  let x = seed >>> 0;
  return (n: number): number => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return Math.floor((x / 4294967296) * n);
  };
};
const pick = <T,>(r: (n: number) => number, xs: readonly T[]): T => xs[r(xs.length)] as T;
const get = (m: Model, p: string, k: string): number => m[p]?.[k] ?? 0;
const add = (m: Model, p: string, k: string, d: number): void => {
  (m[p] as Record<string, number>)[k] = get(m, p, k) + d;
};
const sum = (m: Model, p: string): number => KINDS.reduce((t, k) => t + get(m, p, k), 0);

function check(s: Stocks, m: Model, totals: Record<string, number>): void {
  const seen = new Set<string>();
  for (const p of PLACES)
    for (const id of s.places[p] ?? []) {
      expect(seen.has(id), `${id} in two places`).toBe(false);
      seen.add(id);
    }
  expect(seen.size).toBe(Object.keys(s.kinds).length);
  for (const k of KINDS) {
    expect(PLACES.reduce((t, p) => t + piecesIn(s, p, k), 0)).toBe(totals[k]);
    for (const p of PLACES) expect(piecesIn(s, p, k), `${k} in ${p}`).toBe(get(m, p, k));
  }
}

describe('finite stocks against plain counts (K593)', () => {
  it('300 random sequences of gain, move, draw and return keep every total and one place per piece', () => {
    let draws = 0;
    let refills = 0;
    let fails = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = lcg(seed);
      const m: Model = Object.fromEntries(PLACES.map((p) => [p, Object.fromEntries(KINDS.map((k) => [k, 0]))]));
      for (const k of KINDS) {
        add(m, 'supply', k, r(5));
        add(m, 'bag', k, r(4));
      }
      let s = makeStocks(m);
      const totals = Object.fromEntries(KINDS.map((k) => [k, get(m, 'supply', k) + get(m, 'bag', k)]));
      const rng: StockRng = { int: (n) => r(n) };
      for (let step = 0; step < 40; step++) {
        const op = r(4);
        const n = r(6);
        if (op === 0 || op === 3) {
          // a gain of one kind, or a return of it to the supply
          const kind = pick(r, KINDS);
          const src = op === 3 ? pick(r, PLACES.filter((p) => p !== 'supply')) : pick(r, PLACES);
          const dest = op === 3 ? 'supply' : pick(r, PLACES.filter((p) => p !== src));
          const have = get(m, src, kind);
          const res = gainPieces(s, src, dest, n, kind);
          const got = Math.min(have, n);
          expect(res.ids.length).toBe(got);
          expect(res.short).toBe(n - got);
          expect(res.reason).toBe(n === got ? undefined : got === 0 ? 'empty' : 'short');
          add(m, src, kind, -got);
          add(m, dest, kind, got);
          s = res.state;
        } else if (op === 1) {
          // a move of chosen pieces
          const from = pick(r, PLACES);
          const to = pick(r, PLACES.filter((p) => p !== from));
          const ids = (s.places[from] ?? []).filter(() => r(2) === 0);
          for (const id of ids) {
            add(m, from, s.kinds[id] as string, -1);
            add(m, to, s.kinds[id] as string, 1);
          }
          s = moveIds(s, ids, to);
        } else {
          const to = pick(r, PLACES.filter((p) => p !== 'bag'));
          const ref = pick(r, PLACES.filter((p) => p !== 'bag' && p !== to));
          const rule: ShortBag = pick(r, [{ do: 'drawLeft' }, { do: 'refill', from: ref }, { do: 'fail' }] as const);
          const bag = sum(m, 'bag');
          const extra = rule.do === 'refill' && bag < n ? sum(m, ref) : 0;
          const failed = rule.do === 'fail' && bag < n;
          const res = drawPieces(s, rng, 'bag', to, n, rule);
          const got = failed ? 0 : Math.min(n, bag + extra);
          expect(res.ids.length).toBe(got);
          expect(res.short).toBe(n - got);
          expect(res.refilled).toBe(extra);
          expect(res.failed).toBe(failed);
          draws++;
          if (extra > 0) refills++;
          if (failed) fails++;
          if (extra > 0)
            for (const k of KINDS) {
              add(m, 'bag', k, get(m, ref, k));
              add(m, ref, k, -get(m, ref, k));
            }
          for (const id of res.ids) {
            add(m, 'bag', s.kinds[id] as string, -1);
            add(m, to, s.kinds[id] as string, 1);
          }
          s = res.state;
        }
        check(s, m, totals);
      }
    }
    // the sequences reach every short-bag rule
    expect(draws).toBeGreaterThan(1000);
    expect(refills).toBeGreaterThan(50);
    expect(fails).toBeGreaterThan(50);
  });
});
