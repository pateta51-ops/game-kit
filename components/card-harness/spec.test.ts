import { describe, expect, it } from 'vitest';
import { cardSpecs, specCoverage, specProblems, withoutLine, type SpecGame, type SpecRow } from './index.ts';

interface Rec { id: string; line: string; gain: number }
type Layout = { hand: number };
type Act = 'play';
type Exp = { score: number };
const RECORDS: Rec[] = [{ id: 'r1', line: 'c:1', gain: 2 }, { id: 'r2', line: 'c:2', gain: 0 }];
const GAME: SpecGame<Rec, Layout, Act, Exp, number> = {
  records: RECORDS,
  play: (layout, _act, records) => layout.hand + records.reduce((n, r) => n + r.gain, 0),
  check: (s, e) => (s === e.score ? undefined : `score ${String(s)}, wanted ${String(e.score)}`),
};
const results = (rows: SpecRow<Layout, Act, Exp>[]): Record<string, string | null> => {
  const out: Record<string, string | null> = {};
  cardSpecs('fake', GAME, rows, {
    describe: (_n, fn) => fn(),
    it: (n, fn) => {
      try {
        fn();
        out[n] = null;
      } catch (e) {
        out[n] = (e as Error).message;
      }
    },
  });
  return out;
};

describe('K77 spec rows', () => {
  it('K77: a row holds, and fails without its line records', () => {
    expect(results([{ line: 'c:1', layout: { hand: 1 }, act: 'play', expect: { score: 3 } }])).toEqual({ 'c:1 row 1': null, 'c:1 row 1: fails without its records': null });
  });
  it('K77: a row that still passes without its records fails', () => {
    const out = results([{ line: 'c:2', name: 'idle', layout: { hand: 1 }, act: 'play', expect: [{ score: 3 }] }]);
    expect(out['c:2 idle']).toBeNull();
    expect(out['c:2 idle: fails without its records']).toBe('row c:2 passes without its records');
  });
  it('K77: a line no record names, a wrong expectation, a thrown play', () => {
    const out = results([{ line: 'c:9', layout: { hand: 0 }, act: 'play', expect: { score: 2 } }, { line: 'c:1', layout: { hand: 0 }, act: 'play', expect: { score: 5 } }]);
    expect(out['c:9 row 1']).toBe('no record names line c:9');
    expect(out['c:1 row 2']).toBe('c:1 row 2:\nscore 2, wanted 5');
    const bad: SpecGame<Rec, Layout, Act, Exp, number> = { ...GAME, play: () => { throw new Error('no such zone'); } };
    expect(specProblems(bad, { line: 'c:1', layout: { hand: 0 }, act: 'play', expect: { score: 0 } })).toEqual(['no such zone']);
  });
  it('K77: withoutLine reads line, lines or lineOf', () => {
    expect(withoutLine<object>([{ lines: ['a', 'b'] }, { line: 'c' }], 'b')).toEqual([{ line: 'c' }]);
    expect(withoutLine(RECORDS, 'c:1', (r) => r.id).length).toBe(2);
  });
  it('K77: specCoverage lists lines with no row or title, and stale exemptions', () => {
    const records = [{ line: 'c:1' }, { line: 'c:2' }, { line: 'c:3' }, { lines: ['c:4'] }];
    expect(specCoverage<object>({ records, rows: [{ line: 'c:1' }], titles: ['c:2 discards a card', 'c:30 x'], exempt: { 'c:1': 'shown', 'c:4': 'no moment', 'c:7': 'gone' } })).toEqual({ missing: ['c:3'], stale: ['c:1', 'c:7'] });
  });
});
