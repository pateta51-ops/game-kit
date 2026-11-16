// sim-pool and replay-cli module: `simGame` (whole games with a driver) and `specs` (the golden games).
import type { AnswerAction } from '../../kit/engine-core/index.ts';
import { bySeat, randomDriver, type Driver, type SimGame } from '../../kit/sim-pool/index.ts';
import type { GoldenSpec } from '../../kit/replay-cli/golden.ts';
import { CONTENT, GAME, greedyPicks, RULES, viewOf, type Ref, type Seat } from './rules.ts';

// decides from its own seat's view (bySeat routes each prompt by its seat): the full state is never read past viewOf
const greedy = (seat: Seat): Driver<Ref> => ({
  name: 'greedy',
  choose: (state, answers) => {
    const picks = greedyPicks(viewOf(state, seat));
    return answers.find((a) => a.picks.join() === picks.join()) ?? (answers[0] as AnswerAction);
  },
  reasons: () => [],
});

export const simGame: SimGame<Ref, { winner: number | null }> = {
  rules: GAME,
  content: () => CONTENT,
  start: (spec) => ({ options: { seed: spec.seed }, rules: RULES }),
  driver: (name) => (name === 'greedy' ? bySeat<Ref>({ 0: greedy(0), 1: greedy(1) }) : randomDriver<Ref>()),
  summary: (state) => ({ winner: state.result?.winner ?? null }),
  maxActions: 500,
};

export const specs: readonly GoldenSpec[] = [
  { name: 'greedy-1', driver: 'greedy' },
  { name: 'random-1', driver: 'random' },
];
