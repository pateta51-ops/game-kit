// K542: a status (stunned, stealth, a wound) is a named lasting effect on an object, kind `status`, `target` the object and
// `value` the status name, so every duration of `durations.ts` ends it (boundary, eventOver, ...). Ported in idea from
// Warp's Edge src/engine/combat/stun.ts (6790200): a stun recorded on a target and read when an action asks "is it stunned".
import { addEffect, effectsOf, removeEffect, type ContinuousEffect, type Duration } from './durations.ts';
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
const live = (s: Timed, object: string, name?: string): ContinuousEffect[] =>
  effectsOf(s, STATUS, (e) => e.target === object && (name === undefined || e.value === name));

export const statusCount = (s: Timed, object: string, name: string): number => live(s, object, name).length;
export const hasStatus = (s: Timed, object: string, name: string): boolean => statusCount(s, object, name) > 0;

/** Give `name` to `object`. A non-stacking status already there: nothing changes, `{ given: false, why: 'already' }`. */
export function giveStatus<G extends GameTypes>(ctx: Ctx<G>, table: StatusTable, object: string, name: string, opts: GiveOptions = {}): GiveResult {
  const def = defOf(table, name);
  const n = statusCount(ctx.s, object, name);
  if (def.stacks !== true && n > 0) return { given: false, why: 'already', count: 1 };
  let d: Duration = opts.ends ?? (def.ends === 'removed' ? { until: 'game' } : def.ends);
  if (opts.instance !== undefined && 'until' in d && d.until === 'event') d = { ...d, instance: opts.instance };
  const id = addEffect(ctx, { kind: STATUS, source: opts.source ?? object, target: object, value: name, duration: d });
  return { given: true, id, count: n + 1 };
}

/** Remove up to `n` (default all) of `name` from `object`, oldest first; returns how many went. */
export function removeStatus<G extends GameTypes>(ctx: Ctx<G>, object: string, name: string, n = Infinity): number {
  const gone = live(ctx.s, object, name).slice(0, n);
  for (const e of gone) removeEffect(ctx, e.id);
  return gone.length;
}

/** The object left play: its statuses whose table entry says `endsOnLeave` end; returns their names, once each. */
export function statusLeft<G extends GameTypes>(ctx: Ctx<G>, table: StatusTable, object: string): string[] {
  const gone = live(ctx.s as Timed, object).filter((e) => defOf(table, String(e.value)).endsOnLeave === true);
  for (const e of gone) removeEffect(ctx, e.id);
  return [...new Set(gone.map((e) => String(e.value)))];
}

/** The statuses on `object`, first given first, with their token and count (for a view or a condition). */
export function statusesOf(s: Timed, table: StatusTable, object: string): StatusView[] {
  const out: StatusView[] = [];
  for (const e of live(s, object)) {
    const name = String(e.value);
    const v = out.find((x) => x.name === name);
    if (v === undefined) out.push({ name, token: defOf(table, name).token, count: 1 });
    else (v as { count: number }).count += 1;
  }
  return out;
}
