import { describe, expect, it } from 'vitest';
import { screenProblems, type ScreenInput } from './index.ts';

// Made-up text: a clause with an amount and a card-number reference.
const text = 'Gain 2, then replace this with card #2.';
const ref = [/card #\d+/];
const run = (shown: string, amounts: readonly string[] | undefined, more: Partial<ScreenInput> = {}, t = text): string[] =>
  screenProblems({ faces: [], zoom: (x) => x, icons: {}, clauses: [{ id: 'c', text: t, ...(amounts ? { amounts } : {}) }], prompts: [{ clause: 'c', shown }], opened: ['c'], ...more });

describe('cards:screen number references (K667)', () => {
  it('K667 the amount shown with the reference passes', () => {
    expect(run('Gain 2, then replace this with card #2?', ['2'], { allowNumbers: ref })).toEqual([]);
  });
  it('K667 a reference alone is not the amount', () => {
    expect(run('Replace this with card #2?', ['2'], { allowNumbers: ref })).toEqual(['prompt for c: no amount']);
  });
  it('K667 poor: without allowNumbers nothing changes', () => {
    expect(run('Replace this with card #2?', ['2'])).toEqual([]);
  });
  it('K667 a real amount next to a reference is still checked', () => {
    expect(run('Pay 3 (card #9)?', ['2'], { allowNumbers: ref }, 'Pay 2 (card #9).')).toEqual(['prompt for c: no amount']);
  });
  it('K667 a reference in the printed text is no printed amount', () => {
    expect(run('Replace this with card #9?', undefined, { allowNumbers: ref }, 'Replace this with card #9.')).toEqual([]);
    expect(run('Gain 4?', undefined, { allowNumbers: ref }, 'Gain 4, then card #9.')).toEqual([]);
  });
  it('K667 a counted prompt: the printed reference is no printed number', () => {
    const cl = { id: 'c', text: 'Pay X, then card #9.', amounts: 'counted' as const };
    const r = (shown: string, more: Partial<ScreenInput>): string[] => screenProblems({ faces: [], zoom: (x) => x, icons: {}, clauses: [cl], prompts: [{ clause: 'c', shown, value: 3 }], opened: ['c'], ...more });
    expect(r('Pay 3, then card #9?', { allowNumbers: ref })).toEqual([]);
  });
});
