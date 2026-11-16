// A tiny fake game for the tests: five questions in a row, one per common widget; each answer is kept in `got`.
import { draftOf, hashValue, seedRng, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelOption, type KernelState } from '../../engine-core/index.ts';
import type { PromptSource } from '../../prompt-source/index.ts';

export type MarketKind = 'pick' | 'amount' | 'order' | 'may' | 'pay';

export interface MarketPrompt {
  readonly id: number;
  readonly kind: MarketKind;
  readonly options: readonly KernelOption[];
  readonly min: number;
  readonly max: number;
  readonly source?: PromptSource;
}

export interface MarketState extends KernelState {
  readonly options: { readonly seed: string };
  readonly got: readonly (readonly string[])[];
  readonly stack: readonly { readonly kind: string; readonly answer?: readonly string[] }[];
  readonly prompt: MarketPrompt | null;
  readonly result: { readonly kind: 'done' } | null;
  readonly log: readonly { readonly seq: number }[];
}

export interface Market {
  readonly state: MarketState;
  readonly action: AnswerAction;
  readonly task: { readonly kind: string; readonly answer?: readonly string[] };
  readonly prompt: MarketPrompt;
  readonly event: { readonly seq: number };
  readonly stamped: never;
  readonly content: null;
  readonly options: { readonly seed: string };
  readonly rules: null;
}

const on = (...ids: string[]): KernelOption[] => ids.map((id) => ({ id, enabled: true }));
const ASK: readonly Omit<MarketPrompt, 'id'>[] = [
  { kind: 'pick', options: [...on('a', 'b'), { id: 'c', enabled: false, why: 'Too heavy (TURN-07)' }], min: 1, max: 2 },
  { kind: 'amount', options: on('0', '1', '2', '3'), min: 1, max: 1 },
  { kind: 'order', options: on('x', 'y', 'z'), min: 3, max: 3 },
  { kind: 'may', options: on('yes', 'no'), min: 1, max: 1, source: { frame: 'f1', card: 'c-7', clause: 'You may draw a card.' } },
  { kind: 'pay', options: [...on('gold'), { id: 'strife', enabled: false, why: 'No strife left' }], min: 1, max: 1 },
];

const next = (ctx: Ctx<Market>): void => {
  const s = draftOf(ctx);
  const q = ASK[s.got.length];
  if (q === undefined) s.result = { kind: 'done' };
  else {
    ctx.then({ kind: 'got' });
    ctx.ask(q);
  }
};

export const MARKET: GameRules<Market> = {
  handlers: {
    next,
    got: (ctx, task) => {
      const s = draftOf(ctx);
      s.got = [...s.got, [...(task.answer ?? [])]];
      ctx.then({ kind: 'next' });
    },
  },
  blank(options): Draft<MarketState> {
    const [a, b, c, d] = seedRng(options.seed);
    return { options, rng: { a, b, c, d }, got: [], stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
  },
  setup: (ctx) => ctx.then({ kind: 'next' }),
  contentHash: (c) => hashValue(c),
};
