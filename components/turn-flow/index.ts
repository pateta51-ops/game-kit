// K264 (audit G03/T5): rounds, turns per seat, phases and steps as a data table; the runner calls engine-core's
// `boundary()` at each turn, phase and round edge. Idea from 7th Inning Stretch's `season.phase` chain (each phase task
// pushes its work, then the next phase task), written new and game-free.
import { boundary, draftOf, type Ctx, type GameTypes, type HandlerTable } from '../engine-core/index.ts';

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
