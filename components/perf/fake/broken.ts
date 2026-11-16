// A perf game whose every game throws in setup; its budgets are tight on purpose.
import type { Counter } from '../../engine-core/fake/counter';
import type { Budgets, PerfGame } from '../perf';
import { perfGame as good } from './game';

export const perfGame: PerfGame<Counter> = {
  ...good,
  start(spec) {
    if (spec.seed.startsWith('boom')) throw new Error('boom');
    return good.start(spec, good.content() as Counter['content']);
  },
};

export const budgets: Budgets = { apply: { p95: 10_000, max: 0 } };
