import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollPan } from './pan.ts';

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

const rig = () => {
  const main = document.createElement('div');
  document.body.append(main);
  const tab = document.createElement('button');
  document.body.append(tab);
  const clicks = vi.fn();
  tab.addEventListener('click', clicks);
  return { main, tab, clicks };
};
const box = (el: Element, r: { top?: number; left?: number; w?: number; h?: number }) => {
  const { top = 0, left = 0, w = 10, h = 100 } = r;
  el.getBoundingClientRect = () => ({ top, bottom: top + h, left, right: left + w, width: w, height: h }) as DOMRect;
};
const target = (main: HTMLElement, cls: string, r: Parameters<typeof box>[1]) => {
  const el = document.createElement('i');
  el.className = cls;
  main.append(el);
  box(el, r);
};

describe('scrollPan K452', () => {
  it('several targets pan in order, each waiting for the last', async () => {
    vi.useFakeTimers();
    const { main } = rig();
    box(main, { w: 100, h: 200 });
    target(main, 'a', { top: 1000 });
    target(main, 'b', { top: 3000 });
    const s = scrollPan({ scroller: () => main, panMs: 100 })(1, new AbortController().signal)!;
    let done = false;
    void s.ensure(['.a', '.b']).then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(60);
    expect(main.scrollTop).toBeGreaterThan(0);
    expect(main.scrollTop).toBeLessThan(950);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(70);
    expect(main.scrollTop).toBeGreaterThan(900);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(done).toBe(true);
  });

  it('clickTabs false never presses a tab', async () => {
    vi.useFakeTimers();
    const { main, tab, clicks } = rig();
    const s = scrollPan({ scroller: () => main, tabs: () => tab, activeTab: () => null, clickTabs: false })(1, new AbortController().signal)!;
    void s.ensure('.x');
    await s.back();
    expect(clicks).not.toHaveBeenCalled();
  });

  it('horizontal centres the item in scrollLeft and back restores it', async () => {
    vi.useFakeTimers();
    const { main } = rig();
    box(main, { w: 100, h: 200 });
    target(main, 'x', { left: 500, w: 10, h: 50 });
    main.scrollLeft = 7;
    Object.defineProperty(main, 'scrollWidth', { value: 5000 });
    Object.defineProperty(main, 'clientWidth', { value: 100 });
    const s = scrollPan({ scroller: () => main, horizontal: true, panMs: 50 })(1, new AbortController().signal)!;
    void s.ensure('.x');
    await vi.advanceTimersByTimeAsync(400);
    expect(main.scrollLeft).toBeCloseTo(7 + (500 + 510 - 100) / 2);
    expect(main.scrollTop).toBe(0);
    void s.back();
    await vi.advanceTimersByTimeAsync(400);
    expect(main.scrollLeft).toBe(7);
  });

  it('horizontal clamps to the scrollable width near the right edge', async () => {
    vi.useFakeTimers();
    const { main } = rig();
    box(main, { w: 100, h: 200 });
    target(main, 'x', { left: 500, w: 10, h: 50 });
    Object.defineProperty(main, 'scrollWidth', { value: 300 });
    Object.defineProperty(main, 'clientWidth', { value: 100 });
    const s = scrollPan({ scroller: () => main, horizontal: true, panMs: 50 })(1, new AbortController().signal)!;
    void s.ensure('.x');
    await vi.advanceTimersByTimeAsync(400);
    expect(main.scrollLeft).toBe(200);
  });

  it('back(tab) presses the given tab, not the starting one', async () => {
    vi.useFakeTimers();
    const { main } = rig();
    const home = document.createElement('button');
    const other = document.createElement('button');
    const homeClick = vi.fn();
    const otherClick = vi.fn();
    home.addEventListener('click', homeClick);
    other.addEventListener('click', otherClick);
    const s = scrollPan({ scroller: () => main, activeTab: () => home })(1, new AbortController().signal)!;
    void s.back(other);
    await vi.advanceTimersByTimeAsync(200);
    expect(otherClick).toHaveBeenCalledTimes(1);
    expect(homeClick).not.toHaveBeenCalled();
  });

  it('scale 0 makes no session and moves nothing', () => {
    const { main } = rig();
    main.scrollTop = 5;
    expect(scrollPan({ scroller: () => main })(0, new AbortController().signal)).toBeNull();
    expect(main.scrollTop).toBe(5);
  });
});
