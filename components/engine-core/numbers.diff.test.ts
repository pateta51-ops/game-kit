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
  type Q = { readonly n: bigint; readonly d: bigint };
  const whole = (n: number): Q => ({ n: BigInt(n), d: 1n });
  const lt = (x: Q, y: Q): boolean => x.n * y.d < y.n * x.d;
  // The same rules on exact fractions (numerator and denominator as whole numbers), for inputs with no scope, condition or count.
  const exact = (base: number, ms: readonly { readonly m: NumberModifier; readonly f: Q }[], o: NumberOrder): Q => {
    let v = whole(base);
    for (const step of o.steps) {
      if (step === 'set') {
        const all = ms.filter((x) => x.m.op === 'set');
        const ok = o.setOnlyLowers === true ? all.filter((x) => lt(x.f, v)) : all;
        const win = (o.setters ?? 'last') === 'last' ? ok.at(-1) : ok.reduce<(typeof ok)[number] | undefined>((w, x) => (w === undefined || (o.setters === 'lowest' ? lt(x.f, w.f) : lt(w.f, x.f)) ? x : w), undefined);
        if (win !== undefined) v = win.f;
      } else if (step === 'multiply') {
        for (const x of ms.filter((y) => y.m.op === 'multiply')) {
          v = { n: v.n * x.f.n, d: v.d * x.f.d };
          const r = x.m.round ?? o.round;
          if (r !== undefined) {
            const down = (v.n - (((v.n % v.d) + v.d) % v.d)) / v.d;
            v = { n: r === 'down' || down * v.d === v.n ? down : down + 1n, d: 1n };
          }
        }
      } else if (step === 'floor' || step === 'cap') {
        const lo = step === 'floor';
        const def = o[step];
        const all = [...ms.filter((x) => x.m.op === step).map((x) => x.f), ...(def === undefined ? [] : [whole(def)])];
        const win = all.reduce<Q | undefined>((w, x) => (w === undefined || (lo ? lt(w, x) : lt(x, w)) ? x : w), undefined);
        if (win !== undefined && (lo ? lt(v, win) : lt(win, v))) v = win;
      } else {
        const adds = ms.map((x) => x.m).filter((m) => m.op === 'add' && (step === 'add' || (step === 'decrease' ? m.amount < 0 : m.amount > 0)));
        if (step === 'decrease' && o.decreases === 'highestMin') adds.sort((x, y) => (y.min ?? -Infinity) - (x.min ?? -Infinity) || x.amount - y.amount);
        for (const m of adds) {
          const to: Q = { n: v.n + BigInt(m.amount) * v.d, d: v.d };
          if (m.amount < 0 && m.min !== undefined) v = !lt(whole(m.min), v) ? v : lt(to, whole(m.min)) ? whole(m.min) : to;
          else v = to;
        }
      }
    }
    return v;
  };
  it('seeded random inputs inside the contract, several seeds: the exact result always, and the same value, parts and bound as the K526 code; if the two ever differ, the K526 code is the one that is off', () => {
    const fractions: (readonly [number, number])[] = [[1, 10], [1, 3], [7, 10], [11, 10], [5, 2], [1, 7]];
    const halves: (readonly [number, number])[] = [[2, 1], [3, 1], [1, 2]];
    let n = 0;
    for (const seed of [526, 35, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const rnd = seeded(seed);
      for (let i = 0; i < 1500; i += 1) {
        const o = orders[rnd(orders.length)] as NumberOrder;
        const made = Array.from({ length: rnd(6) }, (_, k): { m: NumberModifier; f: Q } => {
          const source = `m${String(k)}`;
          const kind = rnd(6);
          const int = (m: NumberModifier): { m: NumberModifier; f: Q } => ({ m, f: whole(m.amount) });
          if (kind === 0) return int({ source, op: 'set', amount: rnd(7) });
          if (kind === 1) {
            const [p, q] = (o.round === undefined && rnd(2) === 0 ? fractions[rnd(fractions.length)] : halves[rnd(3)]) as readonly [number, number];
            return { m: mul(source, p / q, rnd(2) === 0 ? { round: rnd(2) === 0 ? 'up' : 'down' } : {}), f: { n: BigInt(p), d: BigInt(q) } };
          }
          if (kind === 2) return int({ source, op: 'floor', amount: rnd(4) });
          if (kind === 3) return int({ source, op: 'cap', amount: 3 + rnd(7) });
          const amount = rnd(9) - 4;
          return int(add(source, amount, amount < 0 && rnd(2) === 0 ? { min: rnd(4) } : {}));
        });
        const ms = made.map((x) => x.m);
        const base = rnd(12) - 2;
        const now = numberParts(base, ms, o);
        const was = partsK526(base, ms, o);
        const e = exact(base, made, o);
        const want = Number(e.n) / Number(e.d);
        if (now.value === was.value) {
          expect(now.parts).toEqual(was.parts);
          expect(now.bound).toEqual(was.bound);
        } else {
          // The K526 code rounded a product that float error had pushed past a whole number (3.0000000000000004 up: 4).
          expect(Math.abs(was.value - want)).toBeGreaterThan(0.5);
        }
        if (e.d === 1n) expect(now.value).toBe(want);
        else expect(Math.abs(now.value - want)).toBeLessThan(1e-9);
        n += now.parts.length;
      }
    }
    expect(n).toBeGreaterThan(18000);
  });
  it('an input where the two differ (found by another seed of an earlier form of that test): 4 x 0.1 x 3 x 2.5 rounded up is 3; the K526 code gave 4', () => {
    const ms = [mul('a', 0.1), mul('b', 3), mul('c', 2.5, { round: 'up' })];
    expect(numberParts(4, ms, { steps: ['multiply'] }).value).toBe(3);
    expect(partsK526(4, ms, { steps: ['multiply'] }).value).toBe(4);
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
    // Float behaviour kept from K526: with no rounding the product is the plain float, also right beside a whole number.
    expect(numberParts(100, [mul('a', 1.1)], o).value).toBe(110.00000000000001);
  });
});
