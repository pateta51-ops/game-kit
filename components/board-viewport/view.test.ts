import { describe, expect, it } from 'vitest';
import { clampView, fitRect, tweenView, zoomAbout } from './index.ts';
import type { ViewLimits } from './index.ts';

const limits: ViewLimits = {
  size: [200, 100],
  bounds: [0, 0, 400, 200],
  minScale: 0.5,
  maxScale: 4,
};
const fitted = { x: 0, y: 0, scale: 0.5 };

describe('view math', () => {
  it('keeps the board point under the cursor when zooming', () => {
    const view = zoomAbout(fitted, 2, [80, 30], limits);
    expect(view).toEqual({ x: -80, y: -30, scale: 1 });
    expect([(80 - view.x) / view.scale, (30 - view.y) / view.scale]).toEqual([
      160, 60,
    ]);
    expect(zoomAbout(view, 100, [80, 30], limits)).toEqual({
      x: -560,
      y: -210,
      scale: 4,
    });
  });

  it('clamps scale and offsets and centers a smaller axis with an offset origin', () => {
    expect(clampView({ x: 100, y: -1000, scale: 10 }, limits)).toEqual({
      x: 0,
      y: -700,
      scale: 4,
    });
    expect(clampView({ x: 5, y: 10, scale: 0.1 }, limits)).toEqual(fitted);
    expect(
      fitRect([10, 20, 100, 100], { ...limits, bounds: [10, 20, 100, 100] }),
    ).toEqual({
      x: 40,
      y: -20,
      scale: 1,
    });
  });

  it('fits the whole board or a target rect', () => {
    expect(fitRect(limits.bounds, limits)).toEqual(fitted);
    expect(fitRect([100, 50, 100, 50], limits)).toEqual({
      x: -200,
      y: -100,
      scale: 2,
    });
  });

  it('eases over the scaled duration and jumps at speed zero', () => {
    const target = { x: -80, y: -40, scale: 1.5 };
    expect(tweenView(fitted, target, 87.5)).toEqual({
      x: -10,
      y: -5,
      scale: 0.625,
    });
    expect(tweenView(fitted, target, 350, 2)).toEqual({
      x: -40,
      y: -20,
      scale: 1,
    });
    expect(tweenView(fitted, target, 700, 2)).toBe(target);
    expect(tweenView(fitted, target, 0, 0)).toBe(target);
  });
});
