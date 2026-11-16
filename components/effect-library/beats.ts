// Beats as "a number and a place", derived from events by one table, and deltas by subtracting two states. Pure.
import type { Rect } from './slots.ts';

export type Tone = 'harm' | 'gain' | 'status' | 'guard' | 'info';
export interface Beat { anchor: string; text: string; tone: Tone; at?: Rect }
export type BeatRule<E> = (e: E) => Beat | undefined;

/** One table maps an event's kind to its beat. An event with no row, or a row that gives none, still gets a word
 * (`fallback`, e.g. "RESOLVED"): a prevented or blocked effect is a beat too, nothing fires silently. A beat whose
 * anchor has no rect on screen is not drawn (`rectOf` returns undefined); `skipped` lists them for a badge. */
export function beatsFromEvents<E extends { kind: string }>(
  events: E[], table: Record<string, BeatRule<E>>, o: { fallback?: BeatRule<E>; rectOf?: (anchor: string) => Rect | undefined } = {},
): { beats: Beat[]; skipped: Beat[] } {
  const beats: Beat[] = [];
  const skipped: Beat[] = [];
  for (const e of events) {
    const b = table[e.kind]?.(e) ?? o.fallback?.(e);
    if (!b) continue;
    const at = o.rectOf?.(b.anchor);
    if (o.rectOf && !at) skipped.push(b);
    else beats.push(at ? { ...b, at } : b);
  }
  return { beats, skipped };
}

export interface Delta { key: string; delta: number; from: number; text: string; tone: Tone }
/** Per-key count changes between two states: "+2" gain, "−1" harm (healing is a gain; `harmWhenUp` marks a count where
 * more is worse). A key new to `next` is not a change; a key gone from it counts down to 0. The UI never computes a number. */
export function countDeltas(prev: Record<string, number>, next: Record<string, number>, o: { harmWhenUp?: (key: string) => boolean } = {}): Delta[] {
  const out: Delta[] = [];
  for (const [key, from] of Object.entries(prev)) {
    const delta = (next[key] ?? 0) - from;
    if (delta === 0) continue;
    const bad = o.harmWhenUp?.(key) ? delta > 0 : delta < 0;
    out.push({ key, delta, from, text: `${delta > 0 ? '+' : '−'}${String(Math.abs(delta))}`, tone: bad ? 'harm' : 'gain' });
  }
  return out;
}
