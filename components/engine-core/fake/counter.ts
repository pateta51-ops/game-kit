// A tiny fake game for the kernel tests: a counter and a shuffled draw pile. Each turn: add 1 or 2 (rng), or draw the top
// card (revealing) and add its value. Reaching the target wins; an empty pile on a draw turn loses (thrown GameOver).
import { applyAction, createGame, draftOf, GameOver, hashValue, nextUint32, own, seedRng, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState } from '../index.ts';

export interface CounterTask {
  readonly kind: string;
  readonly answer?: readonly string[];
}

export type CounterEvent =
  | { readonly type: 'added'; readonly n: number; readonly seq: number; readonly turn: number }
  | { readonly type: 'drawn'; readonly card: number; readonly reveal: true; readonly seq: number; readonly turn: number };

export interface CounterOptions {
  readonly seed: string;
}

export interface CounterRules {
  readonly target: number;
}

export interface CounterContent {
  readonly cards: number;
}

export interface CounterState extends KernelState {
  readonly v: 1;
  readonly options: CounterOptions;
  readonly rules: CounterRules;
  readonly turn: number;
  readonly counter: number;
  readonly pile: readonly number[];
  readonly marks: { readonly added: readonly number[] };
  readonly stack: readonly CounterTask[];
  readonly prompt: KernelPrompt | null;
  readonly result: { readonly kind: 'won' | 'lost' } | null;
  readonly log: readonly CounterEvent[];
}

export interface Counter {
  readonly state: CounterState;
  readonly action: AnswerAction;
  readonly task: CounterTask;
  readonly prompt: KernelPrompt;
  readonly event: CounterEvent;
  readonly stamped: 'turn';
  readonly content: CounterContent;
  readonly options: CounterOptions;
  readonly rules: CounterRules;
}

export const CONTENT: CounterContent = { cards: 6 };
export const RULES: CounterRules = { target: 12 };

const turn = (ctx: Ctx<Counter>): void => {
  const s = draftOf(ctx);
  if (s.counter >= s.rules.target) {
    s.result = { kind: 'won' };
    return;
  }
  s.turn += 1;
  ctx.then({ kind: 'chosen' });
  ctx.ask({
    min: 1,
    max: 1,
    options: [
      { id: 'add', enabled: true },
      { id: 'draw', enabled: true },
      { id: 'skip', enabled: false, why: 'never' },
    ],
  });
};

const chosen = (ctx: Ctx<Counter>, task: CounterTask): void => {
  const s = draftOf(ctx);
  if (task.answer?.[0] === 'add') {
    const n = 1 + ctx.rng.int(2, 'add');
    s.counter += n;
    own(own(s, 'marks'), 'added').push(n);
    ctx.emit({ type: 'added', n });
  } else {
    const card = s.pile[0];
    if (card === undefined) {
      s.result = { kind: 'lost' };
      throw new GameOver();
    }
    s.pile = s.pile.slice(1);
    s.counter += card;
    ctx.emit({ type: 'drawn', card, reveal: true });
  }
  ctx.then({ kind: 'turn' });
};

export const COUNTER: GameRules<Counter> = {
  handlers: { turn, chosen },
  blank(options, rules, content): Draft<CounterState> {
    const [a, b, c, d] = seedRng(options.seed);
    return {
      v: 1,
      options,
      rules,
      rng: { a, b, c, d },
      turn: 0,
      counter: 0,
      pile: Array.from({ length: content.cards }, (_, i) => i + 1),
      marks: { added: [] },
      stack: [],
      prompt: null,
      result: null,
      seq: 1,
      promptSeq: 1,
      log: [],
    };
  },
  setup(ctx) {
    const s = draftOf(ctx);
    s.pile = ctx.rng.shuffle(s.pile);
    ctx.then({ kind: 'turn' });
  },
  contentHash: (content) => hashValue(content),
  stamp: (s) => ({ turn: s.turn }),
  invariants: (state, _content, _events, prev) => [
    ...(state.counter < 0 ? [{ id: 'C-01', message: 'the counter is negative' }] : []),
    ...(prev !== undefined && state.counter < prev.counter ? [{ id: 'C-02', message: 'the counter went down' }] : []),
  ],
  revealWords: (e) => (e.type === 'drawn' ? 'A card was drawn' : undefined),
};

/** A bare state for the kernel tests: no task, no prompt, no result, seeded from `seed`. */
export const bareState = (seed = 'test'): Draft<CounterState> => COUNTER.blank({ seed }, RULES, CONTENT);

/** A seeded random player: the action for the open prompt, from the seed and the state's prompt id. */
export function randomAnswer(state: CounterState, seed: string): AnswerAction {
  const p = state.prompt as KernelPrompt;
  const ok = p.options.filter((o) => o.enabled);
  const w = seedRng(`${seed}:${String(p.id)}`);
  return { kind: 'answer', promptId: p.id, picks: [(ok[nextUint32(w) % ok.length] as { id: string }).id] };
}

/** A whole game played by `randomAnswer`. */
export function playGame(seed: string, rules: CounterRules = RULES): { state: CounterState; actions: AnswerAction[] } {
  let state = createGame(COUNTER, { seed }, rules, CONTENT).state;
  const actions: AnswerAction[] = [];
  while (state.result === null) {
    const a = randomAnswer(state, seed);
    actions.push(a);
    state = applyAction(COUNTER, state, a, CONTENT).state;
  }
  return { state, actions };
}
