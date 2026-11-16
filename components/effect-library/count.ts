// Count-up: animates the number shown, never the stored one. No DOM: the game's `show` writes it.
import type { Speed } from '../motion-frame';

/** The number shown at progress k (0..1) of a count from `from` to `value`, easing out. */
export const countAt = (value: number, k: number, from = 0): number => Math.round(from + (value - from) * (1 - (1 - Math.min(1, Math.max(0, k))) ** 3));

export interface CountOptions {
  value: number;
  from?: number;
  /** at speed 1 (default 700) */
  ms?: number;
  /** read at the start (the factor) and at every frame: `'instant'` ends the count at once */
  speed: () => Speed;
  show: (n: number) => void;
  frame?: (f: (now: number) => void) => number;
  cancel?: (id: number) => void;
  now?: () => number;
}

/** Counts up to `value`; the returned function jumps to the end (call it on input, and when the number leaves the screen). */
export function countUp(o: CountOptions): () => void {
  const from = o.from ?? 0;
  const s = o.speed();
  const frame = o.frame ?? (typeof requestAnimationFrame === 'function' ? (f: (now: number) => void): number => requestAnimationFrame(f) : undefined);
  const ms = (o.ms ?? 700) * (typeof s === 'number' ? s : 0);
  if (!frame || !(ms > 0) || from === o.value) {
    o.show(o.value);
    return () => undefined;
  }
  const cancel = o.cancel ?? (typeof cancelAnimationFrame === 'function' ? (id: number): void => cancelAnimationFrame(id) : undefined);
  const now = o.now ?? ((): number => performance.now());
  const start = now();
  let id = 0;
  let stopped = false;
  const finish = (): void => {
    if (stopped) return;
    stopped = true;
    cancel?.(id);
    o.show(o.value);
  };
  const tick = (t: number): void => {
    if (stopped) return;
    const k = (t - start) / ms;
    if (k >= 1 || o.speed() === 'instant') {
      finish();
      return;
    }
    o.show(countAt(o.value, k, from));
    id = frame(tick);
  };
  o.show(from);
  id = frame(tick);
  return finish;
}
