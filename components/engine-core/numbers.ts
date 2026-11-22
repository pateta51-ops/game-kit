// K526: a number with its parts. The game gives the modifiers and its ruled order as data; the result is the final
// value and who changed it by how much. Pure: no state, nothing stored. Written new.
import { effectsOf, type ContinuousEffect, type EffectsConfig } from './durations.ts';
import { EngineBugError } from './errors.ts';
import type { TimingState } from './timing.ts';

export type NumberOp = 'set' | 'add' | 'multiply' | 'floor' | 'cap';
/** A step of the order: an operation, or the adds split into `increase` (0 or more) and `decrease` (below 0). */
export type NumberStep = NumberOp | 'increase' | 'decrease';
export interface NumberModifier {
  readonly source: string;
  readonly op: NumberOp;
  readonly amount: number;
  /** A key in `NumberOptions.conditions`: it counts only while that holds. */
  readonly when?: string;
  /** A reduction's own minimum: it never lowers a value at or below it, and never raises one. On anything but an add below 0 (or of 0): an `EngineBugError`. */
  readonly min?: number;
  /** A key in `NumberOptions.counts`: the amount is per counted unit. */
  readonly per?: string;
  /** A multiplier's own rounding (else the order's). */
  readonly round?: 'up' | 'down';
  /** The stat, cost line or cost it changes; one that names another than `NumberOptions.of` is skipped. */
  readonly of?: string;
  /** Anything the game wants back on the part (an effect id, a clause); copied as it is, never read here. */
  readonly ref?: unknown;
}
export interface NumberOrder {
  readonly steps: readonly NumberStep[];
  /** Which of several setters applies (default `last`: last in the array given, not latest in time). */
  readonly setters?: 'last' | 'lowest' | 'highest';
  /** A set never raises the value. */
  readonly setOnlyLowers?: boolean;
  /** The order of the reductions in a `decrease` step: as given (default), or highest `min` first, then the largest reduction. With `highestMin` an unsplit `add` step applies its raises first, then its reductions in that order. */
  readonly decreases?: 'gather' | 'highestMin';
  /** Rounding after a multiplier (none: the value stays as it is); `up` is toward plus infinity, so toward zero on a negative. */
  readonly round?: 'up' | 'down';
  /** The default floor, source `floor`; needs a `floor` step. */
  readonly floor?: number;
  /** The default cap, source `cap`; needs a `cap` step. */
  readonly cap?: number;
}
export interface NumberPart {
  readonly source: string;
  readonly op: NumberOp;
  /** The modifier's amount (times its count; on a `scope` entry times its count only when the call gave that count). */
  readonly amount: number;
  /** The change it made: the base plus every `applied` is the value (exactly while every value on the way is a whole number or a half; an unrounded fraction carries float error). */
  readonly applied: number;
  /** The modifier's `ref`, when it has one. */
  readonly ref?: unknown;
}
export interface UnchangedPart extends NumberPart {
  /** `refused`: a setter that `setOnlyLowers` did not let raise. `scope`: it names an `of` and the call named none. May grow: keep a default branch. */
  readonly why: 'condition' | 'outranked' | 'same' | 'refused' | 'scope';
}
export interface NumberBound extends NumberPart {
  /** The final value sits on this bound. */
  readonly holds: boolean;
}
export interface NumberOptions {
  readonly of?: string;
  readonly conditions?: Readonly<Record<string, (m: NumberModifier) => boolean>>;
  readonly counts?: Readonly<Record<string, (m: NumberModifier) => number>>;
  /** Also return the modifiers in scope that changed nothing. */
  readonly unchanged?: boolean;
}
export interface NumberResult {
  readonly value: number;
  readonly base: number;
  /** In the order applied; none changed nothing. */
  readonly parts: readonly NumberPart[];
  /** The last floor or cap that bit (also in `parts`). It may no longer hold on the value: read `bounds`. */
  readonly bound?: NumberPart;
  /** Every floor or cap that bit, in order, each with whether the final value sits on it (absent: none bit). */
  readonly bounds?: readonly NumberBound[];
  readonly unchanged?: readonly UnchangedPart[];
}

export function numberParts(base: number, modifiers: readonly NumberModifier[], order: NumberOrder, opts: NumberOptions = {}): NumberResult {
  const steps = order.steps;
  for (const k of ['floor', 'cap'] as const) if (order[k] !== undefined && !steps.includes(k)) throw new EngineBugError(`numberParts: the order has a default ${k} but no "${k}" step`);
  const parts: NumberPart[] = [];
  const idle: UnchangedPart[] = [];
  const live: NumberModifier[] = [];
  const part = (m: NumberModifier, applied: number): NumberPart => ({ source: m.source, op: m.op, amount: m.amount + 0, applied, ...(m.ref === undefined ? {} : { ref: m.ref }) });
  for (const m of modifiers) {
    if (m.of !== undefined && m.of !== opts.of) {
      const n = m.per === undefined ? undefined : opts.counts?.[m.per];
      if (opts.of === undefined && opts.unchanged === true) idle.push({ ...part(n === undefined ? m : { ...m, amount: m.amount * n(m) }, 0), why: 'scope' });
      continue;
    }
    let x = { ...m };
    if (m.per !== undefined) {
      const n = opts.counts?.[m.per];
      if (n === undefined) throw new EngineBugError(`numberParts: no count "${m.per}" for ${m.source}`);
      x = { ...m, amount: m.amount * n(m) + 0 };
    }
    if (x.min !== undefined && (x.op !== 'add' || x.amount > 0)) throw new EngineBugError(`numberParts: ${x.source} has a minimum, which only a reduction takes`);
    if (!steps.includes(x.op) && !(x.op === 'add' && ((x.amount <= 0 && steps.includes('decrease')) || (x.amount >= 0 && steps.includes('increase'))))) throw new EngineBugError(`numberParts: ${x.source} has "${x.op}" but the order has no step for it`);
    if (m.when !== undefined) {
      const c = opts.conditions?.[m.when];
      if (c === undefined) throw new EngineBugError(`numberParts: no condition "${m.when}" for ${m.source}`);
      if (!c(m)) {
        idle.push({ ...part(x, 0), why: 'condition' });
        continue;
      }
    }
    live.push(x);
  }
  let v = base + 0;
  const bounds: NumberPart[] = [];
  const done = new Set<NumberModifier>();
  const idleOf = new Map<NumberModifier, UnchangedPart>();
  const skip = (m: NumberModifier, why: UnchangedPart['why']): void => {
    if (done.has(m)) return;
    done.add(m);
    const u = { ...part(m, 0), why };
    idleOf.set(m, u);
    idle.push(u);
  };
  const put = (m: NumberModifier, at: number): NumberPart | undefined => {
    const to = at + 0;
    if (to === v) {
      skip(m, 'same');
      return undefined;
    }
    done.add(m);
    const u = idleOf.get(m);
    if (u !== undefined) idle.splice(idle.indexOf(u), 1);
    idleOf.delete(m);
    const p = part(m, to - v);
    parts.push(p);
    v = to;
    return p;
  };
  for (const step of steps) {
    const take = (f: (m: NumberModifier) => boolean): NumberModifier[] => live.filter((m) => !done.has(m) && f(m));
    if (step === 'set') {
      const all = take((m) => m.op === 'set');
      const ok = order.setOnlyLowers === true ? all.filter((m) => m.amount < v) : all;
      const pick = order.setters ?? 'last';
      const win = pick === 'last' ? ok.at(-1) : ok.reduce<NumberModifier | undefined>((a, m) => (a === undefined || (pick === 'lowest' ? m.amount < a.amount : m.amount > a.amount) ? m : a), undefined);
      for (const m of all) if (m !== win) skip(m, ok.includes(m) ? 'outranked' : m.amount > v ? 'refused' : 'same');
      if (win !== undefined) put(win, win.amount);
    } else if (step === 'multiply') {
      for (const m of take((x) => x.op === 'multiply')) {
        const r = m.round ?? order.round;
        const x = v * m.amount;
        const w = Math.round(x);
        const y = Math.abs(x - w) <= Math.abs(x) * Number.EPSILON * 8 ? w : x;
        put(m, r === 'up' ? Math.ceil(y) : r === 'down' ? Math.floor(y) : x);
      }
    } else if (step === 'floor' || step === 'cap') {
      const lo = step === 'floor';
      const ms = live.filter((m) => m.op === step);
      const def = order[step];
      const all: NumberModifier[] = def === undefined ? ms : [...ms, { source: step, op: step, amount: def }];
      const win = all.reduce<NumberModifier | undefined>((a, m) => (a === undefined || (lo ? m.amount > a.amount : m.amount < a.amount) ? m : a), undefined);
      for (const m of ms) if (m !== win) skip(m, 'outranked');
      if (win !== undefined) {
        if (lo ? v < win.amount : v > win.amount) bounds.push(put(win, win.amount) as NumberPart);
        else if (ms.includes(win)) skip(win, 'same');
      }
    } else {
      let ms = take((m) => m.op === 'add' && (step === 'add' || (step === 'decrease' ? m.amount <= 0 : m.amount >= 0)));
      const byMin = (a: NumberModifier, b: NumberModifier): number => (b.min ?? -Infinity) - (a.min ?? -Infinity) || a.amount - b.amount;
      if (step === 'decrease' && order.decreases === 'highestMin') ms = ms.sort(byMin);
      if (step === 'add' && order.decreases === 'highestMin') {
        ms = [...ms.filter((m) => m.amount >= 0), ...ms.filter((m) => m.amount < 0).sort(byMin)];
      }
      for (const m of ms) put(m, m.amount < 0 && m.min !== undefined ? (v <= m.min ? v : Math.max(m.min, v + m.amount)) : v + m.amount);
    }
  }
  const bound = bounds.at(-1);
  return { value: v, base: base + 0, parts, ...(bound === undefined ? {} : { bound, bounds: bounds.map((p) => ({ ...p, holds: v === p.amount })) }), ...(opts.unchanged === true ? { unchanged: idle } : {}) };
}

/** The kernel's active effects (`effectsOf`: oldest first, ended, waiting, blanked and false `when` ones left out) as modifiers. */
export function effectModifiers<S extends { readonly timing?: TimingState }>(
  s: S,
  map: (e: ContinuousEffect) => NumberModifier | readonly NumberModifier[] | undefined,
  kind?: string,
  filter?: (e: ContinuousEffect) => boolean,
  cfg: EffectsConfig<S> = {},
): NumberModifier[] {
  return effectsOf(s, kind, filter, cfg).flatMap((e) => map(e) ?? []);
}

/** Whether the parts only lower, only raise, or both (undefined: no parts). */
export function partsDirection(parts: readonly NumberPart[]): 'lower' | 'higher' | 'mixed' | undefined {
  const down = parts.some((p) => p.applied < 0);
  const up = parts.some((p) => p.applied > 0);
  return down && up ? 'mixed' : down ? 'lower' : up ? 'higher' : undefined;
}
