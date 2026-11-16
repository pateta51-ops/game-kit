import { describe, expect, it } from 'vitest';
import { afterimages, createFlashLimiter, flashAt, holdMs, shakeAt, stopTime, trauma, traumaAt } from './feel.ts';

describe('impact feel', () => {
  it('hit stop holds at contact and keeps the total', () => {
    expect(holdMs()).toBe(100);
    expect(holdMs(true)).toBe(160);
    expect(stopTime(50, 100, 100)).toBe(50);
    expect(stopTime(150, 100, 100)).toBe(100);
    expect(stopTime(200, 100, 100)).toBe(100);
    expect(stopTime(300, 100, 100)).toBe(200);
  });
  it('trauma by damage and decay', () => {
    expect(trauma(1)).toBeCloseTo(0.67);
    expect(trauma(9)).toBe(1);
    expect(trauma(5, { kill: true })).toBe(1);
    expect(trauma(5, { blocked: true })).toBe(0.35);
    expect(traumaAt(1, 300, 600)).toBeCloseTo(0.5);
    expect(traumaAt(1, 700, 600)).toBe(0);
  });
  it('shake is seeded, scales with trauma squared, ends at rest, and caps frequency', () => {
    expect(shakeAt(40, 1, { seed: 3 })).toEqual(shakeAt(40, 1, { seed: 3 }));
    expect(shakeAt(40, 1, { seed: 3 })).not.toEqual(shakeAt(40, 1, { seed: 4 }));
    expect(Math.abs(shakeAt(700, 1).x) + Math.abs(shakeAt(700, 1).rot)).toBe(0);
    const m = (t0: number): number => Math.max(...Array.from({ length: 40 }, (_, i) => Math.abs(shakeAt(i * 5, t0, { decayMs: 100000 }).x)));
    expect(m(0.5)).toBeLessThan(m(1) * 0.3);
    expect(m(1)).toBeLessThanOrEqual(12);
    expect(shakeAt(33, 1, { speed: 100 })).toEqual(shakeAt(33, 1, { speed: 1000 }));
  });
  it('afterimages sample earlier poses and fade', () => {
    const a = afterimages((t) => t, 100);
    expect(a.map((x) => x.pose)).toEqual([84, 68, 52]);
    expect(a[0]!.alpha).toBeGreaterThan(a[2]!.alpha);
    expect(afterimages((t) => t, 10)[2]!.pose).toBe(0);
  });
  it('flash is a bump and the limiter allows under 3 a second per target', () => {
    expect(flashAt(0, 0)).toBe(0);
    expect(flashAt(40, 0)).toBeGreaterThan(0.5);
    const l = createFlashLimiter();
    expect([0, 100, 200, 300].map((t) => l.allow('a', t))).toEqual([true, true, false, false]);
    expect(l.allow('b', 300)).toBe(true);
    expect(l.allow('a', 1001)).toBe(true);
  });
});
