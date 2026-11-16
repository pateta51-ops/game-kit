import { describe, expect, it } from 'vitest';
import { IllegalActionError, newHistory, recordAction, undo, redo, stateAt, applyAction, createGame, createSave, freshWords, hashState, importSave, exportSave, replay, validateAction, type AnswerAction, type RngWords } from './index.ts';
import { CONTENT, COUNTER, RULES, playGame, type Counter } from './fake/counter.ts';

const W: RngWords = { a: 1, b: 2, c: 3, d: 4 };
const first = (seed: string) => {
  const s = createGame(COUNTER, { seed }, RULES, CONTENT).state;
  const p = s.prompt!;
  const a: AnswerAction = { kind: 'answer', promptId: p.id, picks: [p.options.find((o) => o.enabled)!.id] };
  return { s, a };
};

describe('reseed', () => {
  it('gives the same result whatever the seed', () => {
    const x = first('one');
    const y = first('two');
    const rx = applyAction(COUNTER, x.s, { ...x.a, reseed: W }, CONTENT).state;
    const ry = applyAction(COUNTER, y.s, { ...y.a, reseed: W }, CONTENT).state;
    expect(rx.rng).toEqual(ry.rng);
    expect(rx.counter).toBe(ry.counter);
  });
  it('applying the same recorded action twice gives the same state', () => {
    const x = first('one');
    const a = { ...x.a, reseed: W };
    expect(hashState(applyAction(COUNTER, x.s, a, CONTENT).state)).toBe(hashState(applyAction(COUNTER, x.s, a, CONTENT).state));
  });
  it('differs from no reseed, and an absent field is unchanged', () => {
    const x = first('one');
    const none = applyAction(COUNTER, x.s, x.a, CONTENT).state;
    const re = applyAction(COUNTER, x.s, { ...x.a, reseed: W }, CONTENT).state;
    expect(hashState(none)).not.toBe(hashState(re));
    expect(hashState(applyAction(COUNTER, x.s, { ...x.a }, CONTENT).state)).toBe(hashState(none));
  });
  it('a save with reseeded actions restores and replays exactly', () => {
    const o = { seed: 'save' };
    const g = playGame(o.seed);
    const actions = g.actions.map((a, i) => (i % 2 === 0 ? { ...a, reseed: { a: i + 1, b: 9, c: 8, d: 7 } } : a));
    const used = actions;
    const save = createSave(COUNTER, { options: o, rules: RULES, actions: used, undoUsed: false, savedAt: 't' }, CONTENT);
    const back = importSave(COUNTER, exportSave(save), CONTENT);
    expect(back.ok).toBe(true);
    const r = replay(COUNTER, o, RULES, used, CONTENT);
    if (back.ok) expect(hashState(back.state)).toBe(hashState(r.state));
  });
  it('refuses malformed words', () => {
    const x = first('one');
    for (const bad of [{ a: 1, b: 2, c: 3 }, { a: -1, b: 2, c: 3, d: 4 }, { a: 1.5, b: 2, c: 3, d: 4 }, { a: 2 ** 32, b: 2, c: 3, d: 4 }, { a: '1', b: 2, c: 3, d: 4 }, null]) {
      const v = validateAction<Counter>(x.s, { ...x.a, reseed: bad as unknown as RngWords });
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.error).toMatch(/^BAD_RESEED/);
    }
  });
  it('freshWords gives four 32-bit words', () => {
    const w = freshWords();
    for (const k of ['a', 'b', 'c', 'd'] as const) expect(Number.isInteger(w[k]) && w[k] >= 0 && w[k] < 2 ** 32).toBe(true);
    expect(freshWords()).not.toEqual(w);
  });
  it('an illegal answer with valid reseed is refused and leaves rng untouched', () => {
    const x = first('one');
    const bad = { kind: 'answer', promptId: x.s.prompt!.id, picks: ['nope'], reseed: W } as AnswerAction;
    expect(validateAction<Counter>(x.s, bad).ok).toBe(false);
    expect(() => applyAction(COUNTER, x.s, bad, CONTENT)).toThrow(IllegalActionError);
    expect(x.s.rng).not.toEqual(W);
  });
  it('undo then redo of a reseeded answer reproduces the same state', () => {
    const x = first('one');
    const a = { ...x.a, reseed: W };
    const o = { seed: 'one' };
    const h0 = newHistory<Counter>(o, RULES);
    const r1 = recordAction(COUNTER, h0, a, CONTENT);
    expect(r1.ok).toBe(true);
    const u = undo(COUNTER, r1.history, 'free', CONTENT);
    const r2 = redo(COUNTER, u.history, CONTENT);
    expect(r2.ok).toBe(true);
    expect(hashState(r2.state)).toBe(hashState(r1.state));
    expect(hashState(stateAt(COUNTER, r2.history, CONTENT))).toBe(hashState(r1.state));
    expect(hashState(replay(COUNTER, o, RULES, [a], CONTENT).state)).toBe(hashState(r1.state));
  });
});
