import { expect, it } from 'vitest';
import { createGameStore } from '../kit/game-store/index.ts';
import { hashState, hashValue, replay, type AnswerAction } from '../kit/engine-core/index.ts';
import { makeSaves } from '../kit/saves/index.ts';
import { DriverRng, legalAnswers, playOne } from '../kit/sim-pool/index.ts';
import { CARD_SETUP, CONTENT, GAME, REF, type Ref } from '../src/engine/api.ts';
import { simGame } from '../src/engine/sim.ts';

const make = (seed: string) => createGameStore(REF, { seat: '0', seed, undo: 'free' });
const choose = (state: Ref['state'], seed: string) => {
  const rng = new DriverRng(`${seed}|opponent|${String(state.prompt!.id)}`);
  return simGame.driver('opponent', { index: 0, seed, driver: 'opponent' }, CONTENT).choose(state, legalAnswers(state.prompt!, rng), rng) as AnswerAction;
};

it('SC-001 starts the configured pack and human/automa setup and refuses illegal or stale answers', () => {
  const store = make('assembly');
  expect(store.get().rules.life).toEqual({ 0: CARD_SETUP.life[0], 1: CARD_SETUP.life[1] });
  expect(store.get().rules.rounds).toBe(CARD_SETUP.rounds);
  expect(store.get().options).toMatchObject({ bots: ['1'], level: CARD_SETUP.level });
  const before = hashState(store.get().state);
  expect(store.answer(['not-offered'], store.get().state.prompt!.id)).toBe(false);
  expect(hashState(store.get().state)).toBe(before);
  expect(store.answer(['no'], store.get().state.prompt!.id + 1)).toBe(false);
  expect(hashState(store.get().state)).toBe(before);
});

it('SC-002 saves an open card decision, restores, undoes and replays the same authoritative state', () => {
  const seed = 'pending';
  const store = make(seed);
  expect(store.answer(['no'], store.get().state.prompt!.id)).toBe(true);
  expect(store.get().state.prompt?.kind).toBe('pick');
  const pending = hashState(store.get().state);
  const saves = makeSaves({ game: GAME, content: CONTENT, database: 'assembly-test', filePrefix: 'reference-cards' });
  const save = saves.saveOf(store.saved());
  const restored = make('another');
  expect(restored.load(save)).toBeNull();
  expect(hashState(restored.get().state)).toBe(pending);
  const action = choose(store.get().state, seed);
  expect(store.answer(action.picks, action.promptId)).toBe(true);
  expect(restored.answer(action.picks, action.promptId)).toBe(true);
  expect(hashState(restored.get().state)).toBe(hashState(store.get().state));
  expect(store.undo()).toBe(true);
  expect(hashState(store.get().state)).toBe(pending);
  expect(store.redo()).toBe(true);
  const history = store.saved();
  const result = replay(GAME, history.options, history.rules, history.actions as AnswerAction[], CONTENT);
  expect(result.ok).toBe(true);
  expect(hashState(result.state)).toBe(hashState(store.get().state));
});

it('SC-003 reaches the same terminal state and answer trace through live store and simulation', () => {
  const seed = 'same-game';
  const store = make(seed);
  for (let count = 0; store.get().state.result === null && count < 100; count++) {
    const state = store.get().state;
    const action = choose(state, seed);
    expect(store.answer(action.picks, action.promptId), store.get().error ?? '').toBe(true);
  }
  expect(store.get().state.result).not.toBeNull();
  const simulated = playOne({ ...simGame, summary: state => ({ stateHash: hashState(state) }) }, CONTENT, { index: 0, seed, driver: 'opponent' }, undefined, { hidden: true });
  expect(simulated.error).toBeUndefined();
  expect(simulated.result).toEqual(store.get().state.result);
  expect(simulated.summary?.stateHash).toBe(hashState(store.get().state));
  expect(simulated.hash).toBe(hashValue(store.get().history.actions));
});
