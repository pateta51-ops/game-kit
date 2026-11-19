// @vitest-environment jsdom
import { expect, it } from 'vitest';
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
