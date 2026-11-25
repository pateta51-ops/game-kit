import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReplay, type ReplayError } from './index.ts';
import { foldView } from '../paced-view/index.ts';
import { fromSave } from './save.ts';
import { createSave, createGame, applyAction } from '../engine-core/kernel.ts';
import { CONTENT, COUNTER, RULES, type Counter } from '../engine-core/fake/counter.ts';

const adapter = { start: () => ({ value: 0 }), apply: (s: { value: number }, n: number) => { if (n < 0) throw new Error('bad'); s.value += n; return { state: s, events: [n] }; }, view: (s: { value: number }) => s.value, boundary: (_a: { value: number }, b: { value: number }) => b.value % 3 === 0, isStep: () => true };
afterEach(() => vi.useRealTimers());
describe('visual replay', () => {
  it('rebuilds independent states, boundaries, annotations and paced events', () => {
    const live = { value: 0 }, actions = [1, 2, 3, 4];
    const p = createReplay({ ...adapter, start: () => live }, { actions, annotations: ['choice', 'reason'] }); actions[0] = 50;
    expect(p.get().view).toBe(0); p.next(); expect(p.get().annotation).toBe('choice');
    expect(p.get().steps.queue).toEqual([{ event: 1, index: 0 }]); p.advance(); expect(p.get().steps.queue).toEqual([]);
    p.nextBoundary(); expect(p.get().view).toBe(3); p.nextBoundary(); expect(p.get().view).toBe(6);
    p.previous(); expect(p.get().view).toBe(3); p.previousBoundary(); expect(p.get().view).toBe(0);
    p.seek(4); expect(p.get().view).toBe(10); expect(p.get().ended).toBe(true); expect(p.next()).toBe(false); expect(live.value).toBe(0);
  });
  it('reports a zero based failed action and rejects invalid recordings', () => {
    expect(() => createReplay(adapter, { actions: [1, -1] })).toThrow('Action 2 failed');
    try { createReplay(adapter, { actions: [1, -1] }); } catch (e) { expect((e as ReplayError).actionIndex).toBe(1); }
    expect(() => createReplay(adapter, { actions: null as unknown as number[] })).toThrow('Invalid recording');
  });
  it('plays, pauses, changes speed and stops at the end', () => {
    vi.useFakeTimers(); const p = createReplay({ ...adapter, isStep: () => false }, { actions: [1, 2, 3] }, 1000); const listener = vi.fn(); const off = p.subscribe(listener);
    expect(p.play()).toBe(true); vi.advanceTimersByTime(1000); expect(p.get().index).toBe(1);
    p.pause(); vi.advanceTimersByTime(3000); expect(p.get().index).toBe(1);
    p.setSpeed(2); p.play(); vi.advanceTimersByTime(1000); expect(p.get().index).toBe(3); expect(p.get().playing).toBe(false); expect(p.play()).toBe(false);
    off(); expect(listener).toHaveBeenCalled(); p.dispose();
  });
  it('waits for paced events before the next action', () => {
    vi.useFakeTimers(); const p = createReplay(adapter, { actions: [1, 2] }, 100); p.play(); vi.advanceTimersByTime(1000); expect(p.get().index).toBe(1); p.advance(); vi.advanceTimersByTime(100); expect(p.get().index).toBe(2); p.dispose();
  });
  it('restores real engine saves and rejects altered content, seal, and actions', () => {
    const options = { seed: 'test' }; const start = createGame(COUNTER, options, RULES, CONTENT).state;
    const action: Counter['action'] = { kind: 'answer', promptId: start.prompt!.id, picks: ['add'] };
    const end = applyAction(COUNTER, start, action, CONTENT).state;
    const save = createSave(COUNTER, { options, rules: RULES, actions: [action], undoUsed: false, savedAt: 'now' }, CONTENT);
    const p = fromSave(COUNTER, CONTENT, save, (s) => s.counter); p.next(); expect(p.get().state).toEqual(end); p.previous(); expect(p.get().state).toEqual(start);
    expect(() => fromSave(COUNTER, { cards: 1 }, save, (s) => s.counter)).toThrow();
    expect(() => fromSave(COUNTER, CONTENT, { ...save, finalHash: 'bad' }, (s) => s.counter)).toThrow();
    expect(() => fromSave(COUNTER, CONTENT, { ...save, actions: [{ ...action, picks: ['skip'] }] }, (s) => s.counter)).toThrow('Action 1');
    expect(() => fromSave(COUNTER, CONTENT, { ...save, version: 999 }, (s) => s.counter)).toThrow();
  });
});

describe('review regressions', () => {
  const options = { seed: 'test' };
  const make = () => {
    const start = createGame(COUNTER, options, RULES, CONTENT).state;
    const action: Counter['action'] = { kind: 'answer', promptId: start.prompt!.id, picks: ['add'] };
    const end = applyAction(COUNTER, start, action, CONTENT).state;
    const save = createSave(COUNTER, { options, rules: RULES, actions: [action], undoUsed: false, savedAt: 'now' }, CONTENT);
    return { action, end, save };
  };

  it('uses the saved engine even when presentation has extra adapter methods', () => {
    const { end, save } = make();
    const presentation = { start: () => { throw new Error('replacement'); }, isStep: () => true };
    const p = fromSave(COUNTER, CONTENT, save, (s) => s.counter, undefined, presentation);
    p.next();
    expect(p.get().state).toEqual(end);
    expect(p.get().steps.queue).toHaveLength(1);
  });

  it('rejects incompatible files before setup and reports only migrated action indexes', () => {
    const { action, save } = make();
    const blank = vi.fn((...args: Parameters<typeof COUNTER.blank>) => COUNTER.blank(...args));
    const game = { ...COUNTER, blank };
    const bad = { ...action, picks: ['skip'] };
    expect(() => fromSave(game, CONTENT, { ...save, version: 999, actions: [null] }, (s) => s.counter)).toThrow(/newer build/);
    expect(() => fromSave(game, { cards: 1 }, { ...save, actions: [bad] }, (s) => s.counter)).toThrow(/older build/);
    expect(blank).not.toHaveBeenCalled();
    const format = { version: 2, steps: { 1: (raw: object) => ({ ...raw, actions: [action, { ...bad, promptId: action.promptId + 1 }] }) } };
    expect(() => fromSave(game, CONTENT, { ...save, actions: [bad] }, (s) => s.counter, format)).toThrow(expect.objectContaining({ actionIndex: 1, message: expect.stringContaining('Action 2') as unknown }));
    expect(blank).toHaveBeenCalledTimes(1);
  });

  it('isolates reusable adapter outputs, presentation callbacks, and nested snapshots', () => {
    const shared = { nested: { n: 0 } }, event = { n: 0 };
    const first = { n: 1 }, second = { n: 2 };
    const p = createReplay({
      start: () => shared,
      apply: (s, a: { n: number }) => {
        shared.nested.n = s.nested.n + a.n;
        event.n = a.n;
        a.n = 99;
        return { state: shared, events: [event] };
      },
      view: (s) => s,
      boundary: (before, after, a) => {
        before.nested.n = after.nested.n = a.n = -1;
        return false;
      },
      isStep: (e) => { e.n = -1; return true; },
    }, { actions: [first, second], annotations: [{ note: { n: 1 } }] });
    expect(first.n).toBe(1);
    p.next();
    const snap = p.get();
    expect(snap.view.nested.n).toBe(1);
    expect(snap.steps.base?.nested.n).toBe(0);
    expect(snap.events[0]?.n).toBe(1);
    snap.steps.base!.nested.n = 99;
    snap.steps.queue[0]!.event.n = 99;
    snap.annotation!.note.n = 99;
    p.skip();
    p.next();
    expect(p.get().view.nested.n).toBe(3);
    p.seek(0);
    expect(p.get().view.nested.n).toBe(0);
    p.next();
    expect(p.get().steps.queue[0]?.event.n).toBe(1);
    expect(p.get().annotation?.note.n).toBe(1);
  });

  it('publishes one paused seek and cannot restart after disposal', () => {
    vi.useFakeTimers();
    const p = createReplay({ ...adapter, isStep: () => false }, { actions: [1, 2, 3] }, 100);
    const seen: number[] = [];
    p.subscribe(() => {
      const snap = p.get();
      if (!snap.playing) { seen.push(snap.index); p.play(); }
    });
    p.play(); p.seek(1);
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(500);
    expect(p.get().index).toBe(1);
    p.play(); p.dispose();
    expect(p.play()).toBe(false);
    vi.advanceTimersByTime(500);
    expect(p.get().index).toBe(1);
    expect(p.get().playing).toBe(false);
  });

  it('blocks manual next until events drain and distinguishes repeated events and stale completions', () => {
    const p = createReplay({
      ...adapter, view: (s) => [s.value],
      apply: (state, a) => ({ state, events: a === 1 ? [1, 2, 1] : [3] }),
      isStep: (e) => e !== 2,
    }, { actions: [1, 2] });
    p.next();
    const first = p.get().completeStep;
    expect(p.next()).toBe(false);
    first();
    expect(foldView(p.get().steps, p.get().view, (_base, events) => events.map((e) => e.event))).toEqual([1, 2, 1]);
    first();
    expect(p.get().steps.queue).toHaveLength(1);
    const old = p.get().completeStep;
    p.skip(); p.next();
    old();
    expect(p.get().steps.queue[0]?.event).toBe(3);
    expect(p.get().ended).toBe(true);
    p.seek(0); p.next();
    first();
    expect(p.get().steps.queue).toHaveLength(2);
  });

  it('reports invalid actions, outputs and presentation callbacks before playback', () => {
    const malformed = { ...adapter, apply: (state: { value: number }) => ({ state, events: null as unknown as number[] }) };
    expect(() => createReplay(malformed, { actions: [1] })).toThrow(expect.objectContaining({ actionIndex: 0 }));
    const broken = { ...adapter, isStep: () => { throw new Error('display failed'); } };
    expect(() => createReplay(broken, { actions: [1] })).toThrow(expect.objectContaining({ actionIndex: 0, message: expect.stringContaining('display failed') as unknown }));
    const notCloneable = { ...adapter, apply: (state: { value: number }, _a: unknown) => ({ state, events: [] }) };
    expect(() => createReplay(notCloneable, { actions: [1, () => 2] })).toThrow(expect.objectContaining({ actionIndex: 1 }));
    const p = createReplay(adapter, { actions: [1] });
    expect(() => p.setSpeed(Number.MIN_VALUE)).toThrow(RangeError);
    expect(p.get().speed).toBe(1);
  });
});

it('keeps hidden events out of the table projection and pacing', () => {
  const p = createReplay({
    ...adapter, start: () => ({ value: 0, secret: 'private' }),
    apply: (state) => ({ state, events: [{ secret: true }, { secret: false }] }),
    visibleEvent: (event) => !event.secret,
  }, { actions: [1] });
  p.next();
  const { state, view, events, steps } = p.get();
  expect(state.secret).toBe('private');
  expect(view).toBe(0);
  expect(events).toEqual([{ secret: false }]);
  expect(steps.events).toEqual([{ event: { secret: false }, index: 1 }]);
  expect(steps.queue).toEqual(steps.events);
});
