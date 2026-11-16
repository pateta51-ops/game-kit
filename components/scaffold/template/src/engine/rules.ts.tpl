// Stub game: one move ("step"); after `target` steps the game is won. Replace with the game's own rules.
import { defineGame } from '../../kit/game-store/index.ts';
import { draftOf, hashValue, seedRng, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState } from '../../kit/engine-core/index.ts';

export interface StubTask { readonly kind: string; readonly answer?: readonly string[] }
export interface StubEvent { readonly type: 'stepped'; readonly n: number; readonly seq: number }
export interface StubState extends KernelState {
  readonly v: 1;
  readonly options: { readonly seed: string };
  readonly rules: { readonly target: number };
  readonly count: number;
  readonly stack: readonly StubTask[];
  readonly prompt: KernelPrompt | null;
  readonly result: { readonly kind: 'won' } | null;
  readonly log: readonly StubEvent[];
}
export interface Stub {
  readonly state: StubState;
  readonly action: AnswerAction;
  readonly task: StubTask;
  readonly prompt: KernelPrompt;
  readonly event: StubEvent;
  readonly stamped: never;
  readonly content: Record<string, never>;
  readonly options: { readonly seed: string };
  readonly rules: { readonly target: number };
}

export const CONTENT: Stub['content'] = {};
export const RULES: Stub['rules'] = { target: 3 };

const turn = (ctx: Ctx<Stub>): void => {
  const s = draftOf(ctx);
  if (s.count >= s.rules.target) {
    s.result = { kind: 'won' };
    return;
  }
  ctx.then({ kind: 'stepped' });
  ctx.ask({ min: 1, max: 1, options: [{ id: 'step', enabled: true }] });
};

const stepped = (ctx: Ctx<Stub>): void => {
  const s = draftOf(ctx);
  s.count += 1;
  ctx.emit({ type: 'stepped', n: s.count });
  ctx.then({ kind: 'turn' });
};

export const STUB: GameRules<Stub> = {
  handlers: { turn, stepped },
  blank(options, rules): Draft<StubState> {
    const [a, b, c, d] = seedRng(options.seed);
    return { v: 1, options, rules, rng: { a, b, c, d }, count: 0, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
  },
  setup(ctx) {
    ctx.then({ kind: 'turn' });
  },
  contentHash: (content) => hashValue(content),
};

// The one game object: the store, sims and replays read it. `view` is what the seat sees (here the whole state: no hidden information).
export const GAME_DEF = defineGame<Stub, StubState, 'me'>({ rules: STUB, content: CONTENT, seats: ['me'], start: (seed) => ({ options: { seed }, rules: RULES }), view: (s) => s });
