import { describe, expect, it } from 'vitest';
import { applyAction, blocked, createGame, draftOf, hashState, hashValue, seedRng, timingHandlers, type AnswerAction, type Draft, type GameRules, type KernelPrompt, type KernelState, type KernelTask } from '../engine-core/index.ts';
import { cardsIn, newZones } from '../card-zones/index.ts';
import { effectTasks, verbHandler, type VerbTask } from './index.ts';
import { cardPack, inDryRun, type OfferPolicy, type PackEnv, type PackState, type PackStep } from './pack.ts';

// K529: a made-up two-seat game on the pack (tests only). Seat a acts with 3 gold; p1 (in play) is the source card.
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
type Eff = readonly PackStep[];

const gold = (s: PackState, seat = 'a', k = 'gold'): number => s.res?.[seat]?.[k] ?? 0;
const GAIN: PackStep = { op: 'gainResource', res: 'gold', amount: 1 };
const NOTHING: PackStep = { op: 'move', cards: 'top', from: 'aside', to: 'discard' };
const DRAW: PackStep = { op: 'draw', count: 1 };
const pay = (amount: number): PackStep => ({ op: 'pay', res: 'gold', amount });

const game = (offer?: OfferPolicy<S>, wire = true) => {
  const pack = cardPack<G>({
    filters: { even: (_s, c) => c.endsWith('2') },
    tests: { rich: (s, e) => gold(s, e.seat) >= 9 },
    seats: () => ['a', 'b'],
    custom: {
      nothing: { run: () => undefined, text: () => 'Nothing.' },
      roll: { run: (ctx, _st, env) => void (draftOf(ctx).res = { [env.seat]: { gold: ctx.rng.int(6) } }), text: () => 'Roll.' },
      loop: { run: (ctx, st, env) => ctx.then(...(effectTasks([st], env) as Task[])), text: () => 'Loop.' },
      dry: { run: (ctx) => void (inDryRun() && ctx.emit({ type: 'dry' })), text: () => 'Dry.' },
    },
    moved: (ctx, m) => ctx.emit({ type: `${m.op} ${m.card}` }),
    ...(offer === undefined ? {} : { offer }),
    ...(wire ? { handlers: () => RULES.handlers } : {}),
  });
  const RULES: GameRules<G> = {
    handlers: { ...timingHandlers<G>({ happen: (ctx, o) => void pack.happen(ctx, o) }), verb: verbHandler<G>(pack.verbs) },
    blank: ({ seed }): Draft<S> => {
      const [a, b, c, d] = seedRng(seed);
      return {
        rng: { a, b, c, d }, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [], res: { a: { gold: 3 } },
        zones: newZones({
          'deck:a': { seen: 'count', owner: 'a', cards: ['d1', 'd2'] }, 'hand:a': { seen: 'owner', owner: 'a', cards: ['h1', 'h2'] },
          'discard:a': { seen: 'all' }, 'play:a': { seen: 'all', cards: ['p1'] }, aside: { seen: 'all' },
          'hand:b': { seen: 'owner', owner: 'b', cards: ['b1', 'b2'] }, 'deck:b': { seen: 'count' },
        }) as Draft<S['zones']>,
      };
    },
    setup: (ctx) => ctx.then(...(effectTasks(ctx.content.effect, ctx.content.env ?? { seat: 'a', source: 'p1' }) as Task[])),
    contentHash: (c) => hashValue(c),
  };
  const play = (effect: Eff, answers: readonly (readonly string[])[] = [], env?: PackEnv): { s: S; prompts: KernelPrompt[] } => {
    const content = env === undefined ? { effect } : { effect, env };
    let { state } = createGame(RULES, { seed: 's' }, {}, content);
    const prompts: KernelPrompt[] = [];
    for (const picks of answers) {
      if (state.prompt === null) throw new Error(`no prompt for ${picks.join(',')}`);
      prompts.push(state.prompt);
      state = applyAction(RULES, state, { kind: 'answer', promptId: state.prompt.id, picks }, content).state;
    }
    expect(state.prompt).toBeNull();
    return { s: state, prompts };
  };
  const check = (steps: Eff, env: PackEnv = { seat: 'a', source: 'p1' }, before: Eff = []) => {
    const content = { effect: before };
    const s = createGame(RULES, { seed: 's' }, {}, content).state;
    const h = hashState(s);
    const r = pack.wouldChange(s, content, steps, env);
    expect(hashState(s)).toBe(h);
    return r;
  };
  return { pack, play, check };
};
const z = (s: S, name: string): readonly string[] => cardsIn(s, name);
const kinds = (p: readonly KernelPrompt[]): (string | undefined)[] => p.map((x) => x.kind);

describe('card-language offer policy (K529): the would-change-nothing check', () => {
  const { check } = game();
  it('K529 case 1: a sequence with one step that can act is able; with none it is not', () => {
    expect(check([NOTHING, GAIN])).toBe('yes');
    expect(check([NOTHING, NOTHING])).toBe('no');
  });
  it('K529 case 8, 9: a partial effect is able (draw 3 with 2 left); a draw from an empty zone is not', () => {
    expect(check([{ op: 'draw', count: 3 }])).toBe('yes');
    expect(check([DRAW], { seat: 'b' })).toBe('no');
  });
  it('K529 case 10, 11: an amount of 0, a repeat of 0 and a for-each over nothing are not able', () => {
    expect(check([{ op: 'gainResource', res: 'gold', amount: 'X' }], { seat: 'a', n: 0 })).toBe('no');
    expect(check([{ op: 'repeat', times: 'X', then: [GAIN] }], { seat: 'a', n: 0 })).toBe('no');
    expect(check([{ op: 'forEach', then: [GAIN] }], { seat: 'a', cards: [] })).toBe('no');
    expect(check([{ op: 'forEach', then: [GAIN] }], { seat: 'a', cards: ['h1'] })).toBe('yes');
  });
  it('K529 case 12, 14: an optional step inside counts when its body can change something, not when every branch changes nothing', () => {
    expect(check([{ op: 'may', then: [GAIN] }])).toBe('yes');
    expect(check([{ op: 'may', then: [NOTHING] }])).toBe('no');
    expect(check([{ op: 'chooseOption', options: [[NOTHING], [{ op: 'may', then: [NOTHING] }]] }])).toBe('no');
    expect(check([{ op: 'chooseOption', options: [[NOTHING], [{ op: 'may', then: [DRAW] }]] }])).toBe('yes');
  });
  it('K529 case 13: an optional pay-to whose cost cannot be paid in full is not able; payable, it is', () => {
    expect(check([{ op: 'may', then: [{ op: 'payThen', cost: [pay(9)], then: [GAIN] }] }])).toBe('no');
    expect(check([{ op: 'may', then: [{ op: 'payThen', cost: [pay(2)], then: [GAIN] }] }])).toBe('yes');
  });
  it('K529 case 15: an "if you did" follow-up alone does not count', () => {
    expect(check([{ op: 'payThen', cost: [{ op: 'custom', name: 'nothing' }], then: [GAIN] }])).toBe('no');
  });
  it('K529 case 17: a false condition with no else is not able; with an else it is judged on the else', () => {
    expect(check([{ op: 'if', test: 'rich', then: [GAIN] }])).toBe('no');
    expect(check([{ op: 'if', test: 'rich', then: [GAIN], else: [NOTHING] }])).toBe('no');
    expect(check([{ op: 'if', test: 'rich', then: [NOTHING], else: [GAIN] }])).toBe('yes');
  });
  it('K529 case 22: "up to N" may stop at zero, so only a pick that changes something makes it able', () => {
    expect(check([{ op: 'chooseCards', zone: 'hand', min: 0, max: 2, then: [{ op: 'discard', cards: 'chosen' }] }])).toBe('yes');
    expect(check([{ op: 'chooseCards', zone: 'hand', min: 0, max: 2, then: [NOTHING] }])).toBe('no');
  });
  it('K529 case 34: a random step is unknown, never drawn; a change before it is a yes', () => {
    expect(check([{ op: 'shuffle', zone: 'deck' }])).toBe('unknown');
    expect(check([{ op: 'custom', name: 'roll' }])).toBe('unknown');
    expect(check([GAIN, { op: 'custom', name: 'roll' }])).toBe('yes');
  });
  it('K529 case 33: a step the engine cannot run is unknown', () => {
    expect(check([{ op: 'custom', name: 'missing' }])).toBe('unknown');
  });
  it('K529 case 35: a run that hits the task cap or the branch cap is unknown, never a no; both caps are settable', () => {
    const many: Eff = [{ op: 'chooseNumber', max: 40, then: [NOTHING] }];
    const long: Eff = [{ op: 'repeat', times: 50, then: [{ op: 'custom', name: 'nothing' }] }];
    expect(check([{ op: 'custom', name: 'loop' }])).toBe('unknown');
    expect(check(many)).toBe('unknown');
    expect(game({ branches: 64 }).check(many)).toBe('no');
    expect(check(long)).toBe('no');
    expect(game({ tasks: 10 }).check(long)).toBe('unknown');
  });
  it("K529 hidden information: a filter over cards the seat cannot see, or another seat's choice, is unknown", () => {
    expect(check([{ op: 'search', zone: 'deck', filter: 'even' }])).toBe('unknown');
    expect(check([{ op: 'choosePlayer', others: true, then: [{ op: 'may', then: [GAIN] }] }])).toBe('unknown');
    expect(check([{ op: 'chooseCards', zone: 'hand:b', max: 1, filter: 'even', then: [{ op: 'move', cards: 'chosen', to: 'discard' }] }])).toBe('no');
    expect(check([{ op: 'chooseCards', zone: 'hand:b', max: 1, then: [{ op: 'move', cards: 'chosen', to: 'discard' }] }])).toBe('yes');
  });
  it('K529 case 36: the check leaks no state change and no event, in or out of a run, and does not nest', () => {
    const { play, pack } = game({ noChange: 'skip' });
    const { s, prompts } = play([{ op: 'may', then: [{ op: 'custom', name: 'dry' }, DRAW] }], [['no']]);
    expect([kinds(prompts), s.log, z(s, 'hand:a'), s.timing?.occurrences ?? []]).toEqual([['may'], [], ['h1', 'h2'], []]);
    expect(inDryRun()).toBe(false);
    expect(typeof pack.wouldChange).toBe('function');
  });
  it('K529 a policy that needs the check without cfg.handlers fails at build', () => {
    expect(() => game({ noChange: 'skip' }, false)).toThrow(/handlers/);
    expect(() => game({ cost: 'whole', fewer: 'exact' }, false)).not.toThrow();
  });
});

describe('card-language offer policy (K529): one test per knob setting', () => {
  const idle: Eff = [{ op: 'may', then: [NOTHING] }, GAIN];
  it('K529 knob noChange = ask (default): an optional effect that would change nothing is still asked', () => {
    const { s, prompts } = game().play(idle, [['yes']]);
    expect([kinds(prompts), prompts[0]?.options, gold(s)]).toEqual([['may'], [{ id: 'yes', enabled: true }, { id: 'no', enabled: true }], 4]);
  });
  it('K529 knob noChange = skip: it is not offered, the rest runs; one that changes something is asked', () => {
    const g = game({ noChange: 'skip' });
    expect([g.play(idle).prompts.length, gold(g.play(idle).s)]).toEqual([0, 4]);
    expect(gold(g.play([{ op: 'may', then: [GAIN] }], [['yes']]).s)).toBe(4);
  });
  it('K529 knob noChange = bar: it is asked with yes barred and the reason code noChange', () => {
    const g = game({ noChange: 'bar' });
    const { prompts } = g.play(idle, [['no']]);
    expect(blocked(prompts[0] ?? null).map((b) => [b.id, b.reason])).toEqual([['yes', 'noChange']]);
    expect(() => g.play(idle, [['yes']])).toThrow(/noChange/);
    expect(blocked(g.play([{ op: 'may', then: [GAIN] }], [['no']]).prompts[0] ?? null)).toEqual([]);
  });

  const two: Eff = [{ op: 'payThen', cost: [pay(2), pay(2)], then: [DRAW] }];
  it('K529 knob cost = parts (default), case 2: each part judged alone, so a total out of reach still starts', () => {
    const { s } = game().play(two);
    expect([gold(s), z(s, 'hand:a').length]).toEqual([1, 3]);
  });
  it('K529 knob cost = whole, case 2: the parts are summed, so it is not started and nothing is paid', () => {
    const { s } = game({ cost: 'whole' }).play(two);
    expect([gold(s), z(s, 'hand:a').length]).toEqual([3, 2]);
    expect(gold(game({ cost: 'whole' }).play([{ op: 'payThen', cost: [pay(1), pay(2)], then: [DRAW] }]).s)).toBe(0);
  });
  it('K529 case 3, 7: a part that cannot be paid at all, or only partly, stops the cost under both settings', () => {
    for (const g of [game(), game({ cost: 'whole' })]) {
      expect(z(g.play([{ op: 'payThen', cost: [pay(1), pay(9)], then: [DRAW] }]).s, 'hand:a').length).toBe(2);
      expect(z(g.play([{ op: 'payThen', cost: [{ op: 'mill', count: 3 }], then: [DRAW] }]).s, 'deck:a').length).toBe(2);
      expect(g.play([{ op: 'payThen', cost: [{ op: 'discard', count: 3 }], then: [DRAW] }]).prompts).toEqual([]);
    }
  });
  it('K529 knob cost = whole, case 4: two card-taking parts need two distinct cards, assigned by matching, not first fit', () => {
    const g = game({ cost: 'whole' });
    const even: PackStep = { op: 'discard', count: 1, filter: 'even' };
    expect(g.play([{ op: 'payThen', cost: [even, even], then: [GAIN] }]).prompts).toEqual([]);
    const { s } = g.play([{ op: 'payThen', cost: [{ op: 'discard', count: 1 }, even], then: [GAIN] }], [['h1'], ['h2']]);
    expect([z(s, 'hand:a'), gold(s)]).toEqual([[], 4]);
    expect(gold(g.play([{ op: 'payThen', cost: [{ op: 'mill', count: 2 }, { op: 'mill', count: 1 }], then: [GAIN] }]).s)).toBe(3);
  });
  it('K529 knob cost = whole, case 5: exhaust this card and discard this card is payable with the one card; two discards of it are not', () => {
    const g = game({ cost: 'whole' });
    const gone: PackStep = { op: 'discard', cards: 'source' };
    expect(gold(g.play([{ op: 'payThen', cost: [{ op: 'exhaust' }, gone], then: [GAIN] }]).s)).toBe(4);
    expect(z(g.play([{ op: 'payThen', cost: [gone, gone], then: [GAIN] }]).s, 'play:a')).toEqual(['p1']);
  });
  it('K529 knob cost is read by choosePayment: a way whose parts sum out of reach is barred under whole', () => {
    const ways: Eff = [{ op: 'choosePayment', ways: [[pay(2), pay(2)], [pay(1)]], then: [DRAW] }];
    expect(game().play(ways, [['1']]).prompts[0]?.options.map((o) => o.enabled)).toEqual([true, true]);
    expect(game({ cost: 'whole' }).play(ways, [['1']]).prompts[0]?.options.map((o) => o.enabled)).toEqual([false, true]);
  });

  const exact: Eff = [{ op: 'chooseCards', zone: 'hand', min: 3, max: 3, then: [GAIN] }];
  it('K529 knob fewer = cap (default), case 23: exactly N with fewer there asks for what is there', () => {
    const { s, prompts } = game().play(exact, [['h1', 'h2']]);
    expect([prompts[0]?.min, prompts[0]?.max, gold(s)]).toEqual([2, 2, 4]);
  });
  it('K529 knob fewer = exact, case 23: exactly N with fewer there is not offered and its effect does not run', () => {
    const g = game({ fewer: 'exact' });
    expect([g.play(exact).prompts.length, gold(g.play(exact).s)]).toEqual([0, 3]);
    const enough = g.play([{ op: 'chooseCards', zone: 'hand', max: 2, then: [GAIN] }], [['h1', 'h2']]);
    expect([enough.prompts[0]?.min, gold(enough.s)]).toEqual([2, 4]);
  });
  it('K529 knob fewer = exact, case 22: "up to N" with fewer there is still offered, capped, and may stop at zero', () => {
    const { s, prompts } = game({ fewer: 'exact' }).play([{ op: 'chooseCards', zone: 'hand', min: 0, max: 3, then: [GAIN] }], [[]]);
    expect([prompts[0]?.min, prompts[0]?.max, gold(s)]).toEqual([0, 2, 4]);
  });

  const mixed: Eff = [{ op: 'chooseOption', options: [[NOTHING], [GAIN], [{ op: 'payThen', cost: [pay(9)], then: [GAIN] }]] }];
  const dead: Eff = [{ op: 'chooseOption', options: [[NOTHING], [{ op: 'payThen', cost: [pay(9)], then: [GAIN] }]] }, GAIN];
  it('K529 knob deadChoice = today (default), case 19: every option is offered, even when none changes anything', () => {
    expect(game().play(mixed, [['0']]).prompts[0]?.options).toEqual([{ id: '0', enabled: true }, { id: '1', enabled: true }, { id: '2', enabled: true }]);
    expect(kinds(game().play(dead, [['1']]).prompts)).toEqual(['chooseOption']);
  });
  it('K529 knob deadChoice = skip, case 19: a choice with no changing option is not offered; with one it is offered as today', () => {
    const g = game({ deadChoice: 'skip' });
    expect([g.play(dead).prompts.length, gold(g.play(dead).s)]).toEqual([0, 4]);
    expect(g.play(mixed, [['0']]).prompts[0]?.options.map((o) => o.enabled)).toEqual([true, true, true]);
  });
  it('K529 knob deadChoice = bar, case 18: each dead option is barred with its reason code; none alive is not offered', () => {
    const g = game({ deadChoice: 'bar' });
    expect(blocked(g.play(mixed, [['1']]).prompts[0] ?? null).map((b) => [b.id, b.reason])).toEqual([['0', 'noChange'], ['2', 'cannotPay']]);
    expect(() => g.play(mixed, [['0']])).toThrow(/noChange/);
    expect(g.play(dead).prompts).toEqual([]);
  });
  it('K529 knob deadChoice on choosePayment: today a way that cannot be paid is barred with words only; bar gives the code cannotPay; none payable is never offered', () => {
    const ways: Eff = [{ op: 'choosePayment', ways: [[pay(9)], [pay(1)]], then: [DRAW] }];
    const none: Eff = [{ op: 'choosePayment', ways: [[pay(9)]], then: [DRAW] }];
    expect(game().play(ways, [['1']]).prompts[0]?.options[0]).toEqual({ id: '0', enabled: false, why: 'cannotPay' });
    expect(game({ deadChoice: 'skip' }).play(ways, [['1']]).prompts[0]?.options[0]).toEqual({ id: '0', enabled: false, why: 'cannotPay' });
    expect(blocked(game({ deadChoice: 'bar' }).play(ways, [['1']]).prompts[0] ?? null).map((b) => b.reason)).toEqual(['cannotPay']);
    for (const d of ['today', 'skip', 'bar'] as const) expect(game({ deadChoice: d }).play(none).prompts).toEqual([]);
  });

  const random: Eff = [{ op: 'may', then: [{ op: 'shuffle', zone: 'deck' }] }];
  it('K529 knob unknown = offer (default): an unknown result is offered', () => {
    expect(kinds(game({ noChange: 'skip' }).play(random, [['no']]).prompts)).toEqual(['may']);
    expect(blocked(game({ deadChoice: 'bar' }).play([{ op: 'chooseOption', options: [[{ op: 'custom', name: 'roll' }], [GAIN]] }], [['1']]).prompts[0] ?? null)).toEqual([]);
  });
  it('K529 knob unknown = skip: an unknown result is not offered, or barred with the code unknown', () => {
    expect(game({ noChange: 'skip', unknown: 'skip' }).play(random).prompts).toEqual([]);
    expect(blocked(game({ noChange: 'bar', unknown: 'skip' }).play(random, [['no']]).prompts[0] ?? null).map((b) => b.reason)).toEqual(['unknown']);
    expect(blocked(game({ deadChoice: 'bar', unknown: 'skip' }).play([{ op: 'chooseOption', options: [[{ op: 'custom', name: 'roll' }], [GAIN]] }], [['1']]).prompts[0] ?? null).map((b) => [b.id, b.reason])).toEqual([['0', 'unknown']]);
  });

  it('K529 the default policy changes nothing: same prompts and same state as a pack with no policy', () => {
    const DEFAULTS: OfferPolicy<S> = { noChange: 'ask', cost: 'parts', fewer: 'cap', deadChoice: 'today', unknown: 'offer' };
    const runs: readonly [Eff, readonly (readonly string[])[]][] = [
      [idle, [['yes']]], [idle, [['no']]], [two, []], [exact, [['h1', 'h2']]], [mixed, [['2']]], [dead, [['0']]], [random, [['yes']]],
      [[{ op: 'choosePayment', ways: [[pay(9)], [pay(2), pay(2)]], then: [DRAW] }], [['1']]],
      [[{ op: 'chooseCards', zone: 'aside', max: 1, then: [GAIN] }], []],
      [[{ op: 'payThen', cost: [{ op: 'discard', count: 1 }, { op: 'exhaust' }], then: [{ op: 'may', then: [DRAW] }] }], [['h2'], ['yes']]],
      [[pay(9), { op: 'convert', res: 'gold', amount: 2, into: 'vp', get: 1 }], []],
    ];
    for (const [effect, answers] of runs) {
      const a = game().play(effect, answers);
      const b = game(DEFAULTS).play(effect, answers);
      const c = game(undefined, false).play(effect, answers);
      expect([hashState(b.s), JSON.stringify(b.prompts)]).toEqual([hashState(a.s), JSON.stringify(a.prompts)]);
      expect(hashState(c.s)).toBe(hashState(a.s));
    }
  });
});
