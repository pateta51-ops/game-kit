import { describe, expect, it } from 'vitest';
import { createGameStore } from '../kit/game-store/index.ts';
import { applyAction, createGame, CONTENT, GAME_DEF, RULES, STUB } from '../src/engine/api.ts';

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

  it('plays through the game store, with undo', () => {
    const store = createGameStore(GAME_DEF, { seat: 'me', seed: 'smoke', undo: 'free' });
    store.answer(['step'], store.get().state.prompt?.id ?? 0);
    expect(store.get().state.count).toBe(1);
    store.undo();
    expect(store.get().state.count).toBe(0);
  });
});
