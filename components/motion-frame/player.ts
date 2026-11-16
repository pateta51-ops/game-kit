// The playing half: a queue of beats, each a timeline run on timers. It draws nothing itself: the verbs do.
import { buildTimeline, withVariant, type MotionSpec, type Place, type Stage, type Timeline, type VerbCall } from './timeline.ts';

export type Speed = number | 'instant';
/** Starts a verb call; may return its finish (called once: at the call's end, or early on a skip). */
export type Verb<C = undefined> = (call: VerbCall, run: Run<C>) => undefined | (() => void);
export interface Run<C = undefined> {
  /** counts up, one per beat played */
  id: number;
  timeline: Timeline;
  context: C;
  /** set for a beat of `playRun`: its place, and k of n for a chip ("2 of 3") */
  place?: RunPlace;
}
export interface RunPlace {
  at: Place;
  k: number;
  of: number;
}
/** k counts from 1 */
export const placeOf = (k: number, of: number): Place => (of <= 1 ? 'lone' : k <= 1 ? 'first' : k >= of ? 'last' : 'middle');
export type Ended = 'done' | 'skipped';
/** What a big beat was resolved between; the screen draws `before` while the gate is open */
export interface GateData {
  before?: unknown;
  after?: unknown;
}
export interface GateState extends GateData {
  beat: string;
  /** a step marked `leave` has started: the scrim may fade with the return */
  leaving: boolean;
  place?: RunPlace;
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
  /** read when a beat starts: true plays the spec's `reduced` variant at factor 1 (instant without one); then speed need not be `withReducedMotion` */
  reduced?: () => boolean;
  /** a `whenVisible` beat waits at the head of the queue while this is false; call `visibilityChanged()` when it turns true */
  visible?: () => boolean;
  /** factor for `read` steps, from the motion factor; default never under 1 (Slow lengthens, Quick keeps) */
  pace?: (factor: number) => number;
}
export interface PlayOptions {
  onEnd?: () => void;
  /** like onEnd, told whether the beat ran out (`done`) or was skipped or hurried (`skipped`) */
  onEnded?: (how: Ended) => void;
  /** opens the gate while this beat is playing or queued; input is never held */
  gate?: GateData;
  /** starts at once, alongside what plays, outside the queue (for `constant` beats that overlap); `skipAll` still ends it */
  parallel?: boolean;
}
export interface MotionPlayer {
  /** queue a beat by name, or a spec built by the game (a template filled with live actors) */
  play(beat: string | MotionSpec, opts?: PlayOptions): void;
  /** a rare or once beat is playing or queued */
  busy(): boolean;
  /** beats playing (parallel ones too) or queued */
  pending(): number;
  /** everything playing and queued jumps to its end state: verbs finish, end callbacks fire, cues not yet due are dropped */
  skipAll(): void;
  subscribe(listener: () => void): () => void;
  /** like skipAll, but beats whose spec says `hurry: 'keep'` play on (and queued ones still play) */
  hurry(): void;
  /** the open gate: the first playing or queued beat played with `gate` */
  gate(): GateState | null;
  /** calls `f` now when no gate is open, else when the gate closes */
  afterGate(f: () => void): void;
  /** the game's `visible()` may have turned true: a waiting `whenVisible` beat starts now */
  visibilityChanged(): void;
  /** several beats under one stage: each plays its `places` variant (lone, first, middle, last); `onEnd` fires after the last */
  playRun(beats: readonly (string | MotionSpec)[], opts?: Omit<PlayOptions, 'parallel'>): void;
}

interface Item {
  spec: MotionSpec;
  onEnd: ((how: Ended) => void) | undefined;
  gate?: GateData | undefined;
  place?: RunPlace;
}
type Timer = ReturnType<typeof setTimeout>;
interface Current<C> {
  item: Item;
  run: Run<C>;
  timers: Set<Timer>;
  open: Set<() => void>;
  leaving: boolean;
}

const blocks = (s: MotionSpec): boolean => s.frequency === 'rare' || s.frequency === 'once';

export function createMotionPlayer<C = undefined>(o: PlayerOptions<C>): MotionPlayer {
  const queue: Item[] = [];
  const subs = new Set<() => void>();
  let cur: Current<C> | null = null;
  const live = new Set<Current<C>>();
  let runs = 0;
  let skipping = false;
  const waiters: (() => void)[] = [];
  const gate = (): GateState | null => {
    const c = [...live].find((x) => x.item.gate !== undefined);
    const i = c?.item ?? queue.find((x) => x.gate !== undefined);
    if (i?.gate === undefined) return null;
    return { ...i.gate, beat: i.spec.id, leaving: c?.leaving ?? false, ...(i.place && { place: i.place }) };
  };
  const emit = (): void => {
    subs.forEach((f) => {
      f();
    });
    while (waiters.length > 0 && gate() === null) {
      const f = waiters.shift();
      if (f) safe('afterGate', f);
    }
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

  const finish = (c: Current<C>, how: Ended): void => {
    live.delete(c);
    if (cur === c) cur = null;
    c.timers.forEach((t) => {
      clearTimeout(t);
    });
    c.open.forEach((f) => {
      safe(`${c.run.timeline.id} finish`, f);
    });
    safe(`${c.run.timeline.id} end`, () => o.onBeatEnd?.(c.run));
    safe(`${c.run.timeline.id} onEnd`, () => c.item.onEnd?.(how));
  };

  const start = (item: Item, spec: MotionSpec, factor: number, parallel = false): void => {
    const stage = o.stages[spec.stage ?? 'default'];
    if (stage === undefined) throw new Error(`motion-frame ${spec.id}: stage ${String(spec.stage)} is not known`);
    const timeline = buildTimeline(spec, stage, factor, o.pace?.(factor));
    const run: Run<C> = { id: ++runs, timeline, context: o.context, ...(item.place && { place: item.place }) };
    const timers = new Set<Timer>();
    const open = new Set<() => void>();
    const me: Current<C> = { item, run, timers, open, leaving: false };
    live.add(me);
    if (!parallel) cur = me;
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
    const leave = item.gate && run.timeline.calls.find((c) => c.step.leave === true);
    if (leave)
      at(leave.t, () => {
        me.leaving = true;
        emit();
      });
    for (const c of run.timeline.cues)
      at(c.t, () => {
        cue(c.cue, spec.id);
      });
    at(run.timeline.ms, () => {
      if (!live.has(me)) return;
      finish(me, 'done');
      next();
      emit();
    });
  };

  const next = (): void => {
    while (cur === null && !skipping) {
      if (queue[0]?.spec.whenVisible === true && o.visible?.() === false) return;
      const item = queue.shift();
      if (item === undefined) return;
      begin(item, false);
    }
  };
  const begin = (item: Item, parallel: boolean): void => {
    const speed = o.speed();
    const reduced = o.reduced?.() === true;
    const { spec: base } = item;
    const spec = reduced ? withVariant(base, base.reduced) : withVariant(base, item.place && base.places?.[item.place.at]);
    if (speed === 'instant' || !(speed > 0) || (reduced && base.reduced === undefined)) {
      // no timeline is built; the cues still sound, in order
      [...(spec.sound ?? [])]
        .sort((a, b) => a.t - b.t)
        .forEach((c) => {
          cue(c.cue, item.spec.id);
        });
      safe(`${item.spec.id} onEnd`, () => item.onEnd?.('done'));
      return;
    }
    try {
      start(item, spec, reduced ? 1 : speed, parallel);
    } catch (e) {
      if (!parallel) cur = null;
      o.onProblem?.(e instanceof Error ? e.message : String(e));
      safe(`${item.spec.id} onEnd`, () => item.onEnd?.('done'));
    }
  };

  const skip = (snap: (i: Item) => boolean): void => {
    // a play() from an end callback waits until every end callback has fired
    const waiting = queue.filter(snap);
    queue.splice(0, queue.length, ...queue.filter((i) => !snap(i)));
    skipping = true;
    [...live]
      .filter((c) => snap(c.item))
      .forEach((c) => {
        finish(c, 'skipped');
      });
    for (const i of waiting) safe(`${i.spec.id} onEnd`, () => i.onEnd?.('skipped'));
    skipping = false;
    next();
    emit();
  };
  const ender = (p: PlayOptions | undefined): ((how: Ended) => void) | undefined =>
    p?.onEnd || p?.onEnded
      ? (how) => {
          p.onEnd?.();
          p.onEnded?.(how);
        }
      : undefined;
  const lookup = (beat: string | MotionSpec, onEnd: ((how: Ended) => void) | undefined): MotionSpec | undefined => {
    const spec = typeof beat === 'string' ? o.specs[beat] : beat;
    if (spec === undefined) {
      o.onProblem?.(`motion-frame: no spec named ${beat as string}`);
      safe('onEnd', () => onEnd?.('done'));
    }
    return spec;
  };

  return {
    play(beat, opts) {
      const end = ender(opts);
      const spec = lookup(beat, end);
      if (spec === undefined) return;
      if (opts?.parallel === true) {
        // during a skip it jumps to its end at once, like everything else
        if (skipping) safe(`${spec.id} onEnd`, () => end?.('skipped'));
        else begin({ spec, onEnd: end, gate: opts.gate }, true);
      }
      else {
        queue.push({ spec, onEnd: end, gate: opts?.gate });
        next();
      }
      emit();
    },
    playRun(beats, opts) {
      const end = ender(opts);
      const specs = beats.flatMap((b) => lookup(b, undefined) ?? []);
      if (specs.length === 0) safe('onEnd', () => end?.('done'));
      specs.forEach((spec, k) => {
        queue.push({ spec, onEnd: k === specs.length - 1 ? end : undefined, gate: opts?.gate, place: { at: placeOf(k + 1, specs.length), k: k + 1, of: specs.length } });
      });
      next();
      emit();
    },
    hurry() {
      skip((i) => i.spec.hurry !== 'keep');
    },
    gate,
    afterGate(f) {
      waiters.push(f);
      emit();
    },
    visibilityChanged() {
      next();
      emit();
    },
    busy: () => [...live].some((c) => blocks(c.item.spec)) || queue.some((i) => blocks(i.spec)),
    pending: () => live.size + queue.length,
    skipAll() {
      skip(() => true);
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

export interface AutomationEnv {
  navigator?: { webdriver?: boolean; userAgent?: string };
  location?: { search?: string };
}
/** An automated browser (`navigator.webdriver`) that did not ask for motion: no `marker` in its user agent, no `?motion=on`. */
export function automatedWithoutMotion(marker = 'KitMotion', env: AutomationEnv = globalThis): boolean {
  if (env.navigator?.webdriver !== true) return false;
  if (env.navigator.userAgent?.includes(marker) === true) return false;
  return new URLSearchParams(env.location?.search ?? '').get('motion') !== 'on';
}
/** The speed, or instant in an automated browser that did not ask for motion. */
export function withAutomationOff(speed: Speed, marker?: string, env?: AutomationEnv): Speed {
  return automatedWithoutMotion(marker, env) ? 'instant' : speed;
}
/** Puts the speed on the page: `data-motion` (`off`, or `name`) and `--motion-scale` (0 when off). */
export interface MotionSpeedTarget {
  dataset: Record<string, string | undefined>;
  style: { setProperty(k: string, v: string): void };
}
export function putMotionSpeed(
  speed: Speed,
  name = 'on',
  el: MotionSpeedTarget | undefined = typeof document === 'undefined' ? undefined : document.documentElement,
): void {
  if (el === undefined) return;
  const scale = speed === 'instant' || !(speed > 0) ? 0 : speed;
  el.dataset.motion = scale === 0 ? 'off' : name;
  el.style.setProperty('--motion-scale', String(scale));
}
/** Puts `speed()` on the page again whenever the system's reduced-motion setting changes. Returns the unbind. */
export function bindMotionSpeed(
  speed: () => Speed,
  name: () => string = () => 'on',
  el?: MotionSpeedTarget,
  mm: ((q: string) => Pick<MediaQueryList, 'addEventListener' | 'removeEventListener'>) | undefined = typeof matchMedia === 'function' ? matchMedia : undefined,
): () => void {
  if (mm === undefined) return () => undefined;
  const q = mm('(prefers-reduced-motion: reduce)');
  const f = (): void => {
    putMotionSpeed(speed(), name(), el);
  };
  q.addEventListener('change', f);
  return () => {
    q.removeEventListener('change', f);
  };
}

/** Any press or key on `target` hurries what plays (`hurry()`); never swallows the input. Returns the unbind. */
export function hurryOnInput(player: MotionPlayer, target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>): () => void {
  const f = (): void => {
    if (player.pending() > 0) player.hurry();
  };
  target.addEventListener('pointerdown', f, { capture: true });
  target.addEventListener('keydown', f, { capture: true });
  return () => {
    target.removeEventListener('pointerdown', f, { capture: true });
    target.removeEventListener('keydown', f, { capture: true });
  };
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
