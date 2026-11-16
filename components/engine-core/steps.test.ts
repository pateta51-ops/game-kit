import { describe, expect, it } from 'vitest';
import { addStep, canUndoStep, createGame, extendStep, hashState, newSteps, redoStep, replay, replaySteps, undoStep, type AnswerAction, type StepHistory, type StepOptions } from './index.ts';
import { CONTENT, COUNTER, playGame, type Counter, type CounterState } from './fake/counter.ts';

const LONG = { target: 1000 };
const start = (o?: StepOptions): StepHistory<Counter> => newSteps<Counter>(createGame(COUNTER, { seed: 'steps' }, LONG, CONTENT).state, [], o);
const pick = (s: CounterState, id: string): AnswerAction => ({ kind: 'answer', promptId: s.prompt?.id ?? -1, picks: [id] });
const add = (h: StepHistory<Counter>, id = 'add'): StepHistory<Counter> => {
  const r = addStep(COUNTER, h, pick(h.state, id), CONTENT);
  expect(r.error).toBeNull();
  return r.history;
};
const join = (h: StepHistory<Counter>, id = 'add'): StepHistory<Counter> => {
  const r = extendStep(COUNTER, h, pick(h.state, id), CONTENT);
  expect(r.error).toBeNull();
  return r.history;
};

describe('undo by step', () => {
  it('one undo takes back the decision and the answers that joined it; redo plays them again', () => {
    const a = add(start());
    const b = join(join(add(a)));
    expect(b.steps.map((s) => [s.start, s.count])).toEqual([[0, 1], [1, 3]]);
    const u = undoStep(COUNTER, b, 'safe', CONTENT);
    expect(u.ok).toBe(true);
    expect(u.history.state).toBe(a.state);
    expect(u.history.actions).toEqual(a.actions);
    expect(u.history.redo).toEqual([b.actions.slice(1)]);
    expect(u.history.undoUsed).toBe(false);
    const r = redoStep(COUNTER, u.history, CONTENT);
    expect(hashState(r.history.state)).toBe(hashState(b.state));
    expect(r.history.steps.map((s) => [s.start, s.count])).toEqual([[0, 1], [1, 3]]);
    expect(r.history.redo).toEqual([]);
    expect(r.events).toHaveLength(3);
    expect(redoStep(COUNTER, r.history, CONTENT)).toMatchObject({ ok: false, error: 'Nothing to redo.' });
  });

  it('an answer that joins before any step moves the start of the game; nothing to undo there', () => {
    const h = join(start());
    expect(h.steps).toEqual([]);
    expect(h.baseCount).toBe(1);
    expect(h.base).toBe(h.state);
    expect(canUndoStep(h, 'free')).toEqual({ ok: false, reason: 'Nothing to undo.' });
    const u = undoStep(COUNTER, h, 'free', CONTENT);
    expect(u.ok).toBe(false);
    expect(u.history).toBe(h);
    const back = undoStep(COUNTER, add(h), 'safe', CONTENT).history;
    expect(back.state).toBe(h.state);
    expect(back.actions).toHaveLength(1);
  });

  it('Safe refuses a step in which a joined answer revealed something, with the game’s words; Free takes it back and marks the game', () => {
    const h = join(add(add(start())), 'draw');
    expect(canUndoStep(h, 'safe')).toEqual({ ok: false, reason: 'A card was drawn' });
    expect(undoStep(COUNTER, h, 'safe', CONTENT)).toMatchObject({ ok: false, history: h, error: 'A card was drawn' });
    expect(canUndoStep(h, 'free')).toEqual({ ok: true, peek: true });
    const u = undoStep(COUNTER, h, 'free', CONTENT).history;
    expect([u.undoUsed, u.peeked, u.actions.length]).toEqual([true, true, 1]);
    const v = undoStep(COUNTER, u, 'free', CONTENT).history;
    expect([v.undoUsed, v.peeked, v.actions.length]).toEqual([true, true, 0]);
    expect(undoStep(COUNTER, add(start()), 'free', CONTENT).history).toMatchObject({ undoUsed: true, peeked: false });
  });

  it('a new decision forgets the steps to redo; so does a joined answer', () => {
    const u = undoStep(COUNTER, add(add(start())), 'safe', CONTENT).history;
    expect(u.redo).toHaveLength(1);
    expect(add(u).redo).toEqual([]);
    expect(join(u).redo).toEqual([]);
  });

  const KEPT: [StepOptions, number[]][] = [
    [{ keep: 2, every: 3 }, [0, 3, 6, 7]],
    [{ keep: 2, every: 0 }, [6, 7]],
    [{ keep: 0, every: 0 }, []],
    [{}, [0, 1, 2, 3, 4, 5, 6, 7]],
  ];
  it.each(KEPT)('%j keeps the states before steps %j, and undo reaches every earlier state all the same', (o, kept) => {
    let h = start(o);
    const hashes = [hashState(h.state)];
    for (let i = 0; i < 8; i += 1) {
      h = join(add(h));
      hashes.push(hashState(h.state));
    }
    expect(h.steps.flatMap((s, i) => (s.before === null ? [] : [i]))).toEqual(kept);
    for (let i = 7; i >= 0; i -= 1) {
      h = undoStep(COUNTER, h, 'safe', CONTENT).history;
      expect(hashState(h.state)).toBe(hashes[i]);
    }
    for (let i = 1; i <= 8; i += 1) {
      h = redoStep(COUNTER, h, CONTENT).history;
      expect(hashState(h.state)).toBe(hashes[i]);
    }
    expect(h.steps.flatMap((s, i) => (s.before === null ? [] : [i]))).toEqual(kept);
  });

  it('after game over undo is refused, unless the game allows it', () => {
    const g = playGame('over');
    let h = newSteps<Counter>(createGame(COUNTER, { seed: 'over' }, { target: 12 }, CONTENT).state);
    for (const a of g.actions) h = addStep(COUNTER, h, a, CONTENT).history;
    expect(h.state.result).not.toBeNull();
    expect(canUndoStep(h, 'free')).toEqual({ ok: false, reason: 'The game is over: nothing can be undone.' });
    expect(undoStep(COUNTER, h, 'free', CONTENT).ok).toBe(false);
    const u = undoStep(COUNTER, h, 'free', CONTENT, { afterGameOver: true });
    expect(u.ok).toBe(true);
    expect(u.history.state.result).toBeNull();
    expect(hashState(redoStep(COUNTER, u.history, CONTENT).history.state)).toBe(hashState(g.state));
    expect(addStep(COUNTER, h, g.actions[0] as AnswerAction, CONTENT)).toMatchObject({ ok: false, history: h, events: [] });
  });

  it('an action the engine refuses changes nothing', () => {
    const h = add(start());
    for (const f of [addStep, extendStep]) {
      const r = f(COUNTER, h, pick(h.state, 'skip'), CONTENT);
      expect(r.ok).toBe(false);
      expect(r.history).toBe(h);
      expect(r.error).toContain('NOT_LEGAL');
    }
    const u = undoStep(COUNTER, add(h), 'safe', CONTENT).history;
    const broken = { ...u, redo: [[{ ...pick(u.state, 'add'), promptId: 999 }]] };
    expect(redoStep(COUNTER, broken, CONTENT)).toMatchObject({ ok: false, history: broken });
  });

  it('a history whose actions no longer replay refuses the undo that needs them', () => {
    let h = start({ keep: 0, every: 0 });
    for (let i = 0; i < 3; i += 1) h = add(h);
    const damaged = { ...h, actions: [{ ...(h.actions[0] as AnswerAction), promptId: 999 }, ...h.actions.slice(1)] };
    const u = undoStep(COUNTER, damaged, 'safe', CONTENT);
    expect(u.ok).toBe(false);
    expect(u.error).toContain('This history is damaged');
  });

  it('newSteps on a game already under way: undo never goes before it', () => {
    const g = add(add(start()));
    const h = add(newSteps<Counter>(g.state, g.actions));
    expect([h.baseCount, h.actions.length, h.steps[0]?.start]).toEqual([2, 3, 2]);
    const u = undoStep(COUNTER, h, 'safe', CONTENT).history;
    expect(u.state).toBe(g.state);
    expect(undoStep(COUNTER, u, 'safe', CONTENT).error).toBe('Nothing to undo.');
  });

  it('replaySteps rebuilds the same steps from where they started, or from a rule saying whose answer it was', () => {
    let h = join(start({ keep: 1, every: 2 }));
    for (let i = 0; i < 5; i += 1) h = join(add(h), i === 2 ? 'draw' : 'add');
    const strip = (x: StepHistory<Counter>): unknown => ({ ...x, state: hashState(x.state), base: hashState(x.base), steps: x.steps.map((s) => ({ ...s, before: s.before === null ? null : hashState(s.before) })) });
    const a = replaySteps(COUNTER, { seed: 'steps' }, LONG, h.actions, CONTENT, h.steps.map((s) => s.start), { keep: 1, every: 2 });
    expect(a.ok && strip(a.history)).toEqual(strip(h));
    const b = replaySteps(COUNTER, { seed: 'steps' }, LONG, h.actions, CONTENT, (_s, _a, i) => i % 2 === 1, { keep: 1, every: 2 });
    expect(b.ok && strip(b.history)).toEqual(strip(h));
    expect(a.ok && hashState(a.history.state)).toBe(replay(COUNTER, { seed: 'steps' }, LONG, h.actions, CONTENT).hash);
    expect(a.ok && canUndoStep(undoStep(COUNTER, undoStep(COUNTER, a.history, 'safe', CONTENT).history, 'safe', CONTENT).history, 'safe')).toEqual({ ok: false, reason: 'A card was drawn' });
  });

  it('replaySteps: no actions give an empty history; a refused action says where; options that start no game say why', () => {
    const none = replaySteps(COUNTER, { seed: 'steps' }, LONG, [], CONTENT, []);
    expect(none.ok && [none.history.steps, none.history.actions, none.history.baseCount]).toEqual([[], [], 0]);
    const h = add(add(start()));
    const bad = [h.actions[0] as AnswerAction, { ...(h.actions[1] as AnswerAction), picks: ['nope'] }];
    expect(replaySteps(COUNTER, { seed: 'steps' }, LONG, bad, CONTENT, [0, 1])).toMatchObject({ ok: false, failedAt: 1 });
    const broken = { ...COUNTER, blank: () => { throw new Error('no game'); } };
    expect(replaySteps(broken, { seed: 'steps' }, LONG, [], CONTENT, [])).toMatchObject({ ok: false, failedAt: null });
  });
});
