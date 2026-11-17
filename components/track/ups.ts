export const LIGHT_MS = 520;
export const SPARKS = 22;
export const SPARK_MS = 800;

/** Where spark `k` of `SPARKS` flies to: an even spread with a spiral offset and a varied reach (STCC `sparks`). */
export function sparkFlight(k: number, reach: number): { dx: number; dy: number } {
  const a = (k / SPARKS) * Math.PI * 2 + k * 0.7;
  const far = reach * (0.5 + ((k * 37) % 10) / 20);
  return { dx: Math.cos(a) * far, dy: Math.sin(a) * far };
}

/** After a hop with no badge the number waits half the light's time. */
export const QUIET_MS = LIGHT_MS * 0.5;

export interface TrackUp {
  id: string;
  from: number;
  to: number;
  multFrom: number;
  multTo: number;
}
export type TrackState = Record<string, { value: number; mult?: number }>;

/** The tracks whose value went up between two states (forward only), with their multipliers. */
export function trackUps(before: TrackState, after: TrackState): TrackUp[] {
  const out: TrackUp[] = [];
  for (const [id, a] of Object.entries(after)) {
    const b = before[id];
    if (b && a.value > b.value) out.push({ id, from: b.value, to: a.value, multFrom: b.mult ?? 1, multTo: a.mult ?? 1 });
  }
  return out;
}

export interface TrackLeg {
  /** put every track as it was (old number, old fill, new badge hidden) before the board shows */
  hold: () => void;
  /** hop the tracks one after another */
  arrive: () => Promise<void>;
  /** put the final state back, also when the leg is skipped */
  release: () => void;
}

/**
 * The prime / hold / release pattern as one leg for a game's animation queue: no ups, no `before` or `can` false (reduced motion,
 * speed 0) gives `null`. The game supplies `prime(up)`, `hop(up)` and `restore(up)` for its own elements.
 */
export function planTrackUps(
  before: TrackState | null,
  after: TrackState,
  fns: { prime: (u: TrackUp) => void; hop: (u: TrackUp) => Promise<void>; restore: (u: TrackUp) => void; can?: boolean },
): TrackLeg | null {
  if (fns.can === false || before === null) return null;
  const ups = trackUps(before, after);
  if (ups.length === 0) return null;
  return {
    hold: () => ups.forEach(fns.prime),
    arrive: async () => {
      for (const u of ups) await fns.hop(u);
    },
    release: () => ups.forEach(fns.restore),
  };
}
