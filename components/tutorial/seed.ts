// Seed search: try seeds until a line of play on one shows what the game wants (a predicate over its events). The line
// is the script played on the seed, or a game's driver playing from the setup.
import type { PortAnswer, PortTypes } from '../engine-core/index.ts';
import { drive, type TutorialAction, type TutorialEngine } from './game.ts';
import { formatFailure, playStep, startRun } from './play.ts';
import type { TutorialScript } from './script.ts';

export interface SeedLine<G extends PortTypes> {
  readonly events: readonly G['event'][];
  readonly state: G['state'];
  readonly actions: readonly TutorialAction<G>[];
  /** Why the line stopped early (a step that failed, an engine refusal, the action cap), or undefined. */
  readonly stopped?: string;
}

/** The script on a seed, every step's events in order; it stops at the first failed step. */
export const scriptLine =
  <G extends PortTypes>(game: TutorialEngine<G>, script: TutorialScript) =>
  (seed: string): SeedLine<G> => {
    let run = startRun(game, seed);
    const events: G['event'][] = [];
    for (const [i, step] of script.steps.entries()) {
      const out = playStep(game, run, step, i + 1);
      run = out.run;
      events.push(...run.lastEvents);
      if (!out.ok) return { events, state: run.state, actions: run.actions, stopped: formatFailure(out.failure) };
    }
    return { events, state: run.state, actions: run.actions };
  };

/** A driver (the game's AI, or one steered toward what the tutorial teaches) plays from the setup until the game is over,
 * no prompt is open, `choose` returns null, or `maxActions`. */
export const driverLine =
  <G extends PortTypes>(game: TutorialEngine<G>, choose: (state: G['state'], seed: string) => TutorialAction<G> | null, maxActions = 2000) =>
  (seed: string): SeedLine<G> => {
    const d = drive(game);
    let state = d.start(seed);
    const events: G['event'][] = [];
    const actions: TutorialAction<G>[] = [];
    while (d.result(state) === null && d.prompt(state) !== null) {
      if (actions.length >= maxActions) return { events, state, actions, stopped: `the cap of ${String(maxActions)} actions` };
      const a = choose(state, seed);
      if (a === null) break;
      try {
        const r = d.answer(state, a as PortAnswer);
        state = r.state;
        events.push(...r.events);
        actions.push(a);
      } catch (e) {
        return { events, state, actions, stopped: `the engine refused ${(a as PortAnswer).picks.join(', ')} (${e instanceof Error ? e.message : String(e)})` };
      }
    }
    return { events, state, actions };
  };

/** `<prefix><n>` for n = from … from + count - 1. */
export function* seedRange(prefix: string, from: number, count: number): Generator<string> {
  for (let n = from; n < from + count; n += 1) yield `${prefix}${String(n)}`;
}

export interface SeedSearch<G extends PortTypes> {
  readonly seeds: Iterable<string>;
  readonly play: (seed: string) => SeedLine<G>;
  /** The game's predicate: does this line show what the tutorial needs? */
  readonly accept: (events: readonly G['event'][], line: SeedLine<G>) => boolean;
  /** Stop after this many good seeds (default 1; 0 tries them all). */
  readonly want?: number;
  /** Ranks the seeds not accepted, for the report when none is good (higher is better). */
  readonly score?: (events: readonly G['event'][], line: SeedLine<G>) => number;
  /** How many of the best seeds to keep (default 5). */
  readonly keep?: number;
}

export interface SeedReport {
  readonly found: readonly string[];
  readonly tried: number;
  readonly best: readonly { readonly seed: string; readonly score: number; readonly stopped?: string }[];
}

export function searchSeeds<G extends PortTypes>(s: SeedSearch<G>): SeedReport {
  const want = s.want ?? 1;
  const found: string[] = [];
  const best: { seed: string; score: number; stopped?: string }[] = [];
  let tried = 0;
  for (const seed of s.seeds) {
    tried += 1;
    const line = s.play(seed);
    if (s.accept(line.events, line)) {
      found.push(seed);
      if (want > 0 && found.length >= want) break;
    } else if (s.score) {
      best.push({ seed, score: s.score(line.events, line), ...(line.stopped === undefined ? {} : { stopped: line.stopped }) });
      best.sort((a, b) => b.score - a.score);
      best.length = Math.min(best.length, s.keep ?? 5);
    }
  }
  return { found, tried, best };
}
