// The fake counter with faults, by seed: `bad*` breaks invariant F-01 at step 2, `loop*` trips the runaway guard,
// `long*` never ends, `word*` throws an ordinary error that says runaway, `drv*` has a driver that throws at step 2.
import { CONTENT, COUNTER, RULES, type Counter } from '../../engine-core/fake/counter.ts';
import { draftOf } from '../../engine-core/index.ts';
import { randomDriver, type Driver, type SimGame } from '../index.ts';

const add = randomDriver<Counter>((a) => (a.picks[0] === 'add' ? 1 : 0));
const thrower: Driver<Counter> = {
  ...add,
  choose(s, answers, rng) {
    if (s.turn === 3) throw new Error('the driver gave up');
    return add.choose(s, answers, rng);
  },
};

export const simGame: SimGame<Counter> = {
  rules: {
    ...COUNTER,
    handlers: { ...COUNTER.handlers, spin: (ctx) => ctx.then({ kind: 'spin' }) },
    setup(ctx) {
      if (draftOf(ctx).options.seed.startsWith('loop')) ctx.then({ kind: 'spin' });
      else COUNTER.setup?.(ctx);
    },
    invariants: (s) => (s.options.seed.startsWith('bad') && s.turn >= 3 ? [{ id: 'F-01', message: 'turn 3 was reached' }] : []),
  },
  content: () => CONTENT,
  start(spec) {
    if (spec.seed.startsWith('word')) throw new Error('a runaway horse');
    return { options: { seed: spec.seed }, rules: { target: spec.seed.startsWith('long') ? 1e9 : RULES.target } };
  },
  driver: (name, spec) => (name === 'thrower' || spec.seed.startsWith('drv') ? thrower : add),
  maxActions: 40,
};
