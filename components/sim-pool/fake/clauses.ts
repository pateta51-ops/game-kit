// K490: the fake counter with a clause trace (the shape of card-harness traceAbilities): seed `t-N` resolves clause `cN`;
// `long*` seeds never finish. A module-level trace, cleared by the pool before each game.
import { CONTENT, COUNTER, RULES, type Counter } from '../../engine-core/fake/counter.ts';
import { randomDriver, type SimGame } from '../index.ts';

const resolved = new Set<string>();
const trace = { resolved, clear: () => resolved.clear() };

export const simGame: SimGame<Counter> = {
  rules: COUNTER,
  content: () => CONTENT,
  start: (spec) => ({ options: { seed: spec.seed }, rules: { target: spec.seed.startsWith('long') ? 1e9 : RULES.target } }),
  driver: () => randomDriver<Counter>((a) => (a.picks[0] === 'add' ? 1 : 0)),
  onPrompt: (_seen, s) => void resolved.add(`c${s.options.seed.slice(-1)}`),
  trace: () => trace,
  maxActions: 40,
};
