// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs, withReducedMotion, type MotionSpec, type Step } from '../motion-frame/index.ts';
import { registerEffects, type EffectCtx } from './index.ts';

const cancel = vi.fn();
const animate = vi.fn<HTMLElement['animate']>().mockReturnValue({ cancel } as unknown as Animation);
const stage = () => undefined;

function play(steps: Step[], speed: number | 'instant' = 1) {
  vi.useFakeTimers();
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  const verbs = createVerbs<EffectCtx>();
  const context = registerEffects(verbs);
  const spec: MotionSpec = { id: 'rotation', actors: [{ id: 'a', at: [0, 0], w: 20, h: 30 }], steps };
  const player = createMotionPlayer({ specs: {}, stages: { default: stage }, verbs, speed: () => speed, context });
  player.play(spec);
  vi.advanceTimersByTime(1);
  return { player, actor: context.el.querySelector<HTMLElement>('.fx-actor')! };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  document.body.replaceChildren();
});

it.each([false, true])('spins through whole turns and restores the starting pose (skip=%s)', (skip) => {
  const { player, actor } = play([{ do: 'spin', actor: 'a', t: 0, dur: 300, turns: 2, direction: -1, pivot: '25% 80%' }]);
  expect(animate).toHaveBeenCalledWith([
    { rotate: '0deg', transformOrigin: '25% 80%' }, { rotate: '-720deg', transformOrigin: '25% 80%' },
  ], expect.objectContaining({ duration: 300, easing: 'linear' }));
  if (skip) player.skipAll();
  else vi.advanceTimersByTime(300);
  expect(actor.style.rotate).toBe('');
  expect(actor.style.transformOrigin).toBe('');
  expect(cancel).toHaveBeenCalledOnce();
});

it('holds a fractional spin at its pivot and accepts a custom easing', () => {
  const { player, actor } = play([{ do: 'spin', actor: 'a', t: 0, dur: 300, turns: 0.25, ease: 'out', pivot: 'bottom' }]);
  expect(animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ easing: 'ease-out' }));
  player.skipAll();
  expect(actor.style.rotate).toBe('90deg');
  expect(actor.style.transformOrigin).toBe('bottom');
});

it.each([false, true])('taps to the signed angle and holds the pose (skip=%s)', (skip) => {
  const { player, actor } = play([{ do: 'tap', actor: 'a', t: 0, dur: 300, direction: -1 }]);
  expect(animate).toHaveBeenCalledWith([
    { rotate: '0deg', transformOrigin: 'center' }, { rotate: '-90deg', transformOrigin: 'center' },
  ], expect.objectContaining({ easing: 'ease-in-out' }));
  if (skip) player.skipAll();
  else vi.advanceTimersByTime(300);
  expect(actor.style.rotate).toBe('-90deg');
  expect(actor.style.transformOrigin).toBe('center');
  expect(cancel).toHaveBeenCalledOnce();
});

it.each([false, true])('untaps from the held pose to zero (skip=%s)', (skip) => {
  const { player, actor } = play([
    { do: 'tap', actor: 'a', t: 0, dur: 300, angle: 60, pivot: 'bottom' },
    { do: 'untap', actor: 'a', t: 300, dur: 300 },
  ]);
  vi.advanceTimersByTime(300);
  expect(actor.style.rotate).toBe('60deg');
  expect(animate).toHaveBeenLastCalledWith([
    { rotate: '60deg', transformOrigin: 'bottom' }, { rotate: '0deg', transformOrigin: 'bottom' },
  ], expect.objectContaining({ duration: 300 }));
  if (skip) player.skipAll();
  else vi.advanceTimersByTime(300);
  expect(actor.style.rotate).toBe('0deg');
  expect(cancel).toHaveBeenCalledTimes(2);
});

it('starts a standalone untap from the supplied signed angle', () => {
  const { player } = play([{ do: 'untap', actor: 'a', t: 0, dur: 300, angle: 45, direction: -1 }]);
  expect(animate).toHaveBeenCalledWith([
    { rotate: '-45deg', transformOrigin: 'center' }, { rotate: '0deg', transformOrigin: 'center' },
  ], expect.anything());
  player.skipAll();
});

it.each([
  ['tap', '0deg', '186deg', '180deg'],
  ['untap', '180deg', '-6deg', '0deg'],
])('overshoots a half turn on %s and settles', (verb, from, peak, to) => {
  const { actor } = play([{ do: verb, actor: 'a', t: 0, dur: 450, angle: 180, overshoot: 6 }]);
  expect(animate).toHaveBeenCalledWith([
    { rotate: from, transformOrigin: 'center' },
    { rotate: peak, transformOrigin: 'center', offset: .78 },
    { rotate: to, transformOrigin: 'center' },
  ], expect.objectContaining({ duration: 450, easing: 'cubic-bezier(.4,.1,.3,1)' }));
  vi.advanceTimersByTime(450);
  expect(actor.style.rotate).toBe(to);
});

it('rolls artwork in from 540 degrees and .6 scale to its resting pose', () => {
  const { player, actor } = play([{ do: 'spin', actor: 'a', t: 0, dur: 1100, turns: 1.5, scaleFrom: .6, ease: 'out' }]);
  expect(animate).toHaveBeenCalledWith([
    { rotate: '-540deg', transformOrigin: 'center', scale: '0.6' },
    { rotate: '0deg', transformOrigin: 'center', scale: '1' },
  ], expect.objectContaining({ duration: 1100, easing: 'ease-out' }));
  player.skipAll();
  expect(actor.style.rotate).toBe('');
  expect(actor.style.scale).toBe('');
});

const loop = { do: 'spin', actor: 'a', t: 0, dur: 1200, endless: true, period: 400 };

it.each([false, true])('loops until step end or skip (skip=%s)', (skip) => {
  const { player, actor } = play([loop], 2);
  expect(animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
    duration: 800, iterations: Infinity, easing: 'linear',
  }));
  vi.advanceTimersByTime(1600);
  expect(cancel).not.toHaveBeenCalled();
  if (skip) player.skipAll();
  else vi.advanceTimersByTime(800);
  expect(cancel).toHaveBeenCalledOnce();
  expect(actor.style.rotate).toBe('');
});

it('does not start an endless spin under reduced motion', () => {
  play([loop], withReducedMotion(1, true));
  expect(animate).not.toHaveBeenCalled();
});
