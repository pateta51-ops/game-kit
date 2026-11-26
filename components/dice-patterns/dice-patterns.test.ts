import { describe, expect, it } from 'vitest';
import { checkPattern, compile, meaning, missing, smallest, type Pattern } from './index.ts';
import * as before from './main-k527.frozen.ts';

describe('dice-patterns missing (K725)', () => {
  const m = (p: Pattern, v: number[], whole = false) => missing(p, v, { whole });
  it('odd n=2 on [3] lacks one odd die, whole on and off', () => {
    const want = [{ kind: 'odd', have: 1, need: 1 }];
    expect(m({ kind: 'odd', n: 2 }, [3])).toEqual(want);
    expect(m({ kind: 'odd', n: 2 }, [3], true)).toEqual(want);
    expect(smallest({ kind: 'odd', n: 2 }, [3], { whole: true })).toBeNull();
  });
  it('every kind: one short', () => {
    expect(m({ kind: 'same', n: 3 }, [4, 4, 1])).toEqual([{ kind: 'same', have: 2, need: 1, face: 4 }]);
    expect(m({ kind: 'same', n: 2 }, [])).toEqual([{ kind: 'same', have: 0, need: 2 }]);
    expect(m({ kind: 'different', n: 3 }, [2, 2, 5])).toEqual([{ kind: 'different', have: 2, need: 1 }]);
    expect(m({ kind: 'even', n: 2 }, [2, 3])).toEqual([{ kind: 'even', have: 1, need: 1 }]);
    expect(m({ kind: 'atLeast', face: 5, n: 2 }, [5, 2])).toEqual([{ kind: 'atLeast', have: 1, need: 1, face: 5 }]);
    expect(m({ kind: 'face', face: 6, n: 1 }, [5])).toEqual([{ kind: 'face', have: 0, need: 1, face: 6 }]);
    expect(m({ kind: 'twoPair' }, [2, 2, 3, 4])).toEqual([{ kind: 'twoPair', have: 1, need: 1 }]);
    expect(m({ kind: 'twoPair' }, [2, 2])).toEqual([{ kind: 'twoPair', have: 1, need: 2 }]);
    expect(m({ kind: 'count', n: 3 }, [1, 1])).toEqual([{ kind: 'count', op: '>=', value: 3, have: 2, by: 1, dir: 'up', dice: 0 }]);
    expect(m({ kind: 'count', op: '=', n: 2 }, [1, 1, 3], true)).toEqual([{ kind: 'count', op: '=', value: 2, have: 3, by: 1, dir: 'down', dice: 0 }]);
    expect(m({ kind: 'sum', op: '>=', value: 10 }, [3, 4])).toEqual([{ kind: 'sum', op: '>=', value: 10, have: 7, by: 3, dir: 'up', dice: 0 }]);
    expect(m({ kind: 'sum', op: '>=', value: 3 }, [])).toEqual([{ kind: 'sum', op: '>=', value: 3, have: 0, by: 3, dir: 'up', dice: 1 }]);
    expect(m({ kind: 'max', op: '>=', value: 5 }, [2, 4])).toEqual([{ kind: 'max', op: '>=', value: 5, have: 4, by: 1, dir: 'up', dice: 0 }]);
    expect(m({ kind: 'spread', op: '>=', value: 3 }, [4])).toEqual([{ kind: 'spread', op: '>=', value: 3, have: 0, by: 3, dir: 'up', dice: 1 }]);
  });
  it('run names the gaps', () => {
    expect(m({ kind: 'run', n: 3 }, [1, 2, 4, 5])).toEqual([{ kind: 'run', have: 2, need: 1, gaps: [3] }]);
    expect(m({ kind: 'run', n: 4 }, [2, 5])).toEqual([{ kind: 'run', have: 1, need: 2, gaps: [3, 4] }]);
    expect(m({ kind: 'run', n: 2 }, [])).toEqual([{ kind: 'run', have: 0, need: 2, gaps: [] }]);
    expect(m({ kind: 'run', n: 4 }, [8, 8, 9, 1])).toEqual([{ kind: 'run', have: 2, need: 2, gaps: [6, 7] }]);
    expect(m({ kind: 'sum', op: '>', value: 7.5 }, [7])).toEqual([{ kind: 'sum', op: '>', value: 7.5, have: 7, by: 1, dir: 'up', dice: 0 }]);
  });
  it('all lists the unmet parts, any lists the alternatives', () => {
    const all: Pattern = { kind: 'all', of: [{ kind: 'odd', n: 2 }, { kind: 'count', op: '=', n: 2 }, { kind: 'even', n: 1 }] };
    expect(m(all, [3, 5, 1], true)).toEqual([{ kind: 'count', op: '=', value: 2, have: 3, by: 1, dir: 'down', dice: 0 }, { kind: 'even', have: 0, need: 1 }]);
    const any: Pattern = { kind: 'any', of: [{ kind: 'same', n: 3 }, { kind: 'run', n: 3 }] };
    expect(m(any, [1, 1, 5])).toEqual([{ kind: 'any', of: [[{ kind: 'same', have: 2, need: 1, face: 1 }], [{ kind: 'run', have: 1, need: 2, gaps: [2, 3] }]] }]);
    expect(m(any, [2, 2, 2])).toEqual([]);
  });
  it('nothing missing when met, and whole off forgives a set inside the roll', () => {
    expect(m({ kind: 'odd', n: 2 }, [3, 5])).toEqual([]);
    expect(m({ kind: 'sum', op: '=', value: 7 }, [3, 4, 2])).toEqual([]);
    expect(m({ kind: 'sum', op: '=', value: 7 }, [3, 4, 2], true)).toEqual([{ kind: 'sum', op: '=', value: 7, have: 9, by: 2, dir: 'down', dice: 0 }]);
    expect(m({ kind: 'sum', op: '=', value: 7 }, [3, 4], true)).toEqual([]);
  });
  it('throws on bad data like compile', () => {
    expect(() => missing({ kind: 'same', n: 0 }, [1])).toThrow();
  });
});

// Local copies of the two shapes this part feeds (dice-odds chance, dice-tray readRoll); not imported.
type Chance = (k: number, test: (dice: number[], extra?: number) => boolean, spec?: { sides?: number }) => number;
interface Die { id: number; sides: number; value: number; held: boolean; kind?: string }
interface Meaning<T = string> { id: string; test(dice: readonly Die[]): boolean; label: T }
type ReadRoll = <T>(t: { dice: readonly Die[] }, m: readonly Meaning<T>[]) => { meanings: Meaning<T>[] };

const t = (p: Pattern, v: number[]) => compile(p)(v);

describe('dice-patterns compile', () => {
  it('same: a pair, and N the same with N from data', () => {
    expect(t({ kind: 'same', n: 2 }, [3, 5, 5, 3])).toBe(true);
    expect(t({ kind: 'same', n: 3 }, [3, 5, 5, 3])).toBe(false);
    const data = JSON.parse('{"kind":"same","n":4}') as Pattern;
    expect(t(data, [2, 2, 2, 2, 1])).toBe(true);
    expect(t(data, [2, 2, 2, 1, 1])).toBe(false);
  });
  it('different: three different values', () => {
    expect(t({ kind: 'different', n: 3 }, [2, 2, 4, 6, 4])).toBe(true);
    expect(t({ kind: 'different', n: 3 }, [2, 2, 4, 4])).toBe(false);
  });
  it('run: three in a row, and a run with a gap fails', () => {
    expect(t({ kind: 'run', n: 3 }, [5, 3, 4])).toBe(true);
    expect(t({ kind: 'run', n: 3 }, [1, 2, 4, 5])).toBe(false);
    expect(t({ kind: 'run', n: 2 }, [1, 4, 5, 6])).toBe(true);
  });
  it('even and odd: 2 even dice, 2 odd dice', () => {
    expect(t({ kind: 'even', n: 2 }, [1, 2, 3, 4])).toBe(true);
    expect(t({ kind: 'even', n: 2 }, [1, 2, 3, 5])).toBe(false);
    expect(t({ kind: 'odd', n: 2 }, [2, 3, 4, 5])).toBe(true);
    expect(t({ kind: 'odd', n: 2 }, [2, 3, 4, 6])).toBe(false);
  });
  it('sum: over 7, equal to a number, every op', () => {
    expect(t({ kind: 'sum', op: '>', value: 7 }, [3, 5])).toBe(true);
    expect(t({ kind: 'sum', op: '>', value: 7 }, [3, 4])).toBe(false);
    expect(t({ kind: 'sum', op: '=', value: 9 }, [4, 5])).toBe(true);
    expect(t({ kind: 'sum', op: '=', value: 9 }, [4, 6])).toBe(false);
    expect(t({ kind: 'sum', op: '<', value: 5 }, [1, 3])).toBe(true);
    expect(t({ kind: 'sum', op: '<=', value: 4 }, [1, 4])).toBe(false);
    expect(t({ kind: 'sum', op: '>=', value: 10 }, [1, 6, 5, 4])).toBe(true);
  });
  it('count: at least 3 dice', () => {
    expect(t({ kind: 'count', n: 3 }, [1, 1, 1])).toBe(true);
    expect(t({ kind: 'count', n: 3 }, [6, 6])).toBe(false);
  });
  it('atLeast and face: n dice showing a face or more; a slot that takes only a named face', () => {
    expect(t({ kind: 'atLeast', face: 5, n: 2 }, [6, 1, 5])).toBe(true);
    expect(t({ kind: 'atLeast', face: 5, n: 2 }, [6, 1, 4])).toBe(false);
    expect(t({ kind: 'face', face: 4, n: 1 }, [1, 4, 6])).toBe(true);
    expect(t({ kind: 'face', face: 4, n: 1 }, [1, 5, 6])).toBe(false);
  });
  it('max, spread and two pair', () => {
    expect(t({ kind: 'max', value: 6 }, [2, 6, 6])).toBe(true);
    expect(t({ kind: 'max', value: 6 }, [2, 5])).toBe(false);
    expect(t({ kind: 'max', op: '<=', value: 3 }, [2, 3])).toBe(true);
    expect(t({ kind: 'spread', value: 4 }, [3, 1, 5, 2])).toBe(true);
    expect(t({ kind: 'spread', value: 4 }, [3, 1, 6])).toBe(false);
    expect(t({ kind: 'spread', op: '>=', value: 4 }, [3, 1, 6])).toBe(true);
    expect(t({ kind: 'spread', value: 0 }, [3])).toBe(false);
    expect(t({ kind: 'twoPair' }, [2, 3, 2, 3, 3])).toBe(true);
    expect(t({ kind: 'twoPair' }, [2, 3, 2, 4])).toBe(false);
  });
  it('an empty roll meets nothing', () => {
    for (const p of [{ kind: 'same', n: 1 }, { kind: 'sum', op: '<', value: 5 }, { kind: 'count', n: 1 }, { kind: 'max', op: '<', value: 9 }, { kind: 'any', of: [{ kind: 'odd', n: 1 }, { kind: 'even', n: 1 }] }] as Pattern[])
      expect(t(p, [])).toBe(false);
  });
  it('all and any', () => {
    const pairAndSix: Pattern = { kind: 'all', of: [{ kind: 'same', n: 2 }, { kind: 'face', face: 6, n: 1 }] };
    expect(t(pairAndSix, [6, 2, 2])).toBe(true);
    expect(t(pairAndSix, [5, 2, 2])).toBe(false);
    const runOrBig: Pattern = { kind: 'any', of: [{ kind: 'run', n: 3 }, { kind: 'sum', op: '>=', value: 15 }] };
    expect(t(runOrBig, [1, 2, 3])).toBe(true);
    expect(t(runOrBig, [6, 6, 4])).toBe(true);
    expect(t(runOrBig, [1, 1, 4])).toBe(false);
    expect(t({ kind: 'any', of: [pairAndSix, { kind: 'count', n: 4 }] }, [1, 2, 3, 4])).toBe(true);
  });
  it('compile throws on bad data with the problems', () => {
    expect(() => compile({ kind: 'same', n: 0 })).toThrow(/n/);
  });
});

describe('dice-patterns smallest', () => {
  const cases: [string, Pattern, number[], number[] | null][] = [
    ['a pair inside five dice', { kind: 'same', n: 2 }, [1, 4, 6, 4, 2], [1, 3]],
    ['same, lowest indexes first', { kind: 'same', n: 2 }, [3, 5, 5, 3], [0, 3]],
    ['same none', { kind: 'same', n: 3 }, [3, 5, 5, 3], null],
    ['different', { kind: 'different', n: 3 }, [2, 2, 4, 6, 4], [0, 2, 3]],
    ['run', { kind: 'run', n: 2 }, [1, 4, 5, 6], [1, 2]],
    ['run none', { kind: 'run', n: 3 }, [1, 2, 4, 5], null],
    ['even', { kind: 'even', n: 2 }, [1, 2, 3, 4, 6], [1, 3]],
    ['odd', { kind: 'odd', n: 2 }, [2, 3, 4, 5, 1], [1, 3]],
    ['atLeast', { kind: 'atLeast', face: 5, n: 2 }, [6, 1, 5, 6], [0, 2]],
    ['face', { kind: 'face', face: 4, n: 2 }, [4, 1, 4, 4], [0, 2]],
    ['sum: the fewest dice whose sum meets it', { kind: 'sum', op: '>=', value: 10 }, [1, 6, 5, 4], [1, 2]],
    ['sum with an upper bound: one die, never an empty set', { kind: 'sum', op: '<=', value: 4 }, [5, 3, 6], [1]],
    ['max with an upper bound, judged on the set alone', { kind: 'max', op: '<=', value: 3 }, [2, 3], [0]],
    ['max with an upper bound when the whole roll fails it', { kind: 'max', op: '<=', value: 3 }, [6, 2], [1]],
    ['spread with an upper bound', { kind: 'spread', op: '<', value: 2 }, [1, 6, 4, 5], [1, 3]],
    ['all: no more dice than needed', { kind: 'all', of: [{ kind: 'same', n: 2 }, { kind: 'face', face: 6, n: 1 }] }, [2, 2, 6, 6], [2, 3]],
    ['max', { kind: 'max', value: 6 }, [2, 6, 6], [1]],
    ['spread', { kind: 'spread', value: 4 }, [3, 1, 5, 2], [1, 2]],
    ['spread at least', { kind: 'spread', op: '>=', value: 4 }, [3, 1, 6, 5], [1, 2]],
    ['two pair', { kind: 'twoPair' }, [2, 3, 2, 3, 3], [0, 1, 2, 3]],
    ['two pair none', { kind: 'twoPair' }, [2, 3, 2, 4], null],
    ['all: union of each part', { kind: 'all', of: [{ kind: 'same', n: 2 }, { kind: 'atLeast', face: 6, n: 1 }] }, [6, 2, 2, 6], [0, 3]],
    ['any: the smaller met part', { kind: 'any', of: [{ kind: 'same', n: 3 }, { kind: 'face', face: 1, n: 1 }] }, [2, 2, 2, 1], [3]],
    ['empty roll', { kind: 'count', n: 1 }, [], null],
  ];
  for (const [name, p, v, want] of cases) it(name, () => expect(smallest(p, v)).toEqual(want));

  it('agrees with compile on random rolls, and the set alone meets the pattern', () => {
    let s = 12345;
    const rnd = (n: number): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s >> 8) % n; };
    const ps: Pattern[] = [{ kind: 'same', n: 2 }, { kind: 'different', n: 3 }, { kind: 'run', n: 3 }, { kind: 'twoPair' }, { kind: 'spread', op: '>=', value: 3 },
      { kind: 'all', of: [{ kind: 'even', n: 1 }, { kind: 'sum', op: '>', value: 7 }] }, { kind: 'any', of: [{ kind: 'max', value: 6 }, { kind: 'odd', n: 3 }] }];
    let met = 0;
    for (const p of ps) for (let i = 0; i < 200; i += 1) {
      const v = Array.from({ length: rnd(6) }, () => 1 + rnd(6));
      const r = smallest(p, v);
      expect(r !== null).toBe(compile(p)(v));
      if (r) { met += 1; expect(compile(p)(r.map((x) => v[x] as number))).toBe(true); }
    }
    expect(met).toBeGreaterThan(100);
  });
});

describe('dice-patterns smallest over the whole roll (K578)', () => {
  it('an exact sum or spread that only some of the dice meet is not met by the whole roll', () => {
    const seven: Pattern = { kind: 'sum', op: '=', value: 7 };
    expect(t(seven, [3, 4, 2])).toBe(false);
    expect(smallest(seven, [3, 4, 2])).toEqual([0, 1]);
    expect(smallest(seven, [3, 4, 2], { whole: true })).toBeNull();
    const gap: Pattern = { kind: 'spread', value: 2 };
    expect(t(gap, [1, 3, 6])).toBe(false);
    expect(smallest(gap, [1, 3, 6])).toEqual([0, 1]);
    expect(smallest(gap, [1, 3, 6], { whole: true })).toBeNull();
    expect(smallest({ kind: 'max', op: '<=', value: 3 }, [6, 2], { whole: true })).toBeNull();
  });
});

describe('dice-patterns named shapes (K578)', () => {
  it('one even and one odd together', () => {
    const p: Pattern = { kind: 'all', of: [{ kind: 'even', n: 1 }, { kind: 'odd', n: 1 }] };
    expect(t(p, [2, 5])).toBe(true);
    expect(t(p, [2, 4, 6])).toBe(false);
    expect(t(p, [3])).toBe(false);
    expect(smallest(p, [4, 6, 3, 1], { whole: true })).toEqual([0, 2]);
    expect(smallest(p, [1, 3, 5], { whole: true })).toBeNull();
  });
  it('an exact sum of 7 and of 1 over every die', () => {
    const seven: Pattern = { kind: 'sum', op: '=', value: 7 };
    expect(t(seven, [1, 2, 4])).toBe(true);
    expect(t(seven, [6, 2])).toBe(false);
    expect(smallest(seven, [1, 2, 4], { whole: true })).toEqual([0, 1, 2]);
    const one: Pattern = { kind: 'sum', op: '=', value: 1 };
    expect(t(one, [1])).toBe(true);
    expect(t(one, [1, 1])).toBe(false);
    expect(smallest(one, [1], { whole: true })).toEqual([0]);
    expect(smallest(one, [1, 1], { whole: true })).toBeNull();
    expect(smallest(one, [1, 1])).toEqual([0]);
  });
  it('all joins conditions that are each judged on the roll: two even dice, not equal, only on a group of exactly two', () => {
    const p: Pattern = { kind: 'all', of: [{ kind: 'even', n: 2 }, { kind: 'different', n: 2 }] };
    expect(t(p, [2, 6])).toBe(true);
    expect(t(p, [4, 4])).toBe(false);
    expect(t(p, [2, 3])).toBe(false);
    expect(t(p, [2, 2, 3])).toBe(true);
    expect(smallest(p, [2, 2, 3])).toEqual([0, 1, 2]);
    const two: Pattern = { kind: 'all', of: [p, { kind: 'count', op: '=', n: 2 }] };
    expect(t(two, [2, 2, 3])).toBe(false);
    expect(smallest(two, [2, 2, 3])).toBeNull();
    expect(smallest(two, [4, 4, 5, 2])).toEqual([0, 3]);
  });
  it('count below 1 is never met; count above n takes n + 1 dice', () => {
    expect(smallest({ kind: 'count', op: '<', n: 1 }, [3])).toBeNull();
    expect(smallest({ kind: 'count', op: '<', n: 2 }, [3, 5])).toEqual([0]);
    expect(smallest({ kind: 'count', op: '>', n: 2 }, [1, 2, 3, 4])).toEqual([0, 1, 2]);
  });
  it('count with an op: a group of an exact size', () => {
    const three: Pattern = { kind: 'all', of: [{ kind: 'same', n: 3 }, { kind: 'count', op: '=', n: 3 }] };
    expect(t(three, [5, 5, 5])).toBe(true);
    expect(t(three, [5, 5, 5, 5])).toBe(false);
    expect(t(three, [5, 5])).toBe(false);
    expect(smallest(three, [5, 5, 5, 5])).toEqual([0, 1, 2]);
    expect(smallest(three, [5, 5, 5, 5], { whole: true })).toBeNull();
    expect(t({ kind: 'count', op: '<=', n: 2 }, [4, 1])).toBe(true);
    expect(t({ kind: 'count', op: '<=', n: 2 }, [4, 1, 1])).toBe(false);
    expect(t({ kind: 'count', op: '<', n: 3 }, [])).toBe(false);
    expect(t({ kind: 'count', n: 2 }, [4, 1, 1])).toBe(true);
    expect(checkPattern({ kind: 'count', op: '!=', n: 2 })).toEqual(['pattern.op: one of <, <=, =, >=, >']);
  });
  it('random rolls, = included: whole agrees with compile; without it a set of the dice can meet what the roll does not', () => {
    let s = 2468;
    const rnd = (n: number): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s >> 8) % n; };
    const ps: Pattern[] = [{ kind: 'sum', op: '=', value: 7 }, { kind: 'spread', value: 2 }, { kind: 'sum', op: '<=', value: 5 }, { kind: 'max', op: '<', value: 4 },
      { kind: 'count', op: '=', n: 2 }, { kind: 'same', n: 2 }, { kind: 'all', of: [{ kind: 'even', n: 1 }, { kind: 'sum', op: '=', value: 9 }] }];
    const anySet = (p: Pattern, v: number[]): boolean => {
      for (let m = 1; m < 1 << v.length; m += 1) if (compile(p)(v.filter((_, i) => (m >> i) & 1))) return true;
      return false;
    };
    let met = 0, onlyPart = 0;
    for (const p of ps) for (let i = 0; i < 200; i += 1) {
      const v = Array.from({ length: rnd(6) }, () => 1 + rnd(6));
      const all = compile(p)(v);
      const w = smallest(p, v, { whole: true });
      const r = smallest(p, v);
      expect(w !== null).toBe(all);
      expect(r !== null).toBe(anySet(p, v));
      if (all) { met += 1; expect(w).toEqual(r); }
      if (r) expect(compile(p)(r.map((x) => v[x] as number))).toBe(true);
      if (r && !all) onlyPart += 1;
    }
    expect(met).toBeGreaterThan(100);
    expect(onlyPart).toBeGreaterThan(100);
  });
});

describe('dice-patterns second review (K578)', () => {
  it('whole with any: the set comes from a part the whole roll meets', () => {
    const p: Pattern = { kind: 'any', of: [{ kind: 'sum', op: '=', value: 7 }, { kind: 'same', n: 2 }] };
    expect(smallest(p, [3, 4, 2, 2])).toEqual([0, 1]);
    expect(smallest(p, [3, 4, 2, 2], { whole: true })).toEqual([2, 3]);
    expect(smallest({ kind: 'any', of: [{ kind: 'max', op: '<=', value: 2 }, { kind: 'count', n: 3 }] }, [1, 6, 5], { whole: true })).toEqual([0, 1, 2]);
    const nested: Pattern = { kind: 'all', of: [{ kind: 'even', n: 1 }, { kind: 'any', of: [{ kind: 'sum', op: '=', value: 1 }, { kind: 'odd', n: 2 }] }] };
    expect(smallest(nested, [1, 3, 4], { whole: true })).toEqual([0, 1, 2]);
  });
  it('random rolls with any: under whole the set meets a part that the whole roll meets', () => {
    let s = 97531;
    const rnd = (n: number): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s >> 8) % n; };
    const ps: { kind: 'any'; of: readonly Pattern[] }[] = [
      { kind: 'any', of: [{ kind: 'sum', op: '=', value: 7 }, { kind: 'same', n: 2 }] },
      { kind: 'any', of: [{ kind: 'max', op: '<=', value: 2 }, { kind: 'count', n: 3 }] },
      { kind: 'any', of: [{ kind: 'spread', value: 1 }, { kind: 'sum', op: '<', value: 4 }, { kind: 'run', n: 3 }] }];
    let met = 0;
    for (const p of ps) for (let i = 0; i < 300; i += 1) {
      const v = Array.from({ length: rnd(6) }, () => 1 + rnd(6));
      const w = smallest(p, v, { whole: true });
      expect(w !== null).toBe(compile(p)(v));
      if (!w) continue;
      met += 1;
      const set = w.map((x) => v[x] as number);
      expect(p.of.some((q) => compile(q)(v) && compile(q)(set))).toBe(true);
    }
    expect(met).toBeGreaterThan(100);
  });
  it('compile and smallest judge the values they are given; only meaning leaves out value 0 (not rolled)', () => {
    const pair: Pattern = { kind: 'same', n: 2 };
    expect(smallest(pair, [0, 0, 4, 4])).toEqual([0, 1]);
    expect(t(pair, [0, 0, 4])).toBe(true);
    expect(t({ kind: 'even', n: 2 }, [0, 0, 3])).toBe(true);
    expect(meaning('pair', pair, 'a pair').test([{ value: 0 }, { value: 0 }, { value: 4 }])).toBe(false);
    expect(meaning('pair', pair, 'a pair').test([{ value: 0 }, { value: 0 }, { value: 4 }, { value: 4 }])).toBe(true);
  });
  it('a zero face and a negative face are values like any other: sum, same, count, different, odd', () => {
    expect(t({ kind: 'sum', op: '=', value: 2 }, [0, -1, 3])).toBe(true);
    expect(t({ kind: 'sum', op: '<', value: 0 }, [-1, 0])).toBe(true);
    expect(smallest({ kind: 'sum', op: '=', value: 2 }, [0, -1, 3], { whole: true })).toEqual([1, 2]);
    expect(t({ kind: 'same', n: 2 }, [-1, 0, -1])).toBe(true);
    expect(smallest({ kind: 'same', n: 2 }, [-1, 0, -1, 0])).toEqual([0, 2]);
    expect(t({ kind: 'same', n: 2 }, [-1, 0, 1])).toBe(false);
    expect(t({ kind: 'count', n: 3 }, [0, -1, 0])).toBe(true);
    expect(t({ kind: 'count', op: '=', n: 2 }, [0, -1, 0])).toBe(false);
    expect(smallest({ kind: 'count', n: 2 }, [0, -1, 0])).toEqual([0, 1]);
    expect(t({ kind: 'different', n: 3 }, [0, -1, 1, 0])).toBe(true);
    expect(t({ kind: 'different', n: 3 }, [0, -1, -1, 0])).toBe(false);
    expect(smallest({ kind: 'different', n: 2 }, [0, 0, -1])).toEqual([0, 2]);
    expect(t({ kind: 'odd', n: 2 }, [-1, -3, 2])).toBe(true);
    expect(t({ kind: 'even', n: 2 }, [-2, 0, 1])).toBe(true);
    expect(t({ kind: 'odd', n: 1 }, [-2, 0])).toBe(false);
    expect(t({ kind: 'odd', n: 1 }, [2.5, NaN, undefined as unknown as number])).toBe(false);
    expect(t({ kind: 'odd', n: 1 }, [2.5, NaN, -3])).toBe(true);
  });
  it('meaning leaves out every die of value 0 or less, so it misjudges dice whose real faces go that low', () => {
    const dice = (v: number[]) => v.map((value) => ({ value }));
    const three: Pattern = { kind: 'sum', op: '=', value: 3 };
    expect(meaning('m', three, '').test(dice([-1, 3]))).toBe(true);
    expect(t(three, [-1, 3])).toBe(false);
    const low: Pattern = { kind: 'sum', op: '>=', value: -3 };
    expect(meaning('m', low, '').test(dice([-2, -2]))).toBe(false);
    expect(t(low, [-2, -2])).toBe(false);
    expect(t(low, [-2, -1])).toBe(true);
    expect(meaning('m', low, '').test(dice([-2, -1]))).toBe(false);
    const gap: Pattern = { kind: 'spread', value: 2 };
    expect(meaning('m', gap, '').test(dice([0, 3, 5]))).toBe(true);
    expect(t(gap, [0, 3, 5])).toBe(false);
  });
  it('calls without the new options give what the part gave before K578 (frozen copy, fixed seed, faces 0 to 6)', () => {
    let s = 5150;
    const rnd = (n: number): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s >> 8) % n; };
    type Old = Parameters<typeof before.compile>[0];
    const leaf = (): Old => {
      const n = 1 + rnd(3), face = 1 + rnd(6), value = rnd(13), op = (['<', '<=', '=', '>=', '>'] as const)[rnd(5)] as '<';
      const all: Old[] = [{ kind: 'same', n }, { kind: 'different', n }, { kind: 'run', n }, { kind: 'even', n }, { kind: 'odd', n }, { kind: 'count', n },
        { kind: 'atLeast', face, n }, { kind: 'face', face, n }, { kind: 'sum', op, value }, { kind: 'max', op, value: face }, { kind: 'max', value: face },
        { kind: 'spread', op, value: rnd(6) }, { kind: 'spread', value: rnd(6) }, { kind: 'twoPair' }];
      return all[rnd(all.length)] as Old;
    };
    const pattern = (): Old => { const k = rnd(6); return k === 0 ? { kind: 'all', of: [leaf(), leaf()] } : k === 1 ? { kind: 'any', of: [leaf(), { kind: 'all', of: [leaf(), leaf()] }] } : leaf(); };
    let met = 0, sets = 0;
    for (let i = 0; i < 4000; i += 1) {
      const p = pattern();
      const v = Array.from({ length: rnd(7) }, () => rnd(7));
      const want = before.compile(p)(v);
      expect(compile(p)(v), JSON.stringify([p, v])).toBe(want);
      const set = before.smallest(p, v);
      expect(smallest(p, v), JSON.stringify([p, v])).toEqual(set);
      if (want) met += 1;
      if (set) sets += 1;
    }
    expect(met).toBeGreaterThan(500);
    expect(4000 - met).toBeGreaterThan(500);
    expect(sets).toBeGreaterThan(met);
  });
});

describe('dice-patterns checkPattern', () => {
  it('K622 does not silently accept an op that the selected kind never reads', () => {
    const data = { kind: 'same' as const, n: 2, op: '<' as const };
    const problem = 'pattern.op: not used by kind "same"';
    expect(checkPattern(data)).toEqual([problem]);
    expect(() => compile(data)).toThrow(problem);
  });
  it('good data has no problems', () => {
    expect(checkPattern({ kind: 'all', of: [{ kind: 'same', n: 2 }, { kind: 'sum', op: '>', value: 7 }] })).toEqual([]);
  });
  it('bad data gives problems instead of throwing', () => {
    expect(checkPattern({ kind: 'triple' })).toEqual(['pattern: unknown kind "triple"']);
    expect(checkPattern({ kind: 'same', n: 0 })).toEqual(['pattern.n: a whole number of 1 or more']);
    expect(checkPattern({ kind: 'sum', op: '!=', value: 7 })).toEqual(['pattern.op: one of <, <=, =, >=, >']);
    expect(checkPattern({ kind: 'any', of: [{ kind: 'run', n: 3 }, { kind: 'atLeast', n: 2 }] })).toEqual(['pattern.of[1].face: a whole number of 1 or more']);
    expect(checkPattern({ kind: 'all', of: [] })).toEqual(['pattern.of: a list of 1 or more patterns']);
    expect(checkPattern(null)).toEqual(['pattern: not an object']);
  });
});

describe('dice-patterns unread fields (K622)', () => {
  const valid: Pattern[] = [
    { kind: 'same', n: 2 }, { kind: 'different', n: 2 }, { kind: 'run', n: 2 }, { kind: 'even', n: 2 }, { kind: 'odd', n: 2 },
    { kind: 'count', n: 2, op: '=' }, { kind: 'atLeast', face: 3, n: 2 }, { kind: 'face', face: 3, n: 2 },
    { kind: 'sum', op: '=', value: 6 }, { kind: 'max', op: '=', value: 6 }, { kind: 'spread', op: '=', value: 2 },
    { kind: 'twoPair' }, { kind: 'all', of: [{ kind: 'same', n: 2 }] }, { kind: 'any', of: [{ kind: 'same', n: 2 }] },
  ];
  const fields = { n: 2, face: 3, op: '=', value: 6, of: [{ kind: 'same', n: 2 }] };
  const unread = valid.flatMap(pattern => Object.entries(fields)
    .filter(([key]) => !Object.hasOwn(pattern, key))
    .map(([key, value]) => ({ kind: pattern.kind, key, data: { ...pattern, [key]: value } })));

  it.each(valid)('accepts the documented keys of $kind', pattern => {
    expect(checkPattern(pattern)).toEqual([]);
  });
  it.each(unread)('reports unread $key on $kind', ({ kind, key, data }) => {
    expect(checkPattern(data)).toEqual([`pattern.${key}: not used by kind "${kind}"`]);
  });
  it('reports arbitrary extra fields on leaves and composites', () => {
    expect(checkPattern({ kind: 'same', n: 2, label: 'pair', typo: true })).toEqual([
      'pattern.label: not used by kind "same"', 'pattern.typo: not used by kind "same"',
    ]);
    expect(checkPattern({ kind: 'any', of: [{ kind: 'same', n: 2 }], fallback: true })).toEqual(['pattern.fallback: not used by kind "any"']);
  });
  it('keeps full nested paths and a caller-supplied root', () => {
    expect(checkPattern({ kind: 'all', of: [{ kind: 'any', of: [{ kind: 'twoPair', op: '=' }] }] }, 'rules[3]')).toEqual([
      'rules[3].of[0].of[0].op: not used by kind "twoPair"',
    ]);
  });
  it('retains required-value and unknown-kind diagnostics', () => {
    expect(checkPattern({ kind: 'same', n: 0, op: '=' })).toEqual([
      'pattern.n: a whole number of 1 or more', 'pattern.op: not used by kind "same"',
    ]);
    for (const kind of ['unknown', 'constructor', 'toString', '__proto__']) {
      expect(checkPattern({ kind, op: '=' })).toEqual([`pattern: unknown kind "${kind}"`]);
    }
  });
  it('checks unread keys by presence while allowing undefined for supported optional ops', () => {
    expect(checkPattern({ kind: 'same', n: 2, op: undefined })).toEqual(['pattern.op: not used by kind "same"']);
    for (const pattern of [{ kind: 'count', n: 2 }, { kind: 'max', value: 4 }, { kind: 'spread', value: 2 }]) {
      expect(checkPattern(pattern)).toEqual([]);
      expect(checkPattern({ ...pattern, op: undefined })).toEqual([]);
    }
  });
  const helpers: [string, (pattern: Pattern) => unknown][] = [
    ['compile', pattern => compile(pattern)], ['meaning', pattern => meaning('pair', pattern, 'pair')],
    ['smallest', pattern => smallest(pattern, [4, 4])], ['missing', pattern => missing(pattern, [4, 4])],
  ];
  it.each(helpers)('%s rejects an unread key even inside an unused any branch', (_name, invoke) => {
    const bad = { kind: 'same' as const, n: 2, op: '<' as const };
    expect(() => invoke(bad)).toThrow('pattern.op: not used by kind "same"');
    expect(() => invoke({ kind: 'any', of: [{ kind: 'same', n: 2 }, bad] })).toThrow('pattern.of[1].op: not used by kind "same"');
  });
});

describe('dice-patterns feeds chance and readRoll', () => {
  it('a compiled pattern goes into chance as it is', () => {
    // the shape of dice-odds chance, enumerating 2d6 here
    const chance: Chance = (k, test) => {
      let hit = 0, all = 0;
      const walk = (acc: number[]) => { if (acc.length === k) { all += 1; if (test([...acc].sort((a, b) => a - b))) hit += 1; return; } for (let f = 1; f <= 6; f += 1) walk([...acc, f]); };
      walk([]);
      return hit / all;
    };
    expect(chance(2, compile({ kind: 'same', n: 2 }))).toBeCloseTo(1 / 6, 12);
    expect(chance(2, compile({ kind: 'sum', op: '>', value: 7 }))).toBeCloseTo(15 / 36, 12);
  });
  it('meaning gives what readRoll takes; unrolled dice (value 0) are left out', () => {
    const readRoll: ReadRoll = (tray, m) => ({ meanings: m.filter((x) => x.test(tray.dice)) });
    const die = (id: number, value: number): Die => ({ id, sides: 6, value, held: false });
    const ms = [meaning('pair', { kind: 'same', n: 2 }, 'a pair'), meaning('big', { kind: 'sum', op: '>', value: 7 }, 'big')];
    expect(readRoll({ dice: [die(0, 4), die(1, 4)] }, ms).meanings.map((x) => x.id)).toEqual(['pair', 'big']);
    expect(readRoll({ dice: [die(0, 3), die(1, 4)] }, ms).meanings.map((x) => x.label)).toEqual([]);
    expect(readRoll({ dice: [die(0, 0), die(1, 0)] }, ms).meanings).toEqual([]);
  });
});
