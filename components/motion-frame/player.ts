// The playing half: a queue of beats, each a timeline run on timers. It draws nothing itself: the verbs do.
import { buildTimeline, withVariant, type MotionSpec, type Place, type Stage, type Timeline, type VerbCall } from './timeline.ts';

import type { PanFactory, PanSession } from './pan.ts';
import { flyBoard, measureBoard } from './swap.ts';

export type Speed = number | 'instant';
/** K448: a finish may carry `finished`, a promise of the verb's animations: the step ends when both its time and that promise are done (100 ms grace after the time if it never settles) */
export type Finish = (() => void) & { finished?: Promise<unknown> };
/** Starts a verb call; may return its finish (called once: at the call's end, or early on a skip). */
export type Verb<C = undefined> = (call: VerbCall, run: Run<C>) => undefined | Finish;
export interface Run<C = undefined> {
  /** counts up, one per beat played */
  id: number;
  timeline: Timeline;
  context: C;
  data?: unknown;
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
  /** K476: a cue not fired because its beat ended early, once each, in timeline order; every cue goes to onCue or here */
  onDroppedCue?: (cue: string, beat: string, why: 'skipped' | 'failed' | 'cut') => void;
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
  /** K437: `read` steps scale with the speed like the rest (halved at Fast); `pace` wins when given */
  readFollowsSpeed?: boolean;
  pan?: PanFactory;
  /** max time for each pan ensure or return, in milliseconds (default 2000) */
  panTimeoutMs?: number;
  frame?: (callback: FrameRequestCallback) => number | (() => void) | void;
}
export interface PlayOptions {
  commit?: () => void;
  data?: unknown;
  onEnd?: () => void;
  /** like onEnd, told whether the beat ran out (`done`) or was skipped or hurried (`skipped`) */
  onEnded?: (how: Ended) => void;
  /** opens the gate while this beat is playing or queued; input is never held */
  gate?: GateData;
  /** starts at once, alongside what plays, outside the queue (for `constant` beats that overlap); `skipAll` still ends it */
  parallel?: boolean;
  /** K437: the verbs of steps that last to the beat's end finish when its hold ends (release, autoContinueMs, the named beat, a skip), not at the beat's end */
  keepUntilReleased?: boolean;
}
/** K437: `finishStep` lets the steps in progress play to their end, then ends the beat as skipped; later steps and cues never start */
export interface SkipOptions {
  finishStep?: boolean;
}
export interface MotionPlayer {
  /** queue a beat by name, or a spec built by the game (a template filled with live actors) */
  play(beat: string | MotionSpec, opts?: PlayOptions): void;
  /** a rare or once beat is playing or queued, or a pan is returning */
  busy(): boolean;
  /** beats playing (parallel ones too) or queued, plus a pan return */
  pending(): number;
  /** everything playing and queued jumps to its end state: verbs finish, end callbacks fire, cues not yet due are dropped */
  skipAll(opts?: SkipOptions): void;
  release(): void;
  held(): boolean;
  subscribe(listener: () => void): () => void;
  /** like skipAll, but beats whose spec says `hurry: 'keep'` play on (and queued ones still play) */
  hurry(opts?: SkipOptions): void;
  /** the open gate: the first playing or queued beat played with `gate` */
  gate(): GateState | null;
  /** calls `f` now when no gate is open, else when the gate closes */
  afterGate(f: () => void): void;
  /** the game's `visible()` may have turned true: a waiting `whenVisible` beat starts now */
  visibilityChanged(): void;
  /** several beats under one stage: each plays its `places` variant (lone, first, middle, last); `onEnd` fires after the last */
  playRun(beats: readonly (string | MotionSpec)[], opts?: Omit<PlayOptions, 'parallel' | 'commit' | 'data'>): void;
}

interface Item {
  commit?: (() => void) | undefined;
  data?: unknown;
  problem?: string;
  skipped?: true;
  spec: MotionSpec;
  onEnd: ((how: Ended) => void) | undefined;
  gate?: GateData | undefined;
  place?: RunPlace;
  keep?: boolean;
  afterCommit?: (me: Current<unknown>) => void;
}
type Timer = ReturnType<typeof setTimeout>;
interface Current<C> {
  drop?: (why: 'skipped' | 'failed' | 'cut') => void;
  item: Item;
  run: Run<C>;
  timers: Set<Timer>;
  open: Set<() => void>;
  leaving: boolean;
  waiting: Set<() => void>;
  after?: () => void;
  cut?: () => boolean;
}

function requiredRects(spec: MotionSpec): string[] {
  const actors = spec.actors ?? [];
  const zones = actors.flatMap((a) => typeof a.at === 'string' ? [a.at] : []);
  for (const step of spec.steps) {
    if (!actors.some((a) => a.id === step.actor)) zones.push(step.actor);
    if (typeof step.to === 'string') zones.push(step.to);
  }
  return zones;
}

const blocks = (s: MotionSpec): boolean => s.frequency === 'rare' || s.frequency === 'once';

export function createMotionPlayer<C = undefined>(o: PlayerOptions<C>): MotionPlayer {
  const queue: Item[] = [];
  const subs = new Set<() => void>();
  let cur: Current<C> | null = null;
  const live = new Set<Current<C>>();
  const drawing = new Map<Item, () => void>();
  let drawingHead: Item | undefined;
  const holds = new Map<Item, Timer | undefined>();
  const kept = new Map<Item, (() => void)[]>();
  const unkeep = (item: Item): void => {
    const fs = kept.get(item);
    kept.delete(item);
    fs?.forEach((f) => {
      safe(`${item.spec.id} finish`, f);
    });
  };
  const endHolds = (match: (item: Item) => boolean): void => {
    for (const [item, timer] of holds) {
      if (!match(item)) continue;
      clearTimeout(timer);
      holds.delete(item);
      unkeep(item);
    }
  };
  const reached = (id: string): void => {
    if (id !== 'press') endHolds((item) => item.spec.holdUntil === id);
  };
  let pan: { session: PanSession; controller: AbortController } | undefined;
  let returning = false;
  const closePan = (): void => {
    const active = pan;
    pan = undefined;
    returning = false;
    active?.controller.abort();
  };
  const startPan = (scale: number): PanSession | null => {
    if (pan) return pan.controller.signal.aborted ? null : pan.session;
    const controller = new AbortController();
    const session = o.pan?.(scale, controller.signal);
    if (!session) return null;
    pan = { session, controller };
    if (typeof window !== 'undefined') {
      for (const event of ['pointerdown', 'touchstart', 'wheel', 'keydown'])
        window.addEventListener(event, () => { controller.abort(); }, {
          capture: true, passive: true, signal: controller.signal,
        });
    }
    return session;
  };
  const frame = o.frame ?? ((f: FrameRequestCallback) => requestAnimationFrame(f));
  let runs = 0;
  let skipping = false;
  let starting: Item | undefined;
  let committing = false;
  const snapping: Item[][] = [];
  const waiters: (() => void)[] = [];
  const gate = (): GateState | null => {
    const c = [...live].find((x) => x.item.gate !== undefined);
    const i = c?.item ?? [...drawing.keys()].find((x) => x.gate !== undefined) ?? queue.find((x) => x.gate !== undefined);
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
  const safe = <T>(what: string, f: () => T): T | undefined => {
    try {
      return f();
    } catch (e) {
      o.onProblem?.(`${what}: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  };
  const cue = (c: string, beat: string): void => {
    safe(`cue ${c}`, () => o.onCue?.(c, beat));
  };
  const drop = (spec: MotionSpec, why: 'skipped' | 'failed' | 'cut', fired?: ReadonlySet<number>): void => {
    if (!o.onDroppedCue) return;
    [...(spec.sound ?? [])].sort((a, b) => a.t - b.t).forEach((c, k) => {
      if (!fired?.has(k)) safe(`dropped cue ${c.cue}`, () => o.onDroppedCue?.(c.cue, spec.id, why));
    });
  };

  const commit = (item: Item): void => {
    const apply = item.commit;
    delete item.commit;
    if (!apply) return;
    committing = true;
    try {
      safe(`${item.spec.id} commit`, apply);
    } finally {
      committing = false;
    }
  };
  const makeRun = (item: Item, timeline: Timeline): Run<C> => ({
    id: ++runs, timeline, context: o.context, ...(item.place && { place: item.place }),
    ...(item.data !== undefined && { data: item.data }),
  });
  const emptyTimeline = (id: string): Timeline => ({ id, ms: 0, calls: [], actors: [], cues: [] });
  const variant = (item: Item): MotionSpec =>
    o.reduced?.() === true ? withVariant(item.spec, item.spec.reduced) : withVariant(item.spec, item.place && item.spec.places?.[item.place.at]);
  const snapStart = (item: Item): void => {
    const run = item.commit || item.data !== undefined ? makeRun(item, emptyTimeline(item.spec.id)) : undefined;
    if (run) safe(`${item.spec.id} start`, () => o.onBeatStart?.(run));
    commit(item);
    if (run) safe(`${item.spec.id} end`, () => o.onBeatEnd?.(run));
    if (item.problem) o.onProblem?.(item.problem);
  };
  const snapEnd = (item: Item): void => {
    drop(variant(item), 'skipped');
    snapStart(item);
    safe(`${item.spec.id} onEnd`, () => item.onEnd?.('skipped'));
  };
  const waitForRects = (spec: MotionSpec, stage: Stage, ready: () => void, fail: (e: unknown) => void): (() => void) => {
    const zones = new Set([...(spec.whenReady ? requiredRects(spec) : []), ...(spec.awaitRects ?? [])]);
    let left = 60;
    let active = true;
    let request: ReturnType<typeof frame>;
    const cancel = (): void => {
      if (!active) return;
      active = false;
      if (typeof request === 'function') request();
      else if (typeof request === 'number' && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(request);
    };
    const poll = (): void => {
      if (!active) return;
      try {
        const missing = [...zones].filter((zone) => stage(zone) === undefined);
        if (missing.length > 0 && --left > 0) {
          request = frame(poll);
          return;
        }
        if (missing.length > 0) o.onProblem?.(`motion-frame ${spec.id}: timed out waiting for ${missing.join(', ')}`);
        if (!active) return;
        active = false;
        ready();
      } catch (e) {
        fail(e);
      }
    };
    request = frame(poll);
    return cancel;
  };

  const finish = (c: Current<C>, how: Ended, why?: 'failed'): void => {
    if (!live.delete(c)) return;
    c.drop?.(why ?? (how === 'skipped' ? 'skipped' : 'cut'));
    if (cur === c) cur = null;
    c.waiting.clear();
    delete c.after;
    c.timers.forEach((t) => {
      clearTimeout(t);
    });
    commit(c.item);
    c.open.forEach((f) => {
      safe(`${c.run.timeline.id} finish`, f);
    });
    safe(`${c.run.timeline.id} end`, () => o.onBeatEnd?.(c.run));
    safe(`${c.run.timeline.id} onEnd`, () => c.item.onEnd?.(how));
  };

  const start = (item: Item, spec: MotionSpec, stage: Stage, factor: number, parallel: boolean): void => {
    const swap = item.commit && typeof document !== 'undefined' ? spec.swap : undefined;
    const redraw = swap || (item.commit && (spec.whenReady || spec.awaitRects !== undefined));
    const build = (): Timeline => buildTimeline(spec, stage, factor, o.pace?.(factor) ?? (o.readFollowsSpeed ? factor : undefined));
    const run = makeRun(item, redraw ? emptyTimeline(spec.id) : build());
    const timers = new Set<Timer>();
    const open = new Set<() => void>();
    const fired = new Set<number>();
    const me: Current<C> = { item, run, timers, open, leaving: false, waiting: new Set(), drop: (w) => drop(spec, w, fired) };
    live.add(me);
    if (!parallel) cur = me;
    const at = (ms: number, f: () => void): Timer => {
      const t = setTimeout(() => {
        timers.delete(t);
        f();
      }, ms);
      timers.add(t);
      return t;
    };
    safe(`${spec.id} start`, () => o.onBeatStart?.(run));
    if (!live.has(me)) return;
    const schedule = (): void => {
      const t0 = performance.now();
      const atT = (ms: number, f: () => void): Timer => at(Math.max(0, t0 + ms - performance.now()), f);
      type S = { call: Timeline['calls'][number]; end: number; timer?: Timer; started: boolean };
      const steps: S[] = [];
      me.cut = () => {
        delete me.cut;
        const elapsed = performance.now() - t0;
        const going = steps.filter((s) => s.started && (s.timer === undefined || timers.has(s.timer)) && s.end > elapsed);
        const keepT = new Set(going.map((s) => s.timer));
        timers.forEach((t) => {
          if (keepT.has(t)) return;
          clearTimeout(t);
          timers.delete(t);
        });
        const runs = steps.filter((s) => !s.started && s.call.step.onCut === 'run');
        if (going.length === 0 && runs.length === 0) return false;
        const e = Math.max(elapsed, ...going.map((s) => s.end));
        const base = e - elapsed - Math.min(...runs.map((s) => s.call.t));
        const ends = runs.map((s) => put(s.call, base, s, elapsed));
        at(Math.max(e - elapsed, ...ends), () => {
          finish(me, 'skipped');
          next();
          emit();
        });
        return true;
      };
      const settle = (): void => {
        if (me.waiting.size > 0 || !me.after) return;
        const a = me.after;
        delete me.after;
        a();
      };
      const put = (call: S['call'], base: number, step: S, off = 0): number => {
        // all times are offsets from the one clock read at play start (t0)
        let done: Finish | undefined;
        step.end = off + call.t + call.dur + base;
        atT(off + call.t + base, () => {
          step.started = true;
          safe(`${spec.id} ${call.verb}`, () => {
            done = o.verbs.get(call.verb)?.(call, run);
          });
          if (done === undefined) return;
          open.add(done);
          if (timed && done.finished) {
            me.waiting.add(fire);
            const seen = (): void => {
              res = true;
              if (up) fire();
            };
            done.finished.then(seen, seen);
          }
        });
        const end = (): void => {
          const d = done;
          if (d === undefined) return;
          open.delete(d);
          safe(`${spec.id} ${call.verb} finish`, d);
        };
        const fire = (): void => {
          if (!me.waiting.delete(fire)) return;
          end();
          settle();
        };
        let up = false;
        let res = false;
        const timed = !(item.keep && call.t + call.dur >= run.timeline.ms);
        if (timed)
          step.timer = atT(off + call.t + call.dur + base, () => {
            up = true;
            if (!done) return;
            if (!done.finished) return end();
            if (res) fire();
            else at(100, fire);
          });
        return call.t + call.dur + base;
      };
      for (const call of run.timeline.calls) {
        const step: S = { call, end: 0, started: false };
        steps.push(step);
        put(call, 0, step);
      }
      const leave = item.gate && run.timeline.calls.find((c) => c.step.leave === true);
      if (leave)
        atT(leave.t, () => {
          me.leaving = true;
          emit();
        });
      run.timeline.cues.forEach((c, k) =>
        atT(c.t, () => {
          fired.add(k);
          cue(c.cue, spec.id);
        }));
      atT(Math.max(run.timeline.ms, ...run.timeline.cues.map((c) => swap ? c.t : 0)), () => {
        if (!live.has(me)) return;
        if (me.waiting.size > 0) {
          me.after = endBeat;
          return;
        }
        endBeat();
      });
      const endBeat = (): void => {
        if (!live.has(me)) return;
        reached(spec.id);
        const delay = (spec.autoContinueMs ?? 0) * factor;
        if (spec.holdUntil !== undefined || delay > 0) {
          const timer = delay > 0 ? setTimeout(() => {
            if (!holds.has(item)) return;
            holds.delete(item);
            unkeep(item);
            next();
            emit();
          }, delay) : undefined;
          holds.set(item, timer);
          if (item.keep) {
            kept.set(item, [...open]);
            open.clear();
          }
        }
        finish(me, 'done');
        next();
        emit();
      };
    };
    if (!redraw) {
      commit(item);
      item.afterCommit?.(me as Current<unknown>);
      if (live.has(me)) schedule();
      return;
    }
    const failRedraw = (e: unknown): void => {
      if (!live.has(me)) return;
      o.onProblem?.(e instanceof Error ? e.message : String(e));
      finish(me, 'done', 'failed');
      next();
      emit();
    };
    try {
      const before = swap && measureBoard(swap, swap.leave !== 'none');
      commit(item);
      item.afterCommit?.(me as Current<unknown>);
      if (!live.has(me)) return;
      const cancel = waitForRects(spec, stage, () => {
        if (!live.has(me)) return;
        run.timeline = build();
        if (swap && before) run.timeline.ms = Math.max(run.timeline.ms, flyBoard(swap, before, factor, at, open));
        schedule();
      }, failRedraw);
      if (live.has(me)) open.add(cancel);
      else cancel();
    } catch (e) {
      failRedraw(e);
    }
  };

  const next = (): void => {
    while (cur === null && drawingHead === undefined && !skipping && !starting && !committing && !returning) {
      if (queue.length === 0 && live.size === 0 && drawing.size === 0 && holds.size === 0 && pan) {
        const { session, controller } = pan;
        if (controller.signal.aborted) closePan();
        else {
          returning = true;
          void panWork(() => session.back(), controller).finally(() => {
            if (pan?.controller !== controller) return;
            closePan();
            next();
            emit();
          });
          return;
        }
      }
      const index = holds.size === 0 || queue[0]?.skipped ? 0 : queue.findIndex(({ spec }) =>
        spec.id !== 'press' && [...holds.keys()].some((i) => i.spec.holdUntil === spec.id));
      const item = queue[index];
      if (item === undefined || (!item.skipped && item.spec.whenVisible === true && o.visible?.() === false)) return;
      if (item.commit && queue.slice(0, index).some((i) => i.commit)) return;
      queue.splice(index, 1);
      starting = item;
      try {
        if (item.skipped) snapEnd(item);
        else begin(item, false);
      } finally {
        starting = undefined;
      }
    }
  };
  const panWork = async (work: () => Promise<void>, controller: AbortController): Promise<void> => {
    const { signal } = controller;
    if (signal.aborted) return;
    let stop!: () => void;
    const aborted = new Promise<void>((resolve) => { stop = resolve; });
    signal.addEventListener('abort', stop, { once: true });
    const ms = o.panTimeoutMs ?? 2000;
    const timer = setTimeout(() => {
      controller.abort();
      o.onProblem?.(`pan: timed out after ${ms} ms`);
    }, ms);
    try {
      await Promise.race([work(), aborted]);
    } catch (e) {
      o.onProblem?.(`pan: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
    }
  };
  const begin = (item: Item, parallel: boolean): void => {
    if (item.problem) {
      snapStart(item);
      safe(`${item.spec.id} onEnd`, () => item.onEnd?.('done'));
      return;
    }
    const speed = o.speed();
    const reduced = o.reduced?.() === true;
    const { spec: base } = item;
    const spec = reduced ? withVariant(base, base.reduced) : withVariant(base, item.place && base.places?.[item.place.at]);
    if (speed === 'instant' || !(speed > 0) || (reduced && base.reduced === undefined)) {
      // no timeline is built; the cues still sound, in order
      snapStart(item);
      [...(spec.sound ?? [])]
        .sort((a, b) => a.t - b.t)
        .forEach((c) => {
          cue(c.cue, item.spec.id);
        });
      reached(spec.id);
      safe(`${item.spec.id} onEnd`, () => item.onEnd?.('done'));
      return;
    }
    const fail = (e: unknown): void => {
      reached(spec.id);
      snapStart(item);
      drop(spec, 'failed');
      o.onProblem?.(e instanceof Error ? e.message : String(e));
      safe(`${spec.id} onEnd`, () => item.onEnd?.('done'));
    };
    const stage = o.stages[spec.stage ?? 'default'] ?? (spec.swap && spec.stage === undefined ? () => undefined : undefined);
    if (stage === undefined) {
      fail(`motion-frame ${spec.id}: stage ${String(spec.stage)} is not known`);
      return;
    }
    const play = (): void => start(item, spec, stage, reduced ? 1 : speed, parallel);
    const undraw = (): void => {
      drawing.delete(item);
      if (drawingHead === item) drawingHead = undefined;
    };
    const prepare = (): void => {
      if (item.commit || (!spec.whenReady && spec.awaitRects === undefined)) {
        play();
        return;
      }
      if (!parallel) drawingHead = item;
      let waiting = true;
      const cancel = waitForRects(spec, stage, () => {
        waiting = false;
        undraw();
        play();
        next();
        emit();
      }, (e) => {
        waiting = false;
        undraw();
        fail(e);
        next();
        emit();
      });
      if (waiting) drawing.set(item, () => {
        undraw();
        cancel();
      });
    };
    const ready = (): void => {
      try {
        prepare();
      } catch (e) {
        undraw();
        fail(e);
      }
    };
    const late = spec.panAt === 'commit' && o.pan && !reduced && spec.pan !== undefined;
    if (late) item.afterCommit = (me) => {
      const s = safe(`${spec.id} pan`, () => startPan(speed));
      if (!s || !pan) return;
      const token = (): void => {};
      me.waiting.add(token);
      void panWork(() => s.ensure(spec.pan), pan.controller).then(() => {
        if (!me.waiting.delete(token) || me.waiting.size > 0 || !me.after) return;
        const a = me.after;
        delete me.after;
        a();
      });
    };
    const session = o.pan && !reduced && !late && spec.pan !== undefined
      ? safe(`${spec.id} pan`, () => startPan(speed)) : null;
    const active = pan;
    if (!session || !active) {
      ready();
      return;
    }
    drawingHead = item;
    drawing.set(item, undraw);
    void panWork(() => session.ensure(spec.pan), active.controller).then(() => {
      if (!drawing.has(item)) return;
      undraw();
      starting = item;
      try {
        ready();
      } finally {
        starting = undefined;
      }
      next();
      emit();
    });
  };

  const skip = (snap: (i: Item) => boolean, opts?: SkipOptions): void => {
    const wasSkipping = skipping;
    const cutting = new Set(opts?.finishStep ? [...live].filter((c) => snap(c.item) && c.cut?.() === true) : []);
    const current = cur?.item;
    const drawingItems = [...drawing].filter(([item]) => snap(item));
    let blocked = Boolean(committing || [...drawing.keys()].some((item) => item.commit && !snap(item)) ||
      (starting !== current && starting?.commit) ||
      (current?.commit && !snap(current)) || snapping.some((batch) => batch.some((i) => i.commit)));
    const waiting = drawingItems.map(([item]) => item);
    const kept = queue.filter((item) => {
      if (!snap(item)) {
        if (item.commit) blocked = true;
        return true;
      }
      if (blocked && item.commit) {
        item.skipped = true;
        return true;
      }
      waiting.push(item);
      return false;
    });
    queue.splice(0, queue.length, ...kept);
    skipping = true;
    snapping.push(waiting);
    try {
      endHolds(snap);
      for (const [, cancel] of drawingItems) cancel();
      closePan();
      for (const c of [...live]) {
        if (snap(c.item) && !cutting.has(c)) finish(c, 'skipped');
      }
      for (const item of waiting) snapEnd(item);
    } finally {
      snapping.pop();
      skipping = wasSkipping;
    }
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
      const commit = opts?.commit;
      const spec = typeof beat === 'string' && commit ? o.specs[beat] : lookup(beat, end);
      if (spec === undefined && !commit) return;
      const item: Item = {
        spec: spec ?? { id: beat as string, steps: [] },
        onEnd: end, gate: opts?.gate, commit, data: opts?.data, ...(opts?.keepUntilReleased && { keep: true }),
        ...(!spec && { problem: `motion-frame: no spec named ${beat as string}` }),
      };
      if (opts?.parallel === true && !item.commit && (!o.pan || item.spec.pan === undefined)) {
        // during a skip it jumps to its end at once, like everything else
        if (skipping) {
          drop(variant(item), 'skipped');
          snapStart(item);
          safe(`${item.spec.id} onEnd`, () => end?.('skipped'));
        }
        else {
          begin(item, true);
          next();
        }
      }
      else {
        queue.push(item);
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
    hurry(opts) {
      skip((i) => i.spec.hurry !== 'keep', opts);
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
    busy: () => returning || [...live].some((c) => blocks(c.item.spec)) || [...drawing.keys(), ...holds.keys(), ...queue].some((i) => blocks(i.spec)),
    pending: () => live.size + drawing.size + holds.size + queue.length + Number(returning),
    held: () => holds.size > 0,
    release() {
      const size = holds.size;
      endHolds((i) => i.spec.holdUntil === 'press');
      if (size === holds.size) return;
      next();
      emit();
    },
    skipAll(opts) {
      skip(() => true, opts);
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
  el.style.setProperty('--motion-view-transition-duration', `${280 * scale}ms`);
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

/** Any press or key on `target` hurries what plays (`hurry()`); never swallows the input. Returns the unbind. K437: `pointerOnly` ignores keys; `finishStep` is passed to `hurry`. */
export function hurryOnInput(player: MotionPlayer, target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, opts?: SkipOptions & { pointerOnly?: boolean }): () => void {
  const f = (): void => {
    if (player.pending() > 0) player.hurry(opts?.finishStep ? { finishStep: true } : undefined);
  };
  target.addEventListener('pointerdown', f, { capture: true });
  if (!opts?.pointerOnly) target.addEventListener('keydown', f, { capture: true });
  return () => {
    target.removeEventListener('pointerdown', f, { capture: true });
    target.removeEventListener('keydown', f, { capture: true });
  };
}
/** Any press or key on `target` skips what plays; never swallows the input unless `consume` (K444: then the skipping input gets preventDefault and stopPropagation). Returns the unbind. */
export function skipOnInput(player: MotionPlayer, target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>, options: { consume?: boolean } = {}): () => void {
  const skip = (e: Event): void => {
    if (player.pending() <= 0) return;
    player.skipAll();
    if (options.consume) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  target.addEventListener('pointerdown', skip, { capture: true });
  target.addEventListener('keydown', skip, { capture: true });
  return () => {
    target.removeEventListener('pointerdown', skip, { capture: true });
    target.removeEventListener('keydown', skip, { capture: true });
  };
}

export function releaseOnInput(player: MotionPlayer, target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>): () => void {
  const release = (): void => {
    player.release();
  };
  target.addEventListener('pointerdown', release, { capture: true });
  target.addEventListener('keydown', release, { capture: true });
  return () => {
    target.removeEventListener('pointerdown', release, { capture: true });
    target.removeEventListener('keydown', release, { capture: true });
  };
}
