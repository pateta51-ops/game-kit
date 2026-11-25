// K271 (T6, G04): one bot shape for the live store and the simulator: it sees a seat's view and the legal answers, never
// the state. Written new; no game bridged its bot into both yet.
import type { AnswerAction, GameTypes } from '../engine-core/index.ts';
import { readDriverView, type Driver } from './play.ts';
import type { DriverRng } from './rng.ts';

/** Picks one of `answers` from the seat's own `view`; draws only from `rng` (keyed by seed, driver and prompt id). */
export interface Bot<V, A = AnswerAction> {
  readonly name: string;
  choose(view: V, answers: readonly A[], rng: DriverRng): A;
  reasons?(): string[];
}

/** A `Bot` as a sim-pool driver: it gets `view(state, prompt.seat)` and the answers only. */
export function botDriver<G extends GameTypes, V>(bot: Bot<V, G['action']>, view: (state: G['state'], seat: never) => V): Driver<G> {
  return {
    name: bot.name,
    choose: (state, answers, rng) => bot.choose(readDriverView(state, state.prompt?.seat, (seat) => view(state, seat as never)), answers, rng),
    reasons: () => bot.reasons?.() ?? [],
  };
}
