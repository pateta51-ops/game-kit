import { afterEach, describe, expect, it, vi } from 'vitest';
import { withViewTransition } from './view-transition.ts';

afterEach(() => { Reflect.deleteProperty(document, 'startViewTransition'); });
const fake = () => {
  const skip = vi.fn();
  (document as unknown as Record<string, unknown>)['startViewTransition'] = (cb: () => Promise<void>) => {
    const done = Promise.resolve().then(cb);
    return { ready: done, finished: done, updateCallbackDone: done, skipTransition: skip };
  };
  return skip;
};
describe('K402 view-transition onCardStart and signal', () => {
  it('fires once when the flight takes off; at once under instant', async () => {
    fake();
    const s = vi.fn();
    await withViewTransition(() => undefined, 1, { onCardStart: s, id: 'a' });
    expect(s).toHaveBeenCalledExactlyOnceWith(0, 'a');
    const i = vi.fn();
    await withViewTransition(() => undefined, 'instant', { onCardStart: i, id: 'b' });
    expect(i).toHaveBeenCalledExactlyOnceWith(0, 'b');
  });
  it('abort skips the transition and fires no start', async () => {
    const skip = fake();
    const ac = new AbortController();
    ac.abort();
    const s = vi.fn();
    await withViewTransition(() => undefined, 1, { onCardStart: s, signal: ac.signal });
    expect(skip).toHaveBeenCalled();
    expect(s).not.toHaveBeenCalled();
  });
});

describe('K431 per-card staggered start', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  const cards = [{ id: 'a', delay: 0 }, { id: 'b', delay: 100 }, { id: 'c', delay: 250 }];
  const setup = () => {
    let release = (): void => undefined;
    const finished = new Promise<void>((r) => { release = r; });
    (document as unknown as Record<string, unknown>)['startViewTransition'] = (cb: () => Promise<void>) => {
      const done = Promise.resolve().then(cb);
      return { ready: done, finished, updateCallbackDone: done, skipTransition: vi.fn() };
    };
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const q: (() => void)[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => q.push(f));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const step = (t: number): void => { now = t; q.splice(0).forEach((f) => { f(); }); };
    return { release, step };
  };
  it('fires once per card at its planned delay, not once at ready', async () => {
    const { release, step } = setup();
    const s = vi.fn();
    const p = withViewTransition(() => undefined, 1, { onCardStart: s, cards });
    await new Promise((r) => setTimeout(r, 0));
    expect(s.mock.calls).toEqual([[0, 'a']]);
    step(99);
    expect(s).toHaveBeenCalledTimes(1);
    step(120);
    expect(s.mock.calls).toEqual([[0, 'a'], [1, 'b']]);
    step(300);
    expect(s.mock.calls).toEqual([[0, 'a'], [1, 'b'], [2, 'c']]);
    step(400);
    release();
    await p;
    expect(s).toHaveBeenCalledTimes(3);
  });
  it('follows a named native animation clock', async () => {
    const { release, step } = setup();
    const anim = { animationName: 'deal-clock', currentTime: 0 };
    (document as unknown as Record<string, unknown>)['getAnimations'] = () => [anim];
    const s = vi.fn();
    const p = withViewTransition(() => undefined, 1, { onCardStart: s, cards, clock: 'deal-clock' });
    await new Promise((r) => setTimeout(r, 0));
    expect(s).toHaveBeenCalledTimes(1);
    anim.currentTime = 260;
    step(5);
    expect(s).toHaveBeenCalledTimes(3);
    release();
    await p;
    Reflect.deleteProperty(document, 'getAnimations');
  });
  it('instant fires every card at once in order', async () => {
    const s = vi.fn();
    await withViewTransition(() => undefined, 'instant', { onCardStart: s, cards });
    expect(s.mock.calls).toEqual([[0, 'a'], [1, 'b'], [2, 'c']]);
  });
});
