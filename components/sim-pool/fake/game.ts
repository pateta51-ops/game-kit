// The engine-core fake counter as a simulation game. Seed `boom` throws in setup; seed `die` kills its worker thread.
import { CONTENT, COUNTER, RULES, type Counter } from '../../engine-core/fake/counter.ts';
import { randomDriver, type SimGame } from '../index.ts';

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
  // K101: seed `view` has a view that throws from turn 2; seed `cyc` one that cannot be serialized.
  view(s, _c) {
    const seed = s.options.seed;
    if (seed === 'view' && s.turn >= 2) throw new Error('view broke');
    const v: Record<string, unknown> = { turn: s.turn, counter: s.counter };
    if (seed === 'cyc') v.me = v;
    return v;
  },
  hasten: (s) => (s.prompt ? { kind: 'answer', promptId: s.prompt.id, picks: ['add'] } : undefined),
};
