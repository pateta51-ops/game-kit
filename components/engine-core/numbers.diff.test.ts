// K582: permanent proofs for a number with its parts, on seeded random inputs: the order of reductions, the results
// against a frozen copy of the K526 code, and fractional multipliers against exact arithmetic.
import { describe, expect, it } from 'vitest';
import { numberParts, type NumberModifier, type NumberOrder, type NumberPart } from './index.ts';
import { numberParts as partsK526 } from './fake/numbersK526.ts';

const add = (source: string, amount: number, more: Partial<NumberModifier> = {}): NumberModifier => ({ source, op: 'add', amount, ...more });
const mul = (source: string, amount: number, more: Partial<NumberModifier> = {}): NumberModifier => ({ source, op: 'multiply', amount, ...more });
const total = (parts: readonly NumberPart[]): number => parts.reduce((n, p) => n + p.applied, 0);
const seeded = (seed: number) => (n: number): number => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
};
const perms = (xs: NumberModifier[]): NumberModifier[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));

describe('numberParts: decreases highestMin is the lowest result any order gives (K582)', () => {
  it('hand cases and seeded random pools of up to six reductions, every order of each pool', () => {
    const rnd = seeded(582);
    const pools: NumberModifier[][] = [
      [add('a', -2, { min: 1 }), add('b', -1, { min: 0 })],
      [add('a', -1, { min: 0 }), add('b', -3, { min: 2 }), add('c', -2), add('d', -2, { min: 1 })],
      [add('a', -1, { min: 2 }), add('b', -1, { min: 2 }), add('c', -4, { min: 2 }), add('d', -1)],
    ];
    for (let i = 0; i < 40; i += 1) pools.push(Array.from({ length: 1 + rnd(6) }, (_, k) => add(`m${String(k)}`, -1 - rnd(4), rnd(5) === 0 ? {} : { min: rnd(6) })));
    let orderMatters = 0;
    for (const pool of pools) for (const base of [rnd(4), 4 + rnd(8)]) {
      const all = perms(pool);
      const given = all.map((p) => numberParts(base, p, { steps: ['decrease'] }).value);
      const low = Math.min(...given);
      if (given.some((v) => v !== low)) orderMatters += 1;
      expect(all.map((p) => numberParts(base, p, { steps: ['decrease'], decreases: 'highestMin' }).value).filter((v) => v !== low)).toEqual([]);
    }
    expect(orderMatters).toBeGreaterThan(10);
  });
});

describe('numberParts: against the K526 code (K582)', () => {
  const orders: NumberOrder[] = [
    { steps: ['set', 'multiply', 'add', 'floor', 'cap'], round: 'up', floor: 0, cap: 12 },
    { steps: ['increase', 'set', 'decrease', 'floor', 'cap', 'multiply'], setters: 'lowest', setOnlyLowers: true, floor: 0, round: 'down' },
    { steps: ['cap', 'increase', 'decrease', 'set', 'multiply', 'floor'], setters: 'highest', decreases: 'highestMin', cap: 7, round: 'down' },
    { steps: ['floor', 'add', 'cap', 'set', 'multiply'] },
  ];
  it('seeded random inputs inside the contract give the same value, parts and bound; an unrounded fraction is the same float', () => {
    const rnd = seeded(526);
    const fractions = [0.1, 1 / 3, 0.7, 1.1, 2.5, 1 / 7];
    let n = 0;
    for (let i = 0; i < 3000; i += 1) {
      const o = orders[rnd(orders.length)] as NumberOrder;
      const ms: NumberModifier[] = Array.from({ length: rnd(6) }, (_, k): NumberModifier => {
        const source = `m${String(k)}`;
        const kind = rnd(6);
        if (kind === 0) return { source, op: 'set', amount: rnd(7) };
        if (kind === 1) return mul(source, o.round === undefined && rnd(2) === 0 ? (fractions[rnd(fractions.length)] as number) : ([2, 3, 0.5][rnd(3)] as number), rnd(4) === 0 ? { round: 'up' } : {});
        if (kind === 2) return { source, op: 'floor', amount: rnd(4) };
        if (kind === 3) return { source, op: 'cap', amount: 3 + rnd(7) };
        const amount = rnd(9) - 4;
        return add(source, amount, amount < 0 && rnd(2) === 0 ? { min: rnd(4) } : {});
      });
      const base = rnd(12) - 2;
      const now = numberParts(base, ms, o);
      const was = partsK526(base, ms, o);
      expect(now.value).toBe(was.value + 0);
      expect(now.parts).toEqual(was.parts);
      expect(now.bound).toEqual(was.bound);
      n += now.parts.length;
    }
    expect(n).toBeGreaterThan(3000);
  });
});

describe('numberParts: multipliers p/q with q up to 10 (K582)', () => {
  const o: NumberOrder = { steps: ['multiply'] };
  const floorDiv = (n: bigint, d: bigint): bigint => (n - (((n % d) + d) % d)) / d;
  it('every rounded result is the exact one, also where the K526 code was off; when each multiplier is rounded the parts sum exactly', () => {
    const rnd = seeded(10);
    let wasOff = 0;
    let summed = 0;
    for (let i = 0; i < 4000; i += 1) {
      const base = rnd(260) - 60;
      const ms: NumberModifier[] = [];
      let n = BigInt(base);
      let d = 1n;
      let whole = true;
      const len = 1 + rnd(3);
      for (let k = 0; k < len; k += 1) {
        const q = 1 + rnd(10);
        const p = rnd(31);
        const round = k === len - 1 || rnd(2) === 0 ? (rnd(2) === 0 ? 'up' : 'down') : undefined;
        ms.push(mul(`m${String(k)}`, p / q, round === undefined ? {} : { round }));
        n *= BigInt(p);
        d *= BigInt(q);
        if (round === undefined) whole = false;
        else {
          const f = floorDiv(n, d);
          n = round === 'down' || f * d === n ? f : f + 1n;
          d = 1n;
        }
      }
      const r = numberParts(base, ms, o);
      expect(r.value).toBe(Number(n));
      if (whole) {
        expect(r.base + total(r.parts)).toBe(r.value);
        summed += 1;
      }
      if (partsK526(base, ms, o).value !== Number(n)) wasOff += 1;
    }
    expect(wasOff).toBeGreaterThan(0);
    expect(summed).toBeGreaterThan(1000);
  });
  it('the named cases: 100 x 1.1 up is 110, 10 x 1/3 x 3 down is 10, and unrounded 3 x 0.1 is the plain float with parts that sum to it within float precision', () => {
    expect(numberParts(100, [mul('a', 1.1)], { ...o, round: 'up' }).value).toBe(110);
    expect(numberParts(10, [mul('a', 1 / 3), mul('b', 3, { round: 'down' })], o).value).toBe(10);
    const r = numberParts(3, [mul('a', 0.1)], o);
    expect(r.value).toBe(3 * 0.1);
    expect(Math.abs(r.base + total(r.parts) - r.value)).toBeLessThan(1e-12);
  });
});
