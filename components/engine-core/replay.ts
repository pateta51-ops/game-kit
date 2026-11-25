// `hashState` and replay (ported from Rome's replay/replay.ts, adapted). A game is
// `(options, rules, actions)`: the state is rebuilt by replay, and the same inputs give the same hash.
import { applyAction, createGame } from './apply.ts';
import { StateInvariantError } from './errors.ts';
import { hashValue } from './hash.ts';
import type { ApplyResult, GameRules, GameTypes, InvariantViolation, LocatedTriggerCap } from './types.ts';

/** `hashState`: FNV-1a 64 over the canonical JSON of the state. */
export const hashState = (state: unknown): string => hashValue(state);

export interface ReplayResult<G extends GameTypes> {
  readonly ok: boolean;
  /** The state after the last action that applied (the new game's state when none did); null when no game starts. */
  readonly state: G['state'] | null;
  readonly hash: string | null;
  /** Zero-based index of the first action that was rejected, or null. */
  readonly failedAt: number | null;
  readonly error: string | null;
  /** Why it failed: the recording is illegal, or the pack or hash differs. */
  readonly reason?: 'illegal' | 'pack' | 'hash';
  /** Strict state checks rejected setup or an action in the recording. */
  readonly invariantFailure?: true;
  /** Diagnostics from setup and replayed actions, in execution order. */
  readonly violations?: readonly InvariantViolation[];
  readonly triggerCap?: LocatedTriggerCap;
}

/** Public-safe diagnostic text. Seed and replay commands belong to the calling tool. */
export function formatTriggerCap(cap: LocatedTriggerCap): string {
  const where = cap.actionIndex === null ? 'setup' : `action ${String(cap.actionIndex + 1)}`;
  return `trigger-cap at ${where}: processed ${String(cap.processed)} of budget ${String(cap.cap)}, dropped ${String(cap.remaining)} (first batch ${String(cap.batch)})`;
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
  const violations: InvariantViolation[] = [];
  const collect = (found: readonly InvariantViolation[]): void => {
    for (const violation of found) violations.push(violation);
  };
  let triggerCap: LocatedTriggerCap | undefined;
  const diagnostics = (): Pick<ReplayResult<G>, 'violations' | 'triggerCap'> => ({
    ...(violations.length ? { violations } : {}),
    ...(triggerCap === undefined ? {} : { triggerCap }),
  });
  let state: G['state'];
  try {
    const first = createGame(game, options, rules, content);
    state = first.state;
    collect(first.violations);
    if (first.triggerCap !== undefined) triggerCap = { ...first.triggerCap, actionIndex: null };
  } catch (e) {
    const failure: ReplayResult<G> = { ok: false, state: null, hash: null, failedAt: null, error: null, reason: 'illegal' };
    if (e instanceof StateInvariantError)
      return { ...failure, error: `Setup violates state invariants: ${e.message}`, invariantFailure: true, violations: e.violations };
    return { ...failure, error: `The recorded options cannot start a game: ${String(e)}` };
  }
  const fail = (failedAt: number | null, error: string, reason: NonNullable<ReplayResult<G>['reason']>): ReplayResult<G> => ({
    ok: false,
    state,
    hash: hashState(state),
    failedAt,
    error,
    reason,
    ...diagnostics(),
  });
  if (expect !== undefined && expect.contentHash !== game.contentHash(content)) {
    return fail(null, 'The recording was made with another content pack.', 'pack');
  }
  for (const [at, action] of actions.entries()) {
    try {
      const next: ApplyResult<G> = applyAction(game, state, action, content);
      state = next.state;
      collect(next.violations);
      if (next.triggerCap !== undefined) triggerCap ??= { ...next.triggerCap, actionIndex: at };
    } catch (e) {
      if (e instanceof StateInvariantError) {
        collect(e.violations);
        return { ...fail(at, `Action ${String(at + 1)} violates state invariants: ${e.message}`, 'illegal'), invariantFailure: true };
      }
      return fail(at, `Action ${String(at + 1)} is not legal: ${String(e)}`, 'illegal');
    }
  }
  const hash = hashState(state);
  if (expect?.finalHash !== undefined && expect.finalHash !== hash) {
    return fail(null, 'The replayed game differs from the recorded one (the engine changed).', 'hash');
  }
  return { ok: true, state, hash, failedAt: null, error: null, ...diagnostics() };
}
