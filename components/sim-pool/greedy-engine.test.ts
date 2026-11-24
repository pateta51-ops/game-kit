import { describe, expect, it } from 'vitest';
import { applyAction, askOrTake, createGame, draftOf, seedRng, type AnswerAction, type Ctx, type GameRules, type KernelEvent, type KernelPrompt, type KernelState, type KernelTask } from '../engine-core/index.ts';
import { botDriver, DriverRng, greedyBot, greedyPreview, legalAnswers, playOne, type SimGame } from './index.ts';

interface State extends KernelState {
  readonly score: number;
  readonly deck: readonly number[];
}

interface Game {
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
const view = (s: State, seat: KernelPrompt['seat']) => {
  if (!s.prompt || s.prompt.seat !== seat) throw new Error('view requested for another seat');
  return { score: s.score, deckSize: s.deck.length, prompt: structuredClone(s.prompt) };
};
type View = ReturnType<typeof view>;
const answers = (state: State) => legalAnswers(state.prompt!, new DriverRng('preview-answers'));
const probe = greedyPreview<Game, View>({
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

const bot = () => greedyBot({ probe, fallback: () => -1, ties: 'random' });
const initialState = () => createGame(rules, { seed: 'test' }, null, null).state;
const pick = (s: State, id: string) => answers(s).find(a => a.picks[0] === id)!;

describe('engine-backed greedy preview', () => {
  it('probes real engine transitions, takes a mandatory effect and stops at hidden or other-seat branches', () => {
    const state = initialState();
    const redacted = view(state, 'a');
    expect(probe(redacted, pick(state, 'draw'))).toEqual({ kind: 'unknown' });
    expect(probe(redacted, pick(state, 'luck'))).toEqual({ kind: 'unknown' });
    expect(probe(redacted, pick(state, 'transfer'))).toEqual({ kind: 'unknown' });
    expect(probe(redacted, { ...pick(state, 'route'), promptId: 1000 })).toEqual({ kind: 'rejected' });
    const route = probe(redacted, pick(state, 'route'));
    expect(route).toMatchObject({ kind: 'choice', score: 1 });
    if (route.kind !== 'choice') throw new Error('expected a nested choice');
    const child = route.answers[0]!;
    expect(probe(route.view, child)).toEqual({ kind: 'complete', score: 7 });
    const mid = applyAction(rules, state, pick(state, 'route'), null).state;
    const after = applyAction(rules, mid, child, null).state;
    expect(after.result).toBe(7);
    expect(state.score).toBe(0);
    expect(state.deck).toEqual([20, 1, 9]);
  });

  it('makes identical choices on redacted engine worlds and under the simulator hidden shuffle', () => {
    const driver = botDriver<Game, View>(bot(), view);
    const state = initialState();
    const other = { ...state, deck: [...state.deck].reverse(), rng: rng('different-engine-rng') };
    expect(other.deck).not.toEqual(state.deck);
    expect(other.rng).not.toEqual(state.rng);
    expect(view(other, 'a')).toEqual(view(state, 'a'));
    const a = driver.choose(state, answers(state), new DriverRng('same'));
    const b = driver.choose(other, answers(other), new DriverRng('same'));
    expect(a).toEqual(b);
    expect(a).toEqual(pick(state, 'route'));
    const nested = applyAction(rules, state, a as AnswerAction, null).state;
    const nestedOther = { ...nested, deck: other.deck, rng: other.rng };
    expect(driver.choose(nested, answers(nested), new DriverRng('same'))).toEqual(driver.choose(nestedOther, answers(nestedOther), new DriverRng('same')));

    let changed = 0;
    const game: SimGame<Game> = {
      rules,
      content: () => null,
      start: spec => ({ options: { seed: spec.seed }, rules: null }),
      driver: () => botDriver<Game, View>(bot(), view),
      reshuffleHidden: (s, seat, random) => {
        expect(seat).toBe('a');
        const deck = [...s.deck];
        for (let i = deck.length - 1; i > 0; i -= 1) {
          const j = random.int(i + 1);
          [deck[i], deck[j]] = [deck[j]!, deck[i]!];
        }
        if (deck.some((card, i) => card !== s.deck[i])) changed += 1;
        return { ...s, deck };
      },
    };
    const spec = { index: 0, seed: 'shuffle', driver: 'greedy' };
    const result = playOne(game, null, spec, undefined, { hidden: true });
    expect(changed).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
    expect(result.actions).toBe(2);
    expect(result.result).toBe(7);
    expect(result.hash).toBe(playOne(game, null, spec).hash);
  });
});
