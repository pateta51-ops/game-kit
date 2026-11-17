import { describe, expect, it } from 'vitest';
import { applyAction, cancelBatch, createGame, createSave, draftOf, exportSave, hashState, hashValue, importSave, seedRng, timingHandlers, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState, type KernelTask } from '../engine-core/index.ts';
import { cardsIn, newZones, viewOf, zoneProblems } from '../card-zones/index.ts';
import { askVerb, describeEffect, effectTasks, expectVerbs, validateEffect, verbHandler, type Step, type VerbTask } from './index.ts';
import { cardPack, hasMark, PACK_WORDS, runLater, type PackEnv, type PackState, type PackStep } from './pack.ts';

// A fake two-seat card game on the pack (tests only). Seat a acts; p1 (in play) is the source card.
type Task = KernelTask | VerbTask<PackStep, PackEnv>;
interface S extends KernelState, PackState {
  readonly stack: readonly Task[];
  readonly log: readonly { readonly seq: number; readonly type: string }[];
}
interface Content { readonly effect: readonly PackStep[]; readonly env?: PackEnv }
interface G {
  readonly state: S;
  readonly action: AnswerAction;
  readonly task: Task;
  readonly prompt: KernelPrompt;
  readonly event: { readonly seq: number; readonly type: string };
  readonly stamped: never;
  readonly content: Content;
  readonly options: { readonly seed: string };
  readonly rules: object;
}

const gold = (s: PackState, seat = 'a', k = 'gold'): number => s.res?.[seat]?.[k] ?? 0;
const pack = cardPack<G>({
  reshuffle: (_s, _deck, seat) => (seat === 'a' ? 'discard:a' : undefined),
  filters: { even: (_s, c) => /[24]$/.test(c) },
  tests: { rich: (s, e) => gold(s, e.seat) >= 2 },
  counts: { hand: (s, e) => cardsIn(s, `hand:${e.seat}`).length },
  seats: (s) => (gold(s, 'a', 'solo') > 0 ? ['a'] : ['a', 'b']),
  custom: {
    bump: {
      run: (ctx, st, env) => askVerb(ctx, { kind: 'bump', seat: env.seat, min: 1, max: 1, options: [{ id: '1', enabled: true }, { id: '2', enabled: true }] }, st, env),
      resume: (ctx, _st, env, a) => {
        const d = draftOf(ctx);
        d.res = { ...d.res, [env.seat]: { ...d.res?.[env.seat], gold: gold(d, env.seat) + Number(a[0]) } };
      },
      payable: (s) => gold(s) < 4,
      text: () => 'Gain 1 or 2 gold.',
    },
  },
  moved: (ctx, m) => ctx.emit({ type: `${m.op} ${m.card} ${m.from}>${m.to}` }),
});
const VERBS = pack.verbs;

const RULES: GameRules<G> = {
  handlers: {
    ...timingHandlers<G>({
      happen: (ctx, o) => void pack.happen(ctx, o),
      // A protection rule of the fake game: h3 can never be discarded (shows the would window applies).
      before: (ctx, o) => void (((o.kind === 'discard' && o.keys.target === 'h3') || (o.kind === 'reshuffle' && gold(ctx.s, 'a', 'noShuffle') > 0)) && cancelBatch(ctx, o.batch)),
    }),
    verb: verbHandler<G>(VERBS),
    end: (ctx: Ctx<G>) => runLater(ctx, 'end'),
  },
  blank: ({ seed }): Draft<S> => {
    const [a, b, c, d] = seedRng(seed);
    return {
      rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [], res: { a: { gold: 3 } },
      zones: newZones({
        'deck:a': { seen: 'count', owner: 'a', cards: ['d1', 'd2', 'd3', 'd4', 'd5'] }, 'hand:a': { seen: 'owner', owner: 'a', cards: ['h1', 'h2', 'h3'] },
        'discard:a': { seen: 'all', cards: ['x1'] }, 'play:a': { seen: 'all', cards: ['p1'] }, aside: { seen: 'all' }, market: { seen: 'all', cards: ['m1', 'm2'] },
        marketDeck: { seen: 'count', cards: ['k1', 'k2', 'k3'] }, 'hand:b': { seen: 'owner', owner: 'b', cards: ['b1', 'b2'] }, 'deck:b': { seen: 'count', cards: ['e1'] },
      }) as Draft<S['zones']>,
    };
  },
  setup: (ctx) => ctx.then(...(effectTasks(ctx.content.effect, ctx.content.env ?? { seat: 'a', source: 'p1' }) as Task[]), { kind: 'end' }),
  contentHash: (c) => hashValue(c),
  invariants: (s) => zoneProblems(s, 18).map((message) => ({ id: 'zones', message })),
};

const play = (effect: readonly PackStep[], answers: readonly (readonly string[])[] = [], env?: PackEnv): { s: S; prompts: KernelPrompt[] } => {
  const content = env === undefined ? { effect } : { effect, env };
  let { state } = createGame(RULES, { seed: "s" }, {}, content);
  const prompts: KernelPrompt[] = [];
  for (const picks of answers) {
    if (state.prompt === null) throw new Error(`no prompt for ${picks.join(',')}`);
    prompts.push(state.prompt);
    state = applyAction(RULES, state, { kind: 'answer', promptId: state.prompt.id, picks }, content).state;
  }
  expect(state.prompt).toBeNull();
  return { s: state, prompts };
};
const z = (s: S, name: string): readonly string[] => cardsIn(s, name);
const hand = ['h1', 'h2', 'h3'];

// One case per verb (K232): the effect, the answers in order, and what must hold after.
const CASES: readonly [string, readonly PackStep[], readonly (readonly string[])[], (s: S, p: KernelPrompt[]) => void][] = [
  ['draw', [{ op: 'draw', count: 2 }], [], (s) => expect([z(s, 'hand:a'), z(s, 'deck:a')]).toEqual([[...hand, 'd1', 'd2'], ['d3', 'd4', 'd5']])],
  ['draw from an empty deck reshuffles as the game sets', [{ op: 'draw', count: 6 }], [], (s) => expect([z(s, 'hand:a').length, z(s, 'hand:a')[8], z(s, 'discard:a')]).toEqual([9, 'x1', []])],
  ['discard (the seat picks)', [{ op: 'discard', count: 1 }], [['h2']], (s, p) => expect([z(s, 'hand:a'), z(s, 'discard:a'), p[0]?.kind, p[0]?.seat]).toEqual([['h1', 'h3'], ['h2', 'x1'], 'chooseCards', 'a'])],
  ['mill', [{ op: 'mill', count: 2 }], [], (s) => expect(z(s, 'discard:a')).toEqual(['d2', 'd1', 'x1'])],
  ['move (to the bottom)', [{ op: 'move', cards: 'pick', from: 'hand', to: 'deck', at: 'bottom' }], [['h1']], (s) => expect(z(s, 'deck:a')).toEqual(['d1', 'd2', 'd3', 'd4', 'd5', 'h1'])],
  ['putIntoPlay', [{ op: 'putIntoPlay' }], [['h1']], (s) => expect(z(s, 'play:a')).toEqual(['h1', 'p1'])],
  ['setAside', [{ op: 'setAside' }], [], (s) => expect([z(s, 'aside'), z(s, 'play:a')]).toEqual([['p1'], []])],
  ['recall', [{ op: 'setAside' }, { op: 'recall' }], [], (s) => expect([z(s, 'hand:a'), z(s, 'aside')]).toEqual([['p1', ...hand], []])],
  ['gain (from the market)', [{ op: 'gain' }], [['m2']], (s) => expect([z(s, 'discard:a'), z(s, 'market')]).toEqual([['m2', 'x1'], ['m1']])],
  ['refill', [{ op: 'gain' }, { op: 'refill', zone: 'market', from: 'marketDeck', size: 2 }], [['m1']], (s) => expect([z(s, 'market'), z(s, 'marketDeck')]).toEqual([['m2', 'k1'], ['k2', 'k3']])],
  ['shuffle', [{ op: 'shuffle', zone: 'deck' }], [], (s) => expect([...z(s, 'deck:a')].sort()).toEqual(['d1', 'd2', 'd3', 'd4', 'd5'])],
  ['search (match, take, shuffle)', [{ op: 'search', zone: 'deck', filter: 'even' }], [['d4']], (s, p) => {
    expect(p[0]?.options.map((o) => o.id)).toEqual(['d2', 'd4']);
    expect([z(s, 'hand:a'), [...z(s, 'deck:a')].sort()]).toEqual([[...hand, 'd4'], ['d1', 'd2', 'd3', 'd5']]);
  }],
  ['destroy', [{ op: 'destroy' }], [['p1']], (s) => expect(z(s, 'discard:a')).toEqual(['p1', 'x1'])],
  ['attach and detach', [{ op: 'attach', cards: 'pick' }, { op: 'chooseCards', zone: 'attached:p1', max: 1, then: [{ op: 'detach' }] }], [['h1'], ['h1']], (s) =>
    expect([z(s, 'discard:a'), z(s, 'attached:p1')]).toEqual([['h1', 'x1'], []])],
  ['reveal (all see it)', [{ op: 'reveal' }], [], (s) => expect(viewOf(s, 'b')['deck:a']?.cards).toEqual(['d1', null, null, null, null])],
  ['lookAt (only the acting seat sees it)', [{ op: 'lookAt', count: 2 }], [], (s) => expect([viewOf(s, 'a')['deck:a']?.cards?.slice(0, 3), viewOf(s, 'b')['deck:a']?.cards]).toEqual([['d1', 'd2', null], undefined])],
  ['scout (put back in any order)', [{ op: 'scout', count: 3 }], [['d3', 'd1', 'd2']], (s, p) => expect([z(s, 'deck:a'), p[0]?.kind]).toEqual([['d3', 'd1', 'd2', 'd4', 'd5'], 'orderCards'])],
  ['flip', [{ op: 'flip' }], [], (s) => expect(hasMark(s, 'p1', 'flipped')).toBe(true)],
  ['exhaust', [{ op: 'exhaust' }], [], (s) => expect(hasMark(s, 'p1', 'exhausted')).toBe(true)],
  ['ready', [{ op: 'exhaust' }, { op: 'ready' }], [], (s) => expect([hasMark(s, 'p1', 'exhausted'), s.marks]).toEqual([false, {}])],
  ['chooseCards', [{ op: 'chooseCards', zone: 'hand', max: 2, then: [{ op: 'discard', cards: 'chosen' }] }], [['h1', 'h2']], (s) => expect(z(s, 'hand:a')).toEqual(['h3'])],
  ['chooseOption', [{ op: 'chooseOption', options: [[{ op: 'gainResource', res: 'gold', amount: 1 }], [{ op: 'draw', count: 1 }]] }], [['1']], (s) => expect([gold(s), z(s, 'hand:a').length]).toEqual([3, 4])],
  ['may', [{ op: 'may', then: [{ op: 'draw', count: 1 }] }, { op: 'may', then: [{ op: 'gainResource', res: 'gold', amount: 1 }] }], [['no'], ['yes']], (s) => expect([gold(s), z(s, 'hand:a').length]).toEqual([4, 3])],
  ['chooseNumber', [{ op: 'chooseNumber', max: 3, then: [{ op: 'gainResource', res: 'gold', amount: 'X' }] }], [['2']], (s) => expect(gold(s)).toBe(5)],
  ['chooseDestination', [{ op: 'chooseDestination', to: ['hand', 'aside'] }], [['aside']], (s) => expect(z(s, 'aside')).toEqual(['p1'])],
  ['choosePlayer', [{ op: 'choosePlayer', others: true, then: [{ op: 'draw', count: 1 }] }], [['b']], (s, p) => expect([z(s, 'hand:b'), p[0]?.options.map((o) => o.id)]).toEqual([['b1', 'b2', 'e1'], ['b']])],
  ['choosePayment', [{ op: 'choosePayment', ways: [[{ op: 'pay', res: 'gold', amount: 5 }], [{ op: 'pay', res: 'gold', amount: 1 }]], then: [{ op: 'draw', count: 1 }] }], [['1']], (s, p) => {
    expect(p[0]?.options.map((o) => o.enabled)).toEqual([false, true]);
    expect([gold(s), z(s, 'hand:a').length]).toEqual([2, 4]);
  }],
  ['orderEffects', [{ op: 'orderEffects', effects: [[{ op: 'adjust', key: 'score', by: 1 }], [{ op: 'adjust', key: 'score', by: -5, min: 0 }]] }], [['1', '0']], (s) => expect(gold(s, 'a', 'score')).toBe(1)],
  ['gainResource', [{ op: 'gainResource', res: 'gold', amount: 2 }], [], (s) => expect(gold(s)).toBe(5)],
  ['pay', [{ op: 'pay', res: 'gold', amount: 2 }], [], (s) => expect(gold(s)).toBe(1)],
  ['convert', [{ op: 'convert', res: 'gold', amount: 2, into: 'vp', get: 1 }], [], (s) => expect([gold(s), gold(s, 'a', 'vp')]).toEqual([1, 1])],
  ['adjust (clamped)', [{ op: 'adjust', key: 'track', by: 3, max: 2 }], [], (s) => expect(gold(s, 'a', 'track')).toBe(2)],
  ['seq', [{ op: 'seq', steps: [{ op: 'draw', count: 1 }, { op: 'draw', count: 1 }] }], [], (s) => expect(z(s, 'hand:a').length).toBe(5)],
  ['if', [{ op: 'if', test: 'rich', then: [{ op: 'draw', count: 1 }], else: [{ op: 'gainResource', res: 'gold', amount: 1 }] }], [], (s) => expect([gold(s), z(s, 'hand:a').length]).toEqual([3, 4])],
  ['forEach', [{ op: 'chooseCards', zone: 'hand', max: 2, then: [{ op: 'forEach', then: [{ op: 'gainResource', res: 'gold', amount: 1 }] }] }], [['h1', 'h2']], (s) => expect(gold(s)).toBe(5)],
  ['eachPlayer', [{ op: 'eachPlayer', then: [{ op: 'draw', count: 1 }] }], [], (s) => expect([z(s, 'hand:a').length, z(s, 'hand:b')]).toEqual([4, ['b1', 'b2', 'e1']])],
  ['repeat', [{ op: 'repeat', times: 2, then: [{ op: 'gainResource', res: 'gold', amount: 1 }] }], [], (s) => expect(gold(s)).toBe(5)],
  ['count', [{ op: 'count', what: 'hand', then: [{ op: 'gainResource', res: 'gold', amount: 'X' }] }], [], (s) => expect(gold(s)).toBe(6)],
  ['later (runs at the moment the game names)', [{ op: 'later', at: 'end', then: [{ op: 'gainResource', res: 'gold', amount: 1 }] }], [], (s) => expect([gold(s), s.later]).toEqual([4, []])],
  ['payThen', [{ op: 'payThen', cost: [{ op: 'pay', res: 'gold', amount: 2 }], then: [{ op: 'draw', count: 1 }] }, { op: 'payThen', cost: [{ op: 'pay', res: 'gold', amount: 9 }], then: [{ op: 'draw', count: 1 }] }], [], (s) =>
    expect([gold(s), z(s, 'hand:a').length]).toEqual([1, 4])],
  ['custom (asks and resumes)', [{ op: 'custom', name: 'bump' }], [['2']], (s, p) => expect([gold(s), p[0]?.kind]).toEqual([5, 'bump'])],
];

const stepsOf = (v: unknown): Step[] =>
  Array.isArray(v) ? v.flatMap(stepsOf) : typeof v === 'object' && v !== null ? [...('op' in v ? [v as Step] : []), ...Object.values(v).flatMap(stepsOf)] : [];

describe('card-language verb pack (K232)', () => {
  it.each(CASES)('K232 %s', (_name, effect, answers, check) => {
    expect(validateEffect(VERBS, effect)).toEqual([]);
    const { s, prompts } = play(effect, answers);
    check(s, prompts);
  });

  it('K232 every pack verb has a handler, words and a tested example', () => {
    const examples = CASES.flatMap(([, e]) => stepsOf(e)) as PackStep[];
    expectVerbs(VERBS, examples);
    expect(Object.keys(VERBS).sort()).toEqual(Object.keys(PACK_WORDS).sort());
  });

  it('K232 every card move goes through would: a before window cancels it, and each move is one occurrence of its verb', () => {
    const { s } = play([{ op: 'discard', count: 1 }], [['h3']]);
    expect(z(s, 'hand:a')).toEqual(hand);
    const draw = play([{ op: 'draw', count: 2 }]).s;
    expect(draw.timing?.occurrences.map((o) => [o.kind, o.state])).toEqual([['draw', 'happened'], ['draw', 'happened']]);
    expect(draw.log.map((e) => e.type)).toEqual(['draw d1 deck:a>hand:a', 'draw d2 deck:a>hand:a']);
  });

  it('K232 the draw reshuffle is its own would occurrence: cancelled, nothing is shuffled in and the draw stops', () => {
    const on = play([{ op: 'draw', count: 6 }]).s;
    expect(on.timing?.occurrences.map((o) => o.kind)).toEqual(['draw', 'draw', 'draw', 'draw', 'draw', 'draw', 'draw', 'reshuffle']);
    const off = play([{ op: 'gainResource', res: 'noShuffle', amount: 1 }, { op: 'draw', count: 6 }]).s;
    expect([z(off, 'hand:a').length, z(off, 'discard:a'), z(off, 'deck:a')]).toEqual([8, ['x1'], []]);
  });

  it('K232 asking verbs inside forEach and seq each ask and resume in order', () => {
    const each = play([{ op: 'chooseCards', zone: 'hand', max: 2, then: [{ op: 'forEach', then: [{ op: 'may', then: [{ op: 'gainResource', res: 'gold', amount: 1 }] }] }] }], [['h1', 'h2'], ['yes'], ['no']]);
    expect([gold(each.s), each.prompts.map((p) => p.kind)]).toEqual([4, ['chooseCards', 'may', 'may']]);
    const seq = play([{ op: 'seq', steps: [{ op: 'discard', count: 1 }, { op: 'may', then: [{ op: 'draw', count: 1 }] }] }], [['h1'], ['yes']]);
    expect(z(seq.s, 'hand:a')).toEqual(['h2', 'h3', 'd1']);
  });

  it('K232 an empty choice set asks nothing; min above what is there asks for what is there', () => {
    expect(gold(play([{ op: 'chooseCards', zone: 'aside', max: 1, then: [{ op: 'gainResource', res: 'gold', amount: 1 }] }]).s)).toBe(4);
    expect(z(play([{ op: 'choosePayment', ways: [[{ op: 'pay', res: 'gold', amount: 9 }]], then: [{ op: 'draw', count: 1 }] }]).s, 'hand:a')).toEqual(hand);
    const { s, prompts } = play([{ op: 'chooseCards', zone: 'play', min: 2, max: 3, then: [{ op: 'discard', cards: 'chosen' }] }], [['p1']]);
    expect([prompts[0]?.min, prompts[0]?.max, z(s, 'discard:a')]).toEqual([1, 1, ['p1', 'x1']]);
  });

  it('K232 choosePlayer with no other seat asks nothing and skips', () => {
    const { s } = play([{ op: 'gainResource', res: 'solo', amount: 1 }, { op: 'choosePlayer', others: true, then: [{ op: 'draw', count: 1 }] }]);
    expect(z(s, 'hand:a')).toEqual(hand);
  });

  it('K255 pay refuses when unaffordable, leaving the resource unchanged and the later steps running', () => {
    const s = play([{ op: 'pay', res: 'gold', amount: 9 }, { op: 'draw', count: 1 }]).s;
    expect([gold(s), z(s, 'hand:a').length]).toEqual([3, 4]);
  });

  it('K232 payThen: a cost move cancelled in its would window pays nothing, so then does not run', () => {
    const cost = (c: string): S => play([{ op: 'payThen', cost: [{ op: 'discard', count: 1 }], then: [{ op: 'draw', count: 1 }] }], [[c]]).s;
    expect(z(cost('h3'), 'hand:a')).toEqual(hand);
    expect(z(cost('h1'), 'hand:a')).toEqual(['h2', 'h3', 'd1']);
  });

  it('K232 payThen checks every cost kind: exhausted card, nothing to destroy, no source, the custom payable hook', () => {
    const then: PackStep[] = [{ op: 'draw', count: 1 }];
    const drew = (effect: PackStep[], env?: PackEnv): number => play(effect, [], env).s.zones['hand:a']?.cards.length ?? 0;
    expect(drew([{ op: 'exhaust' }, { op: 'payThen', cost: [{ op: 'exhaust' }], then }])).toBe(3);
    expect(drew([{ op: 'payThen', cost: [{ op: 'exhaust' }], then }])).toBe(4);
    expect(drew([{ op: 'payThen', cost: [{ op: 'destroy', from: 'aside' }], then }])).toBe(3);
    expect(drew([{ op: 'payThen', cost: [{ op: 'discard', cards: 'source' }], then }], { seat: 'a' })).toBe(3);
    expect(drew([{ op: 'payThen', cost: [{ op: 'discard', cards: 'source' }], then }])).toBe(4);
    expect(drew([{ op: 'gainResource', res: 'gold', amount: 1 }, { op: 'payThen', cost: [{ op: 'custom', name: 'bump' }], then }])).toBe(3);
  });

  it('K232 an empty deck with no reshuffle set stops the draw', () => {
    const { s } = play([{ op: 'draw', count: 3 }], [], { seat: 'b' });
    expect([z(s, 'hand:b'), z(s, 'deck:b')]).toEqual([['b1', 'b2', 'e1'], []]);
  });

  it("K232 a seat picks from its own view only: another seat's hidden cards are offered as positions, never ids", () => {
    const effect: PackStep[] = [{ op: 'chooseCards', zone: 'hand:b', max: 1, then: [{ op: 'move', cards: 'chosen', to: 'discard' }] }];
    const { s, prompts } = play(effect, [['#1']]);
    expect(prompts[0]?.options.map((o) => o.id)).toEqual(['#0', '#1']);
    expect(JSON.stringify(prompts[0])).not.toMatch(/b1|b2/);
    expect([z(s, 'hand:b'), z(s, 'discard:a')]).toEqual([['b1'], ['b2', 'x1']]);
  });

  it('K232 a save in the middle of an effect resumes: same state as playing on', () => {
    const content = { effect: [{ op: 'discard', count: 1 }, { op: 'scout', count: 2 }, { op: 'chooseNumber', max: 2, then: [{ op: 'draw', count: 'X' }] }] as PackStep[] };
    const answers = [['h1'], ['d2', 'd1'], ['2']];
    let { state } = createGame(RULES, { seed: "s" }, {}, content);
    const actions: AnswerAction[] = [];
    for (const picks of answers) {
      const a: AnswerAction = { kind: 'answer', promptId: state.prompt?.id ?? 0, picks };
      actions.push(a);
      state = applyAction(RULES, state, a, content).state;
    }
    const saved = importSave(RULES, exportSave(createSave(RULES, { options: { seed: 's' }, rules: {}, actions: actions.slice(0, 1), undoUsed: false, savedAt: 't' }, content)), content);
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.state.prompt?.kind).toBe('orderCards');
    let back = saved.state;
    for (const a of actions.slice(1)) back = applyAction(RULES, back, { ...a, promptId: back.prompt?.id ?? 0 }, content).state;
    expect(hashState(back)).toBe(hashState(state));
    expect(z(back, 'hand:a')).toEqual(['h2', 'h3', 'd2', 'd1']);
  });

  it('K232 ordered answers: the order given is the order run', () => {
    const effect: PackStep[] = [{ op: 'orderEffects', effects: [[{ op: 'adjust', key: 'score', by: 1 }], [{ op: 'adjust', key: 'score', by: -5, min: 0 }]] }];
    expect(gold(play(effect, [['0', '1']]).s, 'a', 'score')).toBe(0);
    expect(gold(play(effect, [['1', '0']]).s, 'a', 'score')).toBe(1);
  });

  it('K232 words: default templates with slots, the game overrides them per verb', () => {
    expect(describeEffect(VERBS, [{ op: 'draw', count: 2 }, { op: 'discard', count: 1 }, { op: 'mill', count: 1 }, { op: 'may', then: [{ op: 'gainResource', res: 'gold', amount: 1 }] }])).toBe(
      'Draw 2 cards. Discard 1 card from hand. Put the top 1 card of deck into discard. You may: Gain 1 gold.',
    );
    const mine = cardPack<G>({ words: { draw: 'Draw {count} [card].', gainResource: (s: PackStep) => `+${String((s as { amount: number }).amount)} [gold]` }, word: (k, v) => (k === 'zone' ? `your ${v}` : v) }).verbs;
    expect(describeEffect(mine, [{ op: 'draw', count: 2 }, { op: 'gainResource', res: 'gold', amount: 3 }, { op: 'search', zone: 'deck' }])).toBe('Draw 2 [card]. +3 [gold] Search your deck for 1 card and put it into your hand.');
    expect(validateEffect(VERBS, [{ op: 'draw', count: 0 }, { op: 'move', cards: 'some' }])).toEqual(['[0].count: draw count must be a positive integer or X', '[1].cards: move cards must be one of chosen, source, top, pick, all']);
  });
});
