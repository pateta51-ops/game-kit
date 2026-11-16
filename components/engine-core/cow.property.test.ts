// Copy on write (ported from Warp's Edge tests/property/cow.property.test.ts): `applyAction` shares every container of
// the input state that an action does not write to. Whole games of the fake counter game, played by the seeded random
// player, with state freezing on (tests, the browser) and off (simulations, where a missed barrier would not throw).
// After every action:
// - the input state is unchanged (its JSON, keys in order, is the same before and after the action);
// - the copy-on-write engine gives exactly what the full-copy engine gives (`setCopyMode('full')`): the same state JSON
//   (keys in order) and the same events. This catches a write that missed the barrier and a stale read. The barrier's
//   check mode is on: a barrier called on an object the action does not own throws.
// The nested write path (`own(own(s, 'marks'), 'added')`) and the rng barrier are reached in every game.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAction, createGame, EngineBugError, own, setCopyMode, setCowChecks, setStateFreezing, type ApplyResult } from './index.ts';
import { CONTENT, COUNTER, randomAnswer, RULES, type Counter, type CounterState } from './fake/counter.ts';

const GAMES = 60;
const MAX_ACTIONS = 30_000;

const json = (r: ApplyResult<Counter>): string => JSON.stringify([r.state, r.events]);

/** Plays one game; returns the problems found (empty when copy on write behaves). */
function check(seed: string): string[] {
  let state: CounterState = createGame(COUNTER, { seed }, RULES, CONTENT).state;
  for (let n = 0; state.result === null && n < MAX_ACTIONS; n += 1) {
    const action = randomAnswer(state, seed);
    const before = JSON.stringify(state);
    const cow = applyAction(COUNTER, state, action, CONTENT);
    if (JSON.stringify(state) !== before) return [`${seed} action ${String(n)}: the input state changed`];
    setCopyMode('full');
    let full: ApplyResult<Counter>;
    try {
      full = applyAction(COUNTER, state, action, CONTENT);
    } finally {
      setCopyMode('cow');
    }
    if (json(cow) !== json(full)) return [`${seed} action ${String(n)}: copy on write differs from the full copy`];
    state = cow.state;
  }
  return state.result === null ? [`${seed}: no result after ${String(MAX_ACTIONS)} actions`] : [];
}

const seeds = (tag: string): string[] => Array.from({ length: GAMES }, (_, i) => `${tag}-${String(i)}`);

beforeAll(() => setCowChecks(true)); // `own` on a shared parent throws (cow.ts)

afterAll(() => {
  setCowChecks(false);
  setStateFreezing(true);
  setCopyMode('cow');
});

describe('copy on write', () => {
  it(`${String(GAMES)} games with freezing on: the input never changes, the same results as the full copy`, () => {
    setStateFreezing(true);
    expect(seeds('cow-frozen').flatMap(check).slice(0, 10)).toEqual([]);
  });

  it(`${String(GAMES)} games with freezing off: the input never changes, the same results as the full copy`, () => {
    setStateFreezing(false);
    try {
      expect(seeds('cow-open').flatMap(check).slice(0, 10)).toEqual([]);
    } finally {
      setStateFreezing(true);
    }
  });

  it('a write that misses the barrier throws with freezing on instead of changing the input', () => {
    setStateFreezing(true);
    const bad = { ...COUNTER, handlers: { ...COUNTER.handlers, chosen: (ctx: { s: CounterState }) => void (ctx.s.marks.added as number[]).push(1) } };
    const s = createGame(COUNTER, { seed: 'miss' }, RULES, CONTENT).state;
    const before = JSON.stringify(s);
    expect(() => applyAction(bad, s, randomAnswer(s, 'miss'), CONTENT)).toThrow(TypeError);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('with freezing off nothing stops the missed write: it changes the input, which the input check above catches; a barrier on a shared parent still throws in check mode', () => {
    setStateFreezing(false);
    try {
      const bad = { ...COUNTER, handlers: { ...COUNTER.handlers, chosen: (ctx: { s: CounterState }) => void (ctx.s.marks.added as number[]).push(1) } };
      const s = createGame(COUNTER, { seed: 'miss' }, RULES, CONTENT).state;
      const before = JSON.stringify(s);
      expect(() => applyAction(bad, s, randomAnswer(s, 'miss'), CONTENT)).not.toThrow();
      expect(JSON.stringify(s)).not.toBe(before);
      const shared = { ...COUNTER, handlers: { ...COUNTER.handlers, chosen: (ctx: { s: CounterState }) => void own(ctx.s.marks as { added: number[] }, 'added') } };
      const t = createGame(COUNTER, { seed: 'miss' }, RULES, CONTENT).state;
      expect(() => applyAction(shared, t, randomAnswer(t, 'miss'), CONTENT)).toThrow(EngineBugError);
    } finally {
      setStateFreezing(true);
    }
  });
});
