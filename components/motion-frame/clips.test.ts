import { describe, expect, it } from 'vitest';
import { clipTimes, frameAt, stillFrames, stillTimes } from './clips';

const spec = (...e: [number, number][]) => ({ steps: e.map(([t, dur]) => ({ t, dur })) });
describe('stillTimes', () => {
  it('start plus every step end but the last', () => expect(stillTimes(spec([0, 300], [300, 400], [700, 500]))).toEqual([0, 300, 700]));
  it('spreads more than four ends over four', () => expect(stillTimes(spec(...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i): [number, number] => [i * 100 - 100, 100])))).toEqual([0, 300, 500, 600, 800]));
  it('one step: only the start', () => expect(stillTimes(spec([0, 500]))).toEqual([0]));
});
describe('frames', () => {
  const frames = [0, 1, 2, 3].map((t) => ({ data: String(t), t }));
  it('frameAt holds a frame until the next', () => { expect(frameAt(frames, 1.9)?.t).toBe(1); expect(frameAt(frames, -5)?.t).toBe(0); });
  it('clipTimes runs 0.4 s before to ms after', () => { const t = clipTimes(10, 1000, 10); expect(t[0]).toBeCloseTo(9.6); expect(t.length).toBe(15); });
  it('stillFrames ends on the rest frame', () => expect(stillFrames(frames, 1, [0, 1000]).map((f) => f.t)).toEqual([1, 2, 3]));
});
