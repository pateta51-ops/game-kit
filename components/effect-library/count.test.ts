// Count-up with a hand-driven clock: the shown number moves, the stored one is never written.
import { describe, expect, it } from 'vitest';
import type { Speed } from '../motion-frame/index.ts';
import { countAt, countUp } from './count.ts';

function clock() {
  let q: ((now: number) => void)[] = [];
  let t = 0;
  let cancelled = 0;
  return {
    frame: (f: (now: number) => void): number => q.push(f),
    cancel: (): void => {
      cancelled += 1;
    },
    now: (): number => t,
    cancelled: (): number => cancelled,
    waiting: (): number => q.length,
    step(ms: number): void {
      t += ms;
      const run = q;
      q = [];
      run.forEach((f) => {
        f(t);
      });
    },
  };
}

describe('count-up', () => {
  it('countAt eases out from `from` to the value and clamps', () => {
    expect([countAt(40, 0), countAt(40, 0.5), countAt(40, 1), countAt(40, 2), countAt(40, -1)]).toEqual([0, 35, 40, 40, 0]);
    expect([countAt(10, 0, 20), countAt(10, 1, 20)]).toEqual([20, 10]);
  });
  it('shows rising numbers and ends exactly on the value', () => {
    const c = clock();
    const shown: number[] = [];
    countUp({ value: 40, speed: () => 1, show: (n) => shown.push(n), ...c });
    expect(shown).toEqual([0]);
    for (let i = 0; i < 8; i++) c.step(100);
    expect(shown.at(-1)).toBe(40);
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
    expect(shown.length).toBe(8);
    expect(c.waiting()).toBe(0);
  });
  it('the speed factor scales the time', () => {
    const c = clock();
    const shown: number[] = [];
    countUp({ value: 40, ms: 1000, speed: () => 0.5, show: (n) => shown.push(n), ...c });
    c.step(250);
    expect(shown.at(-1)).toBe(35);
    c.step(250);
    expect(shown.at(-1)).toBe(40);
  });
  it('motion Off: the value at once and no frame asked', () => {
    for (const s of ['instant', 0, -1] as Speed[]) {
      const c = clock();
      const shown: number[] = [];
      countUp({ value: 9, speed: () => s, show: (n) => shown.push(n), ...c })();
      expect([shown, c.waiting()]).toEqual([[9], 0]);
    }
  });
  it('motion going Off half way ends the count on the value', () => {
    const c = clock();
    const shown: number[] = [];
    let s: Speed = 1;
    countUp({ value: 40, speed: () => s, show: (n) => shown.push(n), ...c });
    c.step(100);
    s = 'instant';
    c.step(16);
    expect([shown.at(-1), c.waiting()]).toEqual([40, 0]);
  });
  it('stop jumps to the value once; later frames and stops show nothing more', () => {
    const c = clock();
    const shown: number[] = [];
    const stop = countUp({ value: 40, speed: () => 1, show: (n) => shown.push(n), ...c });
    c.step(100);
    stop();
    stop();
    c.step(100);
    expect(shown).toEqual([0, countAt(40, 100 / 700), 40]);
    expect(c.cancelled()).toBe(1);
  });
  it('nothing to count, or no frames to count on: the value at once', () => {
    const shown: number[] = [];
    countUp({ value: 5, from: 5, speed: () => 1, show: (n) => shown.push(n), ...clock() });
    countUp({ value: 0, speed: () => 1, show: (n) => shown.push(n), ...clock() });
    countUp({ value: 7, speed: () => 1, show: (n) => shown.push(n) });
    expect(shown).toEqual([5, 0, 7]);
  });
  it('counts down too', () => {
    const c = clock();
    const shown: number[] = [];
    countUp({ value: 0, from: 10, ms: 100, speed: () => 1, show: (n) => shown.push(n), ...c });
    c.step(50);
    c.step(50);
    expect(shown).toEqual([10, 1, 0]);
  });
});
