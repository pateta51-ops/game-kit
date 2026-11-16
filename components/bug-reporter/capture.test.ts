// Issue 44b: the screenshot draws what is on screen: the window's scroll once (through the clone's transform), inner scrollers
// by shifting their children, and every live style and scroll offset is put back afterwards, also after an error.
import { afterEach, describe, expect, it, vi } from 'vitest';

const toPng = vi.fn();
vi.mock('html-to-image', () => ({ toPng: (...a: unknown[]) => toPng(...a) as unknown }));

import './test-utils.ts';
import { captureScreen, freezeScroll, scrolledElements } from './capture.ts';

function scroller(x: number, y: number): HTMLElement {
  const el = document.createElement('div');
  let top = y;
  let left = x;
  Object.defineProperty(el, 'scrollTop', { get: () => top, set: (v: number) => (top = v), configurable: true });
  Object.defineProperty(el, 'scrollLeft', { get: () => left, set: (v: number) => (left = v), configurable: true });
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
  toPng.mockReset();
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});

describe('capture of a scrolled screen', () => {
  it('leaves the page itself (html, body, #root) out of the scrolled elements', () => {
    Object.defineProperty(document.documentElement, 'scrollTop', { value: 300, configurable: true });
    const inner = scroller(0, 40);
    document.body.append(inner);
    const found = scrolledElements().map((s) => s.el);
    expect(found).toContain(inner);
    expect(found).not.toContain(document.documentElement);
    Reflect.deleteProperty(document.documentElement, 'scrollTop');
  });

  it('shifts an inner scroller\'s children, and puts it all back', () => {
    const el = scroller(0, 120);
    const kid = document.createElement('p');
    el.append(kid);
    document.body.append(el);
    const restore = freezeScroll();
    expect(kid.style.transform).toContain('translate(0px, -120px)');
    expect(el.scrollTop).toBe(0);
    restore();
    expect(kid.style.transform).toBe('');
    expect(el.scrollTop).toBe(120);
  });

  it('draws the window scroll once, through the clone style only', async () => {
    Object.defineProperty(window, 'scrollY', { value: 900, configurable: true });
    toPng.mockResolvedValue(`data:image/png;base64,${'A'.repeat(200)}`);
    const before = document.documentElement.style.transform;
    await expect(captureScreen()).resolves.toBe('A'.repeat(200));
    const opts = toPng.mock.calls[0]?.[1] as { style?: { transform?: string } };
    expect(opts.style?.transform).toBe('translate(0px, -900px)');
    expect(document.documentElement.style.transform).toBe(before);
    expect(document.body.style.transform).toBe('');
  });

  it('restores inner scrolls and styles when drawing fails', async () => {
    const el = scroller(0, 75);
    const kid = document.createElement('p');
    el.append(kid);
    document.body.append(el);
    toPng.mockRejectedValue(new Error('no canvas'));
    await expect(captureScreen()).resolves.toBeNull();
    expect(el.scrollTop).toBe(75);
    expect(kid.style.transform).toBe('');
  });

  it('restores what it changed when freezing itself throws part-way', () => {
    const el = scroller(0, 60);
    const kid = document.createElement('p');
    el.append(kid);
    const bad = scroller(0, 10);
    const kid2 = document.createElement('p');
    bad.append(kid2);
    document.body.append(el, bad);
    const real = window.getComputedStyle.bind(window);
    let calls = 0;
    vi.spyOn(window, 'getComputedStyle').mockImplementation((e: Element) => {
      calls += 1;
      if (e === kid2) throw new Error('boom');
      return real(e);
    });
    expect(() => freezeScroll()).toThrow('boom');
    vi.restoreAllMocks();
    expect(calls).toBeGreaterThan(0);
    expect(kid.style.transform).toBe('');
    expect(el.scrollTop).toBe(60);
    expect(bad.scrollTop).toBe(10);
  });
});
