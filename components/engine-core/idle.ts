// K91 (netrunner `:change-in-game-state`, MIT; design only): "does this change the game?" is asked apart from "is this
// legal?". A legal option that would change nothing carries `idle` (the game's words); it stays enabled and is never
// swallowed: the UI warns, the game resolves it loudly. `idleProblems` probes each option and reports marks that lie.
import { applyAction } from './apply.ts';
import { canonicalJson } from './canonical.ts';
import type { GameRules, GameTypes, KernelOption } from './types.ts';

/** `options` with `idle` set where `why(id)` gives words (left as they are where it gives undefined). */
export const markIdle = <O extends KernelOption>(options: readonly O[], why: (id: string) => string | undefined): O[] =>
  options.map((o) => {
    const w = why(o.id);
    return w === undefined ? o : { ...o, idle: w };
  });

/** Does answering the open prompt with `picks` leave `view` of the state unchanged? `view`: what counts as the game (the game drops its bookkeeping). */
export function doesNothing<G extends GameTypes>(
  game: GameRules<G>,
  state: G['state'],
  picks: readonly string[],
  content: G['content'],
  view: (s: G['state']) => unknown,
): boolean {
  const p = state.prompt;
  if (p === null) return false;
  const after = applyAction(game, state, { kind: 'answer', promptId: p.id, picks }, content).state;
  return canonicalJson(view(after)) === canonicalJson(view(state));
}

/** Each enabled option of a one-pick prompt, probed: marked idle but changes the game, or unmarked and changes nothing. */
export function idleProblems<G extends GameTypes>(
  game: GameRules<G>,
  state: G['state'],
  content: G['content'],
  view: (s: G['state']) => unknown,
): string[] {
  const p = state.prompt;
  if (p === null) return [];
  const out: string[] = [];
  for (const o of p.options) {
    if (!o.enabled || (o.alone !== true && (p.min > 1 || p.max < 1))) continue;
    const none = doesNothing(game, state, [o.id], content, view);
    if (none && o.idle === undefined) out.push(`"${o.id}" changes nothing but is not marked idle`);
    if (!none && o.idle !== undefined) out.push(`"${o.id}" is marked idle (${o.idle}) but changes the game`);
  }
  return out;
}
