import { describe, expect, it } from 'vitest';
import { screenProblems, type ScreenInput } from './index.ts';

const base = (clauses: ScreenInput['clauses'], shown: string): ScreenInput => ({
  faces: [], clauses, zoom: (t) => t, icons: {}, prompts: [{ clause: 'c', shown }], opened: ['c'],
});
describe('cards:screen amounts (K532)', () => {
  it('without amounts the check is today\'s', () => {
    expect(screenProblems(base([{ id: 'c', text: 'At level 4 or more, draw cards.' }], 'Draw cards?'))).toEqual(['prompt for c: no amount']);
    expect(screenProblems(base([{ id: 'c', text: 'Gain 1 for each gem, up to 10.' }], 'Gain 5?'))).toEqual(['prompt for c: no amount']);
  });
  it('a condition number is not an amount (empty list)', () => {
    expect(screenProblems(base([{ id: 'c', text: 'At level 4 or more, draw cards.', amounts: [] }], 'Draw cards?'))).toEqual([]);
  });
  it('a counted amount shows any number', () => {
    expect(screenProblems(base([{ id: 'c', text: 'Gain 1 for each gem, up to 10.', amounts: 'counted' }], 'Gain 5?'))).toEqual([]);
  });
  it('a stat line number is left out of the amounts', () => {
    expect(screenProblems(base([{ id: 'c', text: '3 / 2 Fly. Draw 1 card.', amounts: ['1'] }], 'Draw 1 card?'))).toEqual([]);
  });
  it('still fails: a listed amount the prompt lacks', () => {
    expect(screenProblems(base([{ id: 'c', text: 'Draw 2 cards at level 4.', amounts: ['2'] }], 'Draw cards at level 4?'))).toEqual(['prompt for c: no amount']);
  });
  it('still fails: counted with no number shown', () => {
    expect(screenProblems(base([{ id: 'c', text: 'Gain 1 for each gem, up to 10.', amounts: 'counted' }], 'Gain some?'))).toEqual(['prompt for c: no amount']);
  });
  it('an amount not in the text is a problem', () => {
    expect(screenProblems(base([{ id: 'c', text: 'Draw 2 cards.', amounts: ['7'] }], 'Draw 7?'))).toEqual(['c: amount 7 is not in its text']);
  });
});
