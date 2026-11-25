import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReplay, type ReplayError } from './index.ts';
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
    expect(p.get().steps.queue).toEqual([1]); p.advance(); expect(p.get().steps.queue).toEqual([]);
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
