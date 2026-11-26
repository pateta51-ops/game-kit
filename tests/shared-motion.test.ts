// @vitest-environment jsdom
import './setup-dom.ts';
import { createElement } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardHand } from '../components/card-hand/ui.tsx';
import { msAt } from '../components/card-hand/index.ts';
import { DragGhost, useDragDrop } from '../components/drag-drop/ui.tsx';
import { buildTimeline, createMotionPlayer, createVerbs, motionRate, withReducedMotion, type MotionSpec } from '../components/motion-frame/index.ts';
import { useBoardPick, type Answer } from '../components/prompt-host/ui.ts';
import { createSettingsStore } from '../components/settings/index.ts';

const schema = {
  storageKey: 'shared-motion-test',
  sections: [{ id: 'motion', title: 'Motion', settings: [{ kind: 'choice', key: 'motion', label: 'Motion', default: 1,
    options: [{ value: 0, label: 'Off' }, { value: 0.5, label: 'Fast' }, { value: 1, label: 'Normal' }, { value: 2, label: 'Slow' }],
  }] }],
} as const;
const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
const beat: MotionSpec = { id: 'move', steps: [{ t: 0, dur: 280, actor: 'card', do: 'move' }] };
const stage = () => [0, 0, 100, 100] as const;
const prompt = { id: 1, kind: 'move', min: 2, max: 2, options: [{ id: 'a', enabled: true }, { id: 'b', enabled: true }] };

function Board({ settings, reduced, answer }: { settings: ReturnType<typeof createSettingsStore<typeof schema>>; reduced: boolean; answer: Answer }) {
  const factor = withReducedMotion(settings((s) => s.values.motion), reduced);
  const rate = motionRate(factor);
  const pick = useBoardPick(prompt, answer, { confirm: false });
  const drag = useDragDrop({ pick, promptId: prompt.id, speed: rate });
  return createElement('div', null,
    createElement(CardHand, { view: { cards: ['a'] }, face: (id) => id, pick, drag, speed: rate }),
    createElement('div', { 'data-testid': 'target', 'data-drop': 'b' }),
    createElement(DragGhost, { drag, render: (id) => id, speed: rate }),
  );
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
  delete (document as { elementsFromPoint?: unknown }).elementsFromPoint;
});

describe('one motion setting across factor and rate callers', () => {
  it.each([0, 0.5, 1, 2] as const)('factor %s drives the player, hand and drag ghost with the same timing direction', (value) => {
    const settings = createSettingsStore(schema, storage);
    settings.getState().set('motion', value);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ cancel: vi.fn(), onfinish: null, oncancel: null }));
    (HTMLElement.prototype as { animate?: unknown }).animate = animate;
    const answer = vi.fn<Answer>();
    const { container, getByTestId } = render(createElement(Board, { settings, reduced: false, answer }));
    expect(container.querySelector<HTMLElement>('[data-part="hand"]')?.style.getPropertyValue('--hand-ms')).toBe(`${280 * value}ms`);

    const durations: number[] = [];
    const verbs = createVerbs();
    verbs.register('move', (call) => { durations.push(call.dur); return undefined; });
    const commit = vi.fn();
    const end = vi.fn();
    const player = createMotionPlayer({ specs: { beat }, stages: { default: stage }, verbs, context: undefined,
      speed: () => withReducedMotion(settings.getState().values.motion, false) });
    player.play('beat', { commit, onEnd: end });
    vi.advanceTimersByTime(0);
    expect(durations).toEqual(value === 0 ? [] : [280 * value]);

    document.elementsFromPoint = () => [];
    fireEvent(container.querySelector('[data-drag="a"]')!, new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 }));
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 30, buttons: 1 })); });
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 30, buttons: 1 })); });
    expect(answer).not.toHaveBeenCalled();
    expect(container.querySelector('[data-part="ghost"]')?.getAttribute('data-flight') ?? null).toBe(value === 0 ? null : 'back');
    expect(animate).toHaveBeenCalledTimes(value === 0 ? 0 : 1);

    document.elementsFromPoint = () => [getByTestId('target')];
    fireEvent(container.querySelector('[data-drag="a"]')!, new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 }));
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 30, buttons: 1 })); });
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 30, buttons: 1 })); });
    expect(answer).toHaveBeenCalledExactlyOnceWith(['a', 'b'], 1);
    expect(animate).toHaveBeenCalledTimes(value === 0 ? 0 : 2);
    if (value > 0) for (const call of animate.mock.calls) expect(call[1]).toMatchObject({ duration: 180 * value });
    vi.advanceTimersByTime(280 * value + 1);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
    player.skipAll();
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it.each([0, 0.5, 1, 2] as const)('reduced motion keeps factor %s instant across all three callers', (value) => {
    const settings = createSettingsStore(schema, storage);
    settings.getState().set('motion', value);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const animate = vi.fn();
    (HTMLElement.prototype as { animate?: unknown }).animate = animate;
    const answer = vi.fn<Answer>();
    const { container, getByTestId } = render(createElement(Board, { settings, reduced: true, answer }));
    expect(container.querySelector<HTMLElement>('[data-part="hand"]')?.style.getPropertyValue('--hand-ms')).toBe('0ms');
    document.elementsFromPoint = () => [getByTestId('target')];
    fireEvent(container.querySelector('[data-drag="a"]')!, new MouseEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 }));
    act(() => { window.dispatchEvent(new MouseEvent('pointermove', { clientX: 30, buttons: 1 })); });
    act(() => { window.dispatchEvent(new MouseEvent('pointerup', { clientX: 30, buttons: 1 })); });
    expect(answer).toHaveBeenCalledExactlyOnceWith(['a', 'b'], 1);
    expect(animate).not.toHaveBeenCalled();
    expect(container.querySelector('[data-part="ghost"]')).toBeNull();
    const verbs = createVerbs();
    const move = vi.fn(() => undefined);
    verbs.register('move', move);
    const commit = vi.fn();
    const end = vi.fn();
    const player = createMotionPlayer({ specs: { beat }, stages: { default: stage }, verbs, context: undefined,
      speed: () => withReducedMotion(settings.getState().values.motion, true) });
    player.play('beat', { commit, onEnd: end });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
    expect(move).not.toHaveBeenCalled();
    expect(player.pending()).toBe(0);
  });

  it('preserves direct numeric contracts and reading holds; rejects invalid conversions explicitly', () => {
    expect(msAt(280, 0.5, false)).toBe(560);
    expect(buildTimeline(beat, stage, 0.5).ms).toBe(140);
    const reading: MotionSpec = { id: 'read', steps: [{ t: 0, dur: 1000, actor: 'card', do: 'read', read: true }] };
    expect(buildTimeline(reading, stage, 0.5).ms).toBe(1000);
    expect(buildTimeline(reading, stage, 2).ms).toBe(2000);
    expect(motionRate('instant')).toBe(0);
    expect(motionRate(-1)).toBe(0);
    for (const invalid of [NaN, Infinity, -Infinity, Number.MIN_VALUE]) expect(() => motionRate(invalid)).toThrow(RangeError);
    const persisted = createSettingsStore(schema, { ...storage, getItem: () => JSON.stringify({ state: { values: { motion: 99 } }, version: 1 }) });
    expect(persisted.getState().values.motion).toBe(1);
    expect(motionRate(persisted.getState().values.motion)).toBe(1);
  });
});
