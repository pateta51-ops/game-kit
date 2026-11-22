import { describe, expect, it } from 'vitest';
import { restrictionProblems, type Catalogue } from './index.ts';

// K665: restrictions nested anywhere in a record's effect tree are found.
const C = (id: string, text: string) => ({ id, card: id.split('#')[0] ?? '', text });
const cat: Catalogue = { summary: { clauses: 1 }, patterns: [], oneOffs: [C('owl#1', 'You may lose 2 {gem}.')], interactions: [] };
const words = { 'optional:true': ['you may'] };
const run = (rec: Record<string, unknown>, o: Partial<Parameters<typeof restrictionProblems>[0]> = {}) =>
  restrictionProblems({ catalogue: cat, records: [{ id: 'owl#1 r0', clause: 'owl#1', ...rec }], keys: ['optional', 'phase'], words, rulings: ['AR-1'], ...o });
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
  it('a lasting record may carry its duration in a nested step', () => {
    const o = { lasting: () => true, words: {}, keys: ['optional', 'duration'], rulings: ['AR-1'] };
    expect(run({ op: 'if', why: 'AR-1', then: [pay({ duration: 'round' })] }, o)).toEqual([]);
    expect(run({ op: 'if', why: 'AR-1', then: [pay()] }, o)).toEqual(['owl#1 r0: lasting effect with no duration']);
  });
  it('a restriction inside a target or filter is not a step restriction', () => {
    expect(run({ op: 'pay', target: { filter: { optional: true } } })).toEqual(['owl#1: printed "you may" has no restriction optional=true']);
    expect(run({ op: 'pay', then: [pay({ target: { filter: { phase: 'night' } } })] }, { words: {} })).toEqual([]);
  });
  it('a self-reference does not loop', () => {
    const a: Record<string, unknown> = { op: 'if' };
    a.then = [a, { op: 'pay', optional: true }];
    expect(run(a)).toEqual([]);
  });
  it('a 20000-deep tree is walked', () => {
    let deep: Record<string, unknown> = pay({ optional: true });
    for (let i = 0; i < 20000; i++) deep = { op: 'if', then: [deep] };
    expect(run(deep)).toEqual([]);
  });
  it('top level is found as before', () => {
    expect(run({ op: 'pay', optional: true })).toEqual([]);
  });
});
