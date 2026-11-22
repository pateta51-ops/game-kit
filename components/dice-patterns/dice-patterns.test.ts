import { describe, expect, it } from 'vitest';
import { checkPattern, compile, meaning, smallest, type Pattern } from './index.ts';

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
  it('two even dice that are not equal', () => {
    const p: Pattern = { kind: 'all', of: [{ kind: 'even', n: 2 }, { kind: 'different', n: 2 }] };
    expect(t(p, [2, 6])).toBe(true);
    expect(t(p, [4, 4])).toBe(false);
    expect(t(p, [2, 3])).toBe(false);
    expect(smallest(p, [4, 4, 5, 2])).toEqual([0, 3]);
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

describe('dice-patterns checkPattern', () => {
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
