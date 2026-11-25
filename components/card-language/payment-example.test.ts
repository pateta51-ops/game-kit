import { describe, expect, it } from 'vitest';
import { applyAction, createGame, enumerateAnswers, hashState, IllegalActionError } from '../engine-core/index.ts';
import { makePaymentGame, preferredPaymentAnswer } from './examples/payment.ts';

const game = makePaymentGame();
const start = (pool = { gold: 3, wild: 2 }) => createGame(game, { seed: 'payment', pool }, {}, null).state;

describe('documented payment action', () => {
  it('offers minimal spending vectors and ranks the same legal choices using the public pool', () => {
    const state = start();
    const answers = enumerateAnswers(state);
    expect(state.prompt?.options).toMatchObject([
      { plan: { spent: { wild: 2 }, remaining: { gold: 3, wild: 0 } } },
      { plan: { spent: { gold: 1, wild: 1 }, remaining: { gold: 2, wild: 1 } } },
    ]);
    const choice = preferredPaymentAnswer(state.pool, answers);
    if (!choice) throw new Error('expected an affordable choice');
    expect(choice).toEqual(answers[1]);
    expect(preferredPaymentAnswer(state.pool, answers.slice(0, 1))).toEqual(answers[0]);
    const before = hashState(state);
    const bought = applyAction(game, state, choice, null);
    expect(bought.state).toMatchObject({ pool: { gold: 2, wild: 1 }, result: 'bought' });
    expect(hashState(state)).toBe(before);
    expect(applyAction(game, state, choice, null)).toEqual(bought);
  });

  it('refuses forged IDs and requotes a stale choice against current holdings', () => {
    const state = start();
    const choice = preferredPaymentAnswer(state.pool, enumerateAnswers(state));
    if (!choice) throw new Error('expected an affordable choice');
    const before = hashState(state);
    expect(() => applyAction(game, state, { ...choice, picks: ['forged'] }, null)).toThrow(IllegalActionError);
    expect(hashState(state)).toBe(before);

    // Simulate an outstanding displayed prompt while a game-owned resource change invalidates its preferred plan.
    const changed = { ...state, pool: { gold: 2, wild: 2 } };
    const changedBefore = hashState(changed);
    expect(() => applyAction(game, changed, choice, null)).toThrow(/payment is no longer legal/);
    expect(hashState(changed)).toBe(changedBefore);
    expect(changed.result).toBeNull();
  });

  it('uses recomputed remaining resources even when the quoted spend remains legal', () => {
    const state = start();
    const choice = preferredPaymentAnswer(state.pool, enumerateAnswers(state));
    if (!choice) throw new Error('expected an affordable choice');
    const changed = { ...state, pool: { gold: 4, wild: 2 } };
    expect(applyAction(game, changed, choice, null).state.pool).toEqual({ gold: 3, wild: 1 });
    expect(changed.pool).toEqual({ gold: 4, wild: 2 });
  });

  it('separates an empty affordable set from a budget error at setup and at commit', () => {
    const state = start({ gold: 2, wild: 0 });
    expect(state).toMatchObject({ result: 'unaffordable', prompt: null });
    expect(preferredPaymentAnswer(state.pool, [])).toBeUndefined();

    const offered = start();
    const action = enumerateAnswers(offered)[0];
    if (!action) throw new Error('expected a legal action');
    const before = hashState(offered);
    for (const limit of ['maxNodes', 'maxDominanceChecks'] as const) {
      const budgeted = makePaymentGame({ [limit]: 1 });
      const exceeded = `exceeded ${limit}`;
      expect(() => createGame(budgeted, { seed: 'payment', pool: offered.pool }, {}, null)).toThrow(exceeded);
      expect(() => applyAction(budgeted, offered, action, null)).toThrow(exceeded);
      expect(hashState(offered)).toBe(before);
    }
  });
});
