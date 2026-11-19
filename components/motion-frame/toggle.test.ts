// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createMotionPlayer, createVerbs, type MotionSpec } from './index.ts';
import { classToggle, classToggleVerb } from './toggle.ts';

it('K439 toggle adds the class with a 0.2 s ease and drops it at once', () => {
  const el = document.createElement('div');
  const off = classToggle(el, 'is-attacking');
  expect(el.classList.contains('is-attacking')).toBe(true);
  expect(el.style.transition).toBe('transform 200ms ease');
  off();
  expect(el.classList.contains('is-attacking')).toBe(false);
  expect(el.style.transition).toBe('');
  off();
  expect(el.classList.contains('is-attacking')).toBe(false);
});

it('K439 toggle takes its own duration, ease and property', () => {
  const el = document.createElement('div');
  classToggle(el, 'up', { dur: 100, ease: 'linear', prop: 'opacity' });
  expect(el.style.transition).toBe('opacity 100ms linear');
});

it('K439 verb lifts the found element and finishes by dropping it; a missing one does nothing', () => {
  const el = document.createElement('div');
  const verb = classToggleVerb((call) => call.actor === 'a' ? el : null, 'is-attacking');
  const call = { actor: 'a' } as Parameters<typeof verb>[0];
  const run = {} as Parameters<typeof verb>[1];
  const finish = verb(call, run)!;
  expect(el.classList.contains('is-attacking')).toBe(true);
  finish();
  expect(el.classList.contains('is-attacking')).toBe(false);
  expect(verb({ actor: 'b' } as typeof call, run)).toBeUndefined();
});

it('K439 off() while the on transition is still running drops the class and clears the transition', () => {
  const el = document.createElement('div');
  document.body.append(el);
  const off = classToggle(el, 'is-attacking', { dur: 200 });
  expect(el.style.transition).toBe('transform 200ms ease');
  off();
  expect(el.classList.contains('is-attacking')).toBe(false);
  expect(el.hasAttribute('style') && el.style.transition !== '').toBe(false);
  el.remove();
});

it('K439 the verb finish runs on a player skip', () => {
  const el = document.createElement('div');
  const verbs = createVerbs();
  verbs.register('lift-class', classToggleVerb(() => el, 'is-attacking'));
  const spec: MotionSpec = { id: 'atk', stage: 'default', maxMs: 1000, actors: [{ id: 'a', label: 'A', at: [10, 10], w: 10, h: 10 }], steps: [{ t: 0, dur: 1000, actor: 'a', do: 'lift-class' }] };
  const p = createMotionPlayer({ specs: { atk: spec }, stages: { default: () => [0, 0, 100, 100] }, verbs, speed: () => 1, context: undefined });
  vi.useFakeTimers();
  p.play('atk');
  vi.advanceTimersByTime(20);
  expect(el.classList.contains('is-attacking')).toBe(true);
  p.skipAll();
  expect(el.classList.contains('is-attacking')).toBe(false);
  vi.useRealTimers();
});
