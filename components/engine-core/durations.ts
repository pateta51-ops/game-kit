// K96 (docs/patterns/timing-vocabulary.md): one registry of continuous effects with typed durations, read at use
// (netrunner effects.clj get-effects / sum-effects / any-effects and duration keys, MIT, design; marvel-champions
// lasting.ts LastingDuration with endOfEvent ifCancelled, AGPL: idea only). K112: layered recompute in game-declared
// layers, timestamp set on activation, optional `after` dependency (XMage ContinuousEffects.java apply / applyLayer,
// MIT, design). Written new. Opt-in: `state.timing.effects` appears only once a game calls `addEffect`.
import { own } from './cow.ts';
import type { Draft } from './draft.ts';
import { EngineBugError } from './errors.ts';
import { timingOf, type TimingState } from './timing.ts';
import type { Ctx, GameTypes } from './types.ts';

export type Duration =
  | { readonly until: 'endOfTurn' | 'endOfRound' | 'endOfPhase'; readonly phase?: string }
  | { readonly until: 'turnBegins' | 'nextTurnBegins'; readonly player: string }
  | { readonly until: 'endOfBatch'; readonly batch: number; readonly ifCancelled: 'expire' | 'wait' }
  | { readonly until: 'used'; readonly uses: number }
  /** K541: ends when the game calls `eventOver(ctx, event, instance)`; with `instance`, only that instance's end ends it. */
  | { readonly until: 'event'; readonly event: string; readonly instance?: string }
  | { readonly while: 'sourceInPlay' }
  | { readonly until: 'game' };
export interface ContinuousEffect {
  /** From `timing.next`. */
  readonly id: number;
  readonly kind: string;
  readonly source: string;
  readonly target?: string;
  readonly value: number | string;
  /** A key in the game's condition table: the effect counts only while it holds. */
  readonly when?: string;
  readonly duration: Duration;
  /** K112: a layer the game declared. */
  readonly layer?: string;
  /** K112: kinds in the same layer that apply before it. */
  readonly after?: readonly string[];
  /** K112: timestamp, set when the effect is first active (the id when it has no `when`). */
  readonly stamp?: number;
  /** Its duration ended (`boundary`, used up, source left, batch over); gone at the next `expireEffects`. */
  readonly ended?: true;
  /** `endOfBatch` with `ifCancelled: 'wait'` whose batch was cancelled: waits for `bindEffect`. */
  readonly waiting?: true;
  /** `cfg.batchEndAfterTriggers`: its batch is over; it ends when the trigger chain is. */
  readonly over?: true;
}
export type EffectInput = Omit<ContinuousEffect, 'id' | 'stamp' | 'ended' | 'waiting' | 'over'>;
export interface Boundary {
  readonly kind: 'turnEnd' | 'roundEnd' | 'phaseEnd' | 'turnBegin';
  readonly player?: string;
  readonly phase?: string;
}
export interface EffectsConfig<S> {
  /** The condition table for `when` keys. */
  readonly conditions?: Readonly<Record<string, (s: S, e: ContinuousEffect) => boolean>>;
  /** Blanked sources (a derived value): their effects are skipped. */
  blanked?(s: S): readonly string[];
}
export interface LayerConfig<S, V> extends EffectsConfig<S> {
  /** The game's layers, first applied first. */
  readonly layers: readonly string[];
  apply(v: V, e: ContinuousEffect, s: S): V;
}

type Timed = { readonly timing?: TimingState };
export const allEffects = (s: Timed): readonly ContinuousEffect[] => s.timing?.effects ?? [];

function effectsDraft<G extends GameTypes>(ctx: Ctx<G>): Draft<ContinuousEffect>[] {
  const t = timingOf(ctx);
  if (t.effects === undefined) (t as { effects?: ContinuousEffect[] }).effects = [];
  return own(t, 'effects') as Draft<ContinuousEffect>[];
}

function mark<G extends GameTypes>(ctx: Ctx<G>, f: (e: ContinuousEffect) => ContinuousEffect): void {
  const list = allEffects(ctx.s);
  if (list.length === 0) return;
  const next = list.map((e) => (e.ended === true ? e : f(e)));
  if (next.some((e, i) => e !== list[i])) (timingOf(ctx) as { effects?: ContinuousEffect[] }).effects = next;
}
const end = (e: ContinuousEffect): ContinuousEffect => ({ ...e, ended: true });

/** Register an effect; returns its id. A static ability uses `{ while: 'sourceInPlay' }` when its card becomes active. */
export function addEffect<G extends GameTypes>(ctx: Ctx<G>, input: EffectInput): number {
  const list = effectsDraft(ctx);
  const t = timingOf(ctx);
  const id = t.next;
  t.next = id + 1;
  const d = input.duration;
  const gone = 'until' in d && d.until === 'endOfBatch' && !batchLive(ctx.s, d.batch);
  list.push({ ...input, id, ...(input.when === undefined ? { stamp: id } : {}), ...(gone ? { ended: true } : {}) } as Draft<ContinuousEffect>);
  return id;
}

export function removeEffect<G extends GameTypes>(ctx: Ctx<G>, id: number): void {
  mark(ctx, (e) => (e.id === id ? end(e) : e));
}

/** The card left play: its `while: 'sourceInPlay'` effects end. */
export function sourceLeft<G extends GameTypes>(ctx: Ctx<G>, source: string): void {
  mark(ctx, (e) => (e.source === source && 'while' in e.duration ? end(e) : e));
}

/** One use of an `until: 'used'` effect; the last use ends it. */
export function spendEffect<G extends GameTypes>(ctx: Ctx<G>, id: number): void {
  mark(ctx, (e) => {
    if (e.id !== id) return e;
    const d = e.duration;
    if (!('until' in d) || d.until !== 'used') throw new EngineBugError(`spendEffect: effect ${String(id)} is not counted by uses`);
    return d.uses <= 1 ? end({ ...e, duration: { until: 'used', uses: 0 } }) : { ...e, duration: { until: 'used', uses: d.uses - 1 } };
  });
}

/** A turn, round or phase ended, or a player's turn began: the durations it ends are marked; `nextTurnBegins` becomes `turnBegins`. */
export function boundary<G extends GameTypes>(ctx: Ctx<G>, b: Boundary): void {
  mark(ctx, (e) => {
    const d = e.duration;
    if (!('until' in d)) return e;
    if (b.kind === 'turnEnd' && d.until === 'endOfTurn') return end(e);
    if (b.kind === 'roundEnd' && d.until === 'endOfRound') return end(e);
    if (b.kind === 'phaseEnd' && d.until === 'endOfPhase' && (d.phase === undefined || d.phase === b.phase)) return end(e);
    if (b.kind === 'turnBegin' && (d.until === 'turnBegins' || d.until === 'nextTurnBegins') && d.player === b.player)
      return d.until === 'turnBegins' ? end(e) : { ...e, duration: { until: 'turnBegins', player: d.player } };
    return e;
  });
}

/**
 * K541: the game's named event `event` happened (a combat ended, the next reveal): every `until: 'event'` effect waiting
 * on it ends, those with no `instance` and those whose `instance` is this one; returns their ids. An effect added later
 * waits for the next one.
 */
export function eventOver<G extends GameTypes>(ctx: Ctx<G>, event: string, instance?: string): number[] {
  if (event === '') throw new EngineBugError('eventOver: an event needs a name');
  const ids: number[] = [];
  mark(ctx, (e) => {
    const d = e.duration;
    if (!('until' in d) || d.until !== 'event' || d.event !== event || (d.instance !== undefined && d.instance !== instance)) return e;
    ids.push(e.id);
    return end(e);
  });
  return ids;
}

/** K541, read-only: the event names (and instances) the live `until: 'event'` effects wait on, first-added first, once each. */
export function waitingOn(s: Timed): { event: string; instance?: string }[] {
  const out: { event: string; instance?: string }[] = [];
  for (const e of allEffects(s)) {
    const d = e.duration;
    if (e.ended === true || !('until' in d) || d.until !== 'event' || out.some((w) => w.event === d.event && w.instance === d.instance)) continue;
    out.push(d.instance === undefined ? { event: d.event } : { event: d.event, instance: d.instance });
  }
  return out;
}

/** Batch `b` still runs: an occurrence of it is pending, or its end (`timing.batchEnd`) is still on the stack. */
export const batchLive = (s: Timed & { readonly stack: readonly object[] }, b: number): boolean =>
  (s.timing?.occurrences.some((o) => o.batch === b && o.state === 'pending') ?? false) || s.stack.some((t) => (t as { kind?: string; end?: number }).kind === 'timing.batchEnd' && (t as { end?: number }).end === b);

/** Batch `b` is over (timing.do settled its last occurrence, and the follow-ups ran) or cancelled (`cancelBatch`). */
export function batchOver<G extends GameTypes>(ctx: Ctx<G>, b: number, cancelled: boolean, afterTriggers = false): void {
  mark(ctx, (e) => {
    const d = e.duration;
    if (!('until' in d) || d.until !== 'endOfBatch' || d.batch !== b || e.waiting === true) return e;
    if (cancelled) return d.ifCancelled === 'wait' ? { ...e, waiting: true } : end(e);
    return afterTriggers ? { ...e, over: true } : end(e);
  });
}

/** The `timing.triggers` chain is over: effects waiting for it (`over`) end, except those of `held` batches (K292: a held trigger of theirs is still pending). */
export function triggersOver<G extends GameTypes>(ctx: Ctx<G>, held: readonly number[] = []): void {
  mark(ctx, (e) => (e.over === true && !('batch' in e.duration && held.includes(e.duration.batch)) ? end(e) : e));
}

/** A waiting `endOfBatch` effect now lasts until batch `b` ends. */
export function bindEffect<G extends GameTypes>(ctx: Ctx<G>, id: number, b: number): void {
  mark(ctx, (e) => {
    if (e.id !== id) return e;
    const d = e.duration;
    if (!('until' in d) || d.until !== 'endOfBatch') throw new EngineBugError(`bindEffect: effect ${String(id)} does not last until a batch ends`);
    const { waiting, ...rest } = e;
    void waiting;
    return { ...rest, duration: { ...d, batch: b }, ...(batchLive(ctx.s, b) ? {} : { ended: true as const }) };
  });
}

/** Remove the ended effects (K95 checkpoint step 2); returns them. */
export function expireEffects<G extends GameTypes>(ctx: Ctx<G>): ContinuousEffect[] {
  const gone = allEffects(ctx.s).filter((e) => e.ended === true);
  if (gone.length > 0) (timingOf(ctx) as { effects?: ContinuousEffect[] }).effects = allEffects(ctx.s).filter((e) => e.ended !== true);
  return gone;
}

function active<S extends Timed>(s: S, e: ContinuousEffect, cfg: EffectsConfig<S>, blanked: readonly string[]): boolean {
  if (e.ended === true || e.waiting === true || blanked.includes(e.source)) return false;
  if (e.when === undefined) return true;
  const c = cfg.conditions?.[e.when];
  if (c === undefined) throw new EngineBugError(`effects: no condition "${e.when}" in the game's table`);
  return c(s, e);
}

const byStamp = (a: ContinuousEffect, b: ContinuousEffect): number => (a.stamp ?? Infinity) - (b.stamp ?? Infinity) || a.id - b.id;

/** The active effects of `kind` (all kinds when undefined), oldest timestamp first. */
export function effectsOf<S extends Timed>(s: S, kind?: string, filter?: (e: ContinuousEffect) => boolean, cfg: EffectsConfig<S> = {}): ContinuousEffect[] {
  const list = allEffects(s);
  if (list.length === 0) return [];
  const blanked = cfg.blanked?.(s) ?? [];
  return list.filter((e) => (kind === undefined || e.kind === kind) && (filter?.(e) ?? true) && active(s, e, cfg, blanked)).sort(byStamp);
}
export const sumEffects = <S extends Timed>(s: S, kind: string, filter?: (e: ContinuousEffect) => boolean, cfg: EffectsConfig<S> = {}): number =>
  effectsOf(s, kind, filter, cfg).reduce((n, e) => n + (typeof e.value === 'number' ? e.value : 0), 0);
export const anyEffect = <S extends Timed>(s: S, kind: string, filter?: (e: ContinuousEffect) => boolean, cfg: EffectsConfig<S> = {}): boolean =>
  effectsOf(s, kind, filter, cfg).length > 0;

/** K112: effects with a `when` that hold now and have no timestamp get one (`timing.next`); K95 runs it before derive. */
export function stampActive<G extends GameTypes>(ctx: Ctx<G>, cfg: EffectsConfig<G['state']> = {}): void {
  const s = ctx.s as Timed;
  const blanked = cfg.blanked?.(ctx.s) ?? [];
  const fresh = allEffects(s).filter((e) => e.stamp === undefined && active(ctx.s, e, cfg, blanked));
  if (fresh.length === 0) return;
  const t = timingOf(ctx);
  const ids = new Map(fresh.map((e, i) => [e.id, t.next + i]));
  t.next += fresh.length;
  (t as { effects?: ContinuousEffect[] }).effects = allEffects(s).map((e) => (ids.has(e.id) ? { ...e, stamp: ids.get(e.id) as number } : e));
}

/**
 * K112: `base` with the active layered effects applied, layer by layer in the game's order; within a layer by timestamp,
 * except that an effect waits until every effect of its `after` kinds in that layer has applied (a cycle falls back to
 * timestamp order). An effect in a layer the game did not declare is an engine bug.
 */
export function layered<S extends Timed, V>(s: S, base: V, cfg: LayerConfig<S, V>, filter?: (e: ContinuousEffect) => boolean): V {
  const all = effectsOf(s, undefined, (e) => e.layer !== undefined && (filter?.(e) ?? true), cfg);
  for (const e of all) if (!cfg.layers.includes(e.layer as string)) throw new EngineBugError(`layered: effect ${String(e.id)} is in undeclared layer "${String(e.layer)}"`);
  let v = base;
  for (const layer of cfg.layers) {
    const left = all.filter((e) => e.layer === layer);
    while (left.length > 0) {
      const i = left.findIndex((e) => !left.some((o) => o !== e && (e.after ?? []).includes(o.kind)));
      const [e] = left.splice(Math.max(i, 0), 1);
      v = cfg.apply(v, e as ContinuousEffect, s);
    }
  }
  return v;
}
