// K218: the hand's arithmetic, no React. The arc is Unstoppable's fanOf (src/ui/scanned/geometry.ts: angle step capped, total
// capped, drop = radius * (1 - cos)); the width fit, the neighbours' slide and the speed are Imperium's FloatingHand/table.css.
import { prefersReducedMotion, type Speed } from '../motion-frame/index.ts';

export interface Tilt {
  /** Largest angle between two neighbours, degrees. */
  readonly step: number;
  /** Largest angle across the whole fan, degrees. */
  readonly total: number;
  /** The arc's radius, in card widths: a card sits `radius * (1 - cos angle)` card widths below the middle one. */
  readonly radius: number;
}
/** K311 (owner, 18 Nov): the gentle arc is the default. */
export const TILT: Tilt = { step: 1.5, total: 14, radius: 20 };

/** Card `i` of `n`: `k` its place from the middle (-2..2 for 5), `angle` degrees, `drop` in card widths. */
export function fanOf(i: number, n: number, tilt: Partial<Tilt> = {}): { k: number; angle: number; drop: number } {
  const t = { ...TILT, ...tilt };
  const k = i - (n - 1) / 2;
  if (n <= 1) return { k, angle: 0, drop: 0 };
  const angle = k * Math.min(t.step, t.total / (n - 1));
  return { k, angle, drop: t.radius * (1 - Math.cos((angle * Math.PI) / 180)) };
}

/** Distance between two neighbours' strips: as wide as `max`, narrower when `n` cards must fit `width` (the same as the CSS `--step`). */
export const stepOf = (n: number, width: number, cardWidth: number, max: number, margin = 0): number =>
  Math.min(max, (width - cardWidth - margin) / Math.max(1, n - 1));

/** How far (in steps) card `i` slides away from the lifted card `lifted`: the nearest one step, then .65, .4, and .2 for the rest (the CSS `--spread`). */
export const SPREAD = [1, 0.65, 0.4, 0.2] as const;
export const spreadOf = (i: number, lifted: number | null): number => {
  if (lifted === null || i === lifted) return 0;
  const s = SPREAD[Math.abs(i - lifted) - 1] ?? 0.2;
  return i < lifted ? -s : s;
};

/** A slide never leaves the fan's own band: the clamp of the CSS `--shift` (all in px). */
export const shiftOf = (spread: number, k: number, step: number, cardWidth: number, width: number, pad = 0): number => {
  const lo = cardWidth / 2 - k * step - width / 2 + pad;
  const hi = width / 2 - cardWidth / 2 - k * step - pad;
  return Math.max(lo, Math.min(hi, spread * step));
};

export const HAND_MS = 280;
export const RISE_MS = 300;
export const PLAY_MS = 420;
/** Milliseconds of an animation at `speed`; 0 for speed 0, 'instant' or reduced motion. */
export const msAt = (base: number, speed: Speed, reduced: boolean = prefersReducedMotion()): number =>
  reduced || speed === 'instant' || speed <= 0 ? 0 : base / speed;
