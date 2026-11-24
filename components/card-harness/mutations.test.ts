import { describe, expect, it } from 'vitest';
import { contentGate } from './contentGate.ts';
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
const removeFirst = mutant('remove-first', () => null);
const removeSecond = { ...mutant('remove-second', () => null, 1), line: 'C-02' };
const completeRows = [...rows, { line: 'C-02', layout: 4, act: 'C-02', expect: 7 }];

function mutationGate(problems: readonly string[]): boolean {
  return contentGate({
    packs: [{ path: 'clause mutations', validate: () => problems.map(message => ({ code: 'clause-mutation', severity: 'error', message })) }],
    readGenerated: () => undefined,
  }, () => undefined).failed;
}

describe('K561 clause mutation checks', () => {
  it('fails the content gate when a required clause is absent despite a killed mutant for another clause', () => {
    const report = runClauseMutations(game, rows, [removeFirst], options);
    expect(report.killed).toBe(1);
    expect(mutationGate(report.problems)).toBe(true);
    expect(report.missing).toEqual(['C-02']);
    expect(report.problems).toContain('C-02: no spec row with executable expectations');
  });
  it('fails the content gate for nonempty content with no spec rows or mutants', () => {
    const report = runClauseMutations(game, [], [], options);
    expect(mutationGate(report.problems)).toBe(true);
    expect(report.problems).toEqual([
      'C-01: no spec row with executable expectations',
      'C-02: no spec row with executable expectations',
    ]);
  });
  it('reports a clause with no executable expectation even when it has a mutant', () => {
    const report = runClauseMutations(game, [{ ...completeRows[1]!, expect: [] }, ...rows], [removeFirst, removeSecond], options);
    expect(report.results.map(r => r.status)).toEqual(['killed', 'uncovered']);
    expect(report.problems).toContain('C-02: no spec row with executable expectations');
  });
  it('rejects duplicate clause declarations', () => {
    const duplicated = { ...options, requiredLines: ['C-01', 'C-01', 'C-02'] };
    expect(() => runClauseMutations(game, completeRows, [removeFirst, removeSecond], duplicated)).toThrow('duplicate required clause: C-01');
    const malformed = { ...game, lineOf: (r: RecordData) => [r.line, r.line] };
    expect(() => runClauseMutations(malformed, completeRows, [removeFirst, removeSecond], options)).toThrow('duplicate clause C-01 in record 0');
  });
  it('rejects unknown exemptions and accepts a clause explicitly exempted with a reason', () => {
    const invalid = { ...options, exempt: { 'C-02': ' ', 'C-03': 'unknown', 'C-01': 'contradicts executable evidence' } };
    const report = runClauseMutations(game, rows, [removeFirst], invalid);
    expect(report.problems).toEqual(expect.arrayContaining([
      'C-01: exemption conflicts with a spec row or mutant',
      'C-02: exemption needs a reason',
      'C-03: exemption names an unknown clause',
    ]));
    const exempt = { 'C-02': 'Reference entry consumed by the UI only' };
    const displayRecordGame = { ...game, records: [records[0]!, { line: 'C-02', draw: 0, discard: 0 }] };
    const valid = runClauseMutations(displayRecordGame, rows, [removeFirst], { ...options, exempt });
    expect(mutationGate(valid.problems)).toBe(false);
    expect(valid.missing).toEqual([]);
    expect(valid.exempted).toEqual([{ line: 'C-02', reason: exempt['C-02'] }]);
  });
  it('retains independent catalogue clauses and ignores inherited exemption keys', () => {
    const report = runClauseMutations(game, completeRows, [removeFirst, removeSecond], {
      ...options, requiredLines: ['C-01', 'C-02', 'toString'],
    });
    expect(report.missing).toEqual(['toString']);
    expect(mutationGate(report.problems)).toBe(true);
  });
  it('permits multiple records referring to one clause and validates each target', () => {
    const repeatedOwner = { ...game, records: [...records, { line: 'C-01', draw: 1, discard: 1 }] };
    const report = runClauseMutations(repeatedOwner, completeRows, [removeFirst, removeSecond], options);
    expect(report.results.map(r => r.status)).toEqual(['killed', 'killed']);
    expect(report.problems).toEqual([]);
  });

  it('kills a wrong amount, missing effect and incorrect optional discard', () => {
    const report = runClauseMutations(game, completeRows, [
      mutant('amount', r => ({ ...r, draw: 3 })),
      mutant('remove', () => null),
      mutant('discard', r => ({ ...r, discard: 0 })),
      removeSecond,
    ], options);
    expect(report.killed).toBe(4);
    expect(report.total).toBe(4);
    expect(report.problems).toEqual([]);
    expect(report.missing).toEqual([]);
    expect(mutationGate(report.problems)).toBe(false);
    expect(records[0]).toEqual({ line: 'C-01', draw: 2, discard: 1 });
  });
  it('reports a surviving mutation when assertions cannot distinguish outcomes', () => {
    const report = runClauseMutations(game, completeRows, [mutant('net', r => ({ ...r, draw: 3, discard: 2 })), removeSecond], options);
    expect(report.results[0]?.status).toBe('survived');
    expect(report.problems).toHaveLength(1);
  });
  it('does not count invalid content, unchanged records, unrelated records or a crash as killed', () => {
    const report = runClauseMutations(game, completeRows, [
      mutant('negative', r => ({ ...r, draw: -1 })),
      mutant('same', r => r),
      mutant('other', r => ({ ...r, draw: 2 }), 1),
      mutant('crash', r => ({ ...r, draw: 99 })),
      mutant('throw', () => { throw new Error('bad mutator'); }),
      removeSecond,
    ], options);
    expect(report.results.map(r => r.status)).toEqual(['invalid', 'invalid', 'invalid', 'error', 'error', 'killed']);
    expect(report.killed).toBe(1);
    expect(report.problems).toHaveLength(5);
  });
  it('requires a passing baseline and detects lines without mutants or rows', () => {
    const wrong = [{ ...rows[0]!, expect: 7 }, { line: 'C-02', layout: 4, act: 'C-02', expect: 7 }];
    const threeClauses = { ...game, records: [...records, { line: 'C-03', draw: 1, discard: 0 }] };
    const report = runClauseMutations(threeClauses, wrong, [
      mutant('wrong', r => ({ ...r, draw: 1 })),
      { ...mutant('missing-row', () => null, 2), line: 'C-03' },
    ], options);
    expect(report.results.map(r => r.status)).toEqual(['baseline-failed', 'uncovered']);
    expect(report.problems).toContain('C-02: no mutation supplied');
    expect(report.missing).toEqual(['C-02', 'C-03']);
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
