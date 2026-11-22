// K264 (audit G03/T5): rounds, turns per seat, phases and steps as a data table; the runner calls engine-core's
// `boundary()` at each turn, phase and round edge. Idea from 7th Inning Stretch's `season.phase` chain (each phase task
// pushes its work, then the next phase task), written new and game-free.
import { bar, boundary as endDurations, draftOf, type Boundary, type Ctx, type GameTypes, type HandlerTable, type KernelOption } from '../engine-core/index.ts';

export interface FlowPhase {
  readonly id: string;
  readonly steps?: readonly string[];
}
export type FlowLevel = 'turn' | 'phase' | 'step';
export interface FlowPos {
  readonly round: number;
  readonly turn: number;
  readonly seat: string;
  readonly phase: string;
  readonly step: string | null;
}
export interface FlowState extends FlowPos {
  readonly at: readonly [number, number];
  readonly done?: true;
  readonly pass?: true;
}
export interface FlowConfig<G extends GameTypes> {
  readonly phases: readonly FlowPhase[];
  seats(s: G['state']): readonly string[];
  step(ctx: Ctx<G>, pos: FlowPos): void;
  skip?(s: G['state'], level: FlowLevel, pos: FlowPos): boolean;
  readonly rounds?: number;
  /** K320: the round ends after a turn when this says so (a solo game's round ends when its deck runs out); seats keep cycling within the round. Default: after one turn per seat. */
  roundEnds?(s: G['state'], pos: FlowPos): boolean;
  over?(s: G['state']): boolean;
}

type Flowing = { readonly flow?: FlowState };
export const FLOW_NEXT = 'flow.next';
export const flowOf = (s: object): FlowState | undefined => (s as Flowing).flow;
export const whoseTurn = (s: object): string | undefined => (flowOf(s)?.done === true ? undefined : flowOf(s)?.seat);

// K589: a shared once-per limit. A game declares keys with a scope (and per card, per seat); a used one bars its option
// with reason `used`; turn, phase and round limits clear at the runner's turnEnd, phaseEnd and roundEnd; game ones never.
export type LimitScope = 'turn' | 'round' | 'phase' | 'game';
export interface LimitDef {
  readonly scope: LimitScope;
  readonly perCard?: true;
  readonly perSeat?: true;
  /** The words a prompt shows when the limit is used; default `used this turn` and the like. */
  readonly why?: string;
}
export type LimitTable = Readonly<Record<string, LimitDef>>;
/** `seat` defaults to whose turn it is (read only when the key is per seat); `card` is read only when it is per card. */
export interface LimitRef {
  readonly key: string;
  readonly card?: string;
  readonly seat?: string;
}
export type LimitsState = Readonly<Partial<Record<LimitScope, readonly string[]>>>;
type Limited = { readonly limits?: LimitsState };
const WHY: Record<LimitScope, string> = { turn: 'used this turn', round: 'used this round', phase: 'used this phase', game: 'already used this game' };

function slot(s: object, t: LimitTable, r: LimitRef): [LimitDef, string] {
  const d = t[r.key];
  if (d === undefined) throw new Error(`No once-per limit "${r.key}" in the table.`);
  const seat = d.perSeat === true ? (r.seat ?? whoseTurn(s)) : null;
  if (seat === undefined) throw new Error(`Limit "${r.key}" is per seat: pass a seat (no turn is running).`);
  if (d.perCard === true && r.card === undefined) throw new Error(`Limit "${r.key}" is per card: pass a card id.`);
  return [d, JSON.stringify([r.key, seat, d.perCard === true ? r.card : null])];
}
export const limitsOf = (s: object): LimitsState | undefined => (s as Limited).limits;
export const limitUsed = (s: object, t: LimitTable, r: LimitRef): boolean => {
  const [d, id] = slot(s, t, r);
  return limitsOf(s)?.[d.scope]?.includes(id) ?? false;
};
/** Marks the limit used; false when it already was. */
export function markLimit<G extends GameTypes>(ctx: Ctx<G>, t: LimitTable, r: LimitRef): boolean {
  const [d, id] = slot(ctx.s, t, r);
  const l = limitsOf(ctx.s);
  if (l?.[d.scope]?.includes(id) === true) return false;
  (draftOf(ctx) as { limits?: LimitsState }).limits = { ...l, [d.scope]: [...(l?.[d.scope] ?? []), id] };
  return true;
}
/** The prompt option for an action behind the limit: enabled, or barred with reason `used` and the limit's words. */
export const limitOption = (s: object, t: LimitTable, r: LimitRef, id: string): KernelOption =>
  limitUsed(s, t, r) ? bar(id, 'used', t[r.key]?.why ?? WHY[t[r.key]?.scope ?? 'turn']) : { id, enabled: true };
/** Clears every limit of a scope (the runner does it at its edges; for a game's own boundaries). */
export function clearLimits<G extends GameTypes>(ctx: Ctx<G>, scope: LimitScope): void {
  const l = limitsOf(ctx.s);
  if (l?.[scope] === undefined) return;
  const rest = { ...l };
  delete rest[scope];
  (draftOf(ctx) as { limits?: LimitsState }).limits = rest;
}
function boundary<G extends GameTypes>(ctx: Ctx<G>, b: Boundary): void {
  endDurations(ctx, b);
  if (b.kind !== 'turnBegin') clearLimits(ctx, b.kind === 'turnEnd' ? 'turn' : b.kind === 'roundEnd' ? 'round' : 'phase');
}

export function startFlow<G extends GameTypes>(ctx: Ctx<G>): void {
  ctx.then({ kind: FLOW_NEXT });
}

export function endTurn<G extends GameTypes>(ctx: Ctx<G>): void {
  const f = flowOf(ctx.s);
  if (f !== undefined && f.done !== true) (draftOf(ctx) as { flow?: FlowState }).flow = { ...f, pass: true };
}

export function flowHandlers<G extends GameTypes>(cfg: FlowConfig<G>): HandlerTable<G> {
  return {
    [FLOW_NEXT]: (ctx: Ctx<G>) => {
      const f = flowOf(ctx.s);
      if (f?.done === true) return;
      const s = draftOf(ctx) as { flow?: FlowState };
      let round = f?.round ?? 1, turn = f?.turn ?? 0, phase = f?.at[0] ?? 0, step = (f?.at[1] ?? -1) + 1, seat = f?.seat ?? '';
      let inRound = f !== undefined, inTurn = f !== undefined, inPhase = f !== undefined;
      if (f?.pass === true) {
        boundary(ctx, { kind: 'phaseEnd', phase: f.phase });
        inPhase = false;
        phase = cfg.phases.length;
      }
      const skip = (level: FlowLevel, who: string): boolean => {
        const ph = cfg.phases[phase];
        return cfg.skip?.(ctx.s, level, { round, turn, seat: who, phase: level === 'turn' ? '' : (ph?.id ?? ''), step: level === 'step' ? (ph?.steps?.[step] ?? null) : null }) ?? false;
      };
      for (;;) {
        if (cfg.over?.(ctx.s) === true) {
          if (inPhase) boundary(ctx, { kind: 'phaseEnd', phase: cfg.phases[phase]?.id ?? '' });
          if (inTurn) boundary(ctx, { kind: 'turnEnd', player: seat });
          if (inRound) boundary(ctx, { kind: 'roundEnd' });
          break;
        }
        const seats = cfg.seats(ctx.s);
        const wrap = !inTurn && turn >= seats.length;
        if (!inTurn && (cfg.roundEnds === undefined ? wrap : (wrap && (!inRound || seats.length === 0)) || (inRound && cfg.roundEnds(ctx.s, { round, turn, seat, phase: '', step: null })))) {
          boundary(ctx, { kind: 'roundEnd' });
          inRound = false;
          round += 1;
          turn = 0;
          if (cfg.rounds !== undefined && round > cfg.rounds) break;
          continue;
        }
        if (wrap) turn = 0;
        if (!inTurn) {
          seat = seats[turn] as string;
          if (skip('turn', seat)) {
            turn += 1;
            continue;
          }
          boundary(ctx, { kind: 'turnBegin', player: seat });
          inRound = true;
          inTurn = true;
          phase = 0;
          step = 0;
        }
        const ph = cfg.phases[phase];
        if (ph === undefined) {
          boundary(ctx, { kind: 'turnEnd', player: seat });
          inTurn = false;
          const i = seats.indexOf(seat);
          turn = i >= 0 ? i + 1 : turn;
          continue;
        }
        if (!inPhase) {
          step = 0;
          if (skip('phase', seat)) {
            phase += 1;
            continue;
          }
          inPhase = true;
        }
        if (step >= (ph.steps?.length ?? 1)) {
          boundary(ctx, { kind: 'phaseEnd', phase: ph.id });
          inPhase = false;
          phase += 1;
          continue;
        }
        if (ph.steps !== undefined && skip('step', seat)) {
          step += 1;
          continue;
        }
        const pos: FlowPos = { round, turn, seat, phase: ph.id, step: ph.steps?.[step] ?? null };
        s.flow = { ...pos, at: [phase, step] };
        ctx.then({ kind: FLOW_NEXT });
        cfg.step(ctx, pos);
        return;
      }
      s.flow = { ...(f ?? { round, turn: 0, seat: '', phase: '', step: null, at: [0, 0] }), done: true };
    },
  };
}
