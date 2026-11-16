import { describe, expect, it, vi } from 'vitest';
import { bestBy, createPlayStats, personalBest, ranked, totals, type PlayRecord, type PlayStatsOptions, type StatsStorage } from './index';

interface Rec extends PlayRecord {
  hero: string;
  points: number;
  won: boolean;
  hash?: string;
}

const KEY = 'fake.stats.v1';
const memory = (init: Record<string, string> = {}): StatsStorage & { data: Record<string, string> } => {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
};
const refusing: StatsStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('full');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};
const valid = (r: Record<string, unknown>): boolean =>
  typeof r['hero'] === 'string' && typeof r['points'] === 'number' && typeof r['won'] === 'boolean';
const compare = (a: Rec, b: Rec): number => b.points - a.points || a.at - b.at;
const rec = (id: string, at: number, points: number, more: Partial<Rec> = {}): Rec => ({ id, at, hero: 'ada', points, won: points >= 10, ...more });
const make = (storage: StatsStorage, more: Partial<PlayStatsOptions<Rec>> = {}) =>
  createPlayStats<Rec>({ key: KEY, valid, compare, storage, onError: () => undefined, ...more });

describe('createPlayStats', () => {
  it('reads nothing from an empty store', () => {
    expect(make(memory()).read()).toEqual([]);
    expect(make(memory({ [KEY]: '' })).read()).toEqual([]);
  });

  it('records games and reads them latest first', () => {
    const m = memory();
    const s = make(m);
    expect(s.record(rec('a', 1, 5))).toEqual(rec('a', 1, 5));
    s.record(rec('b', 3, 7));
    s.record(rec('c', 2, 9));
    expect(s.read().map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect((JSON.parse(m.data[KEY] ?? '') as { version: number }).version).toBe(1);
  });

  it('replaces the record of a game finished again', () => {
    const s = make(memory());
    s.record(rec('a', 1, 5));
    s.record(rec('a', 4, 12));
    expect(s.read()).toEqual([rec('a', 4, 12)]);
  });

  it('never adds the same ending twice: the first record keeps its id and date', () => {
    const s = make(memory(), { same: (a, b) => a.hash !== undefined && a.hash === b.hash });
    s.record(rec('a', 1, 5, { hash: 'h1' }));
    expect(s.record(rec('b', 9, 5, { hash: 'h1', hero: 'bo' }))).toEqual(rec('a', 1, 5, { hash: 'h1', hero: 'bo' }));
    s.record(rec('c', 10, 5, { hash: 'h2' }));
    expect(s.read().map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('removes a record, and removing a missing one writes nothing', () => {
    const m = memory();
    const s = make(m);
    s.record(rec('a', 1, 5));
    const before = m.data[KEY];
    expect(s.remove('zz')).toBe(true);
    expect(m.data[KEY]).toBe(before);
    expect(s.remove('a')).toBe(true);
    expect(s.read()).toEqual([]);
  });

  it('clears', () => {
    const m = memory();
    const s = make(m);
    s.record(rec('a', 1, 5));
    expect(s.clear()).toBe(true);
    expect(KEY in m.data).toBe(false);
  });

  it('past max drops the oldest, never the new record', () => {
    const s = make(memory(), { max: 2 });
    s.record(rec('a', 5, 1));
    s.record(rec('b', 6, 2));
    s.record(rec('c', 1, 3));
    expect(s.read().map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('past max with dropWorst drops the lowest score, never the new record', () => {
    const s = make(memory(), { max: 2, dropWorst: true });
    s.record(rec('a', 1, 50));
    s.record(rec('b', 2, 20));
    s.record(rec('c', 3, 1));
    expect(s.read().map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('skips entries that are not whole records and keeps the stored text aside before writing', () => {
    const text = JSON.stringify({ version: 1, records: [rec('a', 1, 5), { id: 'x', at: 2 }, null, { ...rec('y', 3, 4), at: 'soon' }] });
    const m = memory({ [KEY]: text });
    const onError = vi.fn();
    const s = make(m, { onError });
    expect(s.read()).toEqual([rec('a', 1, 5)]);
    expect(m.data[`${KEY}.unreadable`]).toBeUndefined();
    s.record(rec('b', 9, 9));
    expect(m.data[`${KEY}.unreadable`]).toBe(text);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('unreadable', text);
    expect(s.read().map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('keeps the first unreadable text when junk is found again', () => {
    const m = memory({ [KEY]: 'not json', [`${KEY}.unreadable`]: 'older' });
    const s = make(m);
    expect(s.read()).toEqual([]);
    expect(s.record(rec('a', 1, 5))).not.toBeNull();
    expect(m.data[`${KEY}.unreadable`]).toBe('older');
    expect(s.read()).toEqual([rec('a', 1, 5)]);
  });

  it.each(['5', 'null', '{"records":7}', '[]'])('reads %s as no records', (text) => {
    expect(make(memory({ [KEY]: text })).read()).toEqual([]);
  });

  it('goes on when storage refuses, reporting once', () => {
    const onError = vi.fn();
    const s = make(refusing, { onError });
    expect(s.read()).toEqual([]);
    expect(s.record(rec('a', 1, 5))).toBeNull();
    expect(s.remove('a')).toBe(true);
    expect(s.clear()).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('read', expect.any(Error));
  });

  it('a failing write leaves the stored records and gives null or false', () => {
    const m = memory();
    make(m).record(rec('a', 1, 5));
    const onError = vi.fn();
    const s = make({ ...m, setItem: () => refusing.setItem('', '') }, { onError });
    expect(s.record(rec('b', 2, 6))).toBeNull();
    expect(s.remove('a')).toBe(false);
    expect(s.read()).toEqual([rec('a', 1, 5)]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('write', expect.any(Error));
  });

  it('reports a write refusal after unreadable text was reported', () => {
    const m = memory({ [KEY]: 'not json' });
    const onError = vi.fn();
    const s = make({ ...m, setItem: (k, v) => (k === KEY ? refusing.setItem(k, v) : m.setItem(k, v)) }, { onError });
    expect(s.record(rec('a', 1, 5))).toBeNull();
    expect(s.record(rec('a', 1, 5))).toBeNull();
    expect(onError.mock.calls.map((c) => c[0] as string)).toEqual(['unreadable', 'write']);
  });

  it('past max with dropWorst and equal scores, the comparison decides (here the later one goes)', () => {
    const s = make(memory(), { max: 2, dropWorst: true });
    s.record(rec('a', 1, 10));
    s.record(rec('b', 2, 10));
    s.record(rec('c', 3, 10));
    expect(s.read().map((r) => r.id)).toEqual(['c', 'a']);
  });

  it('finish, undo past the end, finish again: one record, the second ending', () => {
    const s = make(memory());
    s.record(rec('g', 1, 5));
    s.record(rec('h', 2, 6));
    expect(s.remove('g')).toBe(true);
    expect(s.read().map((r) => r.id)).toEqual(['h']);
    s.record(rec('g', 4, 8));
    expect(s.read()).toEqual([rec('g', 4, 8), rec('h', 2, 6)]);
  });

  it('a comparison where lower is better', () => {
    const low = (a: Rec, b: Rec): number => a.points - b.points || a.at - b.at;
    const s = make(memory(), { compare: low, max: 2, dropWorst: true });
    s.record(rec('a', 1, 3));
    s.record(rec('b', 2, 9));
    s.record(rec('c', 3, 20));
    const list = s.read();
    expect(list.map((r) => r.id)).toEqual(['c', 'a']);
    expect(ranked(list, low).map((r) => r.id)).toEqual(['a', 'c']);
    expect(personalBest(rec('d', 4, 2), list, low)?.id).toBe('a');
    expect(personalBest(rec('d', 4, 3), list, low)).toBeNull();
    expect(bestBy(list, (r) => r.hero, low).map((r) => r.id)).toEqual(['a']);
  });

  it('without a browser the default storage refuses and one warning is printed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = createPlayStats<Rec>({ key: KEY, valid, compare });
    expect(s.read()).toEqual([]);
    expect(s.record(rec('a', 1, 5))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('figures', () => {
  const list = [rec('a', 1, 5), rec('b', 2, 12, { hero: 'bo' }), rec('c', 3, 12), rec('d', 4, 8, { hero: 'bo' })];

  it('ranked: best first, ties by the comparison, the list untouched', () => {
    expect(ranked(list, compare).map((r) => r.id)).toEqual(['b', 'c', 'd', 'a']);
    expect(list[0]?.id).toBe('a');
    expect(ranked([], compare)).toEqual([]);
  });

  it('bestBy: one per group, best first', () => {
    expect(bestBy(list, (r) => r.hero, compare).map((r) => r.id)).toEqual(['b', 'c']);
    expect(bestBy([], (r: Rec) => r.hero, compare)).toEqual([]);
  });

  it('personalBest: the earlier best it beats, in its group', () => {
    const sameHero = (a: Rec, b: Rec): boolean => a.hero === b.hero;
    expect(personalBest(rec('e', 5, 13), list, compare)?.id).toBe('b');
    expect(personalBest(rec('e', 5, 12), list, compare)).toBeNull();
    expect(personalBest(rec('e', 5, 9, { hero: 'cy' }), list, compare, sameHero)).toBeNull();
    expect(personalBest(rec('d', 4, 13, { hero: 'bo' }), list, compare, sameHero)?.id).toBe('b');
    expect(personalBest(rec('e', 0, 99), list, compare)).toBeNull();
    expect(personalBest(rec('e', 5, 1), [], compare)).toBeNull();
  });

  it('totals', () => {
    expect(totals(list, (r) => (r.won ? 'win' : 'loss'), (r) => r.points)).toEqual({ games: 4, by: { win: 2, loss: 2 }, sum: 37, average: 9.25 });
    expect(totals(list, (r) => r.hero)).toEqual({ games: 4, by: { ada: 2, bo: 2 }, sum: 0, average: null });
    expect(totals([rec('a', 1, 5, { hero: '__proto__' }), rec('b', 2, 5, { hero: '__proto__' })], (r) => r.hero).by['__proto__']).toBe(2);
    expect(totals([], (r: Rec) => r.hero, (r) => r.points)).toEqual({ games: 0, by: {}, sum: 0, average: null });
  });
});
