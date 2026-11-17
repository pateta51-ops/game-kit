// Port of Warp's Edge bagMode.test.ts: the 3D bag's fallback checks and its texture budget, without three.js.
import { describe, expect, it } from 'vitest';
import { bagMode, drawContents, faceSize, fpsWatch, rateFor, TEXTURE_BUDGET, textureBytes, webglAvailable } from './mode.ts';

describe('the bag view helpers', () => {
  it('3D only when chosen and no fallback', () => {
    expect(bagMode('3d', null)).toBe('3d');
    expect(bagMode('3d', 'slow')).toBe('2d');
    expect(bagMode('2d', null)).toBe('2d');
  });
  it('the scene starts from the bag before the draw: the contents left plus the drawn tokens in order', () => {
    expect(drawContents(['a', 'b'], ['c', 'a'])).toEqual(['a', 'b', 'c', 'a']);
  });
  it('rate follows the speed factor; none at speed 0 or reduced motion', () => {
    expect([rateFor(1), rateFor(2), rateFor(0), rateFor(1, true)]).toEqual([1, 0.5, 0, 0]);
  });
});

const canvasWith = (ctx: (kind: string) => unknown): (() => HTMLCanvasElement) => {
  return () => ({ getContext: ctx }) as unknown as HTMLCanvasElement;
};

describe('the 3D bag fallback', () => {
  it('WebGL is available only when a context is given', () => {
    expect(webglAvailable(canvasWith(() => null))).toBe(false);
    expect(webglAvailable(canvasWith((k) => (k === 'webgl' ? {} : null)))).toBe(true);
    expect(webglAvailable(canvasWith(() => ({})))).toBe(true);
    expect(
      webglAvailable(() => {
        throw new Error('no canvas');
      }),
    ).toBe(false);
  });

  const run = (fps: number, seconds: number, watch = fpsWatch()): number | null => {
    const step = 1000 / fps;
    for (let t = 0; t <= seconds * 1000; t += step) if (watch.frame(1000 + t)) return t / 1000;
    return null;
  };

  it('60 fps and 31 fps never fall back', () => {
    expect(run(60, 6)).toBeNull();
    expect(run(31, 6)).toBeNull();
  });

  it('exactly 30 fps never falls back; 29 fps does (the boundary, "below 30 fps")', () => {
    const w = fpsWatch();
    let slow = false;
    for (let i = 0; i <= 30 * 8; i += 1) slow ||= w.frame(1000 + (i * 1000) / 30);
    expect(slow).toBe(false);
    expect(run(29, 6)).not.toBeNull();
  });

  it('below 30 fps for 2 s falls back, not before 2 s', () => {
    const at = run(20, 6);
    expect(at).not.toBeNull();
    expect(at).toBeGreaterThanOrEqual(2);
    expect(at).toBeLessThan(2.2);
    expect(run(20, 1.9)).toBeNull();
  });

  it('a short stall inside a fast run does not fall back; a long slow stretch does', () => {
    const w = fpsWatch();
    let t = 1000;
    let slow = false;
    const frames = (fps: number, ms: number): void => {
      for (const end = t + ms; t < end; t += 1000 / fps) slow ||= w.frame(t);
    };
    frames(60, 2500);
    frames(5, 400); // a 400 ms hitch
    frames(60, 2500);
    expect(slow).toBe(false);
    frames(15, 2500);
    expect(slow).toBe(true);
  });
});

describe('the texture budget', () => {
  it('the mock’s fifteen faces fit at 512 px', () => {
    expect(faceSize(15)).toBe(512);
    expect(textureBytes(15, 512)).toBeLessThanOrEqual(TEXTURE_BUDGET);
  });

  it('more kinds of token step the faces down and stay inside the budget', () => {
    for (let n = 1; n <= 45; n += 1) expect(textureBytes(n, faceSize(n))).toBeLessThanOrEqual(TEXTURE_BUDGET);
    expect(faceSize(30)).toBe(256);
  });
});
