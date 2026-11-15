// The playing half: a queue of beats, each a timeline run on timers. It draws nothing itself: the verbs do.
import { buildTimeline, type MotionSpec, type Stage, type Timeline, type VerbCall } from './timeline';

export type Speed = number | 'instant';
/** Starts a verb call; may return its finish (called once: at the call's end, or early on a skip). */
export type Verb<C = undefined> = (call: VerbCall, run: Run<C>) => undefined | (() => void);
export interface Run<C = undefined> {
  /** counts up, one per beat played */
  id: number;
  timeline: Timeline;
  context: C;
}

export interface VerbRegistry<C = undefined> {
  register(name: string, verb: Verb<C>): void;
  has(name: string): boolean;
  get(name: string): Verb<C> | undefined;
  names(): string[];
}
export function createVerbs<C = undefined>(): VerbRegistry<C> {
  const m = new Map<string, Verb<C>>();
  return {
    register: (name, verb) => void m.set(name, verb),
    has: (name) => m.has(name),
    get: (name) => m.get(name),
    names: () => [...m.keys()],
  };
}

/** One entry per event kind, or the type check fails: `satisfies BeatTable<Event['kind']>`. */
export type BeatTable<K extends string> = Record<K, readonly string[]>;

export interface PlayerOptions<C = undefined> {
  specs: Readonly<Record<string, MotionSpec>>;
  /** by the spec's `stage` field; a spec without one uses `default` */
  stages: Readonly<Record<string, Stage>>;
  verbs: VerbRegistry<C>;
  /** read when a beat starts */
  speed: () => Speed;
  context: C;
  onCue?: (cue: string, beat: string) => void;
  onBeatStart?: (run: Run<C>) => void;
  onBeatEnd?: (run: Run<C>) => void;
  /** a beat that could not play (no spec, a zone not on the stage, a verb that threw); the game goes on */
  onProblem?: (message: string) => void;
}
export interface PlayOptions {
  onEnd?: () => void;
}
export interface MotionPlayer {
  /** queue a beat by name, or a spec built by the game (a template filled with live actors) */
  play(beat: string | MotionSpec, opts?: PlayOptions): void;
  /** a rare or once beat is playing or queued */
  busy(): boolean;
  /** beats playing or queued */
  pending(): number;
  /** everything playing and queued jumps to its end state: verbs finish, end callbacks fire, cues not yet due are dropped */
  skipAll(): void;
  subscribe(listener: () => void): () => void;
}

interface Item {
  spec: MotionSpec;
  onEnd: (() => void) | undefined;
}
type Timer = ReturnType<typeof setTimeout>;
interface Current<C> {
  item: Item;
  run: Run<C>;
  timers: Set<Timer>;
  open: Set<() => void>;
}

const blocks = (s: MotionSpec): boolean => s.frequency === 'rare' || s.frequency === 'once';

export function createMotionPlayer<C = undefined>(o: PlayerOptions<C>): MotionPlayer {
  const queue: Item[] = [];
  const subs = new Set<() => void>();
  let cur: Current<C> | null = null;
  let runs = 0;
  let skipping = false;
  const emit = (): void => {
    subs.forEach((f) => {
      f();
    });
  };
  const safe = (what: string, f: () => void): void => {
    try {
      f();
    } catch (e) {
      o.onProblem?.(`${what}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const cue = (c: string, beat: string): void => {
    safe(`cue ${c}`, () => o.onCue?.(c, beat));
  };

  const finish = (): void => {
    const c = cur;
    if (c === null) return;
    cur = null;
    c.timers.forEach((t) => {
      clearTimeout(t);
    });
    c.open.forEach((f) => {
      safe(`${c.run.timeline.id} finish`, f);
    });
    safe(`${c.run.timeline.id} end`, () => o.onBeatEnd?.(c.run));
    safe(`${c.run.timeline.id} onEnd`, () => c.item.onEnd?.());
  };

  const start = (item: Item, factor: number): void => {
    const { spec } = item;
    const stage = o.stages[spec.stage ?? 'default'];
    if (stage === undefined) throw new Error(`motion-frame ${spec.id}: stage ${String(spec.stage)} is not known`);
    const timeline = buildTimeline(spec, stage, factor);
    const run: Run<C> = { id: ++runs, timeline, context: o.context };
    const timers = new Set<Timer>();
    const open = new Set<() => void>();
    const me: Current<C> = { item, run, timers, open };
    cur = me;
    const at = (ms: number, f: () => void): void => {
      const t = setTimeout(() => {
        timers.delete(t);
        f();
      }, ms);
      timers.add(t);
    };
    safe(`${spec.id} start`, () => o.onBeatStart?.(run));
    for (const call of run.timeline.calls) {
      // both timers are set now, so a step's finish comes before the start of the step that follows it
      let done: (() => void) | undefined;
      at(call.t, () => {
        safe(`${spec.id} ${call.verb}`, () => {
          done = o.verbs.get(call.verb)?.(call, run);
        });
        if (done !== undefined) open.add(done);
      });
      at(call.t + call.dur, () => {
        const d = done;
        if (d === undefined) return;
        open.delete(d);
        safe(`${spec.id} ${call.verb} finish`, d);
      });
    }
    for (const c of run.timeline.cues)
      at(c.t, () => {
        cue(c.cue, spec.id);
      });
    at(run.timeline.ms, () => {
      if (cur !== me) return;
      finish();
      next();
      emit();
    });
  };

  const next = (): void => {
    while (cur === null && !skipping) {
      const item = queue.shift();
      if (item === undefined) return;
      const speed = o.speed();
      if (speed === 'instant' || !(speed > 0)) {
        // no timeline is built; the cues still sound, in order
        [...(item.spec.sound ?? [])]
          .sort((a, b) => a.t - b.t)
          .forEach((c) => {
            cue(c.cue, item.spec.id);
          });
        safe(`${item.spec.id} onEnd`, () => item.onEnd?.());
        continue;
      }
      try {
        start(item, speed);
      } catch (e) {
        cur = null;
        o.onProblem?.(e instanceof Error ? e.message : String(e));
        safe(`${item.spec.id} onEnd`, () => item.onEnd?.());
      }
    }
  };

  return {
    play(beat, opts) {
      const spec = typeof beat === 'string' ? o.specs[beat] : beat;
      if (spec === undefined) {
        o.onProblem?.(`motion-frame: no spec named ${beat as string}`);
        safe('onEnd', () => opts?.onEnd?.());
        return;
      }
      queue.push({ spec, onEnd: opts?.onEnd });
      next();
      emit();
    },
    busy: () => (cur !== null && blocks(cur.item.spec)) || queue.some((i) => blocks(i.spec)),
    pending: () => (cur === null ? 0 : 1) + queue.length,
    skipAll() {
      // a play() from an end callback waits until every end callback has fired
      const waiting = queue.splice(0);
      skipping = true;
      finish();
      for (const i of waiting) safe(`${i.spec.id} onEnd`, () => i.onEnd?.());
      skipping = false;
      next();
      emit();
    },
    subscribe(f) {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}

/** The game's speed setting with the system's reduced-motion wish: instant when it is set. */
export function withReducedMotion(speed: Speed, reduced = prefersReducedMotion()): Speed {
  return reduced ? 'instant' : speed;
}
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Any press or key on `target` skips what plays; never swallows the input. Returns the unbind. */
export function skipOnInput(player: MotionPlayer, target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>): () => void {
  const skip = (): void => {
    if (player.pending() > 0) player.skipAll();
  };
  target.addEventListener('pointerdown', skip, { capture: true });
  target.addEventListener('keydown', skip, { capture: true });
  return () => {
    target.removeEventListener('pointerdown', skip, { capture: true });
    target.removeEventListener('keydown', skip, { capture: true });
  };
}
