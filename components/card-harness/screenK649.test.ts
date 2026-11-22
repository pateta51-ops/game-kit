import { describe, expect, it } from 'vitest';
import { screenProblems, type ScreenInput } from './index.ts';

// Fake clauses: a printed price, and an amount counted at run time.
const price = 'Pay 2 energy: draw a card.';
const counted = 'Pay X, X = the number of some pieces.';
const run = (clause: ScreenInput['clauses'][number], p: Omit<ScreenInput['prompts'][number], 'clause'>, more: Partial<ScreenInput> = {}): string[] =>
  screenProblems({ faces: [], zoom: (t) => t, icons: {}, clauses: [clause], prompts: [{ clause: 'c', ...p }], opened: ['c'], ...more });

describe('cards:screen amount outside icon codes (K649 a)', () => {
  it('an amount only inside an icon code is no amount', () => {
    expect(run({ id: 'c', text: price }, { shown: 'Pay {2-energy}: draw a card?' })).toEqual(['prompt for c: no amount']);
    expect(run({ id: 'c', text: price, amounts: ['2'] }, { shown: 'Pay {dmg2}?' })).toEqual(['prompt for c: no amount']);
  });
  it('the amount in the words passes, icon or not', () => {
    expect(run({ id: 'c', text: price }, { shown: 'Pay 2 {energy}: draw a card?' })).toEqual([]);
  });
  it('an icon the game says carries the amount counts (iconAmounts)', () => {
    expect(run({ id: 'c', text: price }, { shown: 'Pay {2-energy}?' }, { iconAmounts: ['2-energy'] })).toEqual([]);
    expect(run({ id: 'c', text: price }, { shown: 'Pay {dmg2}?' }, { iconAmounts: /^dmg\d+$/ })).toEqual([]);
    expect(run({ id: 'c', text: price }, { shown: 'Pay {dmg2}?' }, { iconAmounts: ['2-energy'] })).toEqual(['prompt for c: no amount']);
  });
});

describe('cards:screen counted amount tied to the run (K649 b)', () => {
  it('a declared value missing from the text is a problem', () => {
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'pay 2', value: 3 })).toEqual(['prompt for c: amount 3 not shown', 'prompt for c: stray number 2']);
  });
  it('the declared value shown passes', () => {
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'pay 3', value: 3 })).toEqual([]);
    expect(run({ id: 'c', text: counted, promptAmounts: ['counted'] }, { shown: 'pay 3', value: '3' })).toEqual([]);
  });
  it('no declared value: stray digits beside the amount are a problem', () => {
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'pay 3, then pay 2' })).toEqual(['prompt for c: numbers 3, 2 shown, pass value to tell the amount']);
  });
  it('a shared iconAmounts pattern with the g flag counts on every prompt', () => {
    const re = /dmg\d+/g, cl = [{ id: 'c', text: price }];
    expect(screenProblems({ faces: [], zoom: (t) => t, icons: {}, clauses: cl, prompts: [{ clause: 'c', shown: 'Pay {dmg2}?' }, { clause: 'c', shown: 'Pay {dmg2}?' }, { clause: 'c', shown: 'Pay {dmg2}?' }], opened: ['c'], iconAmounts: re })).toEqual([]);
  });
  it('an ordinal is no number: not the amount, not stray', () => {
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'Your 2nd turn: pay 3' })).toEqual([]);
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'Your 2nd turn: pay 3', value: 3 })).toEqual([]);
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'Your 2nd turn: pay' })).toEqual(['prompt for c: no amount']);
  });
  it('allowNumbers: a number or a pattern the game allows is not stray', () => {
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'Unit 7: pay 3', value: 3 })).toEqual(['prompt for c: stray number 7']);
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'Unit 7: pay 3', value: 3 }, { allowNumbers: [/Unit \d+/] })).toEqual([]);
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'Unit 7: pay 3', value: 3 }, { allowNumbers: ['7'] })).toEqual([]);
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'Unit 7: pay 3' }, { allowNumbers: [/Unit \d+/g] })).toEqual([]);
  });
  it('a negative value is shown with its sign; a value that is no whole number is a problem', () => {
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'change by -3', value: -3 })).toEqual([]);
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'change by −3', value: -3 })).toEqual([]);
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'change by 3', value: -3 })).toEqual(['prompt for c: amount -3 not shown']);
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'pay X (3)', value: 'X' })).toEqual(['prompt for c: value X is not a whole number']);
  });
  it('no declared value: one number, or numbers the clause prints, pass', () => {
    expect(run({ id: 'c', text: counted, amounts: 'counted' }, { shown: 'pay 3' })).toEqual([]);
    expect(run({ id: 'c', text: 'Gain 1 for each gem, up to 10.', amounts: 'counted' }, { shown: 'Gain 5, up to 10?' })).toEqual([]);
  });
});
