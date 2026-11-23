// The choice probe: an observation-only hook the engine calls where it settles a choice without asking (forced, random,
// fixed by the text). Off in the game: `note` does nothing and `listening` is false, so the engine builds nothing.
// K707: the same probe is the run probe: the game's verb dispatch notes `{ kind, id }` (an op, a key, a handler, a clause)
// for each piece it runs outside dry run; `recordRan` (ranLog.ts) logs them per passing test for the inventory.
export interface Probe<D> {
  readonly listening: boolean;
  note(d: D | (() => D)): void;
  /** Run `fn` with the probe recording; the previous listener is put back after. */
  trace<T>(fn: () => T): { result: T; notes: D[] };
}
/** K707: what createProbe returns: a Probe that also takes listeners. */
export interface RunProbe<D> extends Probe<D> {
  /** K707: add a listener that hears every note (beside `trace`, which it does not replace) until the returned stop is called. */
  listen(fn: (d: D) => void): () => void;
}

/** K707: what a game's verb dispatch notes on the run probe, outside dry run. */
export interface RanNote {
  readonly kind: string;
  readonly id: string;
}

export function createProbe<D>(): RunProbe<D> {
  let on: ((d: D) => void) | null = null;
  const subs = new Set<(d: D) => void>();
  return {
    get listening() {
      return on !== null || subs.size > 0;
    },
    note(d) {
      if (on === null && subs.size === 0) return;
      const v = typeof d === 'function' ? (d as () => D)() : d;
      on?.(v);
      for (const s of subs) s(v);
    },
    trace(fn) {
      const notes: D[] = [];
      const before = on;
      on = (d) => notes.push(d);
      try {
        return { result: fn(), notes };
      } finally {
        on = before;
      }
    },
    listen(fn) {
      const f = (d: D): void => fn(d);
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}
