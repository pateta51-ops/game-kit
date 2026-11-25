import { StateInvariantError } from './errors.ts';
import type { GameRules, GameTypes, InvariantViolation } from './types.ts';

let checking = false;

/** Enable diagnostic checks for games that have not selected their own invariant policy. Off by default. */
export function setInvariantChecking(on: boolean): void {
  checking = on;
}

/** Is the legacy diagnostic switch on? */
export const isChecking = (): boolean => checking;

export function checkStateInvariants<G extends GameTypes>(
  game: GameRules<G>,
  state: G['state'],
  content: G['content'],
  events: readonly G['event'][],
  prev?: G['state'],
): readonly InvariantViolation[] {
  const policy = game.invariantPolicy;
  if (policy === undefined && !checking) return [];
  const violations = game.invariants?.(state, content, events, prev) ?? [];
  if (policy === 'strict' && violations.length) throw new StateInvariantError(violations);
  return violations;
}
