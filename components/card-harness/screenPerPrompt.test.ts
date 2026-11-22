import { describe, expect, it } from 'vitest';
import { Delivery, screenProblems, type ScreenInput } from './index.ts';

// A fake card: one clause, two prompts: "Move 2 spaces, then you may rest." The second prompt shows an implied 1 that is not printed.
const text = 'Move 2 spaces, then you may rest.';
const two = [{ clause: 'c', shown: 'Move 2 spaces?' }, { clause: 'c', shown: 'Rest 1 turn?', step: 1 }];
const run = (clause: Partial<ScreenInput['clauses'][number]>, prompts: ScreenInput['prompts'] = two): string[] =>
  screenProblems({ faces: [], zoom: (t) => t, icons: {}, clauses: [{ id: 'c', text, ...clause }], prompts, opened: ['c'] });

describe('cards:screen amounts per prompt (K587)', () => {
  it('no single list covers both prompts: the second fails no amount', () => {
    expect(run({})).toEqual(['prompt for c: no amount']);
    expect(run({ amounts: ['2'] })).toEqual(['prompt for c: no amount']);
    expect(run({ amounts: [] })).toEqual([]);
  });
  it('per-prompt amounts check each prompt on its own', () => {
    expect(run({ promptAmounts: [['2'], []] })).toEqual([]);
    expect(run({ promptAmounts: [['2'], 'counted'] })).toEqual([]);
  });
  it('still fails when the first prompt drops its printed 2', () => {
    expect(run({ promptAmounts: [['2'], []] }, [{ clause: 'c', shown: 'Move spaces?' }, two[1]!])).toEqual(['prompt for c: no amount']);
    expect(run({ promptAmounts: [['2'], 'counted'] }, [two[0]!, { clause: 'c', shown: 'Rest?', step: 1 }])).toEqual(['prompt for c: no amount']);
  });
  it('fewer entries than prompts opened, or an entry for a prompt that never opens, is a problem', () => {
    expect(run({ promptAmounts: [['2']] })).toEqual(['prompt for c: prompt 2 has no promptAmounts entry']);
    expect(run({ promptAmounts: [['2'], [], []] })).toEqual(['c: promptAmounts entry 3 but no prompt 3 opened']);
    expect(run({ promptAmounts: [['2'], []] }, [two[0]!])).toEqual(['c: promptAmounts entry 2 but no prompt 2 opened']);
  });
  it('a listed number not in the text, or both forms set, is a problem', () => {
    expect(run({ promptAmounts: [['2'], ['1']] })).toEqual(['c: prompt 2 amount 1 is not in its text']);
    expect(run({ amounts: ['2'], promptAmounts: [['2'], []] })).toEqual(['c: amounts and promptAmounts both set']);
  });
  it('Delivery numbers the prompts of one resolution; load starts again; a refused answer keeps the step', () => {
    let open: string | null = 'move';
    const d2 = new Delivery<null, string>({
      load: () => { open = 'move'; }, dispatch: (p) => ({ ok: p[0] !== 'bad', autos: [] }), prompt: () => open,
      clauseOf: () => 'c', screen: (p) => (p === 'move' ? 'Move 2 spaces?' : 'Rest 1 turn?'),
    });
    d2.load(null);
    d2.answer('bad');
    open = 'rest'; d2.answer('ok');
    open = null; d2.answer('ok');
    d2.load(null);
    expect(d2.screens).toEqual([{ clause: 'c', shown: 'Move 2 spaces?' }, { clause: 'c', shown: 'Move 2 spaces?' }, { clause: 'c', shown: 'Rest 1 turn?', step: 1 }, { clause: 'c', shown: 'Move 2 spaces?' }]);
    expect(run({ promptAmounts: [['2'], []] }, d2.screens)).toEqual([]);
  });
});
