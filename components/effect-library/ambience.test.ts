// The ambience layer on a faked page (no pixels): what it places, watches and lets go of.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Speed } from '../motion-frame';
import { createAmbience } from './ambience';
import { fakeDom } from './fake/dom';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ambience on a faked page', () => {
  it('destroy removes the listeners, the observer, the pending frame and the element', () => {
    const dom = fakeDom();
    const target = dom.el('div');
    let frames = 0;
    const a = createAmbience({ target: () => target as unknown as Element, speed: () => 1, draw: () => void (frames += 1) });
    const el = dom.body.children[0];
    expect([dom.listeners.map((l) => [l[0], l[2]]), dom.observers[0]?.seen, dom.waiting(), el?.style['display'], el?.style['left'], el?.style['width']]).toEqual([
      [
        ['resize', undefined],
        ['scroll', true],
      ],
      [target],
      1,
      'block',
      '10px',
      '300px',
    ]);
    dom.step();
    expect([frames, dom.waiting()]).toEqual([1, 1]);
    a.destroy();
    expect([dom.listeners, dom.observers[0]?.off, dom.waiting(), dom.body.children.length]).toEqual([[], 2, 0, 0]);
    dom.step();
    expect(frames).toBe(1);
  });
  it('no 2D context: the box is placed, no canvas and no frame', () => {
    const dom = fakeDom({ context: false });
    const target = dom.el('div');
    const a = createAmbience({ target: () => target as unknown as Element, speed: () => 1, draw: () => undefined });
    const el = dom.body.children[0];
    expect([el?.style['display'], el?.children.length, dom.waiting()]).toEqual(['block', 0, 0]);
    a.destroy();
  });
  it('a target of no size: drawn on a 0 x 0 canvas', () => {
    const dom = fakeDom({ w: 0, h: 0 });
    const target = dom.el('div');
    const sizes: number[][] = [];
    const a = createAmbience({ target: () => target as unknown as Element, speed: () => 1, draw: (_c, _t, w, h) => void sizes.push([w, h]) });
    dom.step();
    expect([sizes, dom.body.children[0]?.children[0]?.width]).toEqual([[[0, 0]], 0]);
    a.destroy();
  });
  it('the target going away, or motion going Off: hidden, no frame, the old target no longer observed; back on update', () => {
    const dom = fakeDom();
    const box = dom.el('div');
    let target: typeof box | null = box;
    let speed: Speed = 1;
    const a = createAmbience({ target: () => target as unknown as Element | null, speed: () => speed, draw: () => undefined });
    const el = dom.body.children[0];
    target = null;
    a.update();
    expect([el?.style['display'], dom.waiting(), dom.observers[0]?.off]).toEqual(['none', 0, 2]);
    target = box;
    a.update();
    expect([el?.style['display'], dom.waiting(), dom.observers[0]?.seen.length]).toEqual(['block', 1, 2]);
    speed = 'instant';
    dom.step();
    expect([el?.style['display'], dom.waiting()]).toEqual(['none', 0]);
    a.destroy();
  });
  it('no target from the start: hidden and idle', () => {
    const dom = fakeDom();
    const a = createAmbience({ target: () => null, speed: () => 1, draw: () => undefined });
    expect([dom.body.children[0]?.style['display'], dom.waiting(), dom.observers[0]?.seen]).toEqual(['none', 0, []]);
    a.destroy();
  });
});
