// The engine-core fake counter as a simulation game. Seed `boom` throws in setup; seed `die` kills its worker thread.
import { CONTENT, COUNTER, RULES, type Counter } from '../../engine-core/fake/counter.ts';
import type { AnswerAction } from '../../engine-core/index.ts';
import { botDriver, randomDriver, type Driver, type SimGame } from '../index.ts';

const pick = (answers: readonly AnswerAction[], id: string): AnswerAction => answers.find((a) => a.picks[0] === id) ?? (answers[0] as AnswerAction);

export const simGame: SimGame<Counter, { adds: number }> = {
  rules: { ...COUNTER, debug: {} },
  content: () => CONTENT,
  start(spec) {
    if (spec.seed === 'boom') throw new Error('boom');
    if (spec.seed === 'loop') for (;;);
    if (spec.seed === 'die') process.exit(3);
    return { options: { seed: spec.seed }, rules: { target: Number(spec.settings?.target ?? RULES.target) } };
  },
  // K274: `peek` reads the hidden pile (a cheat); `honest` is a Bot over the view alone; `stateful` says it is not pure.
  driver: (name) =>
    name === 'peek'
      ? ({ name, reasons: () => [], choose: (s, answers) => pick(answers, (s.pile[0] ?? 0) > 3 ? 'draw' : 'add') } satisfies Driver<Counter>)
      : name === 'honest'
        ? botDriver<Counter, { counter: number }>({ name, choose: (v, answers) => pick(answers, v.counter < 5 ? 'add' : 'draw') }, (s) => ({ counter: s.counter }))
        : name === 'peekstateful'
          ? ({ name, stateful: true, reasons: () => [], choose: (s, answers) => pick(answers, (s.pile[0] ?? 0) > 3 ? 'draw' : 'add') } satisfies Driver<Counter>)
          : name === 'adder' ? randomDriver<Counter>((a) => (a.picks[0] === 'add' ? 3 : 1)) : randomDriver<Counter>(),
  reshuffleHidden(s, _seat, rng) {
    const pile = [...s.pile];
    for (let i = pile.length - 1; i > 0; i -= 1) { const j = rng.int(i + 1); [pile[i], pile[j]] = [pile[j] as number, pile[i] as number]; }
    return { ...s, pile };
  },
  summary: (s) => ({ adds: s.marks.added.length }),
  // K101: seed `view` has a view that throws from turn 2; seed `cyc` one that cannot be serialized.
  view(s, _c) {
    const seed = s.options.seed;
    if (seed === 'view' && s.turn >= 2) throw new Error('view broke');
    const v: Record<string, unknown> = { turn: s.turn, counter: s.counter };
    if (seed === 'cyc') v.me = v;
    if (seed === 'leak') v.hand = ['card:42'];
    if (seed === 'leakkey') v.rng = 1;
    if (seed === 'leakstack') v.stack = [1];
    return v;
  },
  secrets: (s) => (s.options.seed.startsWith('leak') ? ['42'] : []),
  leakKeys: (s) => (s.options.seed === 'leakkey' ? ['rng'] : []),
  // K737: a kernel `set` edit of the counter, drawn from the seeded rng.
  randomDebug: (_s, _c, rng) => ({ kind: 'debug', verb: 'set', args: { path: ['counter'], value: rng.int(3) } }),
  hasten: (s) => (s.prompt ? { kind: 'answer', promptId: s.prompt.id, picks: ['add'] } : undefined),
};
