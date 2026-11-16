// The paced steps of an answer: the view before it, its events, and those still to play (the head is on screen).
export interface Steps<V, E> { base: V | null; events: readonly E[]; queue: readonly E[] }
export const noSteps = <V, E>(): Steps<V, E> => ({ base: null, events: [], queue: [] });
// after an answer: `before` is the view it was given on, `evs` its events; steps still queued keep their base
export const pushSteps = <V, E>(s: Steps<V, E>, before: V | null, evs: readonly E[], isStep: (e: E) => boolean, instant = false): Steps<V, E> => ({
  base: s.queue.length ? s.base : before, events: s.queue.length ? [...s.events, ...evs] : evs,
  queue: instant ? [] : [...s.queue, ...evs.filter(isStep)],
});
export const advance = <V, E>(s: Steps<V, E>): Steps<V, E> => ({ ...s, queue: s.queue.slice(1) });
export const skip = <V, E>(s: Steps<V, E>): Steps<V, E> => ({ ...s, queue: [] });

// the game's fold: `base` with `events` applied; `live` is the view after the answer, `later` the events not on the table yet
export type Fold<V, E, X> = (base: V, events: readonly E[], live: V, later: readonly E[]) => X;
export interface FoldOptions<E> { shown?: (events: readonly E[], step: E) => readonly E[]; later?: (e: E, step: E, events: readonly E[]) => boolean }
// the view while the step at the head of the queue plays, folded onto the view before the answer; null when nothing is paced (show the live view)
export function foldView<V, E, X>(s: Steps<V, E>, live: V | null, fold: Fold<V, E, X>, o: FoldOptions<E> = {}): X | null {
  const step = s.queue[0];
  if (step === undefined || !s.base || !live) return null;
  const shown = o.shown ?? ((evs: readonly E[], st: E) => evs.slice(0, evs.indexOf(st) + 1));
  const later = o.later ?? ((e: E, st: E, evs: readonly E[]) => evs.indexOf(e) > evs.indexOf(st));
  return fold(s.base, shown(s.events, step), live, s.events.filter((e) => later(e, step, s.events)));
}
// the view just before `step` (where its motion starts)
export function foldBefore<V, E, X>(s: Steps<V, E>, step: E, live: V | null, fold: Fold<V, E, X>): X | null {
  if (!s.base || !live) return null;
  return fold(s.base, s.events.slice(0, Math.max(s.events.indexOf(step), 0)), live, []);
}

export interface StepperOptions<E> {
  head: () => E | null; advance: () => void; skip: () => void; instant: () => boolean;
  // show the step; call `next` when its motion has ended, or `read(ms)` for a step that only waits to be read
  play: (step: E, next: () => void, read: (ms: number) => void) => void;
  left?: () => void; // the step on screen was left (answered, undo, load): end its motion
  idle?: () => void; // the queue is empty
}
// Plays the queue: call `drive` on every store change. One step at a time; at Instant the queue is dropped.
export function createStepper<E>(o: StepperOptions<E>): { drive: () => void; press: () => boolean; current: () => E | null } {
  let cur: E | null = null, ending = false, held: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drive = () => {
    const step = o.head();
    if (step === cur) return;
    cur = step; clearTimeout(timer); held = null;
    if (!ending) o.left?.();
    if (step === null) { o.idle?.(); return; }
    if (o.instant()) { o.skip(); return; }
    const next = () => { if (cur !== step || o.head() !== step) return; ending = true; try { o.advance(); } finally { ending = false; } };
    try { o.play(step, next, (ms) => { if (cur !== step) return; clearTimeout(timer); held = next; timer = setTimeout(next, ms); }); } catch { next(); }
  };
  // a press ends a step that only waits to be read; true when it did
  const press = () => { const h = held; if (!h) return false; clearTimeout(timer); held = null; h(); return true; };
  return { drive, press, current: () => cur };
}

export type Rect = readonly [number, number, number, number];
const meets = (a: Rect, b: Rect) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
export interface QuestionZoneOptions { home?: string; alt?: string; altOk?: Iterable<string> }
// the zone of the question band: `alt` only when a target lies under `home` and every target is in `altOk` (the zones `alt` does not cover; all when left out)
export function questionZone(targets: readonly string[], zones: Readonly<Record<string, { r: Rect } | undefined>>, o: QuestionZoneOptions = {}): string {
  const H = o.home ?? 'question', A = o.alt ?? 'question.alt', ok = o.altOk ? new Set(o.altOk) : null;
  const home = zones[H]?.r;
  if (!home || !zones[A] || targets.length === 0 || !targets.every((t) => !ok || ok.has(t))) return H;
  return targets.some((t) => { const z = zones[t]?.r; return z !== undefined && meets(z, home); }) ? A : H;
}
