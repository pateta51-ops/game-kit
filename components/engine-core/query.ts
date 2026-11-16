// K124: query channel for derived data (Rally the Troops `exports.query(state, role, what)`, ISC; written new).
import { copyJson, deepFreeze } from './copy.ts';
import { GameSetupError } from './errors.ts';
import type { GameRules, GameTypes } from './types.ts';

/** Runs the game's named query on a state (it gets a frozen copy of the content, so a mutating query throws); an unknown name is a `GameSetupError`. */
export function query<G extends GameTypes>(game: GameRules<G>, state: G['state'], content: G['content'], what: string, player?: string, arg?: unknown): unknown {
  const q = game.queries?.[what];
  if (!q) throw new GameSetupError(`query: no query "${what}"`);
  const c = copyJson(content);
  deepFreeze(c);
  return q(state, c, player, arg);
}
