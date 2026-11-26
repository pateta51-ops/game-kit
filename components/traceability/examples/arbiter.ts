import { IllegalActionError, applyAction, createGame, draftOf, seedRng, type AnswerAction, type GameRules, type KernelState } from '../../engine-core/index.ts';
import type { Json, RuleAdapter, RuleCase, RuleRequirement } from '../assertions.ts';

interface TokenState extends KernelState {
  readonly tokens: number;
}
interface TokenGame {
  readonly state: TokenState;
  readonly options: { readonly seed: string };
  readonly rules: { readonly tokens: number };
  readonly content: null;
  readonly action: AnswerAction;
  readonly task: { readonly kind: string; readonly answer?: readonly string[] };
  readonly prompt: NonNullable<TokenState['prompt']>;
  readonly event: TokenState['log'][number];
  readonly stamped: never;
}

const game: GameRules<TokenGame> = {
  blank({ seed }, { tokens }) {
    const [a, b, c, d] = seedRng(seed);
    return { tokens, rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 0, promptSeq: 0, log: [] };
  },
  setup(ctx) {
    ctx.ask({
      min: 1, max: 1,
      options: [{ id: 'buy', enabled: ctx.s.tokens >= 2 }, { id: 'pass', enabled: true }],
    }, { kind: 'resolve' });
  },
  contentHash: () => 'tokens-v1',
  handlers: {
    resolve(ctx, task) {
      const state = draftOf(ctx);
      if (task.answer?.[0] === 'buy') state.tokens -= 2;
      state.result = 'finished';
    },
  },
};

const json = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;
const adapter: RuleAdapter<{ tokens: number }, 'buy', TokenState> = {
  setup(fixture, seed) { return createGame(game, { seed }, fixture, null).state; },
  observe: json, // Observe the whole JSON state, including RNG, queues and prompts.
  act(state, pick) {
    try {
      const result = applyAction(game, state, { kind: 'answer', promptId: state.prompt?.id ?? -1, picks: [pick] }, null);
      return { accepted: true, state: result.state, events: result.events.map(json) };
    } catch (error) {
      if (!(error instanceof IllegalActionError)) throw error;
      return { accepted: false, state, events: [] };
    }
  },
};

const rules = [{ id: 'PAY-01', kind: 'action', requireRefusal: true }] as const satisfies readonly RuleRequirement[];
const cases: readonly RuleCase<{ tokens: number }, 'buy'>[] = [
  {
    id: 'affordable', seed: 'tokens', fixture: { tokens: 3 }, rules: ['PAY-01'],
    steps: [{ action: 'buy', accepted: true, checks: [{ source: 'state', path: ['tokens'], op: 'equals', value: 1 }] }],
    evidence: [{ rule: 'PAY-01', kind: 'action', step: 0, assertion: 0 }],
  },
  {
    id: 'unaffordable', seed: 'tokens', fixture: { tokens: 1 }, rules: ['PAY-01'],
    steps: [{ action: 'buy', accepted: false, checks: [{ source: 'state', path: ['tokens'], op: 'equals', value: 1 }] }],
    evidence: [{ rule: 'PAY-01', kind: 'action', step: 0, assertion: 0 }],
  },
];
export default { adapter, cases, rules };
