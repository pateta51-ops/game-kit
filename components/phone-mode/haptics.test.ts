import { describe, expect, it } from 'vitest';
import { createHaptics, TICK_MS } from './haptics.ts';

const rig = () => {
  const got: unknown[] = [];
  let enabled = true;
  const h = createHaptics({ enabled: () => enabled, vibrate: (p) => got.push(p) });
  return { h, got, set: (b: boolean) => (enabled = b) };
};

describe('haptic ticks (K149)', () => {
  it('plays the five ticks and honours the setting', () => {
    const { h, got, set } = rig();
    h.armed();
    h.sent();
    h.refused();
    h.land('a');
    h.impact('s1');
    expect(got).toEqual([TICK_MS.armed, TICK_MS.sent, TICK_MS.refused, TICK_MS.land, TICK_MS.impact]);
    set(false);
    h.armed();
    expect(got).toHaveLength(5);
  });
  it('lands once per state and hits once per strike', () => {
    const { h, got } = rig();
    h.land('a');
    h.land('a');
    h.land('b');
    h.impact(1);
    h.impact(1);
    expect(got).toHaveLength(3);
  });
  it('a snapped motion drops its pending tick; an unsnapped one plays once', () => {
    const { h, got } = rig();
    const fire = h.later('land', 'x');
    h.snap();
    fire();
    expect(got).toEqual([]);
    const f2 = h.later('impact', 'y');
    f2();
    f2();
    expect(got).toEqual([TICK_MS.impact]);
  });
  it('swallows a failing vibrate', () => {
    const h = createHaptics({
      vibrate: () => {
        throw new Error('x');
      },
    });
    expect(() => h.sent()).not.toThrow();
  });
});
