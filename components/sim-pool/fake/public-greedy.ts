import { applyAction, askOrTake, createGame, draftOf, seedRng, type AnswerAction, type Ctx, type GameRules, type KernelEvent, type KernelPrompt, type KernelState, type KernelTask } from '../../engine-core/index.ts';
import { botDriver, DriverRng, greedyBot, greedyPreview, legalAnswers, type SimGame } from '../browser.ts';

interface State extends KernelState {
  readonly score: number;
  readonly deck: readonly number[];
}

export interface Game {
  readonly state: State;
  readonly action: AnswerAction;
  readonly prompt: KernelPrompt;
  readonly task: KernelTask;
  readonly event: KernelEvent & { readonly card: number };
  readonly stamped: never;
  readonly options: { readonly seed: string };
  readonly rules: null;
  readonly content: null;
}

const initial = { min: 1, max: 1, seat: 'a' };
const enabled = (ids: readonly string[]) => ids.map(id => ({ id, enabled: true }));
const rng = (seed: string) => {
  const [a, b, c, d] = seedRng(seed);
  return { a, b, c, d };
};
const rules: GameRules<Game> = {
  blank: ({ seed }) => ({ score: 0, deck: [20, 1, 9], rng: rng(seed), stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] }),
  invariantPolicy: 'strict',
  invariants: state => Number.isSafeInteger(state.score) && state.score >= 0 ? [] : [{ id: 'score', message: 'score must be a nonnegative safe integer' }],
  setup: ctx => ctx.then({ kind: 'open' }),
  contentHash: () => 'test-game',
  handlers: {
    open: ctx => ctx.ask({ ...initial, kind: 'open', options: enabled(['route', 'cash', 'draw', 'luck', 'transfer']) }, { kind: 'route' }),
    route: (ctx, task) => {
      const s = draftOf(ctx);
      switch (task.answer?.[0]) {
        case 'route':
          s.score += 1;
          ctx.ask({ ...initial, kind: 'continue', options: enabled(['left', 'right']) }, { kind: 'continue' });
          break;
        case 'cash':
          s.score += 4;
          s.result = s.score;
          break;
        case 'draw':
          s.score += s.deck[0] ?? 0;
          ctx.emit({ card: s.deck[0] ?? 0, reveal: true });
          s.result = s.score;
          break;
        case 'luck':
          s.score += ctx.rng.int(20, 'luck');
          s.result = s.score;
          break;
        case 'transfer':
          ctx.ask({ ...initial, kind: 'continue', seat: 'b', options: enabled(['left', 'right']) }, { kind: 'continue' });
          break;
      }
    },
    continue: (ctx, task) => {
      if (task.answer?.[0] === 'left' || task.answer?.[0] === 'right') draftOf(ctx).score += 5;
      ctx.then({ kind: 'finish' });
      askOrTake(ctx, { ...initial, options: [{ id: 'score', enabled: true }, { id: 'skip', enabled: false }] });
    },
    finish: (ctx: Ctx<Game>, task) => {
      const s = draftOf(ctx);
      if (task.answer?.[0] !== 'score') throw new Error('mandatory scoring was skipped');
      s.score += 1;
      s.result = s.score;
    },
  },
};

// Copy public fields explicitly. No deck identities, engine RNG, tasks or log cross the boundary.
export const view = (s: State, seat: KernelPrompt['seat']) => {
  if (!s.prompt || s.prompt.seat !== seat) throw new Error('view requested for another seat');
  return { score: s.score, deckSize: s.deck.length, prompt: structuredClone(s.prompt) };
};
export type View = ReturnType<typeof view>;
export const answers = (state: State) => legalAnswers(state.prompt!, new DriverRng('preview-answers'));
export const probe = greedyPreview<Game, View>({
  rules,
  content: null,
  reconstruct: v => ({
    ...rules.blank({ seed: 'public-placeholder' }, null, null),
    score: v.score,
    deck: Array.from({ length: v.deckSize }, () => 0),
    prompt: v.prompt,
    promptSeq: v.prompt.id + 1,
    stack: [{ kind: v.prompt.kind === 'open' ? 'route' : 'continue', prompt: v.prompt.id }],
  }),
  score: s => s.score,
  nested: s => s.prompt?.kind === 'continue',
  view,
  answers,
});

export const bot = () => greedyBot({ probe, fallback: () => -1, maxProbes: 16, maxRootAnswers: 20, ties: 'random' });
export const initialState = () => createGame(rules, { seed: 'test' }, null, null).state;
export const pick = (s: State, id: string) => answers(s).find(a => a.picks[0] === id)!;

/** A live engine turn. This is also the shape a UI calls for a computer-owned seat. */
export function playGreedyTurn(state: State, seed: string) {
  const prompt = state.prompt;
  if (prompt === null || prompt.seat !== 'a') throw new Error('no computer-seat prompt');
  const rng = new DriverRng(`${seed}|greedy|${String(prompt.id)}`);
  const action = bot().choose(view(state, 'a'), legalAnswers(prompt, rng), rng);
  return { action, state: applyAction(rules, state, action, null).state };
}

export const simGame: SimGame<Game> = {
  rules,
  content: () => null,
  start: spec => ({ options: { seed: spec.seed }, rules: null }),
  driver: () => botDriver<Game, View>(bot(), view),
  reshuffleHidden: (state, _seat, random) => {
    const deck = [...state.deck];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = random.int(i + 1);
      [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }
    return { ...state, deck };
  },
};
