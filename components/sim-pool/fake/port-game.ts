import type { EnginePort, PortAnswer, PortPrompt } from '../../engine-core/index.ts';
import { DriverRegistrationError, type PortDriver, type PortSimGame } from '../index.ts';

export interface Position {
  phase: number;
  pending: boolean;
  score: number;
  seed: string;
  secret: string;
  events: string[];
}
export interface PortGame {
  state: Position;
  prompt: PortPrompt;
  event: string;
  task: never;
  content: { resolved: Set<string> };
}

export const answers = (s: Position): PortAnswer[] => s.phase === 0
  ? [['x', 'y', 'x'], ['y', 'x', 'y']].map(picks => ({ kind: 'answer', promptId: 'choose:0', picks }))
  : [{ kind: 'answer', promptId: s.phase === 1 ? 'pass:1' : 'finish:2', picks: s.phase === 1 ? [] : ['finish'] }];

export function makePort(seed: string, content: PortGame['content']): EnginePort<PortGame> & Required<Pick<EnginePort<PortGame>, 'result'>> {
  return {
    content,
    start: () => ({ phase: -1, pending: true, score: 0, seed, secret: `secret:${seed}`, events: [] }),
    settle: s => s.pending ? { ...s, phase: s.phase + 1, pending: false } : s,
    prompt: s => s.phase >= 3 || seed === 'no-prompt' ? null : {
      id: answers(s)[0]!.promptId,
      options: (s.phase === 0 ? ['x', 'y', 'disabled'] : s.phase === 1 ? [] : ['finish']).map(id => ({ id, enabled: id !== 'disabled' })),
    },
    apply(s, answer) {
      if (seed === 'refuse') return new Error('port refused the actual answer');
      if (!answers(s).some(a => a.promptId === answer.promptId && JSON.stringify(a.picks) === JSON.stringify(answer.picks))) return new Error('illegal port answer');
      if (seed === 'stall') return s;
      const clause = ['choose', 'pass', 'finish'][s.phase]!;
      content.resolved.add(clause);
      const next = { ...s, pending: true, score: s.score + answer.picks.length, events: [...s.events, clause] };
      if (seed === 'mutable') return Object.assign(s, next);
      return next;
    },
    events: s => s.events,
    result: s => s.phase < 3 || seed === 'no-result' ? null : seed === 'false' ? false : seed === 'zero' ? 0 : { winner: 'actor', score: s.score },
    invariants: s => seed === 'bad-setup' && s.phase === 0 || seed === 'bad-step' && s.phase === 1
      ? [{ id: 'port-state', message: `invalid phase ${String(s.phase)}` }] : [],
  };
}

const driver = (): PortDriver<PortGame> => ({
  name: 'random', reasons: () => [],
  choose: (_state, legal, rng) => legal[rng.int(legal.length)]!,
});

export const simGame: PortSimGame<PortGame, { phase: number; score: number }> = {
  content: () => ({ resolved: new Set<string>() }),
  port: (spec, content) => makePort(spec.seed, content),
  answers: s => answers(s),
  driver,
  validateDriver: name => { if (name !== 'random') throw new DriverRegistrationError(`unknown port driver ${name}`); },
  maxActions: 4,
  summary: s => ({ phase: s.phase, score: s.score }),
  trace: content => ({ resolved: content.resolved, clear: () => content.resolved.clear() }),
  changed: (_clause, before, after) => before.phase !== after.phase,
  view: s => s.seed === 'leak' ? { secret: s.secret } : { phase: s.phase },
  secrets: s => [s.secret],
};
