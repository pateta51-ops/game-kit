import { describe, expect, it } from 'vitest';
import { BUMP_FRAMES, crossed, levelOf, scaledMs, tagAt, tagText } from './counter.ts';

const th = { low: 3, out: 1 };

describe('counter pure part', () => {
  it('level from thresholds', () => {
    expect([5, 4, 3, 2, 1, 0].map((n) => levelOf(n, th))).toEqual(['ok', 'ok', 'low', 'low', 'out', 'out']);
    expect(levelOf(0, { low: 2 })).toBe('out');
    expect(levelOf(0)).toBe('ok');
  });
  it('crossed names only a worse level', () => {
    expect(crossed(4, 3, th)).toBe('low');
    expect(crossed(3, 2, th)).toBeNull();
    expect(crossed(2, 1, th)).toBe('out');
    expect(crossed(1, 5, th)).toBeNull();
    expect(crossed(5, 0, th)).toBe('out');
  });
  it('tag text', () => {
    expect([tagText(3), tagText(-2), tagText(0)]).toEqual(['+3', '−2', '']);
  });
  it('scaled ms: none at instant or 0', () => {
    expect([scaledMs(300, 1), scaledMs(300, 0.5), scaledMs(300, 0), scaledMs(300, 'instant')]).toEqual([300, 150, 0, 0]);
  });
  it('bump frames and tag curve', () => {
    expect(BUMP_FRAMES.map((f) => f.transform)).toEqual(['scale(1.35)', 'scale(0.92)', 'scale(1)']);
    expect(tagAt(0)).toEqual({ opacity: 0, y: 0 });
    expect(tagAt(0.5).opacity).toBe(1);
    expect(tagAt(1).opacity).toBeCloseTo(0);
    expect(tagAt(1).y).toBeCloseTo(0.8);
  });
});
