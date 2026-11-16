import { describe, expect, it } from 'vitest';
import { applyAction, createGame, draftOf, EngineBugError, hashValue, seedRng, timingHandlers, would, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState, type KernelTask } from '../engine-core/index';
import { ruleIdFilter } from '../plain-text/index';
import { describeEffect, effectOf, effectTasks, expectVerbs, oneOf, optional, posInt, validateEffect, validateStep, verbHandler, verbProblems, type AnyVerbTable, type VerbTable, type VerbTask } from './index';

// A tiny fake game with example verbs (tests only; the kit holds no game verbs).
type Step =
  | { readonly op: 'gain'; readonly amount: number }
  | { readonly op: 'roll'; readonly sides: number }
  | { readonly op: 'hurt'; readonly amount: number }
  | { readonly op: 'draw'; readonly count: number; readonly from?: 'deck' | 'discard' }
  | { readonly op: 'discard'; readonly count: number };
interface Env { readonly player: string }
type Task = KernelTask | VerbTask<Step, Env>;
interface S extends KernelState {
  score: number;
  hp: number;
  by: string[];
  hand: number[];
  deck: number[];
  pile: number[];
  stack: readonly Task[];
  log: readonly ({ readonly seq: number; readonly type: string })[];
}
interface Content { readonly effect: readonly Step[] }
interface G {
  readonly state: S;
  readonly action: AnswerAction;
  readonly task: Task;
  readonly prompt: KernelPrompt;
  readonly event: { readonly seq: number; readonly type: string };
  readonly stamped: never;
  readonly content: Content;
  readonly options: { readonly seed: string };
  readonly rules: null;
}

const plural = (n: number, w: string): string => `${String(n)} ${w}${n === 1 ? '' : 's'}`;
const VERBS: VerbTable<G, Step, Env> = {
  gain: {
    fields: { amount: posInt },
    run: (ctx, s, env) => {
      const d = draftOf(ctx);
      d.score += s.amount;
      d.by = [...d.by, env?.player ?? '?'];
    },
    text: (s) => `Gain ${plural(s.amount, 'point')}.`,
  },
  roll: { fields: { sides: posInt }, run: (ctx, s) => void (draftOf(ctx).score += 1 + ctx.rng.int(s.sides, 'roll')), text: (s) => `Roll a ${String(s.sides)}-sided die and gain that many points.` },
  hurt: { fields: { amount: posInt }, run: (ctx, s, env) => void would(ctx, [{ kind: 'damage', keys: { player: env?.player ?? '' }, amount: s.amount }]), text: (s) => `Suffer ${String(s.amount)} damage.` },
  draw: {
    fields: { count: posInt, from: optional(oneOf(['deck', 'discard'])) },
    run: (ctx, s) => {
      const d = draftOf(ctx);
      const src = s.from === 'discard' ? 'pile' : 'deck';
      d.hand = [...d.hand, ...d[src].slice(0, s.count)];
      d[src] = d[src].slice(s.count);
    },
    text: (s) => `Draw ${plural(s.count, 'card')}${s.from === 'discard' ? ' from the discard pile' : ''}.`,
  },
  discard: {
    fields: { count: posInt },
    run: (ctx, s) => {
      ctx.then({ kind: 'discarded' });
      const hand = draftOf(ctx).hand;
      ctx.ask({ min: Math.min(s.count, hand.length), max: s.count, options: hand.map((c) => ({ id: String(c), enabled: true })) });
    },
    text: (s) => `Discard ${plural(s.count, 'card')}.`,
  },
};
const EXAMPLES: Step[] = [{ op: 'gain', amount: 2 }, { op: 'roll', sides: 6 }, { op: 'hurt', amount: 1 }, { op: 'draw', count: 1, from: 'discard' }, { op: 'discard', count: 1 }];

const RULES: GameRules<G> = {
  handlers: {
    ...timingHandlers<G>({ happen: (ctx, o) => void (draftOf(ctx).hp -= o.amount ?? 0), event: (o) => ({ type: `hurt ${o.keys.player ?? ''}` }) }),
    verb: verbHandler<G>(VERBS),
    discarded: (ctx, t) => {
      const d = draftOf(ctx);
      const out = (t.answer ?? []).map(Number);
      d.hand = d.hand.filter((c) => !out.includes(c));
      d.pile = [...out, ...d.pile];
    },
  },
  blank: ({ seed }): Draft<S> => {
    const [a, b, c, d] = seedRng(seed);
    return { rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [], score: 0, hp: 5, by: [], hand: [], deck: [1, 2, 3], pile: [9] };
  },
  setup: (ctx: Ctx<G>) => ctx.then(...effectTasks(ctx.content.effect, { player: 'p1' })),
  contentHash: (c) => hashValue(c),
};

describe('card-language (K206)', () => {
  const effect: Step[] = [{ op: 'gain', amount: 1 }, { op: 'hurt', amount: 2 }, { op: 'draw', count: 2 }, { op: 'discard', count: 1 }, { op: 'draw', count: 1, from: 'discard' }];

  it('runs an effect on engine-core with its env, a timing batch and a prompt, and prints the words from the same data', () => {
    const content = { effect };
    let { state } = createGame(RULES, { seed: 's' }, null, content);
    expect(state.prompt?.options.map((o) => o.id)).toEqual(['1', '2']);
    state = applyAction(RULES, state, { kind: 'answer', promptId: state.prompt?.id ?? 0, picks: ['2'] }, content).state;
    expect([state.score, state.by, state.hp, state.hand, state.deck, state.pile]).toEqual([1, ['p1'], 3, [1, 2], [3], [9]]);
    expect(state.log.map((e) => e.type)).toContain('hurt p1');
    expect(describeEffect(VERBS, effect)).toBe('Gain 1 point. Suffer 2 damage. Draw 2 cards. Discard 1 card. Draw 1 card from the discard pile.');
  });

  it('a verb that rolls draws from the seeded ctx.rng: same seed, same score', () => {
    const roll = (seed: string): number => createGame(RULES, { seed }, null, { effect: [{ op: 'roll', sides: 1000 }] }).state.score;
    expect(roll('a')).toBe(roll('a'));
    expect(new Set(['a', 'b', 'c', 'd'].map(roll)).size).toBeGreaterThan(1);
  });

  it('validates steps through the card-harness grammar: unknown verb, missing, extra and bad fields, empty effect, nested effect', () => {
    expect(validateStep(VERBS, { op: 'gain', amount: 2 })).toEqual([]);
    expect(validateStep(VERBS, { op: 'fly' })).toEqual(['op: unknown verb "fly"']);
    expect(validateStep(VERBS, 'gain')).toEqual(['(root): a step must be an object']);
    expect(validateStep(VERBS, { op: 'draw', from: 'hand', x: 1, amount: 1 })).toEqual([
      '(root): draw needs count',
      'x: draw has no key x',
      'amount: amount belongs to gain, hurt, not draw',
      'from: draw from must be one of deck, discard',
    ]);
    expect(validateStep(VERBS, { op: 'toString' })).toEqual(['op: unknown verb "toString"']);
    expect(validateEffect(VERBS, [])).toEqual(['an effect must be a non-empty list of steps']);
    expect(validateEffect(VERBS, [{ op: 'gain', amount: 1 }, { op: 'gain', amount: 0 }])).toEqual(['[1].amount: gain amount must be a positive integer']);
    const nested: AnyVerbTable = { ...VERBS, either: { fields: { a: effectOf(() => nested) }, run: null, text: null } };
    expect(validateStep(nested, { op: 'either', a: [{ op: 'gain' }] })).toEqual(['a[0]: gain needs amount']);
    expect(validateStep(nested, { op: 'either', a: [{ op: 'gain', amount: -1 }] })).toEqual(['a: either a must be [0].amount: gain amount must be a positive integer']);
  });

  it('every verb has a handler, a text generator and an example with no rule id (plain-text filter)', () => {
    expectVerbs(VERBS, EXAMPLES);
    const broken = { ...VERBS, gain: { ...VERBS.gain, run: null, text: (s: { amount: number }) => `Gain ${String(s.amount)} (TURN-12).` }, draw: { ...VERBS.draw, text: null } };
    expect(verbProblems(broken, [...EXAMPLES, { op: 'gain', amount: -1 }])).toEqual([
      'gain: no handler',
      'draw: no text generator',
      'gain: rule id TURN-12 in text "Gain 2 (TURN-12)."',
      'example gain amount: gain amount must be a positive integer',
    ]);
    const lookalike = { ...VERBS, gain: { ...VERBS.gain, text: () => 'Take A-5 cards and pay 1 R-1.' } };
    expect(verbProblems(lookalike, EXAMPLES)).toEqual([]);
    expect(verbProblems(lookalike, EXAMPLES, ruleIdFilter({ long: ['A'] }))).toEqual(['gain: rule id A-5 in text "Take A-5 cards and pay 1 R-1."']);
    expect(verbProblems(VERBS, EXAMPLES.slice(1))).toEqual(['gain: no example']);
    expect(() => expectVerbs(broken)).toThrow(/gain: no handler/);
  });

  it('a field typo, a missing field or a step of another table fails to compile', () => {
    // @ts-expect-error amont is not a field of gain
    const typo: VerbTable<G, Extract<Step, { op: 'gain' }>> = { gain: { fields: { amont: posInt }, run: null, text: null } };
    // @ts-expect-error count is missing
    const missing: VerbTable<G, Extract<Step, { op: 'draw' }>> = { draw: { fields: { from: optional(posInt) }, run: null, text: null } };
    // @ts-expect-error fly is not a verb of VERBS
    expect(() => describeEffect(VERBS, [{ op: 'fly' }])).toThrow(EngineBugError);
    expect([typo, missing].length).toBe(2);
  });

  it('a verb not built yet fails loudly', () => {
    const half = { ...VERBS, gain: { ...VERBS.gain, run: null, text: null } };
    expect(() => describeEffect(half, [{ op: 'gain', amount: 1 }])).toThrow(EngineBugError);
    expect(() => createGame({ ...RULES, handlers: { ...RULES.handlers, verb: verbHandler<G>(half) } }, { seed: 's' }, null, { effect })).toThrow(/gain has no handler/);
  });
});
