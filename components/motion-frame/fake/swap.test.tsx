import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs, putMotionSpeed, withViewTransition, type MotionSpec, type PlayerOptions } from '../index.ts';

const spec: MotionSpec = { id: 'swap', steps: [], swap: { dur: 100, stagger: 20, enter: 'from' } };
const events: unknown[] = [];
const animate = vi.fn<(this: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) => Pick<Animation, 'cancel'>>();

const draw = (after: boolean): void => {
  document.body.innerHTML = after
    ? '<div data-motion-key="move" data-x="40"></div><div data-motion-key="in" data-x="80" data-motion-from="#source"></div><div id="source" data-x="5"></div>'
    : '<div data-motion-key="move" data-x="10" data-width="10"></div><div data-motion-key="out" data-x="30"></div>';
};
const player = (overrides: Partial<PlayerOptions> = {}) => createMotionPlayer({
  specs: { swap: spec }, stages: {}, speed: () => 1, verbs: createVerbs(),
  context: undefined, frame: (f) => {
    const t = setTimeout(() => { f(0); }, 16);
    return () => { clearTimeout(t); };
  },
  onBeatStart: (run) => { events.push(run.data); },
  ...overrides,
});
beforeEach(() => {
  vi.useFakeTimers();
  events.length = 0;
  animate.mockReset().mockImplementation(() => ({ cancel: vi.fn() }));
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    events.push(`measure ${this.dataset.x}`);
    return new DOMRect(Number(this.dataset.x ?? 0), 0, Number(this.dataset.width ?? 20), 20);
  });
  draw(false);
});
afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  Reflect.deleteProperty(document, 'startViewTransition');
  document.body.replaceChildren();
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-motion');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('starts each event before measuring, commits before the redraw, and holds arrivals through landing', () => {
  const p = player();
  p.play('swap', { data: 'first', commit: () => {
    events.push('commit first');
    setTimeout(() => { draw(true); }, 5);
  } });
  p.play('swap', { data: 'second', commit: () => { events.push('commit second'); draw(false); } });
  expect(events).toEqual(['first', 'measure 10', 'measure 30', 'commit first']);
  vi.advanceTimersByTime(16);
  expect(events).toEqual(['first', 'measure 10', 'measure 30', 'commit first', 'measure 40', 'measure 80', 'measure 5']);
  expect(animate.mock.calls.map(([frames, options]) => [frames[0], options.delay])).toEqual([
    [{ transformOrigin: '0 0', transform: 'translate(-30px, 0px) scale(0.5, 1)' }, 0],
    [{ transformOrigin: '0 0', transform: 'translate(-75px, 0px) scale(1, 1)' }, 20],
    [{ opacity: 1, transform: 'scale(1)' }, 40],
  ]);
  const arrival = document.querySelector<HTMLElement>('[data-motion-key="in"]')!;
  expect(arrival.style.visibility).toBe('hidden');
  expect(arrival.hasAttribute('data-motion-landing')).toBe(true);
  vi.advanceTimersByTime(119);
  expect(arrival.style.visibility).toBe('hidden');
  vi.advanceTimersByTime(1);
  expect(arrival.style.visibility).toBe('');
  expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(1);
  expect(events).not.toContain('second');
  vi.advanceTimersByTime(20);
  expect(events.slice(-4)).toEqual(['second', 'measure 40', 'measure 80', 'commit second']);
  vi.runAllTimers();
  expect(p.pending()).toBe(0);
});

it.each(['skipAll', 'hurry'] as const)('cleans flights and snaps queued commits on %s', (skip) => {
  const p = player();
  const first = vi.fn(() => { draw(true); });
  const second = vi.fn();
  p.play('swap', { data: 1, commit: first });
  p.play('swap', { data: 2, commit: second });
  vi.advanceTimersByTime(16);
  expect(document.querySelectorAll('[data-motion-ghost]')).toHaveLength(2);
  p[skip]();
  expect(document.querySelectorAll('[data-motion-ghost], [data-motion-landing]')).toHaveLength(0);
  expect(second).toHaveBeenCalledOnce();
  expect(events.at(-1)).toBe(2);
  vi.runAllTimers();
  expect(first).toHaveBeenCalledOnce();
  expect(animate).toHaveBeenCalledTimes(3);
  expect(p.pending()).toBe(0);
});

it('commits at instant speed and after a bad selector, without leaving artifacts', () => {
  const commit = vi.fn();
  player({ speed: () => 'instant' }).play('swap', { data: 'instant', commit });
  expect(events).toEqual(['instant']);
  const problem = vi.fn();
  player({ onProblem: problem }).play({ ...spec, swap: { select: '[' } }, { commit });
  expect(commit).toHaveBeenCalledTimes(2);
  expect(problem).toHaveBeenCalledOnce();
  expect(animate).not.toHaveBeenCalled();
});

it('polls awaitRects after commit and cleans partially started flights on failure', () => {
  let ready = false;
  const problem = vi.fn();
  const p = player({ stages: { default: () => ready ? [0, 0, 1, 1] : undefined }, onProblem: problem });
  animate.mockImplementationOnce(() => ({ cancel: vi.fn() })).mockImplementationOnce(() => { throw new Error('flight failed'); });
  p.play({ ...spec, awaitRects: ['tray'] }, { commit: () => { draw(true); } });
  vi.advanceTimersByTime(16);
  expect(animate).not.toHaveBeenCalled();
  ready = true;
  vi.advanceTimersByTime(16);
  expect(problem).toHaveBeenCalledWith('flight failed');
  expect(document.querySelectorAll('[data-motion-ghost], [data-motion-landing]')).toHaveLength(0);
  expect(p.pending()).toBe(0);
});

it('commits before polling and advances the queue after a rect wait times out', () => {
  const commits: number[] = [];
  const problem = vi.fn();
  const p = player({ stages: { default: () => undefined }, onProblem: problem });
  p.play({ id: 'wait', steps: [], whenReady: true, awaitRects: ['tray'] }, { commit: () => { commits.push(1); } });
  p.play('swap', { commit: () => { commits.push(2); } });
  vi.advanceTimersByTime(59 * 16);
  expect(commits).toEqual([1]);
  expect(problem).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(problem).toHaveBeenCalledExactlyOnceWith('motion-frame wait: timed out waiting for tray');
  expect(commits).toEqual([1, 2]);
});

it('skips a committed swap before measuring the redraw', () => {
  const commits: number[] = [];
  const p = player();
  p.play('swap', { commit: () => { commits.push(1); draw(true); } });
  p.play('swap', { commit: () => { commits.push(2); } });
  p.skipAll();
  vi.runAllTimers();
  expect(commits).toEqual([1, 2]);
  expect(animate).not.toHaveBeenCalled();
});

it.each(['play', 'skipAll'] as const)('queues unknown beats with their data and commit (%s)', (path) => {
  const commits: number[] = [];
  const problem = vi.fn();
  const p = player({ onProblem: problem });
  p.play('swap', { data: 'first', commit: () => { commits.push(1); } });
  p.play('swap', { data: 'second', commit: () => { commits.push(2); } });
  p.play('missing', { data: 'missing', commit: () => { commits.push(3); } });
  expect(commits).toEqual([1]);
  if (path === 'skipAll') p.skipAll();
  vi.runAllTimers();
  expect(commits).toEqual([1, 2, 3]);
  expect(events.filter((event) => event === 'missing')).toEqual(['missing']);
  expect(problem).toHaveBeenCalledExactlyOnceWith('motion-frame: no spec named missing');
});

it.each([false, true])('hurries without overtaking a kept commit (playing: %s)', (playing) => {
  const commits: number[] = [];
  const kept = { ...spec, hurry: 'keep' as const };
  const later = { commit: () => { commits.push(2); } };
  const p = player({ onBeatStart: (run) => {
    if (playing && run.data === 'keep') {
      p.play('swap', later);
      p.hurry();
    }
  } });
  if (!playing) p.play('swap', { commit: () => { commits.push(0); } });
  p.play(kept, { data: 'keep', commit: () => { commits.push(1); } });
  if (!playing) {
    p.play('swap', later);
    p.hurry();
  }
  vi.runAllTimers();
  expect(commits).toEqual(playing ? [1, 2] : [0, 1, 2]);
});

it.each(['skipAll', 'hurry'] as const)('honors nested %s from an end callback', (skip) => {
  const commits: number[] = [];
  const ended = vi.fn();
  let nestedEnds = 0;
  const p = player();
  p.play('swap', { commit: () => { commits.push(1); }, onEnd: () => {
    p.play('swap', { onEnded: ended });
    p.play('swap', { commit: () => { commits.push(3); }, onEnded: ended });
    p[skip]();
    nestedEnds = ended.mock.calls.length;
  } });
  p.play('swap', { commit: () => { commits.push(2); } });
  p[skip]();
  vi.runAllTimers();
  expect(commits).toEqual([1, 2, 3]);
  expect(nestedEnds).toBe(1);
  expect(ended.mock.calls).toEqual([['skipped'], ['skipped']]);
});

it('keeps commits in order when a verb throws', () => {
  const commits: number[] = [];
  const problem = vi.fn();
  const verbs = createVerbs();
  verbs.register('broken', () => { throw new Error('failed'); });
  const p = player({ stages: { default: () => [0, 0, 1, 1] }, verbs, onProblem: problem });
  p.play({ id: 'broken', steps: [{ t: 0, dur: 10, actor: 'tray', do: 'broken' }] }, {
    commit: () => { commits.push(1); },
  });
  p.play('swap', { commit: () => { commits.push(2); } });
  vi.runAllTimers();
  expect(commits).toEqual([1, 2]);
  expect(problem).toHaveBeenCalledExactlyOnceWith('broken broken: failed');
});

it('uses the native update callback and respects instant and unsupported transitions', async () => {
  const start = vi.fn((update: () => void | Promise<void>) => {
    const done = Promise.resolve().then(update);
    return { finished: done, updateCallbackDone: done };
  });
  const apply = vi.fn();
  await withViewTransition(apply, 1);
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
  await withViewTransition(apply, 'instant');
  expect(start).not.toHaveBeenCalled();
  putMotionSpeed(0.5);
  expect(document.documentElement.style.getPropertyValue('--motion-view-transition-duration')).toBe('140ms');
  await withViewTransition(apply, 0.5);
  expect(apply).toHaveBeenCalledTimes(3);
  expect(start).toHaveBeenCalledOnce();
});
