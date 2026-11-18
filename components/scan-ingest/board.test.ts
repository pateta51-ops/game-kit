import { describe, expect, it } from 'vitest';
import { boxStyle, clipPathOf, cover, mmOf, planOverlay, skewOf, toScreen, trackPoint, trimOutline, uniformOutlines, type Box } from './board.ts';
import { findRows, hueTest, measureRgba, nearTest, type BoxSpec } from './measure.ts';

// a fake game's board: 400 x 300 parchment, a red box and a teal box printed on it, a blue row and a green row below
const W = 400,
  H = 300;
function board(): Uint8ClampedArray {
  const d = new Uint8ClampedArray(W * H * 4);
  const fill = (b: Box, c: [number, number, number]) => {
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) d.set([...c, 255], (y * W + x) * 4);
  };
  fill({ x: 0, y: 0, w: W, h: H }, [225, 210, 170]);
  fill({ x: 300, y: 40, w: 40, h: 40 }, [200, 30, 30]);
  fill({ x: 60, y: 100, w: 36, h: 36 }, [40, 160, 170]);
  fill({ x: 0, y: 180, w: W, h: 30 }, [30, 60, 200]);
  fill({ x: 0, y: 230, w: W, h: 30 }, [30, 170, 60]);
  return d;
}
const red = hueTest([340, 20], [0.45, 1], [0.2, 1]);
const teal = nearTest([40, 160, 170], 60);
const SPECS: BoxSpec[] = [
  { id: 'harm', test: red, region: { x: 0.5, y: 0, w: 0.5, h: 0.5 }, size: [0.06, 0.14], usual: { x: 0.75, y: 0.13, w: 0.1, h: 0.13 } },
  { id: 'progress', test: teal, region: { x: 0, y: 0.2, w: 0.5, h: 0.4 }, size: [0.06, 0.14] },
  { id: 'gone', test: nearTest([0, 0, 0], 30), region: { x: 0, y: 0, w: 1, h: 1 }, size: [0.06, 0.14] },
];

describe('scan geometry (K373)', () => {
  it('measures the printed boxes and colour rows of a synthetic board', () => {
    const g = measureRgba(W, H, board(), {
      boxes: SPECS,
      rows: { tests: { blue: hueTest([200, 250], [0.4, 1]), green: hueTest([100, 160], [0.4, 1]) }, order: ['blue', 'green'], opts: { from: 0.4, minH: 0.05 } },
    });
    const near = (b: Box | null | undefined, e: Box) => {
      expect(b).toBeTruthy();
      for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(b![k] - e[k])).toBeLessThanOrEqual(4);
    };
    near(g.boxes.harm, { x: 300, y: 40, w: 40, h: 40 });
    near(g.boxes.progress, { x: 60, y: 100, w: 36, h: 36 });
    expect(g.boxes.gone).toBeNull();
    expect(g.bands.map((b) => b.id)).toEqual(['blue', 'green']);
    expect(Math.abs(g.bands[0]!.y0 - 180)).toBeLessThanOrEqual(2);
    expect(findRows(W, H, board(), { blue: hueTest([200, 250], [0.4, 1]) }, ['blue', 'blue'], { from: 0.4 })).toBeNull();
  });

  it('maps boxes to the screen at any scale', () => {
    const b = { x: 300, y: 40, w: 40, h: 40 };
    for (const screen of [390, 800, 1600, 3840]) {
      const s = toScreen(b, W, screen);
      expect(s.x / screen).toBeCloseTo(0.75);
      expect(s.w / screen).toBeCloseTo(0.1);
    }
    const { boxes, missing } = planOverlay(SPECS, measureRgba(W, H, board(), { boxes: SPECS }));
    expect(missing).toEqual(['gone']);
    expect(Math.abs(parseFloat(boxStyle(boxes.harm!).left) - 74.5)).toBeLessThanOrEqual(1);
    expect(planOverlay(SPECS, undefined).boxes).toEqual({ harm: SPECS[0]!.usual });
    expect(cover({ x: 0, y: 0, w: 50, h: 50 }, 100, 100)).toEqual({ x: 0, y: 0, w: 52, h: 52 });
    expect(trackPoint([{ x: 0, y: 0 }, { x: 1, y: 1 }], 9)).toEqual({ x: 1, y: 1 });
  });

  it('die-cut pieces: clip path, trim, true size, skew, the typical outline', () => {
    const sq: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(clipPathOf(sq)).toBe('polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)');
    expect(clipPathOf([[0, 0], [1, 1]])).toBeUndefined();
    expect(trimOutline(sq, 0.1)![0]![0]).toBeCloseTo(0.1);
    expect(mmOf({ width: 300, height: 200, sizeMm: [20, 30] })).toEqual({ w: 30, h: 20 });
    const t = (5 * Math.PI) / 180;
    const turned = sq.map(([x, y]) => [0.5 + (x - 0.5) * Math.cos(t) - (y - 0.5) * Math.sin(t), 0.5 + (x - 0.5) * Math.sin(t) + (y - 0.5) * Math.cos(t)] as [number, number]);
    expect(skewOf(turned, 100, 100)).toBeCloseTo(5, 0);
    expect(skewOf(sq, 100, 100)).toBe(0);
    const wobble: [number, number][] = [[0, 0], [1, 0], [1, 0.5], [0.85, 0.55], [1, 0.6], [1, 1], [0, 1]];
    const out = uniformOutlines([
      { id: 'a', family: 'card', outline: sq },
      { id: 'b', family: 'card', outline: sq },
      { id: 'c', family: 'card', outline: wobble },
    ]);
    expect(out.c).toBe(sq);
  });
});
