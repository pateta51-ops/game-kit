// K542: a status (stunned, stealth, a wound) is a named lasting effect on an object, kind `status`, `target` the object and
// `value` the status name, so every duration of `durations.ts` ends it (boundary, eventOver, ...). Ported in idea from
// Warp's Edge src/engine/combat/stun.ts (6790200): a stun recorded on a target and read when an action asks "is it stunned".
import { addEffect, allEffects, effectsOf, removeEffect, type ContinuousEffect, type Duration, type EffectsConfig } from './durations.ts';
import { EngineBugError } from './errors.ts';
import type { TimingState } from './timing.ts';
import type { Ctx, GameTypes } from './types.ts';

export const STATUS = 'status';
export interface StatusDef {
  /** The token key a view draws (card-attachments `TokenRow`). */
  readonly token: string;
  /** true: each give adds one (a count); false or absent: giving it again does nothing. */
  readonly stacks?: boolean;
  /** How it ends: any `Duration`, or `'removed'`: only `removeStatus` (or `statusLeft`) ends it. */
  readonly ends: Duration | 'removed';
  /** true: `statusLeft` (the object left play) ends it. */
  readonly endsOnLeave?: boolean;
}
export type StatusTable = Readonly<Record<string, StatusDef>>;
export interface GiveOptions {
  /** Who gave it (the effect's `source`); default the object itself. */
  readonly source?: string;
  /** Replaces the table's `ends` for this give (a batch number, a player). */
  readonly ends?: Duration;
  /** Sets the `instance` of an `until: 'event'` end (the combat's id, the unit's id). */
  readonly instance?: string;
  /** A key in the game's condition table (`EffectsConfig.conditions`): the status counts only while it holds. */
  readonly when?: string;
}
export type GiveResult = { readonly given: true; readonly id: number; readonly count: number } | { readonly given: false; readonly why: 'already'; readonly count: 1 };
export interface StatusView {
  readonly name: string;
  readonly token: string;
  readonly count: number;
}

type Timed = { readonly timing?: TimingState };
const defOf = (table: StatusTable, name: string): StatusDef => {
  const d = table[name];
  if (d === undefined) throw new EngineBugError(`status: "${name}" is not in the game's status table`);
  return d;
};
const on = (object: string, name?: string) => (e: ContinuousEffect): boolean => e.kind === STATUS && e.target === object && (name === undefined || e.value === name);
const live = <S extends Timed>(s: S, object: string, name?: string, cfg?: EffectsConfig<S>): ContinuousEffect[] => effectsOf(s, STATUS, on(object, name), cfg);
// Given and not ended, whether or not `blanked` or `when` hides it now (what give, remove and leave act on), oldest first.
const kept = (s: Timed, object: string, name?: string): ContinuousEffect[] => allEffects(s).filter((e) => e.ended !== true && e.waiting !== true && on(object, name)(e));

/** Read with the game's `EffectsConfig` (blanked sources, `when` conditions), so it always agrees with `effectsOf`. */
export const statusCount = <S extends Timed>(s: S, object: string, name: string, cfg?: EffectsConfig<S>): number => live(s, object, name, cfg).length;
export const hasStatus = <S extends Timed>(s: S, object: string, name: string, cfg?: EffectsConfig<S>): boolean => statusCount(s, object, name, cfg) > 0;

/** Give `name` to `object`. A non-stacking status already there: nothing changes, `{ given: false, why: 'already' }`. */
export function giveStatus<G extends GameTypes>(ctx: Ctx<G>, table: StatusTable, object: string, name: string, opts: GiveOptions = {}): GiveResult {
  const def = defOf(table, name);
  const n = kept(ctx.s, object, name).length;
  if (def.stacks !== true && n > 0) return { given: false, why: 'already', count: 1 };
  let d: Duration = opts.ends ?? (def.ends === 'removed' ? { until: 'game' } : def.ends);
  if (opts.instance !== undefined && 'until' in d && d.until === 'event') d = { ...d, instance: opts.instance };
  const id = addEffect(ctx, { kind: STATUS, source: opts.source ?? object, target: object, value: name, duration: d, ...(opts.when === undefined ? {} : { when: opts.when }) });
  return { given: true, id, count: n + 1 };
}

/** Remove up to `n` (default all; else a whole number 1 or more) of `name` from `object`, oldest given first; returns how many went. */
export function removeStatus<G extends GameTypes>(ctx: Ctx<G>, object: string, name: string, n = Infinity): number {
  if (n !== Infinity && !(Number.isInteger(n) && n >= 1)) throw new EngineBugError(`removeStatus: n must be a whole number 1 or more, got ${String(n)}`);
  const gone = kept(ctx.s, object, name).slice(0, n);
  for (const e of gone) removeEffect(ctx, e.id);
  return gone.length;
}

/** The object left play: its statuses whose table entry says `endsOnLeave` end; returns their names, once each. */
export function statusLeft<G extends GameTypes>(ctx: Ctx<G>, table: StatusTable, object: string): string[] {
  const gone = kept(ctx.s, object).filter((e) => defOf(table, String(e.value)).endsOnLeave === true);
  for (const e of gone) removeEffect(ctx, e.id);
  return [...new Set(gone.map((e) => String(e.value)))];
}

/** The statuses on `object`, first given first, with their token and count (for a view or a condition). */
export function statusesOf<S extends Timed>(s: S, table: StatusTable, object: string, cfg?: EffectsConfig<S>): StatusView[] {
  const out: StatusView[] = [];
  for (const e of live(s, object, undefined, cfg)) {
    const name = String(e.value);
    const v = out.find((x) => x.name === name);
    if (v === undefined) out.push({ name, token: defOf(table, name).token, count: 1 });
    else (v as { count: number }).count += 1;
  }
  return out;
}
