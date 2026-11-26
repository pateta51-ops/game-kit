import { describe, expect, it } from 'vitest';
import { createGameStore } from '../kit/game-store/index.ts';
import { applyAction, createGame, createSave, draftOf, restoreSave, setCowChecks, type AnswerAction, type GameRules } from '../kit/engine-core/index.ts';
import { breakAt, playOne } from '../kit/sim-pool/index.ts';
import { ACCEPTANCE_ROUTE, CONFIG, CONTENT, COURIER, GAME_DEF, courierView, startCourier, type Courier, type CourierState } from '../src/engine/api.ts';
import { SIM } from '../src/sim.ts';

setCowChecks(true);
const first = ACCEPTANCE_ROUTE[0];
const start = () => { const setup = GAME_DEF.start('courier'); return createGame(COURIER, setup.options, setup.rules, CONTENT).state; };
const answer = (state: CourierState, space: string): AnswerAction => ({ kind: 'answer', promptId: state.prompt?.id ?? -1, picks: [space] });

describe('courier gameplay acceptance', () => {
  it('COU-02 COU-06 SC-002 SC-006 charges one movement allowance and refuses illegal and stale choices without changing state', () => {
    const before = start();
    const moved = applyAction(COURIER, before, answer(before, first), CONTENT).state;
    expect(moved).toMatchObject({ space: first, movesLeft: CONFIG.allowances[0] - 1 });
    expect(before).toMatchObject({ space: CONFIG.depot, movesLeft: CONFIG.allowances[0], parcel: false });
    expect(() => applyAction(COURIER, before, answer(before, CONFIG.depot), CONTENT)).toThrow(/not an option/);
    const store = createGameStore(GAME_DEF, { seat: 'courier', seed: 'courier', undo: 'free' });
    const prompt = store.get().view.prompt;
    if (!prompt) throw new Error('No route prompt');
    expect(store.answer([CONFIG.depot], prompt.id)).toBe(false);
    expect(store.get().state).toEqual(before);
    expect(store.answer([first], prompt.id)).toBe(true);
    const valid = store.get().state;
    expect(store.answer([CONFIG.depot], prompt.id)).toBe(false);
    expect(store.get().state).toBe(valid);
    expect(store.undo()).toBe(true);
    expect(store.get().view.space).toBe(CONFIG.depot);
    expect(store.redo()).toBe(true);
    expect(store.get().view.space).toBe(first);
  });

  it('COU-03 COU-04 COU-07 SC-003 SC-004 SC-007 restores a saved pending route and completes the authored acceptance path', () => {
    const store = createGameStore(GAME_DEF, { seat: 'courier', seed: 'courier', undo: 'free' });
    expect(store.answer([first], store.get().view.prompt?.id ?? -1)).toBe(true);
    expect(store.get().view.prompt).not.toBeNull();
    const saved = createSave(COURIER, { ...store.saved(), savedAt: '2026-01-01T00:00:00.000Z' }, CONTENT);
    const restored = restoreSave(COURIER, saved, CONTENT);
    if (!restored.ok) throw new Error(restored.error);
    expect(restored.state).toEqual(store.get().state);
    const resumed = createGameStore(GAME_DEF, { seat: 'courier', seed: 'other', undo: 'free' });
    expect(resumed.load(saved)).toBeNull();
    for (const target of ACCEPTANCE_ROUTE.slice(1)) {
      expect(store.answer([target], store.get().view.prompt?.id ?? -1)).toBe(true);
      expect(resumed.answer([target], resumed.get().view.prompt?.id ?? -1)).toBe(true);
    }
    expect(resumed.get().view).toEqual(store.get().view);
    expect(resumed.get().view).toMatchObject({ result: 'delivered', space: CONFIG.destination, parcel: true, movesLeft: CONFIG.allowances[0] - ACCEPTANCE_ROUTE.length, prompt: null });
  });

  it('COU-05 SC-005 ends at an exhausted movement allowance and rejects further moves', () => {
    let state = start();
    for (let move = 0; move < CONFIG.allowances[0]; move++) {
      const to = move % 2 === 0 ? first : CONFIG.depot;
      state = applyAction(COURIER, state, answer(state, to), CONTENT).state;
    }
    expect(state).toMatchObject({ result: 'late', movesLeft: 0, prompt: null });
    expect(() => applyAction(COURIER, state, answer(state, CONFIG.destination), CONTENT)).toThrow();
  });

  it('SC-008 uses the same public pilot, setup and rules in simulation and store replay', () => {
    const spec = { index: 0, seed: 'courier', driver: 'courier-pilot' };
    const played = playOne(SIM, CONTENT, spec, undefined, { view: true });
    expect(played.error).toBeUndefined();
    expect(played.result).toBe('delivered');
    expect(played.viewValidation).toMatchObject({ status: 'executed' });
    expect(playOne(SIM, CONTENT, spec, undefined, { view: true }).hash).toBe(played.hash);
    const replay = breakAt(SIM, CONTENT, spec, CONFIG.allowances[0]);
    const store = createGameStore(GAME_DEF, { seat: 'courier', seed: spec.seed });
    for (const action of replay.history.actions) expect(store.answer(action.picks, action.promptId)).toBe(true);
    expect(store.get().view).toEqual(played.summary);
    expect(courierView(replay.state)).toEqual(played.summary);
    expect(store.get().view).not.toHaveProperty('rng');
    expect(store.get().view).not.toHaveProperty('stack');
    expect(SIM.start({ ...spec, settings: { allowance: String(CONFIG.allowances.at(-1)) } }, CONTENT)).toEqual(startCourier(spec.seed, CONFIG.allowances.at(-1)));
    expect(playOne(SIM, CONTENT, { ...spec, driver: 'misspelled-pilot' }).error).toContain('unknown driver');
  });

  it('rejects an invalid settled transition through the configured strict invariants', () => {
    const invalid: GameRules<Courier> = { ...COURIER, handlers: { ...COURIER.handlers, move: ctx => { draftOf(ctx).movesLeft = -1; } } };
    const before = start();
    expect(() => applyAction(invalid, before, answer(before, first), CONTENT)).toThrow(/movesLeft/);
    expect(before.movesLeft).toBe(CONFIG.allowances[0]);
    expect(() => startCourier('bad', 0)).toThrow(/allowance/);
  });
});
