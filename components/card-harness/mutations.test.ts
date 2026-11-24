import { describe, expect, it } from 'vitest';
import { runClauseMutations, type ClauseMutation } from './mutations.ts';
import type { SpecGame, SpecRow } from './spec.ts';

interface RecordData { line: string; draw: number; discard: number }
const records: readonly RecordData[] = [{ line: 'C-01', draw: 2, discard: 1 }, { line: 'C-02', draw: 3, discard: 0 }];
const game: SpecGame<RecordData, number, string, number, number> = {
  records,
  play(hand, act, rs) {
    const r = rs.find(x => x.line === act);
    if (r?.draw === 99) throw new Error('engine broke');
    return hand + (r?.draw ?? 0) - (r?.discard ?? 0);
  },
  check(actual, expected) { return actual === expected ? undefined : 'wrong hand size'; },
};
const rows: readonly SpecRow<number, string, number>[] = [{ line: 'C-01', layout: 4, act: 'C-01', expect: 5 }];
const options = { validate: (rs: readonly RecordData[]) => rs.some(r => r.draw < 0) ? ['negative draw'] : [] };
const mutant = (id: string, mutate: ClauseMutation<RecordData>['mutate'], recordIndex = 0): ClauseMutation<RecordData> => ({ id, line: 'C-01', recordIndex, mutate });

describe('K561 clause mutation checks', () => {
  it('kills a wrong amount, missing effect and incorrect optional discard', () => {
    const report = runClauseMutations(game, rows, [
      mutant('amount', r => ({ ...r, draw: 3 })),
      mutant('remove', () => null),
      mutant('discard', r => ({ ...r, discard: 0 })),
    ], options);
    expect(report.killed).toBe(3);
    expect(report.total).toBe(3);
    expect(report.problems).toEqual([]);
    expect(records[0]).toEqual({ line: 'C-01', draw: 2, discard: 1 });
  });
  it('reports a surviving mutation when assertions cannot distinguish outcomes', () => {
    const report = runClauseMutations(game, rows, [mutant('net', r => ({ ...r, draw: 3, discard: 2 }))], options);
    expect(report.results[0]?.status).toBe('survived');
    expect(report.problems).toHaveLength(1);
  });
  it('does not count invalid content, unchanged records, unrelated records or a crash as killed', () => {
    const report = runClauseMutations(game, rows, [
      mutant('negative', r => ({ ...r, draw: -1 })),
      mutant('same', r => r),
      mutant('other', r => ({ ...r, draw: 2 }), 1),
      mutant('crash', r => ({ ...r, draw: 99 })),
      mutant('throw', () => { throw new Error('bad mutator'); }),
    ], options);
    expect(report.results.map(r => r.status)).toEqual(['invalid', 'invalid', 'invalid', 'error', 'error']);
    expect(report.killed).toBe(0);
    expect(report.problems).toHaveLength(5);
  });
  it('requires a passing baseline and detects lines without mutants or rows', () => {
    const wrong = [{ ...rows[0]!, expect: 7 }, { line: 'C-02', layout: 4, act: 'C-02', expect: 7 }];
    const report = runClauseMutations(game, wrong, [
      mutant('wrong', r => ({ ...r, draw: 1 })),
      { ...mutant('missing-row', () => null), line: 'C-03' },
    ], options);
    expect(report.results.map(r => r.status)).toEqual(['baseline-failed', 'uncovered']);
    expect(report.problems).toContain('C-02: no mutation supplied');
  });
  it('isolates in-place edits to the mutation record and the playing adapter', () => {
    const edits: SpecGame<RecordData, number, string, number, number> = {
      ...game,
      play(hand, act, rs) {
        const result = game.play(hand, act, rs, false);
        if (rs[0]) rs[0].draw = 200;
        return result;
      },
    };
    const report = runClauseMutations(edits, rows, [
      mutant('in-place', r => { r.draw = 1; return r; }),
      mutant('same-again', r => r),
    ], options);
    expect(report.results.map(r => r.status)).toEqual(['killed', 'invalid']);
    expect(records[0]?.draw).toBe(2);
  });
  it('rejects duplicate mutation ids and invalid original content', () => {
    const one = mutant('same-id', () => null);
    expect(() => runClauseMutations(game, rows, [one, one], options)).toThrow('duplicate');
    expect(() => runClauseMutations(game, rows, [], { validate: () => ['bad original'] })).toThrow('invalid original content');
  });
});
