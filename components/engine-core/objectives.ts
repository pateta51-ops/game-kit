// K546: objectives with progress kept in engine state (`s.objectives`): a count to reach or a list of steps (ordered or
// not), an optional fail condition (failures, or a round deadline the game passes), an optional owner seat. Restated in
// idea from STCC src/engine/turn/missions.ts (27fb8882: progress { have, need } capped at need, each mission done once),
// Earthborne Rangers src/engine/phases/clear.ts (b9b06107: a progress threshold clears once, IR-61 latch) and Warp's
// Edge src/engine/combat/counting.ts (6790200: met when have >= need; every part met). Written new.
import type { StateCheck } from './checkpoint.ts';
import { draftOf } from './ctx.ts';
import { EngineBugError } from './errors.ts';
import type { Ctx, GameTypes } from './types.ts';

export interface ObjectiveFail {
  /** Failed when this many failures were recorded (`failObjective`). */
  readonly failures?: number;
  /** Failed when the game ends this round (`objectivesRoundEnd`) and it is not done. */
  readonly round?: number;
}
export type ObjectiveDef =
  | { readonly id: string; readonly kind: 'count'; readonly target: number; readonly fail?: ObjectiveFail; readonly owner?: string }
  | { readonly id: string; readonly kind: 'steps'; readonly steps: readonly string[]; readonly ordered?: boolean; readonly fail?: ObjectiveFail; readonly owner?: string };
export type ObjectiveOutcome = 'open' | 'done' | 'failed';
export interface ObjectiveEntry {
  readonly def: ObjectiveDef;
  readonly count: number;
  readonly steps: readonly string[];
  readonly failures: number;
  readonly outcome: ObjectiveOutcome;
  /** The state check reported its outcome. */
  readonly reported?: true;
}
export interface ObjectiveProgress {
  readonly id: string;
  /** Count reached (capped at `need`), or steps done. */
  readonly have: number;
  readonly need: number;
  /** Steps done, in the order marked. */
  readonly steps: readonly string[];
  readonly failures: number;
  readonly outcome: ObjectiveOutcome;
  readonly owner?: string;
}
export type MarkResult = { readonly marked: true } | { readonly marked: false; readonly why: 'already' | 'order' | 'closed' };
export interface ObjectiveReport {
  readonly id: string;
  readonly outcome: 'done' | 'failed';
}
type WithObjectives = object;

const whole = (n: number, what: string): void => {
  if (!(Number.isInteger(n) && n >= 1)) throw new EngineBugError(`${what} must be a whole number 1 or more, got ${String(n)}`);
};
const list = (s: WithObjectives): readonly ObjectiveEntry[] => (s as { objectives?: readonly ObjectiveEntry[] }).objectives ?? [];
const entry = (s: WithObjectives, id: string): ObjectiveEntry => {
  const e = list(s).find((x) => x.def.id === id);
  if (e === undefined) throw new EngineBugError(`objective "${id}" was not started`);
  return e;
};
const need = (d: ObjectiveDef): number => (d.kind === 'count' ? d.target : d.steps.length);
const put = <G extends GameTypes>(ctx: Ctx<G>, id: string, f: (e: ObjectiveEntry) => ObjectiveEntry): void => {
  (draftOf(ctx) as { objectives?: ObjectiveEntry[] }).objectives = list(ctx.s).map((e) => (e.def.id === id ? f(e) : e));
};
const settle = (e: ObjectiveEntry): ObjectiveEntry => {
  if (e.outcome !== 'open') return e;
  if ((e.def.kind === 'count' ? e.count : e.steps.length) >= need(e.def)) return { ...e, outcome: 'done' };
  if (e.def.fail?.failures !== undefined && e.failures >= e.def.fail.failures) return { ...e, outcome: 'failed' };
  return e;
};

/** Start a scenario's objectives (added after any already started); a repeated id is an `EngineBugError`. */
export function startObjectives<G extends GameTypes>(ctx: Ctx<G>, defs: readonly ObjectiveDef[]): void {
  const old = list(ctx.s);
  const ids = new Set(old.map((e) => e.def.id));
  for (const d of defs) {
    if (ids.has(d.id)) throw new EngineBugError(`objective "${d.id}" is started twice`);
    ids.add(d.id);
    if (d.kind === 'count') whole(d.target, `objective "${d.id}" target`);
    else if (d.steps.length === 0 || new Set(d.steps).size !== d.steps.length) throw new EngineBugError(`objective "${d.id}" needs one or more distinct steps`);
    if (d.fail?.failures !== undefined) whole(d.fail.failures, `objective "${d.id}" fail.failures`);
  }
  (draftOf(ctx) as { objectives?: ObjectiveEntry[] }).objectives = [...old, ...defs.map((def) => ({ def, count: 0, steps: [], failures: 0, outcome: 'open' as const }))];
}

/** Add `n` (default 1) to a count objective; a done or failed one does not change. Returns its progress. */
export function advanceObjective<G extends GameTypes>(ctx: Ctx<G>, id: string, n = 1): ObjectiveProgress {
  const e = entry(ctx.s, id);
  if (e.def.kind !== 'count') throw new EngineBugError(`objective "${id}" has steps: mark them with markStep`);
  whole(n, 'advanceObjective n');
  if (e.outcome === 'open') put(ctx, id, (x) => settle({ ...x, count: Math.min(x.count + n, need(x.def)) }));
  return objectiveProgress(ctx.s, id);
}

/** Mark one step done. Ordered: only the next step is taken (`why: 'order'`). A step not in the list is an `EngineBugError`. */
export function markStep<G extends GameTypes>(ctx: Ctx<G>, id: string, step: string): MarkResult {
  const e = entry(ctx.s, id);
  if (e.def.kind !== 'steps') throw new EngineBugError(`objective "${id}" is a count: advance it with advanceObjective`);
  if (!e.def.steps.includes(step)) throw new EngineBugError(`objective "${id}" has no step "${step}"`);
  if (e.outcome !== 'open') return { marked: false, why: 'closed' };
  if (e.steps.includes(step)) return { marked: false, why: 'already' };
  if (e.def.ordered === true && e.def.steps[e.steps.length] !== step) return { marked: false, why: 'order' };
  put(ctx, id, (x) => settle({ ...x, steps: [...x.steps, step] }));
  return { marked: true };
}

/** Record `n` (default 1) failures; it fails when they reach `fail.failures`. An objective with no `fail.failures` is an `EngineBugError`. */
export function failObjective<G extends GameTypes>(ctx: Ctx<G>, id: string, n = 1): ObjectiveProgress {
  const e = entry(ctx.s, id);
  if (e.def.fail?.failures === undefined) throw new EngineBugError(`objective "${id}" has no fail.failures`);
  whole(n, 'failObjective n');
  if (e.outcome === 'open') put(ctx, id, (x) => settle({ ...x, failures: x.failures + n }));
  return objectiveProgress(ctx.s, id);
}

/** The game ended round `round`: every open objective whose `fail.round` is `round` or earlier fails. Returns their ids. */
export function objectivesRoundEnd<G extends GameTypes>(ctx: Ctx<G>, round: number): string[] {
  const late = list(ctx.s).filter((e) => e.outcome === 'open' && e.def.fail?.round !== undefined && e.def.fail.round <= round).map((e) => e.def.id);
  for (const id of late) put(ctx, id, (x) => ({ ...x, outcome: 'failed' }));
  return late;
}

export function objectiveProgress(s: WithObjectives, id: string): ObjectiveProgress {
  const e = entry(s, id);
  return { id, have: e.def.kind === 'count' ? e.count : e.steps.length, need: need(e.def), steps: e.steps, failures: e.failures, outcome: e.outcome, ...(e.def.owner === undefined ? {} : { owner: e.def.owner }) };
}
export const objectiveDone = (s: WithObjectives, id: string): boolean => entry(s, id).outcome === 'done';
export const objectiveFailed = (s: WithObjectives, id: string): boolean => entry(s, id).outcome === 'failed';
/** Every started objective in start order, or those of one owner seat. */
export const objectivesOf = (s: WithObjectives, owner?: string): ObjectiveProgress[] =>
  list(s).filter((e) => owner === undefined || e.def.owner === owner).map((e) => objectiveProgress(s, e.def.id));

/** Each objective that became done or failed since the last call, once, in start order; marks them reported. */
export function reportObjectives<G extends GameTypes>(ctx: Ctx<G>): ObjectiveReport[] {
  const out = list(ctx.s).filter((e) => e.outcome !== 'open' && e.reported !== true).map((e) => ({ id: e.def.id, outcome: e.outcome as 'done' | 'failed' }));
  for (const r of out) put(ctx, r.id, (x) => ({ ...x, reported: true }));
  return out;
}

/** A checkpoint state check (`cfg.checkpoint.checks`): calls `react` once per objective that became done or failed. */
export const objectivesCheck = <G extends GameTypes>(react: (ctx: Ctx<G>, r: ObjectiveReport) => void, name = 'objectives'): StateCheck<G> => ({
  name,
  run: (ctx) => {
    const out = reportObjectives(ctx);
    for (const r of out) react(ctx, r);
    return out.length > 0;
  },
});
