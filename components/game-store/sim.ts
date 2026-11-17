// K234: the one game object as sim-pool's game module, its driver and replay-cli's engine (node only: sim-pool loads node modules).
import type { GameTypes } from '../engine-core/index.ts';
import { botDriver, bySeat, randomDriver, type Bot, type Driver, type SimGame } from '../sim-pool/index.ts';
import type { ReplayEngine } from '../replay-cli/replay.ts';
import { answerOf, type GameDef, type SeatId } from './index.ts';

/** The opponent as a sim-pool driver: it reads `view(state, prompt.seat)` only. */
export function opponentDriverOf<G extends GameTypes, V, S extends SeatId>(def: GameDef<G, V, S>): Driver<G> {
  return {
    name: 'opponent',
    choose: (state, answers, rng) => {
      const p = state.prompt as G['prompt'];
      if (def.opponent === undefined) throw new Error('This game has no opponent.');
      const picks = def.opponent(def.view(state, p.seat as S), p, rng);
      return answers.find((a) => a.kind === 'answer' && a.picks.join() === picks.join()) ?? answerOf(p.id, picks);
    },
    reasons: () => [],
  };
}

/** K271: a `Bot` as a sim-pool driver over the game's `view`; with driver name `opponent` it answers as `botOpponent` in the store. */
export const botDriverOf = <G extends GameTypes, V, S extends SeatId>(def: GameDef<G, V, S>, bot: Bot<V, G['action']>): Driver<G> => botDriver<G, V>(bot, def.view);

/** sim-pool's game module: drivers `opponent` (every seat) and `random`, plus the game's own. */
export function simGameOf<G extends GameTypes, V, S extends SeatId, Sum = unknown>(
  def: GameDef<G, V, S>,
  o: { drivers?: Readonly<Record<string, Driver<G>>>; summary?: (state: G['state']) => Sum; maxActions?: number } = {},
): SimGame<G, Sum> {
  return {
    rules: def.rules,
    content: () => def.content,
    start: (spec) => def.start(spec.seed),
    driver: (name) => o.drivers?.[name] ?? (name === 'opponent' ? bySeat<G>({}, opponentDriverOf(def)) : randomDriver<G>()),
    ...(o.summary === undefined ? {} : { summary: o.summary }),
    ...(o.maxActions === undefined ? {} : { maxActions: o.maxActions }),
  };
}

/** replay-cli's engine. */
export const replayEngineOf = <G extends GameTypes, V, S extends SeatId>(def: GameDef<G, V, S>, describe?: (state: G['state']) => string[]): ReplayEngine<G> => ({
  game: def.rules,
  content: () => def.content,
  ...(def.format === undefined ? {} : { format: def.format }),
  ...(describe === undefined ? {} : { describe }),
});
