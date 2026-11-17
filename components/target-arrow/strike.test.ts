import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStrikes } from './index.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('strike store', () => {
  it('runs a flight at once when no strike is held, at the hit when one is', () => {
    const s = createStrikes();
    const launch = vi.fn();
    s.hold({}, launch);
    expect(launch).toHaveBeenCalledTimes(1);
    const no = s.beginHold();
    s.hold({}, launch);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(s.holding()).toBe(true);
    s.endHold(no);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(s.holding()).toBe(false);
  });
  it('a newer hold ends the older one; a stale end does nothing', () => {
    const s = createStrikes();
    const fn = vi.fn();
    const a = s.beginHold();
    s.afterStrike(fn);
    const b = s.beginHold();
    expect(fn).toHaveBeenCalledTimes(1);
    s.endHold(a);
    expect(s.holding()).toBe(true);
    s.endHold(b);
    expect(s.holding()).toBe(false);
  });
  it('lets go after the longest hold', () => {
    vi.useFakeTimers();
    const s = createStrikes(100);
    const fn = vi.fn();
    s.beginHold();
    s.afterStrike(fn);
    vi.advanceTimersByTime(101);
    expect(fn).toHaveBeenCalled();
  });
  it('announce tells listeners, skips no ids, survives a throwing listener, one table apart from another', () => {
    const a = createStrikes<string>();
    const b = createStrikes<string>();
    const seen: string[] = [];
    a.on(() => {
      throw new Error('x');
    });
    const off = a.on((st) => seen.push(st.prompt));
    b.on((st) => seen.push('b' + st.prompt));
    a.announce({ prompt: 'p', ids: [], auto: false });
    a.announce({ prompt: 'p', ids: ['t'], auto: false });
    off();
    a.announce({ prompt: 'q', ids: ['t'], auto: false });
    expect(seen).toEqual(['p']);
  });
});
