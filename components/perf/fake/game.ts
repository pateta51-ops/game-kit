// The engine-core fake counter as a perf game: a call that drew a card counts in `draw`, the others in `apply`.
import { CONTENT, COUNTER, RULES, type Counter } from '../../engine-core/fake/counter.ts';
import { randomDriver } from '../../sim-pool/play.ts';
import type { Budgets, PerfGame } from '../perf.ts';

export const perfGame: PerfGame<Counter> = {
  rules: COUNTER,
  content: () => CONTENT,
  start: (spec) => ({ options: { seed: spec.seed }, rules: RULES }),
  driver: () => randomDriver<Counter>(),
  bucket: (_before, r) => (r.events.some((e) => e.type === 'drawn') ? 'draw' : 'apply'),
};

export const budgets: Budgets = { apply: { p95: 10_000 } };
