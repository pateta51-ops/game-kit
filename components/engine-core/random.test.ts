// K108 (boardgame.io MockRandom, "randomness used" flag): a named override in tests; a rng-using action bars Safe undo when the game sets `randomWords`.
import { afterEach, describe, expect, it } from 'vitest';
import { addStep, applyAction, createGame, newHistory, newSteps, recordAction, setRngOverrides, undo, undoStep, type AnswerAction } from './index';
import { CONTENT, COUNTER, type Counter, type CounterState } from './fake/counter';

const LONG = { target: 1000 };
const O = { seed: 'k108' };
const pick = (s: CounterState, id: string): AnswerAction => ({ kind: 'answer', promptId: s.prompt?.id ?? -1, picks: [id] });
afterEach(() => setRngOverrides(null));

describe('named rng override', () => {
  it('a named call returns the forced value and leaves the rng alone; the rest stays seeded', () => {
    const s0 = createGame(COUNTER, O, LONG, CONTENT).state;
    setRngOverrides({ add: () => 1 });
    const r = applyAction(COUNTER, s0, pick(s0, 'add'), CONTENT);
    expect(r.state.counter).toBe(2);
    expect(r.state.rng).toEqual(s0.rng);
    setRngOverrides({ other: () => 0 });
    const seeded = applyAction(COUNTER, s0, pick(s0, 'add'), CONTENT);
    setRngOverrides(null);
    expect(applyAction(COUNTER, s0, pick(s0, 'add'), CONTENT).state.rng).toEqual(seeded.state.rng);
    expect(seeded.state.rng).not.toEqual(s0.rng);
  });
});

describe('randomness bars Safe undo', () => {
  const game = { ...COUNTER, randomWords: 'Dice were rolled' };
  it('refused in Safe with the game words, allowed in Free; unset: unchanged', () => {
    const s = createGame(game, O, LONG, CONTENT).state;
    const h = { ...newHistory<Counter>(O, LONG) };
    const r = recordAction(game, h, pick(s, 'add'), CONTENT);
    expect(r.ok).toBe(true);
    expect(undo(game, r.history, 'safe', CONTENT)).toMatchObject({ ok: false, error: 'Dice were rolled' });
    expect(undo(game, r.history, 'free', CONTENT).ok).toBe(true);
    expect(undo(COUNTER, r.history, 'safe', CONTENT).ok).toBe(true);
  });
  it('by step too', () => {
    const s = createGame(game, O, LONG, CONTENT).state;
    const h = addStep(game, newSteps<Counter>(s, []), pick(s, 'add'), CONTENT).history;
    expect(undoStep(game, h, 'safe', CONTENT)).toMatchObject({ ok: false, error: 'Dice were rolled' });
    expect(undoStep(game, h, 'free', CONTENT).ok).toBe(true);
  });
});
