// The headless check: replay a script on its seed (or another) and print every problem. A game's `tutorial:check`
// script loads its script and adapter and returns this function's exit code (0 the script plays, 1 a problem).
import type { GameTypes } from '../engine-core';
import type { TutorialGame } from './game';
import { playScript, type PlayOptions } from './play';
import type { TutorialScript } from './script';

export interface CheckIo {
  out(line: string): void;
  err(line: string): void;
}

export function tutorialCheck<G extends GameTypes>(
  game: TutorialGame<G>,
  script: TutorialScript,
  options: PlayOptions = {},
  io: CheckIo = { out: console.log, err: console.error },
  name = script.title ?? 'tutorial',
): 0 | 1 {
  let report;
  try {
    report = playScript(game, script, options);
  } catch (e) {
    io.err(`tutorial:check: ${name}: the engine threw while playing the script: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  const seed = options.seed ?? script.seed;
  if (!report.ok) {
    io.err(`tutorial:check: ${name} on seed ${seed}: ${String(report.problems.length)} problem(s); ${String(report.stepsPlayed)} of ${String(script.steps.length)} steps played`);
    for (const p of report.problems) io.err(`  ${p}`);
    return 1;
  }
  const items = options.items === undefined ? '' : `, ${String(report.covered.length)} of ${String(options.items.length)} items`;
  const end = report.run.state.result === null ? 'not over' : `ended ${JSON.stringify(report.run.state.result)}`;
  io.out(`tutorial:check: ${name} on seed ${seed}: ${String(script.steps.length)} steps, ${String(report.run.actions.length)} answers${items}, ${end}: OK`);
  return 0;
}
