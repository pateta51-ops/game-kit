import { describe, expect, it } from 'vitest';
import { applyAction, createGame, CONTENT, RULES, STUB } from '../src/engine/api.ts';

describe('smoke', () => {
  it('plays the stub game to a win', () => {
    let { state } = createGame(STUB, { seed: 'smoke' }, RULES, CONTENT);
    while (state.result === null) {
      const p = state.prompt;
      if (p === null) throw new Error('no prompt');
      state = applyAction(STUB, state, { kind: 'answer', promptId: p.id, picks: ['step'] }, CONTENT).state;
    }
    expect(state.result).toEqual({ kind: 'won' });
    expect(state.count).toBe(RULES.target);
  });
});
