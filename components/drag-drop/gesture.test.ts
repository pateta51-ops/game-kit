import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD_PX, dragStep, pressSource, type DragGesture, type DragInput } from './gesture.ts';

// K220: ported from Imperium play.test.ts "U7: the drag gesture", over target ids instead of one zone.
const pressed = (): DragGesture => {
  const g = pressSource('c:a', 7, 100, 500, true, true);
  if (g === null) throw new Error('no gesture');
  return g;
};
const run = (inputs: DragInput[]) => {
  let g: DragGesture | null = pressed();
  for (const input of inputs) {
    if (g === null) throw new Error('the gesture ended early');
    const step = dragStep(g, input);
    if (step.gesture === null) return step;
    g = step.gesture;
  }
  return { gesture: g, drop: null, swallowClick: false };
};

describe('drag gesture (K220)', () => {
  it('starts only on a source that can be dragged, with the setting on', () => {
    expect(pressSource('c:a', 1, 0, 0, false, true)).toBeNull();
    expect(pressSource('c:a', 1, 0, 0, true, false)).toBeNull();
    expect(pressed()).toMatchObject({ source: 'c:a', phase: 'pressed', over: null });
  });

  it('a move shorter than the threshold stays a press (the release is the click); at the threshold it is a drag', () => {
    expect(run([{ type: 'move', x: 100 + DRAG_THRESHOLD_PX - 1, y: 500, over: null }]).gesture?.phase).toBe('pressed');
    expect(run([{ type: 'move', x: 100, y: 500 - DRAG_THRESHOLD_PX, over: null }]).gesture?.phase).toBe('dragging');
    expect(run([{ type: 'move', x: 102, y: 498, over: 'play' }, { type: 'release', over: 'play' }])).toEqual({ gesture: null, drop: null, swallowClick: false });
  });

  it('drops on the target id only when released over one while dragging; Escape, a release elsewhere and a lost pointer drop nothing and swallow the click', () => {
    const up = { type: 'move', x: 100, y: 100, over: 'play' } as const;
    expect(run([up, { type: 'release', over: 'play' }])).toEqual({ gesture: null, drop: 'play', swallowClick: true });
    expect(run([up, { type: 'release', over: null }])).toEqual({ gesture: null, drop: null, swallowClick: true });
    expect(run([up, { type: 'escape' }, up, { type: 'release', over: 'play' }])).toEqual({ gesture: null, drop: null, swallowClick: true });
    expect(run([up, { type: 'cancel' }])).toEqual({ gesture: null, drop: null, swallowClick: true });
    expect(run([up, { type: 'escape' }, up]).gesture).toMatchObject({ phase: 'cancelled', over: null });
  });
});
