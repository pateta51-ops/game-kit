// Port of Warp's Edge timeline.test.ts (decision 017): the scripted shuffle is a pure function of time; the drawn coins (an input,
// never chosen here) leave the bag in order and end face up in their row slots. Which coin rises is decided at draw time
// from the drawn defs alone: where a coin lies never predicts the next draw.
import { describe, expect, it } from 'vitest';
import {
  assignDraws,
  bagCountAt,
  bagPose,
  coinPose,
  pileLayout,
  restOrder,
  slotPose,
  totalDuration,
  type CoinRest,
} from './timeline.ts';

const at = (xs: CoinRest[], i: number): CoinRest => {
  const r = xs[i];
  if (r === undefined) throw new Error(`no coin ${String(i)}`);
  return r;
};

const DEMO = [
  'a1',
  'a1',
  'a1',
  'a2',
  'b1',
  'b1',
  'b2',
  'c1',
  'c1',
  'c1',
  'd1',
  'd2',
  'd3',
  'e1',
  'e2',
  'e3',
  'f1',
  'g1',
  'g2',
  'g3',
];
const DRAWN = ['d2', 'c1', 'g1', 'b1', 'd3'];

/** A seeded shuffle for the test's permutations of the contents. */
function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs];
  let a = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    const j = a % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

describe('3D bag timeline (decision 017)', () => {
  const rests = pileLayout(20);
  const drawn = [11, 7, 17, 4, 12];

  it('is deterministic: the same inputs give the same poses', () => {
    expect(pileLayout(20)).toEqual(rests);
    for (const t of [0, 0.7, 1.3, 2.5, 4.0]) {
      expect(coinPose(at(rests, 11), 0, 5, t)).toEqual(coinPose(at(pileLayout(20), 11), 0, 5, t));
    }
  });

  it('the bag is still before and after the shake', () => {
    for (const t of [0, 1.9, 3]) {
      const p = bagPose(t);
      expect([p.x, p.y, p.rx, p.ry, p.rz].every((v) => Math.abs(v) < 1e-12)).toBe(true);
    }
    expect(Math.abs(bagPose(1).rz)).toBeGreaterThan(0);
  });

  it('the drawn coins land face up in their slots; the others stay in the bag', () => {
    const end = totalDuration(5) + 1;
    drawn.forEach((i, k) => {
      const p = coinPose(at(rests, i), k, 5, end);
      const s = slotPose(k, 5);
      expect(p.x).toBeCloseTo(s.x, 6);
      expect(p.z).toBeCloseTo(s.z, 6);
      expect(p.y).toBeCloseTo(s.y, 3);
      expect(Math.abs(p.rx)).toBeLessThan(1e-3);
    });
    rests.forEach((r, i) => {
      if (drawn.includes(i)) return;
      expect(coinPose(r, -1, 5, end)).toMatchObject({ x: r.x, y: r.y, z: r.z });
    });
  });

  it('counts down from 20 to 15 as the coins come out', () => {
    expect(bagCountAt(20, 5, 0)).toBe(20);
    expect(bagCountAt(20, 5, totalDuration(5))).toBe(15);
    let last = 20;
    for (let t = 0; t <= totalDuration(5); t += 0.05) {
      const n = bagCountAt(20, 5, t);
      expect(n).toBeLessThanOrEqual(last);
      last = n;
    }
  });

  it('each draw raises a coin carrying the drawn def, never the same coin twice', () => {
    const picks = assignDraws(DEMO, DRAWN);
    expect(picks.map((i) => DEMO[i])).toEqual(DRAWN);
    expect(new Set(picks).size).toBe(5);
    // two draws of a def the bag holds three of take two different coins
    const twice = assignDraws(DEMO, ['a1', 'a1']);
    expect(twice.map((i) => DEMO[i])).toEqual(['a1', 'a1']);
    expect(twice[0]).not.toBe(twice[1]);
    expect(assignDraws([], ['d2'])).toEqual([-1]);
  });

  it('the drawn coin is not determined by position: where a coin lies does not predict the next draw', () => {
    // the same bag in 40 different orders: the coin that rises for "d2" lies at many different heights in the
    // pile, and the topmost coin is not the one drawn more often than chance would allow
    const places = pileLayout(20);
    const ranks = new Set<number>();
    let topDrawn = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const contents = shuffled(DEMO, seed);
      const rests = restOrder(20).map((p) => at(places, p));
      const pick = assignDraws(contents, ['d2'])[0] ?? -1;
      expect(contents[pick]).toBe('d2');
      const heights = rests.map((r) => r.y).sort((a, b) => b - a);
      const rank = heights.indexOf(at(rests, pick).y);
      ranks.add(rank);
      if (rank === 0) topDrawn += 1;
    }
    expect(ranks.size).toBeGreaterThanOrEqual(8);
    expect(topDrawn).toBeLessThan(10);
    // and the pick does not change when only the pile's places change (positions are not an input)
    const contents = shuffled(DEMO, 7);
    expect(assignDraws(contents, DRAWN)).toEqual(assignDraws([...contents], DRAWN));
  });

  it('the contents order does not decide which coins lie on top', () => {
    const perm = restOrder(20);
    expect([...perm].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
    expect(perm).not.toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});
