// sim-pool and replay-cli module: `simGame` (whole games with a driver) and `specs` (the golden games).
import type { AnswerAction } from '../../kit/engine-core/index';
import { randomDriver, type Driver, type SimGame } from '../../kit/sim-pool/index';
import type { GoldenSpec } from '../../kit/replay-cli/golden';
import { CONTENT, GAME, greedyPicks, RULES, viewOf, type Ref } from './rules';

// decides from the answering seat's own view: the full state is never read past viewOf
const greedy = (): Driver<Ref> => ({
  name: 'greedy',
  choose: (state, answers) => {
    const picks = greedyPicks(viewOf(state, state.prompt?.seat ?? 0));
    return answers.find((a) => a.picks.join() === picks.join()) ?? (answers[0] as AnswerAction);
  },
  reasons: () => [],
});

export const simGame: SimGame<Ref, { winner: number | null }> = {
  rules: GAME,
  content: () => CONTENT,
  start: (spec) => ({ options: { seed: spec.seed }, rules: RULES }),
  driver: (name) => (name === 'greedy' ? greedy() : randomDriver<Ref>()),
  summary: (state) => ({ winner: state.result?.winner ?? null }),
  maxActions: 500,
};

export const specs: readonly GoldenSpec[] = [
  { name: 'greedy-1', driver: 'greedy' },
  { name: 'random-1', driver: 'random' },
];
