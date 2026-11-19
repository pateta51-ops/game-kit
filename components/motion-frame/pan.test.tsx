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

describe('scrollPan K444', () => {
  it('tabWaitMs presses the tab and waits that long, not the frame count', async () => {
    vi.useFakeTimers();
    const { main, tab, clicks } = rig();
    const s = scrollPan({ scroller: () => main, tabs: () => tab, activeTab: () => null, tabWaitMs: 70 })(1, new AbortController().signal)!;
    let done = false;
    void s.ensure('.x').then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(clicks).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(done).toBe(true);
  });

  it('panMs sets the ease length', async () => {
    vi.useFakeTimers();
    const { main } = rig();
    const el = document.createElement('i');
    el.className = 'x';
    main.append(el);
    el.getBoundingClientRect = () => ({ top: 1000, bottom: 1100, left: 0, right: 10, width: 10, height: 100 }) as DOMRect;
    main.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 100, width: 100, height: 200 }) as DOMRect;
    const s = scrollPan({ scroller: () => main, panMs: 100 })(1, new AbortController().signal)!;
    let done = false;
    void s.ensure('.x').then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(150);
    expect(done).toBe(true);
    expect(main.scrollTop).toBeGreaterThan(0);
  });

  it('defaults: the tab wait ends after about three frames', async () => {
    vi.useFakeTimers();
    const { main, tab } = rig();
    const s = scrollPan({ scroller: () => main, tabs: () => tab, activeTab: () => null })(1, new AbortController().signal)!;
    let done = false;
    void s.ensure('.x').then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toBe(true);
  });
});
