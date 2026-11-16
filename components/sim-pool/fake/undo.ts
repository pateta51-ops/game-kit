// The fake counter with a bad undo (its `add` draws randomness without a reveal; `good*` seeds only draw cards, which reveal),
// a placeholder prompt (`ph*`) and a dead end (`dead*`).
import { CONTENT, COUNTER, RULES, type Counter } from '../../engine-core/fake/counter.ts';
import { randomDriver, type SimGame } from '../index.ts';

export const simGame: SimGame<Counter> = {
  rules: COUNTER,
  content: () => CONTENT,
  start: (spec) => ({ options: { seed: spec.seed }, rules: RULES }),
  driver: () => randomDriver<Counter>(),
  undoCheck: true,
  answers: (s) => (s.options.seed.startsWith('dead') ? [] : [{ kind: 'answer', promptId: s.prompt?.id ?? 0, picks: [s.options.seed.startsWith('good') ? 'draw' : 'add'] }]),
  promptProblem: (s) => (s.options.seed.startsWith('ph') ? 'TODO: write this prompt' : undefined),
  maxActions: 40,
};
