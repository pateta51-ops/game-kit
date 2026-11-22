import { describe, expect, it } from 'vitest';
import { screenProblems, type ScreenInput } from './index.ts';

// A fake clause whose amount is counted at run time: no number is printed.
const text = 'Gain X of something, X = the number of some pieces.';
const run = (clauses: ScreenInput['clauses'], shown: string): string[] =>
  screenProblems({ faces: [], zoom: (t) => t, icons: {}, clauses, prompts: [{ clause: 'c', shown }], opened: ['c'] });

describe('cards:screen counted amount (K587, rule 28)', () => {
  it('a counted prompt with the number removed fails no amount; with any number it passes', () => {
    expect(run([{ id: 'c', text, amounts: 'counted' }], 'Gain of something?')).toEqual(['prompt for c: no amount']);
    expect(run([{ id: 'c', text, amounts: 'counted' }], 'Gain 4 of something?')).toEqual([]);
  });
  it('digits inside an icon code are not a number shown', () => {
    expect(run([{ id: 'c', text, amounts: 'counted' }], 'Gain {res2} of something?')).toEqual(['prompt for c: no amount']);
    expect(run([{ id: 'c', text, amounts: 'counted' }], 'Gain 4 {res2} of something?')).toEqual([]);
  });
  it('the same clause listed again without amounts does not drop counted', () => {
    expect(run([{ id: 'c', text, amounts: 'counted' }, { id: 'c', text }], 'Gain of something?')).toEqual(['c: listed twice with different text or amounts', 'prompt for c: no amount']);
    expect(run([{ id: 'c', text, amounts: 'counted' }, { id: 'c', text, amounts: 'counted' }], 'Gain 4 of something?')).toEqual([]);
  });
  it('the per-prompt form takes counted for a single prompt', () => {
    expect(run([{ id: 'c', text, promptAmounts: ['counted'] }], 'Gain of something?')).toEqual(['prompt for c: no amount']);
    expect(run([{ id: 'c', text, promptAmounts: ['counted'] }], 'Gain {res2} of something?')).toEqual(['prompt for c: no amount']);
    expect(run([{ id: 'c', text, promptAmounts: ['counted'] }], 'Gain 4 of something?')).toEqual([]);
  });
});
