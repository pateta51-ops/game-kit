// For random games and random cursors, the state at a cursor is the replay of that prefix, and
// Safe undo never goes back past a revealing action. (Jarl ran this with fast-check; the kit has no fast-check, so the
// cases come from the seeded rng: 100 runs, fixed seed.)
import { describe, expect, it } from 'vitest';
import { appendAction, recordAction, applyAction, createGame, hashState, isRevealing, newHistory, randomInt, replay, seedRng, stateAt, undo, type History } from './index.ts';
import { CONTENT, COUNTER, playGame, type Counter } from './fake/counter.ts';

const content = CONTENT;

describe('history', () => {
  it('stateAt(h, c) equals the replay of the first c actions, and Safe undo stops at the last reveal', () => {
    const w = seedRng('20261109');
    for (let run = 0; run < 100; run += 1) {
      const n = randomInt(w, 100_000);
      const long = randomInt(w, 2) === 1;
      const frac = randomInt(w, 1001) / 1000;
      const rules = { target: long ? 30 : 12 };
      const options = { seed: `h${String(n)}` };
      const g = playGame(options.seed, rules);
      const c = Math.floor(frac * g.actions.length);
      const h: History<Counter> = { ...newHistory<Counter>(options, rules), actions: g.actions, cursor: c };
      const expected = replay(COUNTER, options, rules, g.actions.slice(0, c), content);
      expect(hashState(stateAt(COUNTER, h, content))).toBe(expected.hash);
      // the cursor just after the last revealing action among the first c
      let s = createGame(COUNTER, options, rules, content).state;
      let boundary = 0;
      for (let at = 0; at < c; at += 1) {
        const r = applyAction(COUNTER, s, g.actions[at] as never, content);
        s = r.state;
        if (isRevealing(r.events)) boundary = at + 1;
      }
      let cur = h;
      for (let guard = 0; guard < 10_000; guard += 1) {
        const r = undo(COUNTER, cur, 'safe', content);
        if (!r.ok) break;
        cur = r.history;
        expect(cur.cursor).toBeGreaterThanOrEqual(boundary);
      }
      // a finished game cannot be undone at all; otherwise Safe undo stops exactly at the last reveal
      expect(cur.cursor).toBe(s.result !== null ? c : boundary);
      expect(cur.undoUsed).toBe(false);
    }
  });

  it('appendAction gives the same history and state as recordAction, plus the events', () => {
    const g = playGame('inc1', { target: 12 });
    let inc = newHistory<Counter>({ seed: 'inc1' }, { target: 12 });
    let reb = inc;
    let state = createGame(COUNTER, inc.options, inc.rules, content).state;
    for (const a of g.actions) {
      const x = appendAction(COUNTER, inc, state, a, content);
      const y = recordAction(COUNTER, reb, a, content);
      expect(x.ok).toBe(true);
      expect(x.events).toEqual(applyAction(COUNTER, state, a, content).events);
      inc = x.history;
      reb = y.history;
      state = x.state as typeof state;
      expect(hashState(state)).toBe(hashState(y.state));
    }
    expect(inc).toEqual(reb);
    // precondition: the game is over, so any further action is refused
    expect(state.result).not.toBeNull();
    expect(appendAction(COUNTER, inc, state, g.actions[0] as never, content).ok).toBe(false);
    expect(appendAction(COUNTER, { ...inc, cursor: -1 }, state, g.actions[0] as never, content).ok).toBe(false);
  });

  it('undo then appendAction drops the redo tail, same as recordAction', () => {
    const g = playGame('inc2', { target: 12 });
    let h = newHistory<Counter>({ seed: 'inc2' }, { target: 12 });
    for (const a of g.actions.slice(0, 5)) h = recordAction(COUNTER, h, a, content).history;
    const u = undo(COUNTER, h, 'free', content);
    expect(u.ok).toBe(true);
    const a = g.actions[4] as never;
    const x = appendAction(COUNTER, u.history, u.state as never, a, content);
    const y = recordAction(COUNTER, u.history, a, content);
    expect(x.ok).toBe(true);
    expect(x.history.actions).toEqual(y.history.actions);
    expect(x.history.cursor).toBe(y.history.cursor);
    expect(x.history.actions.length).toBe(5);
  });
});
