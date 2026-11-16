// Tooling for writing a script: build it from a seed's line of play (a seed search's driver line) and the game's narration,
// list each step's answers in the words on screen, and dump a line for reading.
import { applyAction, type AnswerAction, type GameTypes } from '../engine-core';
import type { TutorialGame } from './game';
import { startRun } from './play';
import type { ExpectedEvent, TutorialScript, TutorialStep } from './script';

/** One step to build: it takes the next `n` answers of the line (0: Next); `auto` plays them on Next. */
export interface StepPlan {
  readonly id: string;
  readonly n: number;
  readonly auto?: boolean;
  readonly narration: string;
  readonly targets?: readonly string[];
  readonly items?: readonly string[];
}

export interface BuildOptions<G extends GameTypes> {
  readonly seed: string;
  readonly title?: string;
  /** The events a step expects (default none). */
  readonly keep?: (event: G['event']) => boolean;
  /** An event as the script expects it, e.g. without its sequence fields (default the event). */
  readonly strip?: (event: G['event']) => ExpectedEvent;
}

const answerOf = <G extends GameTypes>(game: TutorialGame<G>, state: G['state'], ref: string): string => game.findOption?.(state, ref) ?? ref;
const wordsOf = <G extends GameTypes>(game: TutorialGame<G>, state: G['state'], picks: readonly string[], words: (w: string) => string): string =>
  picks.map((id) => words(game.optionWords?.(state, answerOf(game, state, id)) ?? id)).join(', ');

/** The script: each step takes the next `n` answers of `actions` (from the seed's setup), its expected events read from playing them.
 * Throws when a step finds no prompt or the steps do not take the whole line. */
export function buildScript<G extends GameTypes>(game: TutorialGame<G>, actions: readonly AnswerAction[], plan: readonly StepPlan[], o: BuildOptions<G>): TutorialScript {
  let s = startRun(game, o.seed).state;
  let at = 0;
  const steps = plan.map((st): TutorialStep => {
    const moves = actions.slice(at, at + st.n).map((a) => [...a.picks]);
    if (moves.length < st.n) throw new Error(`${st.id}: the line has only ${String(actions.length)} answers`);
    const events: G['event'][] = [];
    let asks: string | undefined;
    let kind: string | undefined;
    for (const m of moves) {
      const p = s.prompt;
      if (p === null) throw new Error(`${st.id}: no prompt`);
      if (st.n === 1) {
        kind = game.promptKind?.(s);
        asks = wordsOf(game, s, m, (w) => w);
      }
      const r = applyAction(game.rules, s, { kind: 'answer', promptId: p.id, picks: m.map((r) => answerOf(game, s, r)) }, game.content);
      events.push(...r.events);
      s = r.state;
    }
    at += st.n;
    const expect = events.filter((e) => o.keep?.(e) ?? false).map((e) => o.strip?.(e) ?? (e as unknown as ExpectedEvent));
    const first = moves[0] ?? [];
    return {
      id: st.id,
      narration: st.narration,
      targets: [...(st.targets ?? [])],
      do: st.n === 0 ? { kind: 'next' } : st.auto === true || st.n > 1 ? { kind: 'auto', moves } : { kind: 'move', ...(kind === undefined ? {} : { prompt: kind }), choose: first },
      ...(asks === undefined ? {} : { asks }),
      ...(events.length === 0 ? {} : { expect }),
      ...(st.items ? { items: [...st.items] } : {}),
    };
  });
  if (at !== actions.length) throw new Error(`the steps take ${String(at)} answers; the line has ${String(actions.length)}`);
  return { seed: o.seed, ...(o.title === undefined ? {} : { title: o.title }), steps };
}

/** Each step's answers in the words on screen (the game's `optionWords`, then `words`, e.g. icon tokens to names); a Next step has none.
 * A step whose answer finds no prompt or is refused ends the list. */
export function answerWords<G extends GameTypes>(game: TutorialGame<G>, script: TutorialScript, words: (w: string) => string = (w) => w): string[][] {
  let s = startRun(game, script.seed).state;
  const out: string[][] = [];
  for (const step of script.steps) {
    const got: string[] = [];
    const moves = step.do.kind === 'auto' ? step.do.moves : step.do.kind === 'move' ? [step.do.choose] : [];
    for (const m of moves) {
      const p = s.prompt;
      if (p === null) return [...out, got];
      got.push(wordsOf(game, s, m, words));
      try {
        s = applyAction(game.rules, s, { kind: 'answer', promptId: p.id, picks: m.map((r) => answerOf(game, s, r)) }, game.content).state;
      } catch {
        return [...out, got];
      }
    }
    out.push(got);
  }
  return out;
}

/** A line of play in words: per answer, where the game is (`where`), the prompt's kind, the picks and the options (`(x)` disabled);
 * then its events. For reading a seed before writing its narration. */
export function lineDump<G extends GameTypes>(game: TutorialGame<G>, seed: string, actions: readonly AnswerAction[], where: (state: G['state']) => string = () => ''): string[] {
  let s = startRun(game, seed).state;
  const out: string[] = [];
  for (const [i, a] of actions.entries()) {
    const p = s.prompt;
    const opts = (p?.options ?? []).map((o) => `${o.id}${o.enabled ? '' : '(x)'}=${game.optionWords?.(s, o.id) ?? o.id}`).join(' | ');
    out.push(`#${String(i)} [${where(s)}] ${game.promptKind?.(s) ?? ''}: ${a.picks.join(', ')}  {${opts}}`);
    if (p === null) break;
    const r = applyAction(game.rules, s, { ...a, promptId: p.id }, game.content);
    for (const e of r.events) out.push(`    ${game.eventWords?.(s, e) ?? JSON.stringify(e)}`);
    s = r.state;
  }
  return out;
}
