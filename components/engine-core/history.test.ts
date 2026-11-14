// For random games and random cursors, the state at a cursor is the replay of that prefix, and
// Safe undo never goes back past a revealing action. (Jarl ran this with fast-check; the kit has no fast-check, so the
// cases come from the seeded rng: 100 runs, fixed seed.)
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, hashState, isRevealing, newHistory, randomInt, replay, seedRng, stateAt, undo, type History } from './index';
import { CONTENT, COUNTER, playGame, type Counter } from './fake/counter';

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
});
