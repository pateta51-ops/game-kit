import { afterEach, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs, type MotionSpec } from './index.ts';

afterEach(() => vi.useRealTimers());
const spec: MotionSpec = { id: 'actors', steps: [
  { actor: 'a', do: 'missing', t: 0, dur: 10 },
  { actor: 'a', do: 'probe', t: 20, dur: 20 },
  { actor: 'a', do: 'probe', t: 50, dur: 20 },
  { actor: 'b', do: 'probe', t: 80, dur: 20 },
] };

it('K329 announces only the first actual registered verb of each actor, before dispatch', () => {
  vi.useFakeTimers();
  const events: string[] = [], verbs = createVerbs();
  verbs.register('probe', call => { events.push(`verb:${call.actor}`); return undefined; });
  const player = createMotionPlayer({
    specs: {}, stages: { default: () => [0, 0, 1, 1] }, verbs, speed: () => 1, context: undefined,
    onBeatStart: run => {
      run.onActorStart?.(actor => { events.push(`start:${actor}`); });
      const off = run.onActorStart?.(() => { events.push('unsubscribed'); });
      off?.();
    },
  });
  player.play(spec);
  vi.advanceTimersByTime(10);
  expect(events).toEqual([]);
  vi.runAllTimers();
  expect(events).toEqual(['start:a', 'verb:a', 'verb:a', 'start:b', 'verb:b']);
});

it('K329 gives snapped runs a dispatch subscription without reporting a start', () => {
  const starts: string[] = [], verbs = createVerbs();
  const commits: string[] = [];
  const player = createMotionPlayer({
    specs: {}, stages: { default: () => [0, 0, 1, 1] }, verbs, speed: () => 'instant', context: undefined,
    onBeatStart: run => {
      expect(typeof run.onActorStart).toBe('function');
      run.onActorStart?.(actor => starts.push(actor));
    },
  });
  player.play(spec, { commit: () => commits.push('commit') });
  expect(commits).toEqual(['commit']);
  expect(starts).toEqual([]);
});

it('K329 reports a malformed handler without consuming the later valid actor start', () => {
  vi.useFakeTimers();
  const events: string[] = [], problems: string[] = [], verbs = createVerbs();
  verbs.register('bad', {} as never); // a JavaScript caller can bypass the registry's type
  verbs.register('probe', call => { events.push(`verb:${call.actor}`); return undefined; });
  const player = createMotionPlayer({
    specs: {}, stages: { default: () => [0, 0, 1, 1] }, verbs, speed: () => 1, context: undefined,
    onProblem: message => problems.push(message),
    onBeatStart: run => { run.onActorStart?.(actor => { events.push(`start:${actor}`); }); },
  });
  player.play({ id: 'invalid', steps: [
    { actor: 'a', do: 'bad', t: 0, dur: 10 },
    { actor: 'a', do: 'probe', t: 20, dur: 20 },
  ] });
  vi.advanceTimersByTime(10);
  expect(events).toEqual([]);
  expect(problems).toHaveLength(1);
  expect(problems[0]).toMatch(/^invalid bad: .*not a function/);
  vi.runAllTimers();
  expect(events).toEqual(['start:a', 'verb:a']);
});

it('K329 isolates observer errors and honors unsubscribe and a skip during notification', () => {
  vi.useFakeTimers();
  const events: string[] = [], problems: string[] = [], verbs = createVerbs();
  verbs.register('probe', () => { events.push('verb'); return undefined; });
  const player = createMotionPlayer({
    specs: {}, stages: { default: () => [0, 0, 1, 1] }, verbs, speed: () => 1, context: undefined,
    onProblem: message => problems.push(message),
    onBeatStart: run => {
      run.onActorStart?.(() => { events.push('throws'); throw new Error('observer failed'); });
      run.onActorStart?.(() => off?.());
      const off = run.onActorStart?.(() => { events.push('unsubscribed'); });
      run.onActorStart?.(() => { events.push('skips'); player.skipAll(); });
      run.onActorStart?.(() => { events.push('after skip'); });
    },
  });
  player.play(spec);
  vi.runAllTimers();
  expect(events).toEqual(['throws', 'skips']);
  expect(problems).toEqual(['actors actor a: observer failed']);
  expect(player.pending()).toBe(0);
});
