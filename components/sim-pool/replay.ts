// K101 (halogenandtoast MarvelChampions tools/replay-smoke-answer.hs, idea only): replay a game to one step and say where the time went.
import type { GameTypes } from '../engine-core/index.ts';
import { playOne, type GameSpec, type PlayOptions, type SimGame, type SimRecord, type StepMs } from './play.ts';

export interface StepReport {
  readonly step: number;
  readonly record: SimRecord;
  /** The last step played: its milliseconds by phase (the view is 0 unless `view` was on). */
  readonly ms: StepMs;
  /** The largest view so far, in JSON characters. */
  readonly viewBytes?: number | undefined;
  /** The slowest steps up to there (at most `top`), slowest first. */
  readonly slowest: readonly { step: number; ms: number }[];
  readonly lines: readonly string[];
}

/** Play `spec` to `step` (the driver answers there too, so what fails there fails again) and report that step's timings and the `top` slowest steps. */
export function replayStep<G extends GameTypes, S, O = unknown>(
  game: SimGame<G, S, O>,
  content: G['content'],
  spec: GameSpec,
  step: number,
  opts: Pick<PlayOptions, 'view' | 'hasten'> = {},
  top = 15,
): StepReport {
  const all: { step: number; ms: StepMs }[] = [];
  let bytes: number | undefined;
  const record = playOne(game, content, spec, step, {
    ...opts,
    onStep: (n, ms, b) => {
      all.push({ step: n, ms });
      bytes = b;
    },
  });
  const sum = (m: StepMs): number => m.answers + m.choose + m.apply + m.view;
  const last = all.at(-1)?.ms ?? { answers: 0, choose: 0, apply: 0, view: 0 };
  const slowest = all.map((a) => ({ step: a.step, ms: sum(a.ms) })).sort((a, b) => b.ms - a.ms).slice(0, top);
  const f = (n: number): string => n.toFixed(2);
  const lines = [
    `seed ${spec.seed} (${spec.driver}) to step ${String(step)}: ${record.error ?? (record.violations?.length ? 'invariant violation' : 'no failure')}`,
    `last step: answers ${f(last.answers)} ms, choose ${f(last.choose)} ms, apply ${f(last.apply)} ms, view ${f(last.view)} ms${bytes === undefined ? '' : `, view ${String(bytes)} chars`}`,
    ...slowest.map((s) => `  step ${String(s.step)}: ${f(s.ms)} ms`),
  ];
  return { step, record, ms: last, viewBytes: bytes, slowest, lines };
}
