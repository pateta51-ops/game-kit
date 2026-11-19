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
