import { describe, expect, it } from 'vitest';
import { restrictionProblems, type CardRecord, type Catalogue } from './index.ts';

// K665: restrictions nested anywhere in a record's effect tree are found.
const C = (id: string, text: string) => ({ id, card: id.split('#')[0] ?? '', text });
const cat: Catalogue = { summary: { clauses: 1 }, patterns: [], oneOffs: [C('owl#1', 'You may lose 2 {gem}.')], interactions: [] };
const words = { 'optional:true': ['you may'] };
const run = (rec: Record<string, unknown>, o: Partial<Parameters<typeof restrictionProblems>[0]> = {}) =>
  restrictionProblems({ catalogue: cat, records: [{ id: 'owl#1 r0', clause: 'owl#1', ...rec } as CardRecord], keys: ['optional', 'phase'], words, rulings: ['AR-1'], ...o });
const pay = (extra: Record<string, unknown> = {}) => ({ op: 'pay', n: 2, ...extra });

describe('K665 nested restrictions', () => {
  it('if -> pay -> pay { optional }', () => {
    expect(run({ op: 'if', then: [pay({ then: [pay({ optional: true })] })] })).toEqual([]);
  });
  it('under eachPlayer effects[]', () => {
    expect(run({ op: 'eachPlayer', effects: [pay({ optional: true })] })).toEqual([]);
  });
  it('under an upgraded branch', () => {
    expect(run({ op: 'if', upgraded: { op: 'seq', steps: [pay({ optional: true })] } })).toEqual([]);
  });
  it('missing at every depth still fails', () => {
    expect(run({ op: 'if', then: [pay({ then: [pay()] })], else: [pay()] })).toEqual(['owl#1: printed "you may" has no restriction optional=true']);
  });
  it('a nested restriction with no printed words and no ruling fails; a ruling excuses it', () => {
    const rec = { op: 'if', then: [pay({ phase: 'night', optional: true })] };
    expect(run(rec)).toEqual(['owl#1 r0: phase=night has no printed source and no AR']);
    expect(run({ ...rec, why: 'AR-1' })).toEqual([]);
  });
  it('top level is found as before', () => {
    expect(run({ op: 'pay', optional: true })).toEqual([]);
  });
});
