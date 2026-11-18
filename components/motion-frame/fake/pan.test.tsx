import { afterEach, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs, scrollPan, type PanFactory, type PlayerOptions, type Speed } from '../index.ts';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function fixture(speed: Speed = 1, rejected = false, options: Partial<PlayerOptions> = {}) {
  vi.useFakeTimers();
  const order: string[] = [];
  const ensure = vi.fn(async (target: unknown) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push(String(target));
    if (rejected) throw new Error('cannot pan');
  });
  const back = vi.fn(() => {
    order.push('back');
    return Promise.resolve();
  });
  const pan = vi.fn<PanFactory>(() => ({ ensure, back }));
  const player = createMotionPlayer({
    specs: {}, stages: { default: () => [0, 0, 20, 20] }, verbs: createVerbs(),
    context: undefined, speed: () => speed, pan,
    onBeatStart: (run) => { order.push(run.timeline.id); },
    onProblem: (problem) => { order.push(problem); },
    ...options,
  });
  const beats = ['first', 'second'].map((id) => ({
    id, pan: '#' + id, steps: [{ t: 0, dur: 30, actor: 'actor', do: 'show' }],
  }));
  return { player, order, pan, ensure, back, beats };
}

it('pans before the beat and its commit, with one return after the queue drains', async () => {
  const { player, beats, order, pan } = fixture();
  for (const beat of beats) player.play(beat, { commit: () => { order.push('commit ' + beat.id); } });
  expect(order).toEqual([]);
  await vi.runAllTimersAsync();
  expect(order).toEqual(['#first', 'first', 'commit first', '#second', 'second', 'commit second', 'back']);
  expect(pan).toHaveBeenCalledTimes(1);
});

it.each(['pointerdown', 'wheel', 'keydown'])('abandons the whole run on %s', async (event) => {
  const { player, beats, order, ensure, back } = fixture();
  player.playRun(beats);
  window.dispatchEvent(new Event(event));
  await vi.runAllTimersAsync();
  expect(order).toContain('second');
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(back).not.toHaveBeenCalled();
  player.playRun(beats);
  await vi.runAllTimersAsync();
  expect(back).toHaveBeenCalledTimes(1);
});

it('does not open a pan session at instant speed', () => {
  const { player, beats, pan } = fixture('instant');
  player.playRun(beats);
  expect(pan).not.toHaveBeenCalled();
});

it('snaps a pending pan when skipped', async () => {
  const { player, beats, order, back, pan } = fixture();
  player.playRun(beats);
  player.skipAll();
  expect(pan.mock.calls[0]?.[1].aborted).toBe(true);
  await vi.runAllTimersAsync();
  expect(player.pending()).toBe(0);
  expect(order).not.toContain('first');
  expect(back).not.toHaveBeenCalled();
});

const never = (): Promise<void> => new Promise(() => {});

it('hurries a pending ensure and keeps the next commit in order', async () => {
  const { player, beats, order, ensure, back, pan } = fixture();
  ensure.mockImplementationOnce(never);
  player.play({ ...beats[0]!, hurry: 'keep' }, { commit: () => { order.push('commit first'); } });
  player.play(beats[1]!, { commit: () => { order.push('commit second'); } });
  player.hurry();
  expect(pan.mock.calls[0]?.[1].aborted).toBe(true);
  await vi.runAllTimersAsync();
  expect(order).toEqual(['first', 'commit first', 'second', 'commit second']);
  expect(back).not.toHaveBeenCalled();
  expect(player.pending()).toBe(0);
});

it('times out a stuck ensure and drains the queue', async () => {
  const { player, beats, order, ensure, back, pan } = fixture(1, false, { panTimeoutMs: 50 });
  ensure.mockImplementationOnce(never);
  player.playRun(beats);
  await vi.advanceTimersByTimeAsync(49);
  expect(order).toEqual([]);
  await vi.runAllTimersAsync();
  expect(order).toEqual(['pan: timed out after 50 ms', 'first', 'second']);
  expect(pan.mock.calls[0]?.[1].aborted).toBe(true);
  expect(back).not.toHaveBeenCalled();
  expect(player.pending()).toBe(0);
});

it.each(['hurry', 'skipAll', 'timeout'] as const)('releases a stuck return by %s', async (action) => {
  const { player, beats, back, order, pan } = fixture(1, false, { panTimeoutMs: 100 });
  back.mockImplementationOnce(never);
  player.play(beats[0]!);
  await vi.advanceTimersByTimeAsync(50);
  expect(back).toHaveBeenCalledTimes(1);
  expect(player.pending()).toBe(1);
  expect(player.busy()).toBe(true);
  if (action !== 'timeout') player[action]();
  player.play({ id: 'next', steps: [] });
  await vi.runAllTimersAsync();
  expect(pan.mock.calls[0]?.[1].aborted).toBe(true);
  expect(order.at(-1)).toBe('next');
  expect(player.pending()).toBe(0);
  expect(player.busy()).toBe(false);
});

it('waits for rects after panning', async () => {
  const frames: FrameRequestCallback[] = [];
  const { player, beats, order } = fixture(1, false, { frame: (callback) => { frames.push(callback); } });
  player.play({ ...beats[0]!, whenReady: true });
  expect(frames).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(20);
  expect(order).toEqual(['#first']);
  frames.shift()?.(20);
  await vi.runAllTimersAsync();
  expect(order).toEqual(['#first', 'first', 'back']);
});

it('keeps the session through a press hold and the next beat', async () => {
  const { player, beats, back, pan, order } = fixture();
  player.play({ ...beats[0]!, holdUntil: 'press' });
  await vi.runAllTimersAsync();
  expect(player.held()).toBe(true);
  expect(back).not.toHaveBeenCalled();
  player.play(beats[1]!);
  player.release();
  await vi.runAllTimersAsync();
  expect(pan).toHaveBeenCalledTimes(1);
  expect(order).toEqual(['#first', 'first', '#second', 'second', 'back']);
});

it.each(['hurry', 'skipAll'] as const)('commits a panned beat once and in order when it re-enters %s', async (action) => {
  const order: string[] = [];
  const { player, beats } = fixture(1, false, { onBeatStart: (run) => {
    if (run.timeline.id === 'first') player.hurry();
  } });
  player.play({ ...beats[0]!, hurry: 'keep' }, { commit: () => {
    order.push('first began');
    player[action]();
    order.push('first committed');
  } });
  player.play(beats[1]!, { commit: () => { order.push('second committed'); } });
  await vi.runAllTimersAsync();
  expect(order).toEqual(['first began', 'first committed', 'second committed']);
  expect(player.pending()).toBe(0);
});

it('reports an ensure error and still returns', async () => {
  const { player, beats, order } = fixture(1, true);
  player.playRun(beats);
  await vi.runAllTimersAsync();
  expect(order).toEqual(['#first', 'pan: cannot pan', 'first', '#second', 'pan: cannot pan', 'second', 'back']);
});

it('follows the tab button and restores its starting scroll', async () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<button id="home"></button><button id="away"></button><main><div id="actor"></div></main>';
  const main = document.querySelector('main')!;
  const home = document.querySelector('button')!;
  const away = document.querySelector<HTMLElement>('#away')!;
  let active = home as HTMLElement;
  home.onclick = () => { active = home; main.scrollTop = 0; };
  away.onclick = () => { active = away; main.scrollTop = 0; };
  main.scrollTop = 30;
  main.getBoundingClientRect = () => new DOMRect(0, 0, 200, 200);
  document.querySelector('#actor')!.getBoundingClientRect = () => new DOMRect(0, 560, 40, 80);
  const controller = new AbortController();
  const pan = scrollPan({ scroller: () => main, tabs: () => away, activeTab: () => active })(1, controller.signal)!;
  const going = pan.ensure('#actor');
  await vi.runAllTimersAsync();
  await going;
  expect(active).toBe(away);
  expect(main.scrollTop).toBe(500);
  const returning = pan.back();
  await vi.runAllTimersAsync();
  await returning;
  expect(active).toBe(home);
  expect(main.scrollTop).toBe(30);
});
