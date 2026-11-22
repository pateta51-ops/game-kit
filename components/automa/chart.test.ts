// K653: an older engine's chart-row cases restated on a made-up solo chart. The game supplies how much of a row can
// resolve (its `match`); the table falls through, spends nothing and keeps the row it matched.
import { describe, expect, it } from 'vitest';
import { decideAutoma, type AutomaTable } from './index.ts';

type Able = 'full' | 'part' | 'none';
interface View { kind: string; pileZ: number; removable: number; food: number; offer: string[]; side: 1 | 2; able: Record<string, Able> }
const rng = { int: () => 0 };
// The game's judgement of each row: how much of it can resolve now.
const rows = (v: View): Record<string, Able> => ({
  R1: v.pileZ > 0 ? 'full' : 'none',
  R2: v.removable > 0 ? 'full' : 'part', // gain 1 gem; remove a row card; file this card: gem and file always resolve
  ...v.able,
});
const chart: AutomaTable<View, string, null> = {
  rules: [
    { id: 'R1', when: (v) => v.kind === 'K', match: (a, v) => a === 'row:R1' && rows(v).R1 !== 'none' },
    { id: 'R2', match: (a, v) => a === 'row:R2' && rows(v).R2 !== 'none' },
  ],
  tieBreak: [],
};
const base: View = { kind: 'K', pileZ: 0, removable: 0, food: 1, offer: ['R-card'], side: 1, able: {} };

describe('K653 automa: chart rows fall through by how much of them can resolve', () => {
  it('I B10: the first matching row that cannot resolve at all is skipped; the next resolves in part; exactly one row is chosen (the game supplies how much of a row can resolve)', () => {
    const d = decideAutoma(chart, base, ['row:R1', 'row:R2'], null, rng);
    expect(d.missed).toEqual(['R1']);
    expect(d.rule).toBe('R2');
    expect(d.answer).toBe('row:R2');
    expect(rows(base).R2).toBe('part');
    expect(decideAutoma(chart, { ...base, pileZ: 1 }, ['row:R1', 'row:R2'], null, rng).rule).toBe('R1');
  });
  it('I B10: "X if able, otherwise Y": an X that can resolve only in part is not able, so Y runs', () => {
    const ifAble: AutomaTable<View, string, null> = {
      rules: [{ id: 'X', match: (a, v) => a === 'X' && rows(v).X === 'full' }, { id: 'Y', match: (a) => a === 'Y' }],
      tieBreak: [],
    };
    expect(decideAutoma(ifAble, { ...base, able: { X: 'part' } }, ['X', 'Y'], null, rng).rule).toBe('Y');
    expect(decideAutoma(ifAble, { ...base, able: { X: 'full' } }, ['X', 'Y'], null, rng).rule).toBe('X');
  });
});

describe('K653 automa: a coupled cost and a pinned chart side', () => {
  const buy: AutomaTable<View, string, null> = {
    rules: [
      { id: 'buyT', match: (a, v) => a === 'buy:T' && v.food >= 1 && v.offer.includes('T-card') },
      { id: 'takeR', match: (a, v) => a === 'take:R' && v.offer.includes('R-card') },
    ],
    tieBreak: [],
  };
  it('I B11: "spend 1 food to buy a T card; if unable, take an R card" with no T on offer: nothing spent, an R card taken', () => {
    const v = { ...base, offer: ['R-card'] };
    const d = decideAutoma(buy, v, ['buy:T', 'take:R'], null, rng);
    expect([d.rule, d.answer, d.missed]).toEqual(['takeR', 'take:R', ['buyT']]);
    expect(v.food).toBe(1);
  });
  it('I B11: a row matched on side 1 keeps that side when its own step flips the chart (the game resolves the row the decision names)', () => {
    const sided: AutomaTable<View, string, null> = {
      rules: [{ id: 'side1', when: (v) => v.side === 1, match: (a) => a === 'discard' }, { id: 'side2', when: (v) => v.side === 2, match: (a) => a === 'discard' }],
      tieBreak: [],
    };
    const v: View = { ...base };
    const d = decideAutoma(sided, v, ['discard'], null, rng);
    v.side = 2; // the discarded chart card flips the chart
    const gems = d.rule === 'side1' ? 2 : 0;
    expect(d.rule).toBe('side1');
    expect(gems).toBe(2);
    expect(decideAutoma(sided, v, ['discard'], null, rng).rule).toBe('side2');
  });
});
