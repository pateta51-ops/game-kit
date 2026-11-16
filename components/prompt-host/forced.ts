// K226 (7IS src/ui/store.ts dispatch, lines 99-104): forced answers are sent from the game's store, right after the player's
// answer, and join its undo step (engine-core `extendStep`), so one Undo takes back one click and the events of the click
// and of every forced answer after it are paced as one (paced-view `pushSteps`). Only prompts of `seat` (or with no seat).
import { addStep, extendStep, seatKey, type GameRules, type GameTypes, type StepHistory, type StepResult } from '../engine-core/index';

/** The picks to send without asking (e.g. `(p) => autoAnswer(p, setting, NEVER)`), or null to ask. */
export type Forced<P> = (p: P) => readonly string[] | null;

export interface ForcedOptions {
  /** The seat that answers on this screen: a prompt of another seat stops the loop (one with no seat is everyone's). `'all'`: every seat (hot seat). */
  readonly seat: string | number;
  /** The most forced answers in a row (default 200). */
  readonly cap?: number;
}

/** Sends forced answers to the open prompts, each joined to the top step; stops at a prompt the player must answer. */
export function sendForced<G extends GameTypes>(game: GameRules<G>, h: StepHistory<G>, content: G['content'], forced: Forced<G['prompt']>, { seat, cap = 200 }: ForcedOptions): StepResult<G> & { capped: boolean } {
  let r: StepResult<G> = { ok: true, history: h, events: [], error: null };
  for (let i = 0; ; i += 1) {
    const p = r.history.state.prompt as G['prompt'] | null;
    if (p === null || (seat !== 'all' && p.seat !== undefined && seatKey(p.seat) !== seatKey(seat))) break;
    const picks = forced(p);
    if (picks === null) break;
    if (i >= cap) return { ...r, capped: true, error: `Forced answers did not stop after ${String(cap)}.` };
    const n = extendStep(game, r.history, { kind: 'answer', promptId: p.id, picks }, content);
    if (!n.ok) break;
    r = { ...n, events: [...r.events, ...n.events] };
  }
  return { ...r, capped: false };
}

/** The player's answer as a new step (`addStep`), then the forced answers after it (`sendForced`); the events of all. */
export function answerWithForced<G extends GameTypes>(game: GameRules<G>, h: StepHistory<G>, action: G['action'], content: G['content'], forced: Forced<G['prompt']>, o: ForcedOptions): StepResult<G> & { capped: boolean } {
  const r = addStep(game, h, action, content);
  if (!r.ok) return { ...r, capped: false };
  const f = sendForced(game, r.history, content, forced, o);
  return { ...f, events: [...r.events, ...f.events] };
}
