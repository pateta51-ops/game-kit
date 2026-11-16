// Five haptic ticks (armed, sent, refused, land, impact) with caps and a setting; a snapped motion drops its pending tick.
export type Tick = 'armed' | 'sent' | 'refused' | 'land' | 'impact';

/** navigator.vibrate patterns in ms (Android Chrome only; iOS Safari has no vibrate, so there it does nothing). */
export const TICK_MS: Record<Tick, number | number[]> = { armed: 8, sent: 14, refused: [20, 40, 20], land: 10, impact: 28 };

/**
 * `enabled` is the game's Haptics setting. `vibrate` defaults to navigator.vibrate; any failure is swallowed.
 * `land(key)` plays at most once per key (the new state), `impact(key)` at most once per strike.
 * `later(kind, key)` returns the tick for a motion's landing or hit: `snap()` (a touch that finishes the motion) drops every
 * pending one, so no tick follows a snapped motion.
 */
export function createHaptics(opts: { enabled?: () => boolean; vibrate?: (p: number | number[]) => unknown } = {}) {
  const buzz = (k: Tick) => {
    if (opts.enabled && !opts.enabled()) return;
    try {
      const v = opts.vibrate ?? (typeof navigator !== 'undefined' && 'vibrate' in navigator ? (p: number | number[]) => navigator.vibrate(p) : undefined);
      v?.(TICK_MS[k]);
    } catch {
      /* a failed tick is not an error to show */
    }
  };
  const last: { land?: unknown; impact?: unknown } = {};
  const pending = new Set<object>();
  const once = (k: 'land' | 'impact', key: unknown) => {
    if (k in last && last[k] === key) return;
    last[k] = key;
    buzz(k);
  };
  return {
    armed: () => buzz('armed'),
    sent: () => buzz('sent'),
    refused: () => buzz('refused'),
    land: (key: unknown) => once('land', key),
    impact: (key: unknown) => once('impact', key),
    later(kind: 'land' | 'impact', key: unknown) {
      const t = {};
      pending.add(t);
      return () => {
        if (pending.delete(t)) once(kind, key);
      };
    },
    snap: () => pending.clear(),
  };
}
