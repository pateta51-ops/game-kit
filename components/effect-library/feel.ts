// Impact feel as pure arithmetic on time (ms) and a seed: hit stop, trauma shake with a frequency cap, afterimages,
// and a flash limiter. Opt-in; nothing here draws or reads the page.
import { clamp, pulse } from './particles.ts';

/** Hit stop: the time the picture shows when the clock reads `t`. The picture holds at `contact` for `hold` ms, the
 * rest runs on; shorten the beat's impact by `hold` to keep the total unchanged. `kill` holds longer. */
export const HOLD = { hold: 100, kill: 160 };
export function holdMs(kill = false): number {
  return kill ? HOLD.kill : HOLD.hold;
}
export function stopTime(t: number, contact: number, hold: number): number {
  return t <= contact ? t : t < contact + hold ? contact : t - hold;
}

/** Eiserloh trauma: damage 0.55 + 0.12 per point, 1 on a kill, 0.35 when blocked. */
export function trauma(damage: number, o: { kill?: boolean; blocked?: boolean } = {}): number {
  return o.kill ? 1 : o.blocked ? 0.35 : clamp(0.55 + 0.12 * damage);
}
/** Trauma left `t` ms after a hit, linear to 0 over `decayMs`. */
export const traumaAt = (t0: number, t: number, decayMs = 600): number => clamp(t0 - (t0 * Math.max(0, t)) / decayMs, 0, 1);

const MAX_HZ = 25;
const wob = (t: number, hz: number, ph: number, speed: number): number =>
  Math.sin(2 * Math.PI * Math.min(hz * Math.max(speed, 0), MAX_HZ) * (t / 1000) + ph);

/** Shake offset (px, deg) at `t` ms after the hit: max * trauma^2 * two seeded sines (5-8 Hz and 9-13 Hz). Each
 * frequency is capped at 25 Hz after `speed` (the player's factor, 1 = normal) so a quick setting never aliases. */
/** K435-8: `sine` instead: x = amplitude * (1 - t/decayMs)^decay * sin(2 pi frequency t), y and rot 0 (t0 unused) */
export function shakeAt(t: number, t0: number, o: { seed?: number; max?: number; rot?: number; decayMs?: number; speed?: number; sine?: { amplitude: number; frequency: number; decay?: number } } = {}): { x: number; y: number; rot: number } {
  const { seed = 1, max = 12, rot = 2, decayMs = 600, speed = 1, sine } = o;
  if (sine) return { x: sine.amplitude * clamp(1 - Math.max(0, t) / decayMs, 0, 1) ** (sine.decay ?? 2) * wob(t, sine.frequency, 0, speed), y: 0, rot: 0 };
  const k = traumaAt(t0, t, decayMs) ** 2;
  const h = (n: number): number => (Math.imul(seed * 31 + n, 2654435761) >>> 0) / 4294967296;
  const f = (n: number, lo: number, hi: number): number => lo + h(n) * (hi - lo);
  const ax = (a: number): number => wob(t, f(a, 5, 8), h(a + 1) * 6.28, speed) * 0.6 + wob(t, f(a + 2, 9, 13), h(a + 3) * 6.28, speed) * 0.4;
  return { x: max * k * ax(1), y: max * k * ax(11), rot: rot * k * ax(21) };
}

/** Afterimages: the pose `lags` ms earlier, fading with age (default 16, 32, 48 ms). */
export function afterimages<P>(poseAt: (t: number) => P, t: number, lags: number[] = [16, 32, 48]): { pose: P; alpha: number }[] {
  return lags.map((lag, i) => ({ pose: poseAt(Math.max(0, t - lag)), alpha: (lags.length - i) / (lags.length + 1) }));
}

/** One flash bump 0..1 over `ms` from `start`, a fast attack. */
export const flashAt = (t: number, start: number, ms = 160): number => pulse(t, start, start + ms);

/** Flash limit (WCAG 2.3.1): under 3 a second: `max` flashes (default 2) in any `windowMs` (1000), counted per target. `allow`
 * is true and records the flash, or false and the game skips it. Flash the target only, never the page. */
export function createFlashLimiter(max = 2, windowMs = 1000): { allow(target: string, now: number): boolean } {
  const seen = new Map<string, number[]>();
  return {
    allow(target, now) {
      const a = (seen.get(target) ?? []).filter((x) => now - x < windowMs);
      const ok = a.length < max;
      if (ok) a.push(now);
      seen.set(target, a);
      return ok;
    },
  };
}
