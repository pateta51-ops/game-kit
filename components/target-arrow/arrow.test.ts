import { describe, expect, it } from 'vitest';
import { STRIKE_MS, aimedZone, arrowShape, curveOf, ease, partOf, pointOn, strikeFrame, strikePlan, untilHit } from './index.ts';

describe('arrow geometry', () => {
  it('bends up the screen, whichever way it points', () => {
    expect(curveOf({ x: 0, y: 100 }, { x: 100, y: 100 }).c.y).toBeLessThan(100);
    expect(curveOf({ x: 100, y: 100 }, { x: 0, y: 100 }).c.y).toBeLessThan(100);
    expect(curveOf({ x: 5, y: 5 }, { x: 5, y: 5 }).c).toEqual({ x: 5, y: 5 });
  });
  it('caps the bend', () => {
    const q = curveOf({ x: 0, y: 5000 }, { x: 5000, y: 5000 });
    expect(5000 - q.c.y).toBe(180);
  });
  it('pointOn and partOf agree', () => {
    const q = curveOf({ x: 0, y: 0 }, { x: 200, y: 0 });
    const part = partOf(q, 0.25, 0.75);
    expect(part.p0.x).toBeCloseTo(pointOn(q, 0.25).x);
    expect(part.p2.y).toBeCloseTo(pointOn(q, 0.75).y);
  });
  it('arrowShape: head tip at the end, nothing for no length', () => {
    const q = curveOf({ x: 0, y: 0 }, { x: 200, y: 0 });
    expect(arrowShape(q).head.startsWith('200 0 ')).toBe(true);
    expect(arrowShape(curveOf({ x: 1, y: 1 }, { x: 1, y: 1 })).d).toBe('');
  });
  it('aimedZone takes the smallest zone holding the point, with pad', () => {
    const big = { id: 'big', rect: { left: 0, top: 0, width: 200, height: 200 } };
    const small = { id: 'small', rect: { left: 50, top: 50, width: 40, height: 40 } };
    expect(aimedZone({ x: 60, y: 60 }, [big, small])?.id).toBe('small');
    expect(aimedZone({ x: 205, y: 100 }, [big, small])?.id).toBe('big');
    expect(aimedZone({ x: 300, y: 300 }, [big, small])).toBeNull();
  });
});

describe('strike plan', () => {
  it('none without motion; the hit alone without an arrow; collapse when aimed; the whole stroke otherwise', () => {
    expect(strikePlan({ factor: 0, arrow: true, aimed: false })).toBeNull();
    expect(strikePlan({ factor: 1, arrow: false, aimed: false })).toEqual({ draw: 0, hold: 0, collapse: 0, hit: STRIKE_MS.hit });
    expect(strikePlan({ factor: 1, arrow: true, aimed: true })).toEqual({ draw: 0, hold: 0, collapse: STRIKE_MS.collapse, hit: STRIKE_MS.hit });
    const full = strikePlan({ factor: 2, arrow: true, aimed: false });
    expect(full && untilHit(full)).toBe(2 * (220 + 90 + 150));
  });
  it('frames: grows, stays, collapses, ends', () => {
    const q = curveOf({ x: 0, y: 0 }, { x: 200, y: 0 });
    const plan = strikePlan({ factor: 1, arrow: true, aimed: false });
    if (plan === null) throw new Error('plan');
    expect(strikeFrame(q, plan, 0)?.p2).toEqual(q.p0);
    expect(strikeFrame(q, plan, 250)).toBe(q);
    expect(strikeFrame(q, plan, 460 - 1)?.p0.x).toBeGreaterThan(150);
    expect(strikeFrame(q, plan, 460)).toBeNull();
    expect(ease(0.5)).toBe(0.5);
  });
});
