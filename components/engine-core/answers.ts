// K25, K30: every answer set of a prompt, and test helpers that drive a game through `applyAction`. Ported from
// 7th Inning Stretch (src/engine/api.ts enumerateAnswers; tests/helpers randomPicks, playUntil, expectEvents; the
// skip-empty test in src/ui/prompts/prompts.test.tsx). They throw plain Errors, so no test runner is imported.
import { applyAction } from './apply';
import { nextUint32, seedRng } from './rng';
import type { AnswerAction, GameRules, GameTypes, KernelPrompt, KernelState } from './types';

/** Every answer `validateAction` accepts: each set of enabled option ids of size min..max, in option order (an ordered prompt is listed once per set). */
export function enumerateAnswers(state: KernelState): AnswerAction[] {
  const p = state.prompt;
  if (p === null || state.result !== null) return [];
  const ids = p.options.filter((o) => o.enabled).map((o) => o.id);
  const out: AnswerAction[] = [];
  const pick = (from: number, acc: string[]): void => {
    if (acc.length >= p.min) out.push({ kind: 'answer', promptId: p.id, picks: acc });
    if (acc.length === p.max) return;
    for (let i = from; i < ids.length; i += 1) pick(i + 1, [...acc, ids[i] as string]);
  };
  pick(0, []);
  return out;
}

/** The first `min` enabled options of the open prompt. */
export const firstPicks = (s: KernelState): string[] => {
  const p = s.prompt as KernelPrompt;
  return p.options.filter((o) => o.enabled).slice(0, p.min).map((o) => o.id);
};

/** A seeded random answer from the seed and the prompt id (picks in random order). */
export function randomPicks(s: KernelState, seed: string): string[] {
  const p = s.prompt as KernelPrompt;
  const w = seedRng(`${seed}:${String(p.id)}`);
  const ids = p.options.filter((o) => o.enabled).map((o) => o.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = nextUint32(w) % (i + 1);
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
  }
  return ids.slice(0, p.min + (nextUint32(w) % (Math.max(Math.min(p.max, ids.length) - p.min, 0) + 1)));
}

export interface Played<G extends GameTypes> {
  state: G['state'];
  events: G['event'][];
}

/** Answer with `pick` (default `firstPicks`) until `stop` holds, the game ends or `cap` answers; events accumulate. */
export function playUntil<G extends GameTypes>(
  game: GameRules<G>,
  start: { readonly state: G['state']; readonly events?: readonly G['event'][] },
  content: G['content'],
  stop: (s: G['state']) => boolean,
  pick: (s: G['state']) => readonly string[] = firstPicks,
  cap = 10_000,
): Played<G> {
  let { state } = start;
  const events = [...(start.events ?? [])];
  for (let i = 0; i < cap && state.result === null && state.prompt !== null && !stop(state); i += 1) {
    const r = applyAction(game, state, { kind: 'answer', promptId: state.prompt.id, picks: pick(state) }, content);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** Throws unless `events` hold these types in this order (others between are allowed); `key` reads an event's type. */
export function expectEvents<E>(events: readonly E[], key: (e: E) => string, ...types: string[]): void {
  let i = 0;
  for (const e of events) if (key(e) === types[i]) i += 1;
  if (i !== types.length) throw new Error(`expected events ${types.join(',')} in order; got ${events.map(key).join(',')}`);
}

/**
 * K30, the skip-empty invariant: plays each start state with `randomPicks` and, at every prompt `auto` answers (non-null),
 * checks that the answer is the only legal one. Returns the count of auto-answered prompts and the problems found.
 */
export function skipEmptyProblems<G extends GameTypes>(
  game: GameRules<G>,
  starts: readonly G['state'][],
  content: G['content'],
  auto: (s: G['state']) => readonly string[] | null,
  seed = 'skip-empty',
  cap = 10_000,
): { autos: number; problems: string[] } {
  let autos = 0;
  const problems: string[] = [];
  starts.forEach((start, k) =>
    playUntil(game, { state: start }, content, (s) => {
      const a = auto(s);
      if (a === null) return false;
      autos += 1;
      const legal = enumerateAnswers(s).map((x) => x.picks);
      if (legal.length !== 1 || JSON.stringify(legal[0]) !== JSON.stringify(a))
        problems.push(`start ${String(k)}, prompt ${String((s.prompt as KernelPrompt).id)}: auto ${JSON.stringify(a)}, legal ${JSON.stringify(legal)}`);
      return false;
    }, (s) => randomPicks(s, `${seed}:${String(k)}`), cap),
  );
  return { autos, problems };
}
