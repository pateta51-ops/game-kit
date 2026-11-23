import { describe, expect, it } from 'vitest';
import { expectResolved, traceAbilities } from '../card-harness/trace.ts';
import { dispatchTrace, type ResolvedTrace } from './index.ts';

type Note = { kind: string; id: string };
const notes = () => {
  const subs = new Set<(n: Note) => void>();
  return {
    listen(fn: (n: Note) => void) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    note(n: Note) {
      for (const s of subs) s(n);
    },
  };
};
const REG = { c1: { effects: ['gain'] }, c2: { effects: ['lose'] } };
// A tiny dispatch: a dry run reads the effects to check the offer and notes nothing; a real run reads them and notes the clause.
const dispatch = (reg: typeof REG, id: 'c1' | 'c2', dryRun: boolean, p?: ReturnType<typeof notes>): number => {
  const n = reg[id].effects.length;
  if (!dryRun) p?.note({ kind: 'clause', id });
  return n;
};

describe('K708 dispatchTrace counts only clauses dispatch ran outside dry run', () => {
  it('traceAbilities counts a dry-run offer check as a resolve (the gap)', () => {
    const t = traceAbilities(REG);
    dispatch(t.registry, 'c2', true);
    expect([...t.resolved]).toEqual(['c2']);
  });
  it('dispatchTrace does not: c2 only checked, c1 run', () => {
    const p = notes();
    const t = dispatchTrace(REG, p);
    dispatch(t.registry, 'c2', true, p);
    dispatch(t.registry, 'c1', false, p);
    expect([...t.resolved]).toEqual(['c1']);
    expect([...t.considered].sort()).toEqual(['c1', 'c2']);
    expect(() => expectResolved(t, 'c2')).toThrow('Not resolved: c2 (looked up, not run)');
    expect(() => expectResolved(t, 'c1')).not.toThrow();
  });
  it('ignores other note kinds, clears, stops, and fits SimGame.trace', () => {
    const p = notes();
    const t = dispatchTrace(REG, p);
    const sim: ResolvedTrace = t;
    p.note({ kind: 'op', id: 'gain' });
    p.note({ kind: 'clause', id: 'c1' });
    expect([...sim.resolved]).toEqual(['c1']);
    sim.clear();
    expect([...t.resolved]).toEqual([]);
    t.stop();
    p.note({ kind: 'clause', id: 'c2' });
    expect([...t.resolved]).toEqual([]);
    const k = dispatchTrace(REG, p, 'handler');
    p.note({ kind: 'handler', id: 'c2' });
    expect([...k.resolved]).toEqual(['c2']);
  });
});
