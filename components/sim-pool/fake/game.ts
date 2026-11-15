// The engine-core fake counter as a simulation game. Seed `boom` throws in setup; seed `die` kills its worker thread.
import { CONTENT, COUNTER, RULES, type Counter } from '../../engine-core/fake/counter';
import { randomDriver, type SimGame } from '../index';

export const simGame: SimGame<Counter, { adds: number }> = {
  rules: COUNTER,
  content: () => CONTENT,
  start(spec) {
    if (spec.seed === 'boom') throw new Error('boom');
    if (spec.seed === 'die') process.exit(3);
    return { options: { seed: spec.seed }, rules: { target: Number(spec.settings?.target ?? RULES.target) } };
  },
  driver: (name) => (name === 'adder' ? randomDriver<Counter>((a) => (a.picks[0] === 'add' ? 3 : 1)) : randomDriver<Counter>()),
  summary: (s) => ({ adds: s.marks.added.length }),
};
