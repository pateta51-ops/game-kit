import { describe, expect, it } from 'vitest';
import { applyAction, createGame, createSave, restoreSave, type AnswerAction } from '../kit/engine-core/index.ts';
import { playOne } from '../kit/sim-pool/index.ts';
import { COURIER, courierSim, type CourierState } from '../src/engine/courier.ts';

const options = { seed: 'courier' };
const start = () => createGame(COURIER, options, {}, null).state;
const step = (state: CourierState, to: string): AnswerAction => ({
  kind: 'answer', promptId: state.prompt?.id ?? -1, picks: [to],
});

describe('solo tactical compatibility reference', () => {
  it('uses the wall-aware map to gate actual kernel actions', () => {
    const state = start();
    expect(state.prompt?.options.map(option => option.id)).toEqual(['r1c0']);
    expect(() => applyAction(COURIER, state, step(state, 'r0c1'), null)).toThrow(/not an option/);
    const moved = applyAction(COURIER, state, step(state, 'r1c0'), null).state;
    expect(moved).toMatchObject({ space: 'r1c0', parcel: false, movesLeft: 4 });
    expect(state).toMatchObject({ space: 'r0c0', parcel: false, movesLeft: 5 });
  });

  it('runs the public-view pilot through the simulator and repeats under the same seed', () => {
    const spec = { index: 0, seed: 'courier', driver: 'courier-pilot' };
    const played = playOne(courierSim, null, spec, undefined, { view: true });
    expect(played).toMatchObject({ result: 'delivered', actions: 4, summary: { space: 'r0c2', parcel: true } });
    expect(playOne(courierSim, null, spec, undefined, { view: true }).hash).toBe(played.hash);
  });

  it('ends the delivery when the player spends the movement allowance', () => {
    let state = start();
    for (const to of ['r1c0', 'r0c0', 'r1c0', 'r0c0', 'r1c0'])
      state = applyAction(COURIER, state, step(state, to), null).state;
    expect(state).toMatchObject({ result: 'late', movesLeft: 0, prompt: null });
  });

  it('restores a mid-delivery save and finishes from the same open prompt', () => {
    const before = start();
    const first = step(before, 'r1c0');
    const moved = applyAction(COURIER, before, first, null).state;
    const second = step(moved, 'r1c1');
    const picked = applyAction(COURIER, moved, second, null).state;
    expect(picked.parcel).toBe(true);
    const saved = createSave(COURIER, {
      options, rules: {}, actions: [first, second], undoUsed: false, savedAt: '2026-01-01T00:00:00.000Z',
    }, null);
    const restored = restoreSave(COURIER, saved, null);
    if (!restored.ok) throw new Error(restored.error);
    expect(restored.state).toEqual(picked);
    const next = applyAction(COURIER, restored.state, step(restored.state, 'r0c1'), null).state;
    expect(applyAction(COURIER, next, step(next, 'r0c2'), null).state.result).toBe('delivered');
  });
});
