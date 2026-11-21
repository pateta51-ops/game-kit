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
  /** A reduction's own minimum: it never lowers a value at or below it, and never raises one. */
  readonly min?: number;
  /** A key in `NumberOptions.counts`: the amount is per counted unit. */
  readonly per?: string;
  /** A multiplier's own rounding (else the order's). */
  readonly round?: 'up' | 'down';
  /** The stat, cost line or cost it changes; one that names another than `NumberOptions.of` is skipped. */
  readonly of?: string;
}
export interface NumberOrder {
  readonly steps: readonly NumberStep[];
  /** Which of several setters applies (default `last`, in the order given). */
  readonly setters?: 'last' | 'lowest' | 'highest';
  /** A set never raises the value. */
  readonly setOnlyLowers?: boolean;
  /** The `decrease` step's order: as given (default), or highest `min` first, then the largest reduction. */
  readonly decreases?: 'gather' | 'highestMin';
  /** Rounding after a multiplier (none: the value stays as it is). */
  readonly round?: 'up' | 'down';
  /** The default floor, source `floor`; needs a `floor` step. */
  readonly floor?: number;
  /** The default cap, source `cap`; needs a `cap` step. */
  readonly cap?: number;
}
export interface NumberPart {
  readonly source: string;
  readonly op: NumberOp;
  /** The modifier's amount (times its count). */
  readonly amount: number;
  /** The change it made: the base plus every `applied` is the value. */
  readonly applied: number;
}
export interface UnchangedPart extends NumberPart {
  readonly why: 'condition' | 'outranked' | 'same';
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
  /** The last floor or cap that bit (also in `parts`). */
  readonly bound?: NumberPart;
  readonly unchanged?: readonly UnchangedPart[];
}

export function numberParts(base: number, modifiers: readonly NumberModifier[], order: NumberOrder, opts: NumberOptions = {}): NumberResult {
  const steps = order.steps;
  for (const k of ['floor', 'cap'] as const) if (order[k] !== undefined && !steps.includes(k)) throw new EngineBugError(`numberParts: the order has a default ${k} but no "${k}" step`);
  const parts: NumberPart[] = [];
  const idle: UnchangedPart[] = [];
  const live: NumberModifier[] = [];
  for (const m of modifiers) {
    if (m.of !== undefined && m.of !== opts.of) continue;
    let x = m;
    if (m.per !== undefined) {
      const n = opts.counts?.[m.per];
      if (n === undefined) throw new EngineBugError(`numberParts: no count "${m.per}" for ${m.source}`);
      x = { ...m, amount: m.amount * n(m) };
    }
    if (!steps.includes(x.op) && !(x.op === 'add' && ((x.amount <= 0 && steps.includes('decrease')) || (x.amount >= 0 && steps.includes('increase'))))) throw new EngineBugError(`numberParts: ${x.source} has "${x.op}" but the order has no step for it`);
    if (m.when !== undefined) {
      const c = opts.conditions?.[m.when];
      if (c === undefined) throw new EngineBugError(`numberParts: no condition "${m.when}" for ${m.source}`);
      if (!c(m)) {
        idle.push({ source: x.source, op: x.op, amount: x.amount, applied: 0, why: 'condition' });
        continue;
      }
    }
    live.push(x);
  }
  let v = base;
  let bound: NumberPart | undefined;
  const done = new Set<NumberModifier>();
  const idleOf = new Map<NumberModifier, UnchangedPart>();
  const skip = (m: NumberModifier, why: UnchangedPart['why']): void => {
    if (done.has(m)) return;
    done.add(m);
    const u = { source: m.source, op: m.op, amount: m.amount, applied: 0, why };
    idleOf.set(m, u);
    idle.push(u);
  };
  const put = (m: NumberModifier, to: number): NumberPart | undefined => {
    if (to === v) {
      skip(m, 'same');
      return undefined;
    }
    done.add(m);
    const u = idleOf.get(m);
    if (u !== undefined) idle.splice(idle.indexOf(u), 1);
    idleOf.delete(m);
    const p = { source: m.source, op: m.op, amount: m.amount, applied: to - v };
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
      for (const m of all) if (m !== win) skip(m, ok.includes(m) ? 'outranked' : 'same');
      if (win !== undefined) put(win, win.amount);
    } else if (step === 'multiply') {
      for (const m of take((x) => x.op === 'multiply')) {
        const r = m.round ?? order.round;
        const x = v * m.amount;
        put(m, r === 'up' ? Math.ceil(x) : r === 'down' ? Math.floor(x) : x);
      }
    } else if (step === 'floor' || step === 'cap') {
      const lo = step === 'floor';
      const ms = live.filter((m) => m.op === step);
      const def = order[step];
      const all: NumberModifier[] = def === undefined ? ms : [...ms, { source: step, op: step, amount: def }];
      const win = all.reduce<NumberModifier | undefined>((a, m) => (a === undefined || (lo ? m.amount > a.amount : m.amount < a.amount) ? m : a), undefined);
      for (const m of ms) if (m !== win) skip(m, 'outranked');
      if (win !== undefined) {
        if (lo ? v < win.amount : v > win.amount) bound = put(win, win.amount) ?? bound;
        else if (ms.includes(win)) skip(win, 'same');
      }
    } else {
      let ms = take((m) => m.op === 'add' && (step === 'add' || (step === 'decrease' ? m.amount <= 0 : m.amount >= 0)));
      if (step === 'decrease' && order.decreases === 'highestMin') ms = ms.sort((a, b) => (b.min ?? -Infinity) - (a.min ?? -Infinity) || a.amount - b.amount);
      for (const m of ms) put(m, m.amount < 0 && m.min !== undefined ? (v <= m.min ? v : Math.max(m.min, v + m.amount)) : v + m.amount);
    }
  }
  return { value: v, base, parts, ...(bound === undefined ? {} : { bound }), ...(opts.unchanged === true ? { unchanged: idle } : {}) };
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
