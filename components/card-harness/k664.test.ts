import { describe, expect, it } from 'vitest';
import { patternProblems, type CardRecord, type Catalogue } from './index.ts';

// K664: an invented game; wording keeps the whole-pattern check, split patterns compare wording groups.
const C = (id: string, text: string) => ({ id, card: id.split('#')[0] ?? '', text });
const clauses = [C('owl#1', 'Gain 2 {gem}.'), C('bat#1', 'Gain 2 {leaf}.'), C('elk#1', 'Gain 3 {gem}.')];
const cat: Catalogue = { summary: { clauses: 3 }, patterns: [{ id: 'P-01', clauses }], oneOffs: [], interactions: [] };
const R = (clause: string, patch: Record<string, unknown> = {}): CardRecord => ({ id: `${clause} r0`, clause, op: 'gain', n: 2, ...patch });
const run = (records: CardRecord[], o: Partial<Parameters<typeof patternProblems>[0]> = {}, split = false) =>
  patternProblems({ catalogue: cat, records, arMap: [{ id: 'P-01', ar: 'AR-1', ...(split ? { split: true } : {}) }], ...o });

describe('K664 patternProblems wording', () => {
  it('wording: true still reports a pattern with 2 shapes', () => {
    const recs = [R('owl#1'), R('bat#1', { kind: 'leaf' }), R('elk#1')];
    expect(run(recs, { wording: true })).toEqual(['P-01 has 2 shapes: owl#1 {n,op}; bat#1 {kind,n,op}']);
  });
  it('a split pattern compares same-wording clauses', () => {
    const recs = [R('owl#1'), R('bat#1'), R('elk#1', { phase: 'night' })];
    expect(run(recs, { wording: true }, true)).toEqual(['P-01 wording "Gain N {gem}." has 2 shapes: owl#1 {n,op}; elk#1 {n,op,phase}']);
  });
  it('a split pattern with different wording and shapes passes; no wording: unchanged', () => {
    const recs = [R('owl#1'), R('bat#1', { kind: 'leaf' }), R('elk#1')];
    expect(run(recs, { wording: true }, true)).toEqual([]);
    expect(run(recs, {}, true)).toEqual([]);
  });
});
