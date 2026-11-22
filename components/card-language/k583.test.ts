import { describe, expect, it } from 'vitest';
import { blocked, EngineBugError, type KernelPrompt } from '../engine-core/index.ts';
import { cardsIn } from '../card-zones/index.ts';
import { describeEffect } from './index.ts';
import { cannotKnow, cardPack, inDryRun, type PackEnv, type PackStep } from './pack.ts';
import { DRAW, GAIN, gold, NOTHING, offerGame, pay, type Eff, type G, type GameOpts, type S } from './offerGame.ts';

// K583: every case on the made-up game of offerGame.ts. Seat a: 3 gold, hand h1 h2, deck d1 d2, p1 in play; seat b: hidden hand b1 b2 b3.
const game = (offer?: GameOpts['offer'], opts: GameOpts = {}) => offerGame(cardPack<G>, { ...opts, ...(offer ? { offer } : {}) });
const A: PackEnv = { seat: 'a', source: 'p1' };
const z = (s: S, name: string): readonly string[] => cardsIn(s, name);
const kinds = (p: readonly KernelPrompt[]): (string | undefined)[] => p.map((x) => x.kind);
const bars = (p: KernelPrompt | undefined): (string | undefined)[][] => blocked(p ?? null).map((b) => [b.id, b.reason]);
const paid = (cost: Eff, then: Eff): PackStep => ({ op: 'payThen', cost, then });
const HAVE: PackStep = { op: 'custom', name: 'have' };
const IDLE: PackStep = { op: 'custom', name: 'nothing' };

describe('card-language offer policy (K583) point 1: paid = effect judges a paid effect by what the effect changes', () => {
  const fx = game({ paid: 'effect' });
  const def = game();
  it('K583 case 20: a payable cost whose effect does nothing is a no under paid = effect, a yes under the default', () => {
    expect([def.check([paid([pay(1)], [NOTHING])]), fx.check([paid([pay(1)], [NOTHING])])]).toEqual(['yes', 'no']);
    expect(fx.check([paid([pay(1)], [GAIN])])).toBe('yes');
  });
  it('K583 a payable cost that shows no change counts as able: the effect is judged (a yes under paid = effect, a no under the default)', () => {
    for (const cost of [[HAVE], [IDLE]]) expect([def.check([paid(cost, [GAIN])]), fx.check([paid(cost, [GAIN])])]).toEqual(['no', 'yes']);
    expect(fx.check([paid([HAVE], [NOTHING])])).toBe('no');
  });
  it('K583 a cost that cannot be paid is a no under both; the bar reason says cannotPay, and noChange when only the effect is idle', () => {
    expect([def.check([paid([pay(9)], [GAIN])]), fx.check([paid([pay(9)], [GAIN])])]).toEqual(['no', 'no']);
    const g = game({ paid: 'effect', deadChoice: 'bar' });
    expect(bars(g.play([{ op: 'chooseOption', options: [[paid([pay(1)], [NOTHING])], [paid([pay(9)], [GAIN])], [GAIN]] }], [['2']]).prompts[0])).toEqual([['0', 'noChange'], ['1', 'cannotPay']]);
  });
  it('K583 only what the effect changes counts: a change beside the paid effect is still a yes; a cost with a pick is paid in every way', () => {
    expect(fx.check([GAIN, paid([pay(1)], [NOTHING])])).toBe('yes');
    expect(fx.check([paid([pay(1)], [NOTHING]), GAIN])).toBe('yes');
    expect(fx.check([paid([pay(1)], [NOTHING]), paid([HAVE], [NOTHING])])).toBe('no');
    expect(fx.check([paid([{ op: 'discard', count: 1 }], [NOTHING])])).toBe('no');
    expect(fx.check([paid([{ op: 'discard', count: 1 }], [{ op: 'if', test: 'poor', then: [GAIN] }])])).toBe('no');
    expect(fx.check([paid([{ op: 'discard', count: 1 }, pay(1)], [{ op: 'if', test: 'poor', then: [GAIN] }])])).toBe('yes');
    expect(fx.check([paid([paid([pay(1)], [pay(1)])], [NOTHING])])).toBe('no');
  });
  it('K583 an optional paid effect that would do nothing is not offered under noChange = skip, and nothing is paid', () => {
    const eff: Eff = [{ op: 'may', then: [paid([pay(1)], [DRAW])] }];
    const empty = game({ paid: 'effect', noChange: 'skip' }, { deck: [] }).play(eff);
    expect([empty.prompts, gold(empty.s)]).toEqual([[], 3]);
    const full = game({ paid: 'effect', noChange: 'skip' }).play(eff, [['yes']]);
    expect([kinds(full.prompts), gold(full.s), z(full.s, 'hand:a').length]).toEqual([['may'], 2, 3]);
    expect(kinds(game({ noChange: 'skip' }, { deck: [] }).play(eff, [['no']]).prompts)).toEqual(['may']);
  });
  it('K583 under cost = whole a cost that stops when a part is reached gives no effect, so it is a no', () => {
    const g = game({ paid: 'effect', cost: 'whole' });
    expect(g.check([paid([pay(2), HAVE], [GAIN])])).toBe('no');
    expect(g.check([paid([pay(1), HAVE], [GAIN])])).toBe('yes');
    expect(g.check([paid([pay(2), HAVE], [GAIN]), paid([pay(1)], [NOTHING])])).toBe('no');
  });
  it('K583 choosePayment under paid = effect: a payable way whose effect does nothing is dead for deadChoice', () => {
    const ways = (then: Eff): Eff => [{ op: 'choosePayment', ways: [[pay(1)], [pay(9)]], then }, GAIN];
    const bar = game({ paid: 'effect', deadChoice: 'bar' });
    expect([bar.play(ways([NOTHING])).prompts, gold(bar.play(ways([NOTHING])).s)]).toEqual([[], 4]);
    expect(bars(bar.play(ways([DRAW]), [['0']]).prompts[0])).toEqual([['1', 'cannotPay']]);
    expect(game({ paid: 'effect', deadChoice: 'skip' }).play(ways([NOTHING])).prompts).toEqual([]);
    expect(kinds(game({ paid: 'effect' }).play(ways([NOTHING]), [['0']]).prompts)).toEqual(['choosePayment']);
    expect(kinds(game({ deadChoice: 'bar' }).play(ways([NOTHING]), [['0']]).prompts)).toEqual(['choosePayment']);
  });
});

describe('card-language offer policy (K583) point 2: an effect that ends the game is a change', () => {
  const WIN: PackStep = { op: 'custom', name: 'win' };
  const example = game({ view: ({ zones, res, marks }) => ({ zones, res, marks }) });
  it('K583 ending the game is a yes under the default view and under a view without result (the README example view)', () => {
    expect([game().check([WIN]), example.check([WIN]), example.check([NOTHING])]).toEqual(['yes', 'yes', 'no']);
  });
  it('K583 ending the game under a pick set of the second pass is a yes; an optional win is asked under noChange = skip', () => {
    expect(example.check([{ op: 'chooseCards', zone: 'hand', min: 2, max: 2, then: [{ op: 'if', test: 'ends', then: [WIN] }] }], A, [DRAW])).toBe('yes');
    const g = game({ noChange: 'skip', view: ({ zones, res, marks }) => ({ zones, res, marks }) });
    const { s, prompts } = g.play([{ op: 'may', then: [WIN] }], [['yes']]);
    expect([kinds(prompts), s.result]).toEqual([['may'], { winner: 'a' }]);
  });
});

describe('card-language offer policy (K583) point 3: errors inside the check', () => {
  const TYPO: Eff = [{ op: 'if', test: 'typo', then: [GAIN] }];
  const BACK: PackStep = { op: 'custom', name: 'back' };
  const PAIRS: PackStep = { op: 'custom', name: 'pairs' };
  const BOOM: PackStep = { op: 'custom', name: 'boom' };
  it('K583 a kernel error in the check stays unknown by default, with the reason error and the error kept', () => {
    const g = game();
    const { s, content } = g.at();
    const r = g.pack.judge(s, content, TYPO, A);
    expect([g.check(TYPO), r.answer, r.reason, r.error instanceof EngineBugError, String(r.error)]).toEqual(['unknown', 'unknown', 'error', true, expect.stringMatching(/no test typo/)]);
    expect(g.pack.judge(s, content, [GAIN], A)).toEqual({ answer: 'yes' });
    expect(g.pack.judge(s, content, [NOTHING], A)).toEqual({ answer: 'no' });
  });
  it('K583 strict: a typo in card data throws from the check, so a not-offered test cannot pass for the wrong reason', () => {
    expect(() => game({ strict: true }).check(TYPO)).toThrow(/no test typo/);
    expect(() => game({ strict: true, noChange: 'skip', unknown: 'skip' }).play([{ op: 'may', then: TYPO }])).toThrow(/no test typo/);
    expect(game({ noChange: 'skip', unknown: 'skip' }).play([{ op: 'may', then: TYPO }]).prompts).toEqual([]);
    expect(() => game({ strict: true }).check([BOOM])).toThrow(/boom/);
    expect(inDryRun()).toBe(false);
  });
  it('K583 an option answered alone whose handler throws does not crash the real action: unknown, the error kept', () => {
    const g = game({ noChange: 'skip' });
    const { s, content } = g.at();
    const r = g.pack.judge(s, content, [BACK], A);
    expect([r.answer, r.reason, r.error instanceof TypeError]).toEqual(['unknown', 'error', true]);
    expect(kinds(g.play([{ op: 'may', then: [BACK] }], [['no']]).prompts)).toEqual(['may']);
  });
  it('K583 a pick set the screen would never send whose handler throws does not crash the real action', () => {
    const g = game({ noChange: 'skip' });
    expect(g.check([PAIRS])).toBe('unknown');
    expect(kinds(g.play([{ op: 'may', then: [PAIRS] }], [['no']]).prompts)).toEqual(['may']);
    expect(g.play([{ op: 'may', then: [PAIRS] }], [['yes'], ['x1', 'y1']]).s.prompt).toBeNull();
  });
  it('K583 a throw after a change is a yes; alone it is unknown; the real run still throws', () => {
    const g = game();
    expect([g.check([GAIN, BOOM]), g.check([BOOM])]).toEqual(['yes', 'unknown']);
    expect(() => g.play([BOOM])).toThrow(/boom/);
  });
});

describe('card-language offer policy (K583) point 4: hidden information', () => {
  const TOP: Eff = [{ op: 'if', test: 'top', then: [GAIN] }];
  const judge = (g: ReturnType<typeof game>, steps: Eff, env: PackEnv = A, before: Eff = []) => {
    const { s, content } = g.at(before);
    return g.pack.judge(s, content, steps, env);
  };
  it('K583 cannotKnow: a game test or custom verb that would read hidden cards says so, and the check answers unknown with the reason hidden', () => {
    const g = game();
    expect(judge(g, TOP)).toEqual({ answer: 'unknown', reason: 'hidden' });
    expect(judge(g, [{ op: 'custom', name: 'peek' }])).toEqual({ answer: 'unknown', reason: 'hidden' });
    expect([gold(g.play(TOP).s), gold(g.play([{ op: 'custom', name: 'peek' }]).s)]).toEqual([4, 9]);
    expect(cannotKnow()).toBeUndefined();
  });
  it('K583 a blind pick is not shown to the game: a test on a card picked from a hidden hand is unknown, whatever the hand holds', () => {
    const blind: Eff = [{ op: 'chooseCards', zone: 'hand:b', max: 1, then: [{ op: 'forEach', then: [{ op: 'if', test: 'b3', then: [GAIN] }] }] }];
    for (const b of [['b1', 'b2', 'b3'], ['b1', 'b2', 'b4']]) expect(judge(game(undefined, { b }), blind)).toEqual({ answer: 'unknown', reason: 'hidden' });
    expect(judge(game(), [{ op: 'chooseCards', zone: 'hand:b', max: 1, then: [{ op: 'count', what: 'held', then: [GAIN] }] }]).answer).toBe('unknown');
    expect(judge(game(), [{ op: 'chooseCards', zone: 'hand:b', max: 1, then: [IDLE] }]).answer).toBe('unknown');
  });
  it('K583 choose 2 of 3 of a hidden hand, then a test on them: unknown for every hand; moving the blind picks is still a yes', () => {
    const pairOf: Eff = [{ op: 'chooseCards', zone: 'hand:b', min: 2, max: 2, then: [{ op: 'if', test: 'b3', then: [GAIN] }] }];
    expect([game(undefined, { b: ['b1', 'b2', 'b3'] }).check(pairOf), game(undefined, { b: ['b1', 'b2', 'b4'] }).check(pairOf)]).toEqual(['unknown', 'unknown']);
    expect(game().check([{ op: 'chooseCards', zone: 'hand:b', max: 1, then: [{ op: 'move', cards: 'chosen', to: 'discard' }] }])).toBe('yes');
    expect(gold(game().play(pairOf, [['#1', '#2']]).s)).toBe(4);
  });
  it('K583 a hidden trigger of another seat does not change the answer; one the seat can see is unknown with the reason otherSeat', () => {
    const pool = { react: { when: [{ on: 'draw', optional: true, then: [GAIN] }] } };
    const eff: Eff = [{ op: 'may', then: [DRAW] }];
    const held = game({ noChange: 'skip' }, { deck: [], b: ['b1', 'react'], pool });
    const none = game({ noChange: 'skip' }, { deck: [], b: ['b1', 'b2'], pool });
    expect([held.check([DRAW]), none.check([DRAW])]).toEqual(['no', 'no']);
    expect([held.play(eff).prompts, none.play(eff).prompts]).toEqual([[], []]);
    const open = game({ noChange: 'skip' }, { deck: [], pool: { p1: { when: [{ on: 'draw', optional: true, then: [GAIN] }] } } });
    expect(judge(open, [DRAW])).toEqual({ answer: 'unknown', reason: 'otherSeat' });
    expect(held.play([DRAW], [['yes']]).prompts.map((p) => [p.kind, p.seat])).toEqual([['may', 'b']]);
  });
  it('K583 the reason tells a spent budget from what cannot be known: budget, random, otherSeat, hidden', () => {
    const g = game();
    const many: Eff = [{ op: 'chooseNumber', max: 40, then: [NOTHING] }];
    expect(judge(g, many)).toEqual({ answer: 'unknown', reason: 'budget' });
    expect(judge(g, [{ op: 'custom', name: 'loop' }])).toEqual({ answer: 'unknown', reason: 'budget' });
    expect(judge(g, [{ op: 'shuffle', zone: 'deck' }])).toEqual({ answer: 'unknown', reason: 'random' });
    expect(judge(g, [{ op: 'choosePlayer', others: true, then: [{ op: 'may', then: [GAIN] }] }])).toEqual({ answer: 'unknown', reason: 'otherSeat' });
    expect(judge(g, [{ op: 'search', zone: 'deck', filter: 'even' }])).toEqual({ answer: 'unknown', reason: 'hidden' });
    expect(judge(g, [{ op: 'chooseOption', options: [[{ op: 'custom', name: 'roll' }], many] }])).toEqual({ answer: 'unknown', reason: 'random' });
    expect(judge(g, [{ op: 'custom', name: 'nest' }])).toEqual({ answer: 'no' });
  });
});

describe('card-language offer policy (K583) point 5: small points', () => {
  it('K583 payThen keeps a game env field named owed for its effect under cost = parts (as before K529); under cost = whole the field is the pack\'s', () => {
    const eff: Eff = [paid([pay(1)], [{ op: 'if', test: 'owes', then: [GAIN] }])];
    const env = { ...A, owed: [] };
    expect([gold(game().play(eff, [], env).s), gold(game().play(eff).s), gold(game({ cost: 'whole' }).play(eff, [], env).s)]).toEqual([3, 2, 2]);
  });
  it('K583 lookAt of a card the seat already sees, or reveal of a card all see, is no change in the check; the real run is as before', () => {
    const g = game();
    expect(g.check([{ op: 'lookAt', cards: 'all', from: 'hand' }])).toBe('no');
    expect(g.check([{ op: 'reveal', cards: 'all', from: 'play' }])).toBe('no');
    expect(g.check([{ op: 'lookAt', count: 1 }])).toBe('yes');
    expect(g.check([{ op: 'reveal', cards: 'all', from: 'hand' }])).toBe('yes');
    expect(g.check([{ op: 'lookAt', cards: 'all', from: 'hand', then: [GAIN] }])).toBe('yes');
    expect(g.play([{ op: 'lookAt', cards: 'all', from: 'hand' }]).s.zones['hand:a']?.shown).toEqual({ h1: ['a'], h2: ['a'] });
  });
  it('K583 the bar reason reads nested steps: an unpayable cost inside a seq or a may is cannotPay', () => {
    const deep: Eff = [{ op: 'seq', steps: [{ op: 'may', then: [paid([pay(9)], [GAIN])] }] }];
    expect(bars(game({ noChange: 'bar' }).play([{ op: 'may', then: deep }], [['no']]).prompts[0])).toEqual([['yes', 'cannotPay']]);
    expect(bars(game({ deadChoice: 'bar' }).play([{ op: 'chooseOption', options: [deep, [{ op: 'seq', steps: [NOTHING] }], [GAIN]] }], [['2']]).prompts[0])).toEqual([['0', 'cannotPay'], ['1', 'noChange']]);
  });
});

describe('card-language cost hook (K583) point 6: cfg.due, the amount a cost step asks for now', () => {
  // README recipe "A modified cost": a tax of 1 on every gold cost.
  const tax = (offer?: GameOpts['offer']) => game(offer, { cfg: { due: (_s, step, _env, printed) => (step.op === 'pay' && step.res === 'gold' ? printed + 1 : printed) } });
  const ways: Eff = [{ op: 'choosePayment', ways: [[pay(3)], [IDLE]], then: [DRAW] }];
  it('K583 printed 3, a +1 tax, 3 held: the way is barred with cannotPay and the label shows 4', () => {
    const g = tax();
    expect(g.play(ways, [['1']]).prompts[0]?.options[0]).toEqual({ id: '0', enabled: false, why: 'cannotPay' });
    expect(bars(tax({ deadChoice: 'bar' }).play(ways, [['1']]).prompts[0])).toEqual([['0', 'cannotPay']]);
    const { s } = g.at();
    expect(describeEffect(g.pack.verbs, g.pack.costed(s, [pay(3)], A))).toBe('Pay 4 gold.');
    expect(describeEffect(g.pack.verbs, g.pack.costed(s, ways, A))).toBe('Pay Pay 4 gold. or Nothing. Draw 1 card.');
    expect(describeEffect(g.pack.verbs, ways)).toBe('Pay Pay 3 gold. or Nothing. Draw 1 card.');
  });
  it('K583 with 4 held exactly 4 leaves; a bare pay step with 3 held refuses', () => {
    const g = tax();
    const rich = g.play([GAIN, ...ways], [['0']]);
    expect([rich.prompts[0]?.options[0], gold(rich.s), z(rich.s, 'hand:a').length]).toEqual([{ id: '0', enabled: true }, 0, 3]);
    expect(gold(g.play([pay(3)]).s)).toBe(3);
    expect(gold(g.play([GAIN, paid([pay(3)], [DRAW])]).s)).toBe(0);
  });
  it('K583 case 29: the check, the whole-cost sum and convert judge the modified cost, not the printed one', () => {
    expect([tax().check([paid([pay(3)], [GAIN])]), game().check([paid([pay(3)], [GAIN])])]).toEqual(['no', 'yes']);
    expect(bars(tax({ noChange: 'bar' }).play([{ op: 'may', then: [paid([pay(3)], [GAIN])] }], [['no']]).prompts[0])).toEqual([['yes', 'cannotPay']]);
    const two = [paid([pay(1), pay(1)], [DRAW])];
    expect([gold(tax({ cost: 'whole' }).play(two).s), gold(game({ cost: 'whole' }).play(two).s), gold(tax().play(two).s)]).toEqual([3, 1, 1]);
    const cheap = game(undefined, { cfg: { due: (_s, _st, _e, printed) => printed - 1 } });
    expect([gold(cheap.play([pay(4)]).s), gold(game().play([pay(4)]).s)]).toEqual([0, 3]);
    const conv = cheap.play([{ op: 'convert', res: 'gold', amount: 4, into: 'vp', get: 1 }]).s;
    expect([gold(conv), gold(conv, 'a', 'vp')]).toEqual([0, 1]);
  });
  it('K583 with no due nothing changes: costed returns the same steps, and so does a due that returns the printed amount', () => {
    const g = game();
    const same = game(undefined, { cfg: { due: (_s, _st, _e, printed) => printed } });
    expect(g.pack.costed(g.at().s, ways, A)).toBe(ways);
    expect(same.pack.costed(same.at().s, ways, A)).toBe(ways);
    expect(gold(same.play([GAIN, ...ways], [['0']]).s)).toBe(1);
    const x: Eff = [{ op: 'pay', res: 'gold', amount: 'X' }];
    expect(tax().pack.costed(g.at().s, x, { ...A, n: 2 })).toEqual([pay(3)]);
  });
});

// K583: prior-art cases that still had no test (list: the K529 prior-art note; older engine: STCC src/engine/text/resolve.ts@27fb8882).
describe('card-language offer policy (K583) point 7: prior-art cases without a test', () => {
  it('K583 case 25: "attempt A, otherwise B" is a game verb on the check: A when it can change something, else B', () => {
    const g = game();
    expect(z(g.play([{ op: 'custom', name: 'attempt' }]).s, 'hand:a').length).toBe(3);
    expect(gold(g.play([{ op: 'custom', name: 'attempt' }], [], { seat: 'b' }).s, 'b')).toBe(1);
  });
  it('K583 case 26: whether a play that changes nothing is legal is the game\'s rule: it reads no from the check, with or without a payable cost', () => {
    expect(game().check([NOTHING])).toBe('no');
    expect([game().check([paid([pay(1)], [NOTHING])]), game({ paid: 'effect' }).check([paid([pay(1)], [NOTHING])])]).toEqual(['yes', 'no']);
  });
  it('K583 case 31: where the card being played is during the check is the state the game passes', () => {
    const g = game();
    const cost: Eff = [paid([{ op: 'discard', count: 2 }], [GAIN])];
    const out = g.play([{ op: 'chooseCards', zone: 'hand', max: 1, then: [{ op: 'setAside', cards: 'chosen' }] }], [['h1']]).s;
    expect([g.check(cost), g.pack.wouldChange(out, { effect: [] }, cost, A)]).toEqual(['yes', 'no']);
  });
  it('K583 rules question a (stated choice): under cost = parts a refused pay step still gives the effect', () => {
    const s = game().play([paid([pay(2), pay(2)], [DRAW])]).s;
    expect([gold(s), z(s, 'hand:a').length]).toEqual([1, 3]);
  });
  it('K583 rules question b (stated choice): a paid option whose effect does nothing is offered under the default, not under paid = effect', () => {
    const eff: Eff = [{ op: 'may', then: [paid([pay(1)], [NOTHING])] }];
    expect(kinds(game({ noChange: 'skip' }).play(eff, [['no']]).prompts)).toEqual(['may']);
    expect(game({ noChange: 'skip', paid: 'effect' }).play(eff).prompts).toEqual([]);
  });
});
