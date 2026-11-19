import { describe, expect, it } from 'vitest';
import {
  addPortStep,
  addStep,
  canUndoPortStep,
  canUndoStep,
  createGame,
  extendPortStep,
  extendStep,
  hashState,
  kernelPort,
  newPortSteps,
  newSteps,
  portSettle,
  redoPortStep,
  redoStep,
  replayPortSteps,
  undoPortStep,
  undoStep,
  type AnswerAction,
  type PortStepHistory,
  type PortStepOptions,
  type StepHistory,
} from './index.ts';
import { CONTENT, COUNTER, playGame, type Counter, type CounterState } from './fake/counter.ts';

// K404: undo by step over an engine port gives what the GameRules step undo gives
const LONG = { target: 1000 };
const PORT = kernelPort(COUNTER, CONTENT, { gameRules: LONG });
const pick = (s: CounterState, id: string): AnswerAction => ({ kind: 'answer', promptId: s.prompt?.id ?? -1, picks: [id] });
const kStart = (): StepHistory<Counter> => newSteps<Counter>(createGame(COUNTER, { seed: 'steps' }, LONG, CONTENT).state);
const pStart = (o: PortStepOptions<Counter> = {}): PortStepHistory<Counter> => newPortSteps<Counter>(portSettle(PORT, PORT.start('steps')).state, [], o);
const bounds = (h: { readonly steps: readonly { readonly start: number; readonly count: number }[] }): number[][] => h.steps.map((s) => [s.start, s.count]);

describe('K404 undo by step over an engine port', () => {
  it('add, extend, undo and redo give the same states and step boundaries as the GameRules step undo', () => {
    let k = kStart();
    let p = pStart();
    for (const [f, id] of [['add', 'add'], ['join', 'add'], ['add', 'add'], ['join', 'draw'], ['join', 'add'], ['add', 'add']] as const) {
      k = (f === 'add' ? addStep : extendStep)(COUNTER, k, pick(k.state, id), CONTENT).history;
      const r = (f === 'add' ? addPortStep : extendPortStep)(PORT, p, pick(p.state, id));
      expect(r.error).toBeNull();
      p = r.history;
      expect(hashState(p.state)).toBe(hashState(k.state));
      expect(canUndoPortStep(PORT, p, 'safe')).toEqual(canUndoStep(k, 'safe'));
    }
    expect(p.steps.map((s) => s.reason)).toEqual(k.steps.map((s) => s.reason));
    expect(bounds(p)).toEqual(bounds(k));
    expect(p.answers).toEqual(k.actions);
    for (let i = 0; i < 3; i += 1) {
      k = undoStep(COUNTER, k, 'free', CONTENT).history;
      const u = undoPortStep(PORT, p, 'free');
      expect(u.ok).toBe(true);
      p = u.history;
      expect([hashState(p.state), bounds(p), p.redo, p.peeked, canUndoPortStep(PORT, p, 'safe')]).toEqual([hashState(k.state), bounds(k), k.redo, k.peeked, canUndoStep(k, 'safe')]);
    }
    for (let i = 0; i < 3; i += 1) {
      k = redoStep(COUNTER, k, CONTENT).history;
      p = redoPortStep(PORT, p).history;
      expect([hashState(p.state), bounds(p), p.redo]).toEqual([hashState(k.state), bounds(k), k.redo]);
    }
    expect(redoPortStep(PORT, p)).toMatchObject({ ok: false, error: 'Nothing to redo.' });
  });

  it('Safe mode refuses what the GameRules path refuses: a reveal, and with randomWords a step that moved the rng', () => {
    const game = { ...COUNTER, randomWords: 'Dice were rolled' };
    const port = kernelPort(game, CONTENT, { gameRules: LONG });
    let k = newSteps<Counter>(createGame(game, { seed: 'steps' }, LONG, CONTENT).state);
    let p = newPortSteps<Counter>(portSettle(port, port.start('steps')).state);
    const seen: unknown[] = [];
    for (const id of ['add', 'draw', 'add']) {
      k = addStep(game, k, pick(k.state, id), CONTENT).history;
      p = addPortStep(port, p, pick(p.state, id)).history;
      expect(canUndoPortStep(port, p, 'safe')).toEqual(canUndoStep(k, 'safe'));
      seen.push(canUndoPortStep(port, p, 'safe'));
    }
    expect(seen).toEqual([{ ok: false, reason: 'Dice were rolled' }, { ok: false, reason: 'A card was drawn' }, { ok: false, reason: 'Dice were rolled' }]);
    expect(undoPortStep(port, p, 'safe')).toMatchObject({ ok: false, history: p, error: 'Dice were rolled' });
    const bare = kernelPort({ ...COUNTER, revealWords: () => undefined }, CONTENT, { gameRules: LONG });
    const r = addPortStep(bare, pStart(), pick(pStart().state, 'draw')).history;
    expect(canUndoPortStep(bare, r, 'safe')).toEqual({ ok: false, reason: 'Something hidden was revealed' });
  });

  it('with isDecision skipping some prompts, their answers fold into the step; undo lands on a decision point', () => {
    const isDecision = (s: CounterState): boolean => s.turn % 2 === 1;
    let p = pStart({ isDecision });
    const states = [p.state];
    for (let i = 0; i < 6; i += 1) {
      p = addPortStep(PORT, p, pick(p.state, 'add')).history;
      states.push(p.state);
    }
    expect(bounds(p)).toEqual([[0, 2], [2, 2], [4, 2]]);
    p = undoPortStep(PORT, p, 'safe').history;
    expect(p.state).toBe(states[4]);
    p = undoPortStep(PORT, p, 'safe').history;
    expect(hashState(p.state)).toBe(hashState(states[2] as CounterState));
    expect(isDecision(p.state)).toBe(true);
    const r = replayPortSteps(PORT, 'steps', redoPortStep(PORT, p).history.answers, { isDecision });
    expect(r.ok && bounds(r.history)).toEqual([[0, 2], [2, 2]]);
  });

  it('after game over undo is refused unless allowed; a new answer clears redo; an empty history has nothing to undo', () => {
    const port = kernelPort(COUNTER, CONTENT, { gameRules: { target: 12 } });
    const g = playGame('over');
    let p = newPortSteps<Counter>(portSettle(port, port.start('over')).state);
    let k = newSteps<Counter>(createGame(COUNTER, { seed: 'over' }, { target: 12 }, CONTENT).state);
    for (const a of g.actions) {
      p = addPortStep(port, p, a).history;
      k = addStep(COUNTER, k, a, CONTENT).history;
    }
    expect(canUndoPortStep(port, p, 'free')).toEqual(canUndoStep(k, 'free'));
    expect(undoPortStep(port, p, 'free').ok).toBe(false);
    const u = undoPortStep(port, p, 'free', { afterGameOver: true });
    expect(u.ok).toBe(true);
    expect(hashState(u.history.state)).toBe(hashState(undoStep(COUNTER, k, 'free', CONTENT, { afterGameOver: true }).history.state));
    expect(hashState(redoPortStep(port, u.history).history.state)).toBe(hashState(g.state));
    expect(addPortStep(port, p, g.actions[0] as AnswerAction)).toMatchObject({ ok: false, history: p, events: [] });

    const s0 = pStart();
    const two = addPortStep(PORT, addPortStep(PORT, s0, pick(s0.state, 'add')).history, pick(s0.state, 'add'));
    expect(two.ok).toBe(false);
    const a1 = addPortStep(PORT, s0, pick(s0.state, 'add')).history;
    const q = undoPortStep(PORT, addPortStep(PORT, a1, pick(a1.state, 'add')).history, 'safe').history;
    expect(q.redo).toHaveLength(1);
    expect(addPortStep(PORT, q, pick(q.state, 'add')).history.redo).toEqual([]);
    expect(extendPortStep(PORT, q, pick(q.state, 'add')).history.redo).toEqual([]);

    expect(canUndoPortStep(PORT, s0, 'free')).toEqual(canUndoStep(kStart(), 'free'));
    expect(undoPortStep(PORT, s0, 'free')).toMatchObject({ ok: false, history: s0, error: 'Nothing to undo.' });
    const none = replayPortSteps(PORT, 'steps', []);
    expect(none.ok && [none.history.steps, none.history.answers]).toEqual([[], []]);
  });

  it('a reason option overrides the default; replay by starts rebuilds the same steps', () => {
    const reason = (_s: CounterState, _a: CounterState, events: readonly Counter['event'][]): string | null => (events.some((x) => x.type === 'drawn') ? 'Drawn' : null);
    let p = pStart({ reason });
    p = addPortStep(PORT, p, pick(p.state, 'add')).history;
    p = addPortStep(PORT, p, pick(p.state, 'add')).history;
    p = extendPortStep(PORT, p, pick(p.state, 'draw')).history;
    expect(canUndoPortStep(PORT, p, 'safe')).toEqual({ ok: false, reason: 'Drawn' });
    const u = undoPortStep(PORT, p, 'free').history;
    expect([u.undoUsed, u.peeked, u.answers.length]).toEqual([true, true, 1]);
    const r = replayPortSteps(PORT, 'steps', p.answers, { starts: p.steps.map((s) => s.start), reason });
    expect(r.ok && [bounds(r.history), hashState(r.history.state), r.history.steps[1]?.reason]).toEqual([bounds(p), hashState(p.state), 'Drawn']);
    expect(replayPortSteps(PORT, 'steps', [{ ...(p.answers[0] as AnswerAction), picks: ['nope'] }])).toMatchObject({ ok: false, failedAt: 0 });
  });
});
