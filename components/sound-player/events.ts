// Optional: the events of one action become a few cues, spaced out. The game supplies `cueOf`.

export interface CueHit {
  cue: string;
  /** How many events of the action gave this cue. */
  count: number;
}

export interface CuePlan<E> {
  /** The cue of one event; null: it makes no sound. */
  cueOf: (event: E) => string | null | undefined;
  /** Cue names, the most important first; a cue not listed ranks last. */
  rank?: readonly string[];
  /** At most this many cues for one action (default 3). */
  max?: number;
  /** A cue that is in the action hides the cues listed for it. */
  hides?: Readonly<Record<string, readonly string[]>>;
  /** A cue that sounds alone and is never throttled (the first one listed that is in the action). */
  alone?: readonly string[];
}

/** One hit per cue, counted; the `max` best ranked, in the order they first happened. */
export function cuesFor<E>(events: readonly E[], plan: CuePlan<E>): CueHit[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const c = plan.cueOf(e);
    if (c !== null && c !== undefined) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  for (const k of [...counts.keys()]) for (const h of plan.hides?.[k] ?? []) if (h !== k) counts.delete(h);
  const hits = [...counts].map(([cue, count]) => ({ cue, count }));
  const end = plan.alone?.find((c) => counts.has(c));
  if (end !== undefined) return hits.filter((h) => h.cue === end);
  const r = (c: string): number => {
    const i = plan.rank?.indexOf(c) ?? -1;
    return i < 0 ? 1e9 : i;
  };
  const kept = new Set(
    [...hits]
      .sort((a, b) => r(a.cue) - r(b.cue))
      .slice(0, Math.max(0, plan.max ?? 3))
      .map((h) => h.cue),
  );
  return hits.filter((h) => kept.has(h.cue));
}

export interface EventSoundsOptions<E> {
  plan: CuePlan<E>;
  /** Plays one hit `delayMs` from now: with the player, `(h, delayMs) => sound.play(h.cue, { times: Math.min(h.count, 3), delayMs })`. */
  play: (hit: CueHit, delayMs: number) => void;
  /** False: nothing is played and no spacing is used up (sound off, audio not running). */
  ready?: () => boolean;
  /** Between two cues, also across actions (default 130); a function is read at each action. */
  gapMs?: number | (() => number);
  /** The same cue asked for again sooner than this is dropped (default 120). */
  repeatMs?: number;
  /** No more than `maxPerWindow` (6) starts in any `windowMs` (1000). */
  windowMs?: number;
  maxPerWindow?: number;
  /** A cue that would start later than this after its action is dropped (default 1000). */
  maxLagMs?: number;
  now?: () => number;
}

export interface EventSounds<E> {
  playEvents: (events: readonly E[]) => void;
  /** One cue, through the same spacing and throttles. */
  playCue: (cue: string, count?: number) => void;
}

export function createEventSounds<E>(o: EventSoundsOptions<E>): EventSounds<E> {
  const now = o.now ?? (() => performance.now());
  const lastAsked = new Map<string, number>();
  let starts: number[] = [];
  let nextAt = -Infinity;
  const play = (hits: readonly CueHit[]): void => {
    if (hits.length === 0 || o.ready?.() === false) return;
    const t0 = now();
    const gap = typeof o.gapMs === 'function' ? o.gapMs() : (o.gapMs ?? 130);
    const win = o.windowMs ?? 1000;
    for (const hit of hits) {
      const alone = o.plan.alone?.includes(hit.cue) ?? false;
      const asked = lastAsked.get(hit.cue);
      if (!alone && asked !== undefined && t0 - asked < (o.repeatMs ?? 120)) continue;
      const at = Math.max(t0, nextAt);
      starts = starts.filter((t) => t > at - win);
      if (!alone && (starts.length >= (o.maxPerWindow ?? 6) || at - t0 > (o.maxLagMs ?? 1000))) continue;
      try {
        o.play(hit, at - t0);
      } catch {
        // a sound never stops the game
      }
      lastAsked.set(hit.cue, t0);
      starts.push(at);
      nextAt = at + gap;
    }
  };
  return {
    playEvents: (events) => play(cuesFor(events, o.plan)),
    playCue: (cue, count = 1) => play([{ cue, count }]),
  };
}

/** The first cue of the chain the player can play (the card's own, then its family, then the generic one); null: none. */
export function resolveCue(chain: readonly (string | null | undefined)[], canPlay: (cue: string) => boolean): string | null {
  for (const c of chain) if (c !== null && c !== undefined && canPlay(c)) return c;
  return null;
}

export interface TrailSoundsOptions<A> {
  /** Called with the actions added since the last feed, oldest first. */
  onNew: (actions: readonly A[]) => void;
  /** Tells a replaced action from the one seen last (default: same object); a different one resyncs silently. */
  same?: (a: A, b: A) => boolean;
}

/** Cues only from the action trail: the first feed (load, resume), an undo or a rewritten trail is silent. */
export function createTrailSounds<A>(o: TrailSoundsOptions<A>): { feed: (trail: readonly A[]) => void; reset: () => void } {
  let mark = -1;
  let last: A | undefined;
  return {
    feed(trail) {
      const was = mark;
      const prev = last;
      mark = trail.length;
      last = trail[mark - 1];
      if (was < 0 || mark <= was) return;
      if (was > 0 && prev !== undefined && !(o.same ?? Object.is)(trail[was - 1] as A, prev)) return;
      o.onNew(trail.slice(was));
    },
    reset() {
      mark = -1;
      last = undefined;
    },
  };
}
