// The choice probe: an observation-only hook the engine calls where it settles a choice without asking (forced, random,
// fixed by the text). Off in the game: `note` does nothing and `listening` is false, so the engine builds nothing.
export interface Probe<D> {
  readonly listening: boolean;
  note(d: D | (() => D)): void;
  /** Run `fn` with the probe recording; the previous listener is put back after. */
  trace<T>(fn: () => T): { result: T; notes: D[] };
}

export function createProbe<D>(): Probe<D> {
  let on: ((d: D) => void) | null = null;
  return {
    get listening() {
      return on !== null;
    },
    note(d) {
      if (on !== null) on(typeof d === 'function' ? (d as () => D)() : d);
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
  };
}
