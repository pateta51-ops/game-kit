// `hashState` and replay (ported from Rome's replay/replay.ts, adapted). A game is
// `(options, rules, actions)`: the state is rebuilt by replay, and the same inputs give the same hash.
import { applyAction, createGame } from './apply.ts';
import { hashValue } from './hash.ts';
import type { GameRules, GameTypes } from './types.ts';

/** `hashState`: FNV-1a 64 over the canonical JSON of the state. */
export const hashState = (state: unknown): string => hashValue(state);

export interface ReplayResult<G extends GameTypes> {
  readonly ok: boolean;
  /** The state after the last action that applied (the new game's state when none did); null when no game starts. */
  readonly state: G['state'] | null;
  readonly hash: string | null;
  /** Zero-based index of the first action that was refused, or null. */
  readonly failedAt: number | null;
  readonly error: string | null;
  /** Why it failed: the recorded game is not legal ('illegal'), the pack differs, or the hash differs. */
  readonly reason?: 'illegal' | 'pack' | 'hash';
}

/** What a recorded game expects of the replay: the pack it was played with and, optionally, the final hash. */
export interface ReplayExpectation {
  readonly contentHash: string;
  readonly finalHash?: string;
}

/** Create the game and apply every action. Refuses (never throws on a bad action) an action the engine rejects. */
export function replay<G extends GameTypes>(
  game: GameRules<G>,
  options: G['options'],
  rules: G['rules'],
  actions: readonly G['action'][],
  content: G['content'],
  expect?: ReplayExpectation,
): ReplayResult<G> {
  let state: G['state'];
  try {
    state = createGame(game, options, rules, content).state;
  } catch (e) {
    return { ok: false, state: null, hash: null, failedAt: null, error: `The recorded options cannot start a game: ${String(e)}`, reason: 'illegal' };
  }
  const fail = (failedAt: number | null, error: string, reason: 'illegal' | 'pack' | 'hash'): ReplayResult<G> => ({
    ok: false,
    state,
    hash: hashState(state),
    failedAt,
    error,
    reason,
  });
  if (expect !== undefined && expect.contentHash !== game.contentHash(content)) {
    return fail(null, 'The recording was made with another content pack.', 'pack');
  }
  for (const [at, action] of actions.entries()) {
    try {
      state = applyAction(game, state, action, content).state;
    } catch (e) {
      return fail(at, `Action ${String(at + 1)} is not legal: ${String(e)}`, 'illegal');
    }
  }
  const hash = hashState(state);
  if (expect?.finalHash !== undefined && expect.finalHash !== hash) {
    return fail(null, 'The replayed game differs from the recorded one (the engine changed).', 'hash');
  }
  return { ok: true, state, hash, failedAt: null, error: null };
}
