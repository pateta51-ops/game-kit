import { describe, expect, it } from 'vitest';
import { applyAction, blocked, createGame, draftOf, enumerateAnswers, hashState, type Ctx } from '../engine-core/index.ts';
import { cannotKnow, cardPack, inDryRun, type OfferPolicy, type PackEnv, type PackStep } from './pack.ts';
import { DRAW, GAIN, gen, LUCKY, NOTHING, offerGame, pay, type Eff, type G, type S } from './offerGame.ts';
import { askVerb } from './index.ts';
import { pinned } from './k597.pin.ts';
import { cardsIn } from '../card-zones/index.ts';

// K597: how much of an effect would resolve (in full, in part, not at all, unknown), each skipped step with its reason.
// K605: the reasons of a `no` from `judge` (opt-in), and a game hook that decides the answer.
const A: PackEnv = { seat: 'a', source: 'p1' };
const game = (offer: OfferPolicy<S> = {}, deck?: readonly string[]) => offerGame(cardPack<G>, { offer, ...(deck ? { deck } : {}) });
const resolves = (steps: Eff, g = game()) => {
  const { s, content } = g.at();
  const h = hashState(s);
  const r = g.pack.resolves(s, content, steps, A);
  expect(hashState(s)).toBe(h);
  return r;
};
const RICH: PackStep = { op: 'if', test: 'rich', then: [GAIN] };
const FULL_ADJUST: PackStep = { op: 'adjust', key: 'gold', by: 1, max: 3 };

describe('card-language resolves (K597): prior-art cases restated on the made-up game', () => {
  it('K597 an effect every step of which resolves is full, with nothing skipped', () => {
    expect(resolves([GAIN, DRAW])).toEqual({ answer: 'full', skipped: [] });
  });
  it('K597 a draw whose second step gains from an empty zone is part, the skipped step reported with emptyZone', () => {
    expect(resolves([DRAW, { op: 'gain', from: 'aside' }])).toEqual({ answer: 'part', skipped: [{ step: 1, reason: 'emptyZone' }] });
  });
  it('K597 a find with a match in hand is full; with no match anywhere and nothing hidden it is none (noTarget), and stays legal for the game to decide', () => {
    expect(resolves([{ op: 'discard', cards: 'pick', filter: 'even' }]).answer).toBe('full');
    expect(resolves([{ op: 'discard', cards: 'pick', from: 'play', filter: 'even' }])).toEqual({ answer: 'none', skipped: [{ step: 0, reason: 'noTarget' }] });
  });
  it('K597 a find that may reach a hidden pile is unknown (hidden), whatever the pile holds', () => {
    for (const deck of [['d1', 'd2'], ['d1', 'd3']]) expect(resolves([GAIN, { op: 'search', zone: 'deck', filter: 'even' }], game({}, deck))).toEqual({ answer: 'unknown', reason: 'hidden', skipped: [{ step: 1, reason: 'hidden' }] });
  });
  it('K597 a mill, then "you may discard a card" from an empty zone: part, the optional step skipped with the reason of its body', () => {
    expect(resolves([{ op: 'mill', count: 1 }, { op: 'may', then: [{ op: 'discard', cards: 'pick', from: 'aside' }] }])).toEqual({ answer: 'part', skipped: [{ step: 1, reason: 'emptyZone' }] });
  });
  it('K597 two plays of one card: a gain is full, a gain under a false condition is none (condition)', () => {
    expect(resolves([GAIN]).answer).toBe('full');
    expect(resolves([RICH])).toEqual({ answer: 'none', skipped: [{ step: 0, reason: 'condition' }] });
  });
  it('K597 a cost that cannot be paid: none (cannotPay); paid, its effect runs and the step resolves', () => {
    expect(resolves([{ op: 'payThen', cost: [pay(9)], then: [GAIN] }])).toEqual({ answer: 'none', skipped: [{ step: 0, reason: 'cannotPay' }] });
    expect(resolves([{ op: 'payThen', cost: [pay(1)], then: [DRAW] }]).answer).toBe('full');
  });
  it('K597 every answer is tried, not the first one enabled: choosing h2 makes the gain happen', () => {
    expect(resolves([{ op: 'chooseCards', zone: 'hand', min: 1, max: 1, then: [{ op: 'if', test: 'h2', then: [GAIN] }] }]).answer).toBe('full');
    expect(resolves([{ op: 'chooseOption', options: [[NOTHING], [GAIN]] }]).answer).toBe('full');
  });
  it('K597 one line resolves the first step, another the second, none both: part, the step skipped on the best line reported', () => {
    expect(resolves([{ op: 'may', then: [NOTHING] }, GAIN])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'emptyZone' }] });
    expect(resolves([{ op: 'chooseOption', options: [[pay(1)], [{ op: 'gainResource', res: 'gold', amount: 1 }]] }, { op: 'if', test: 'poor', then: [GAIN] }]).answer).toBe('full');
  });
  it('K597 a draw from an empty deck: emptyZone; a gain that changes nothing: noChange', () => {
    expect(resolves([DRAW], game({}, []))).toEqual({ answer: 'none', skipped: [{ step: 0, reason: 'emptyZone' }] });
    expect(resolves([FULL_ADJUST])).toEqual({ answer: 'none', skipped: [{ step: 0, reason: 'noChange' }] });
  });
  it('K597 a handler that throws: unknown with the reason error and what it threw; a step resolved before it is known', () => {
    const r = resolves([GAIN, { op: 'custom', name: 'boom' }]);
    expect([r.answer, r.reason, String(r.error), r.skipped.map((k) => [k.step, k.reason])]).toEqual(['unknown', 'error', 'TypeError: boom', [[1, 'error']]]);
  });
  it('K597 an effect that ends the game resolves its step; a random draw and another seat\'s choice are unknown', () => {
    expect(resolves([{ op: 'custom', name: 'win' }]).answer).toBe('full');
    expect(resolves([{ op: 'custom', name: 'roll' }])).toMatchObject({ answer: 'unknown', reason: 'random' });
    expect(resolves([{ op: 'choosePlayer', others: true, then: [{ op: 'may', then: [GAIN] }] }])).toMatchObject({ answer: 'unknown', reason: 'otherSeat' });
  });
  it('K597 unknown only when the known part does not fix the answer: a hidden last step after a false condition is part', () => {
    expect(resolves([GAIN, RICH, { op: 'search', zone: 'deck', filter: 'even' }])).toEqual({ answer: 'part', skipped: [{ step: 1, reason: 'condition' }, { step: 2, reason: 'hidden' }] });
    expect(resolves([NOTHING, { op: 'search', zone: 'deck', filter: 'even' }])).toMatchObject({ answer: 'unknown', reason: 'hidden' });
  });
  it('K597 a paid effect is two parts: the cost paid and the effect under a false condition is part (condition), as judge under paid = effect says no', () => {
    const step: PackStep = { op: 'payThen', cost: [pay(1)], then: [RICH] };
    expect(resolves([step])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'condition' }] });
    const g = game({ paid: 'effect' });
    const { s, content } = g.at();
    expect(g.pack.judge(s, content, [step], A, { why: true })).toEqual({ answer: 'no', reason: 'condition' });
    expect(resolves([{ op: 'payThen', cost: [pay(1)], then: [{ op: 'if', test: 'poor', then: [DRAW] }] }])).toEqual({ answer: 'full', skipped: [] });
  });
  it('K597 the branch cap: an answer found before it is returned; a cap hit is unknown, a step no tried line resolved carrying budget', () => {
    const many = (k: number): PackStep => ({ op: 'chooseOption', options: Array.from({ length: 4 }, (_, i) => (i === k ? [GAIN] : [NOTHING])) });
    expect(resolves([many(0)], game({ branches: 2 }))).toEqual({ answer: 'full', skipped: [] });
    expect(resolves([many(3), DRAW], game({ branches: 2 }))).toEqual({ answer: 'unknown', reason: 'budget', skipped: [{ step: 0, reason: 'budget' }] });
    expect(resolves([many(3), DRAW]).answer).toBe('full');
  });
  it('K597 the check of nested calls and the dry-run flag are left as they were', () => {
    resolves([GAIN, { op: 'custom', name: 'nest' }]);
    expect(inDryRun()).toBe(false);
  });
});

describe('card-language judge reasons (K605)', () => {
  const judge = (steps: Eff, offer: OfferPolicy<S> = {}, deck?: readonly string[]) => {
    const g = game(offer, deck);
    const { s, content } = g.at();
    return g.pack.judge(s, content, steps, A, { why: true });
  };
  it('K605 each reason of a no: condition, cannotPay, noTarget, emptyZone, noChange', () => {
    expect(judge([RICH])).toEqual({ answer: 'no', reason: 'condition' });
    expect(judge([{ op: 'payThen', cost: [pay(9)], then: [GAIN] }])).toEqual({ answer: 'no', reason: 'cannotPay' });
    expect(judge([pay(9)])).toEqual({ answer: 'no', reason: 'cannotPay' });
    expect(judge([{ op: 'discard', cards: 'pick', from: 'play', filter: 'even' }])).toEqual({ answer: 'no', reason: 'noTarget' });
    expect(judge([{ op: 'chooseCards', zone: 'aside', max: 1, then: [{ op: 'discard', cards: 'chosen' }] }])).toEqual({ answer: 'no', reason: 'emptyZone' });
    expect(judge([DRAW], {}, [])).toEqual({ answer: 'no', reason: 'emptyZone' });
    expect(judge([FULL_ADJUST])).toEqual({ answer: 'no', reason: 'noChange' });
  });
  it('K605 the reasons of an unknown are as before: hidden, error; a yes carries none', () => {
    expect(judge([{ op: 'search', zone: 'deck', filter: 'even' }])).toEqual({ answer: 'unknown', reason: 'hidden' });
    expect(judge([{ op: 'custom', name: 'boom' }])).toMatchObject({ answer: 'unknown', reason: 'error' });
    expect(judge([GAIN])).toEqual({ answer: 'yes' });
  });
  it('K605 without `why` a no carries no reason (as before)', () => {
    const g = game();
    const { s, content } = g.at();
    expect(g.pack.judge(s, content, [RICH], A)).toEqual({ answer: 'no' });
  });
  it('K605 a game hook decides the answer: wouldChange and the offer of a may read it', () => {
    const offer: OfferPolicy<S> = { noChange: 'skip', decide: (_s, _steps, _env, c) => (c.answer === 'no' && c.reason === 'condition' ? { answer: 'yes' } : c) };
    const g = game(offer);
    expect(g.check([RICH])).toBe('yes');
    expect(g.check([FULL_ADJUST])).toBe('no');
    expect(g.play([{ op: 'may', then: [RICH] }], [], undefined, true).s.prompt?.kind).toBe('may');
    expect(g.play([{ op: 'may', then: [FULL_ADJUST] }]).s.prompt).toBeNull();
  });
});

describe('card-language decide hook (K605): game code in the check', () => {
  it('K605 a decide that throws is unknown with the reason error, never a crash of the real play (a may under noChange skip is still asked)', () => {
    const boom = new TypeError('decide');
    const g = game({ noChange: 'skip', decide: () => {
      throw boom;
    } });
    const { s, content } = g.at();
    expect(g.pack.judge(s, content, [RICH], A)).toEqual({ answer: 'unknown', reason: 'error', error: boom });
    expect(g.play([{ op: 'may', then: [RICH] }], [], undefined, true).s.prompt?.kind).toBe('may');
    expect(() => game({ strict: true, decide: () => {
      throw boom;
    } }).check([RICH])).toThrow('decide');
  });
  it('K605 decide runs as the check of the seat: one that reads hidden cards is unknown (hidden); after the check met a hidden card it is not asked', () => {
    let asked = 0;
    const g = game({ decide: (_s, _st, _e, c) => (asked += 1, c.answer === 'no' ? (cannotKnow(), c) : c) });
    const { s, content } = g.at();
    expect(g.pack.judge(s, content, [RICH], A)).toEqual({ answer: 'unknown', reason: 'hidden' });
    expect(asked).toBe(1);
    expect(g.pack.judge(s, content, [{ op: 'search', zone: 'deck', filter: 'even' }], A)).toEqual({ answer: 'unknown', reason: 'hidden' });
    expect(asked).toBe(1);
    expect(inDryRun()).toBe(false);
  });
});

describe('card-language resolves (K597): second review', () => {
  const MILL: PackStep = { op: 'mill', count: 1 };
  const DECKS = [['d1', 'd2'], ['d2', 'd1']];
  const paid = (then: Eff): PackStep => ({ op: 'payThen', cost: [pay(1)], then });
  it('K597 a card the seat has not seen is never read: a test after a draw or a mill is unknown (hidden) whatever the deck order', () => {
    const cases: Eff[] = [[DRAW, { op: 'if', test: 'drew2', then: [GAIN] }], [MILL, { op: 'if', test: 'evenUp', then: [GAIN] }], [DRAW, { op: 'chooseCards', zone: 'hand', min: 2, max: 2, then: [{ op: 'if', test: 'ends', then: [GAIN] }] }]];
    for (const e of cases) expect(DECKS.map((d) => resolves(e, game({}, d)))).toEqual(DECKS.map(() => ({ answer: 'unknown', reason: 'hidden', skipped: [{ step: 1, reason: 'hidden' }] })));
  });
  it('K597 a step that does some but less than its number resolves in part (short): discard 3 from a hand of 2, draw 3 from a deck of 2, +2 up to 4 from 3, choose 3 of 2', () => {
    for (const st of [{ op: 'discard', count: 3 }, { op: 'draw', count: 3 }, { op: 'adjust', key: 'gold', by: 2, max: 4 }, { op: 'chooseCards', zone: 'hand', max: 3, then: [GAIN] }] as PackStep[]) expect(resolves([st])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'short' }] });
    expect(resolves([{ op: 'seq', steps: [GAIN, { op: 'discard', count: 3 }] }])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'short' }] });
    expect(resolves([{ op: 'discard', count: 2 }, { op: 'draw', count: 2 }, { op: 'adjust', key: 'gold', by: 1, max: 4 }])).toEqual({ answer: 'full', skipped: [] });
  });
  it('K597 a cost and its effect are two parts at any depth: a cost paid and its effect under a false condition is part (condition) inside a may, a seq, an option and a choice of payment', () => {
    for (const st of [{ op: 'may', then: [paid([RICH])] }, { op: 'seq', steps: [paid([RICH])] }, { op: 'chooseOption', options: [[paid([RICH])], [NOTHING]] }, { op: 'choosePayment', ways: [[pay(9)], [pay(1)]], then: [RICH] }] as PackStep[]) expect(resolves([st])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'condition' }] });
    for (const st of [{ op: 'may', then: [paid([DRAW])] }, { op: 'choosePayment', ways: [[pay(9)], [pay(1)]], then: [DRAW] }] as PackStep[]) expect(resolves([st])).toEqual({ answer: 'full', skipped: [] });
    const g = game({ paid: 'effect' });
    const { s, content } = g.at();
    expect(g.pack.judge(s, content, [{ op: 'may', then: [paid([RICH])] }], A, { why: true })).toEqual({ answer: 'no', reason: 'condition' });
  });
  it('K597 a line stopped inside a paid effect keeps its cost part (a hidden read, another seat\'s choice); what an open step changed so far is not kept, the rest of it may undo it', () => {
    expect(resolves([RICH, paid([{ op: 'search', zone: 'deck', filter: 'even' }])])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'condition' }, { step: 1, reason: 'hidden' }] });
    expect(resolves([RICH, paid([{ op: 'choosePlayer', others: true, then: [{ op: 'may', then: [GAIN] }] }])])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'condition' }, { step: 1, reason: 'otherSeat' }] });
    expect(resolves([RICH, { op: 'seq', steps: [pay(1), { op: 'custom', name: 'roll' }] }])).toMatchObject({ answer: 'unknown', reason: 'random' });
  });
  it('K597 a nested cost that changes nothing (noChange), or stops part paid (cannotPay), leaves its step part; a refill short of its size is short', () => {
    expect(resolves([{ op: 'may', then: [{ op: 'payThen', cost: [{ op: 'custom', name: 'have' }], then: [DRAW] }] }])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'noChange' }] });
    expect(resolves([{ op: 'may', then: [{ op: 'payThen', cost: [pay(2), { op: 'custom', name: 'have' }], then: [DRAW] }] }], game({ cost: 'whole' }))).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'cannotPay' }] });
    expect(resolves([{ op: 'refill', zone: 'hand', from: 'deck', size: 5 }])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'short' }] });
    expect(resolves([{ op: 'refill', zone: 'hand', from: 'deck', size: 4 }])).toEqual({ answer: 'full', skipped: [] });
  });
  it('K597 the reason of a paid effect is read when its cost ends: emptyZone, noTarget', () => {
    expect(resolves([paid([{ op: 'discard', cards: 'pick', from: 'aside' }])])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'emptyZone' }] });
    expect(resolves([paid([{ op: 'discard', cards: 'pick', from: 'play', filter: 'even' }])])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'noTarget' }] });
  });
});

describe('card-language resolves (K597, K605): third look', () => {
  const POOR: PackStep = { op: 'if', test: 'poor', then: [GAIN] };
  const DREW2: PackStep = { op: 'if', test: 'drew2', then: [GAIN] };
  const DECKS = [['d1', 'd2'], ['d2', 'd1']];
  const paid = (then: Eff): PackStep => ({ op: 'payThen', cost: [pay(1)], then });
  const RES = { res: { get: (s: S, seat: string, key: string) => s.res?.[seat]?.[key] ?? 0, set: (ctx: { s: S }, seat: string, key: string, n: number) => void ((ctx as unknown as { s: { res: unknown } }).s.res = { ...ctx.s.res, [seat]: { ...ctx.s.res?.[seat], [key]: n } }) } };
  const resGame = (deck: readonly string[]) => offerGame(cardPack<G>, { deck, cfg: RES });
  it('K597 a top-level payThen whose cost judged as a whole stops part paid: its effect part is cannotPay', () => {
    expect(resolves([{ op: 'payThen', cost: [pay(2), { op: 'custom', name: 'have' }], then: [DRAW] }], game({ cost: 'whole' }))).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'cannotPay' }] });
  });
  it('K597 fourth look: a step skipped because the game ended does not count against full; it keeps gameOver as its reason', () => {
    const WIN: PackStep = { op: 'custom', name: 'win' };
    expect(resolves([WIN])).toEqual({ answer: 'full', skipped: [] });
    expect(resolves([WIN, GAIN])).toEqual({ answer: 'full', skipped: [{ step: 1, reason: 'gameOver' }] });
    expect(resolves([GAIN, WIN, GAIN, { op: 'payThen', cost: [pay(1)], then: [DRAW] }])).toEqual({ answer: 'full', skipped: [{ step: 2, reason: 'gameOver' }, { step: 3, reason: 'gameOver' }] });
    expect(resolves([RICH, WIN, GAIN])).toEqual({ answer: 'part', skipped: [{ step: 0, reason: 'condition' }, { step: 2, reason: 'gameOver' }] });
  });
  it('K605 judge why on a choice of options gives the reason of its options', () => {
    const g = game();
    const { s, content } = g.at();
    expect(g.pack.judge(s, content, [{ op: 'chooseOption', options: [[RICH], [pay(9)]] }], A, { why: true })).toEqual({ answer: 'no', reason: 'condition' });
  });
  it('K597 an unknown answer is reported from the line left open, not from a declined may (no condition)', () => {
    for (const d of DECKS) expect(resolves([{ op: 'may', then: [paid([DRAW, DREW2])] }], game({}, d))).toEqual({ answer: 'unknown', reason: 'hidden', skipped: [{ step: 0, reason: 'hidden' }] });
  });
  it('K597 game code that reads no card that came into view runs after a draw: a gold test, a gain through cfg.res; a test that reads the drawn card stays unknown', () => {
    for (const d of DECKS) {
      expect(resolves([DRAW, POOR], game({}, d))).toEqual({ answer: 'part', skipped: [{ step: 1, reason: 'condition' }] });
      expect(resolves([DRAW, GAIN], resGame(d))).toEqual({ answer: 'full', skipped: [] });
      expect(resolves([DRAW, pay(9)], resGame(d))).toEqual({ answer: 'part', skipped: [{ step: 1, reason: 'cannotPay' }] });
      expect(resolves([DRAW, DREW2], game({}, d))).toEqual({ answer: 'unknown', reason: 'hidden', skipped: [{ step: 1, reason: 'hidden' }] });
      expect(resolves([DRAW, DREW2], resGame(d))).toMatchObject({ answer: 'unknown', reason: 'hidden' });
      expect(resolves([DRAW, { op: 'choosePlayer', then: [GAIN] }, { op: 'eachPlayer', then: [GAIN] }], game({}, d))).toEqual({ answer: 'full', skipped: [] });
      expect(resolves([DRAW, pay(1)], offerGame(cardPack<G>, { deck: d, cfg: { due: (_s: S, _st: PackStep, _e: PackEnv, n: number) => n } }))).toEqual({ answer: 'full', skipped: [] });
    }
  });
  it('K597 the guarded view stops on a key or a log line holding the card, and on the card in env; length passes', () => {
    const t = (f: (s: S) => boolean, deck?: readonly string[]) => offerGame(cardPack<G>, { marks: true, ...(deck ? { deck } : {}), cfg: { tests: { f } } });
    const IF: PackStep = { op: 'if', test: 'f', then: [GAIN] };
    expect(resolves([DRAW, IF], t((s) => s.zones['hand:a']?.cards.length === 3))).toEqual({ answer: 'full', skipped: [] });
    expect(resolves([DRAW, IF], t((s) => s.res?.a?.gold === 3))).toEqual({ answer: 'full', skipped: [] });
    expect(resolves([DRAW, IF], t((s) => Object.keys(s.got ?? {}).length === 1))).toMatchObject({ answer: 'unknown', reason: 'hidden' });
    expect(resolves([DRAW, IF], offerGame(cardPack<G>, { cfg: { tests: { f: (s: S) => s.log.some((l) => l.type.includes('d2')) } } }))).toMatchObject({ answer: 'unknown', reason: 'hidden' });
    expect(resolves([{ op: 'lookAt', count: 1, then: [{ op: 'if', test: 'two', then: [GAIN] }] }])).toMatchObject({ answer: 'unknown', reason: 'hidden' });
  });
  it('K597 fourth look: a keyed read, an in check, an own-key check or a key listing of an object holding a card that came into view stops, whatever the deck order', () => {
    const t = (f: (s: S) => boolean, deck: readonly string[]) => offerGame(cardPack<G>, { marks: true, deck, cfg: { tests: { f } } });
    const IF: PackStep = { op: 'if', test: 'f', then: [GAIN] };
    const reads: ((s: S) => boolean)[] = [
      (s) => s.got?.d2 === 1, (s) => 'd2' in (s.got ?? {}), (s) => Object.prototype.hasOwnProperty.call(s.got ?? {}, 'd2'), (s) => Object.hasOwn(s.got ?? {}, 'd2'),
      (s) => Object.getOwnPropertyDescriptor(s.got ?? {}, 'd2') !== undefined, (s) => Reflect.ownKeys(s.got ?? {}).length === 1, (s) => s.got?.zz === undefined, (s) => Reflect.has(s.got ?? {}, 'd1'),
    ];
    for (const [i, f] of reads.entries()) for (const d of DECKS) expect([i, resolves([DRAW, IF], t(f, d))]).toMatchObject([i, { answer: 'unknown', reason: 'hidden' }]);
    // Never on the key asked alone: after a look at the deck's top (d2 new in one order only), asking for d2 in marks that hold no new card is answered alike.
    const rs = DECKS.map((d) => resolves([{ op: 'discard', count: 1 }, { op: 'lookAt', count: 1 }, IF], t((s) => s.got?.d2 === 1 || 'd2' in (s.got ?? {}), d)));
    expect(rs[0]?.answer).not.toBe('unknown');
    expect(rs[1]).toEqual(rs[0]);
  });
  it('K597 fourth look: a custom verb or game row flagged viewSafe runs after a card came into view, on the guarded view; unflagged keeps the hard stop', () => {
    const custom = (viewSafe: boolean) => ({
      nine: { run: (ctx: Ctx<G>) => void (draftOf(ctx).res = { ...ctx.s.res, a: { gold: 9 } }), text: () => 'Nine.', viewSafe },
      keep: { run: (ctx: Ctx<G>) => void (draftOf(ctx).res = { ...ctx.s.res, b: { gold: 1 } }), text: () => 'Keep.', viewSafe },
      zones: { run: (ctx: Ctx<G>) => void (draftOf(ctx).zones = { ...ctx.s.zones }), text: () => 'Zones.', viewSafe },
      drewTwo: { run: (ctx: Ctx<G>) => void (cardsIn(ctx.s, 'hand:a').includes('d2') && (draftOf(ctx).res = { a: { gold: 9 } })), text: () => 'Drew two.', viewSafe },
      ask: {
        run: (ctx: Ctx<G>, st: PackStep, env: PackEnv) => askVerb(ctx, { kind: 'ask', seat: env.seat, min: 1, max: 1, options: [{ id: 'x', enabled: true }, { id: 'y', enabled: true }] }, st, env),
        resume: (ctx: Ctx<G>, _st: PackStep, _e: PackEnv, a: readonly string[]) => void (a[0] === 'y' && (draftOf(ctx).res = { ...ctx.s.res, a: { gold: 7 } })),
        text: () => 'Ask.', viewSafe,
      },
    });
    const c = (name: string): PackStep => ({ op: 'custom', name });
    for (const d of DECKS) {
      const on = offerGame(cardPack<G>, { deck: d, cfg: { custom: custom(true) } });
      const off = offerGame(cardPack<G>, { deck: d, cfg: { custom: custom(false) } });
      expect(resolves([DRAW, c('nine')], on)).toEqual({ answer: 'full', skipped: [] });
      expect(resolves([DRAW, c('nine')], off)).toEqual({ answer: 'unknown', reason: 'hidden', skipped: [{ step: 1, reason: 'hidden' }] });
      expect(resolves([DRAW, c('ask')], on)).toEqual({ answer: 'full', skipped: [] });
      // What it writes is stored as the state, never as the view: a later prompt copies the state.
      expect(resolves([DRAW, c('keep'), { op: 'chooseOption', options: [[NOTHING], [GAIN]] }], on)).toEqual({ answer: 'full', skipped: [] });
      expect(resolves([DRAW, c('zones'), { op: 'discard', cards: 'pick' }], on)).toEqual({ answer: 'part', skipped: [{ step: 1, reason: 'noChange' }] });
      expect(resolves([DRAW, c('ask'), { op: 'if', test: 'rich', then: [GAIN] }], on)).toEqual({ answer: 'part', skipped: [{ step: 2, reason: 'condition' }] });
      expect(resolves([DRAW, c('ask')], off)).toMatchObject({ answer: 'unknown', reason: 'hidden' });
      // The guard still holds: a flagged verb that reads the drawn card stops.
      expect(resolves([DRAW, c('drewTwo')], on)).toMatchObject({ answer: 'unknown', reason: 'hidden' });
      // A game row: lucky reads the open discard; after a draw it holds no new card and runs, after a mill it does and stops.
      const row = offerGame(cardPack<G>, { deck: d, viewSafe: true });
      expect(resolves([DRAW, LUCKY], row)).toEqual({ answer: 'part', skipped: [{ step: 1, reason: 'noChange' }] });
      expect(resolves([DRAW, LUCKY], offerGame(cardPack<G>, { deck: d }))).toMatchObject({ answer: 'unknown', reason: 'hidden' });
      expect(resolves([{ op: 'mill', count: 1 }, LUCKY], row)).toMatchObject({ answer: 'unknown', reason: 'hidden' });
      // Outside resolves the flag changes nothing: wouldChange and judge keep the hard stop.
      for (const v of [true, false]) {
        const g = offerGame(cardPack<G>, { deck: d, offer: { paid: 'effect' }, cfg: { custom: custom(v) } });
        const { s, content } = g.at();
        expect(g.pack.judge(s, content, [{ op: 'payThen', cost: [{ op: 'mill', count: 1 }], then: [c('nine')] }], A)).toMatchObject({ answer: 'unknown', reason: 'hidden' });
      }
      const w = game({ paid: 'effect' }, d);
      const { s, content } = w.at();
      expect(w.pack.judge(s, content, [{ op: 'payThen', cost: [{ op: 'mill', count: 1 }], then: [LUCKY] }], A)).toEqual(offerGame(cardPack<G>, { deck: d, viewSafe: true, offer: { paid: 'effect' } }).pack.judge(s, content, [{ op: 'payThen', cost: [{ op: 'mill', count: 1 }], then: [LUCKY] }], A));
    }
  });
  it('K597 a filter is not run on a card that came into view; a custom verb after it keeps the hard stop', () => {
    const custom = { drewTwo: { run: (ctx: Ctx<G>) => void (cardsIn(ctx.s, 'hand:a').includes('d2') && (draftOf(ctx).res = { a: { gold: 9 } })), text: () => 'Drew two.' } };
    for (const d of DECKS) {
      expect(resolves([DRAW, { op: 'chooseCards', zone: 'hand', filter: 'even', min: 2, max: 2, then: [GAIN] }], game({}, d))).toMatchObject({ answer: 'unknown', reason: 'hidden' });
      expect(resolves([DRAW, { op: 'custom', name: 'drewTwo' }], offerGame(cardPack<G>, { deck: d, cfg: { custom } }))).toMatchObject({ answer: 'unknown', reason: 'hidden' });
    }
  });
});

describe('card-language reasons (K605): second review', () => {
  const reasons = (p: Parameters<typeof blocked>[0]) => blocked(p).map((b) => [b.id, b.reason]);
  it('K605 decide may return the game\'s own reason: judge carries it and a barred option shows it', () => {
    const g = game({ noChange: 'bar', decide: (_s, _st, _e, c) => (c.answer === 'no' ? { answer: 'no', reason: 'shielded' } : c) });
    const { s, content } = g.at();
    expect(g.pack.judge(s, content, [RICH], A)).toEqual({ answer: 'no', reason: 'shielded' });
    expect(reasons(g.play([{ op: 'may', then: [RICH] }], [['no']]).prompts[0] ?? null)).toEqual([['yes', 'shielded']]);
  });
  it('K605 barReason why: a barred option carries the reason judge gives (also with decide set); by default the code is as before', () => {
    const opts: Eff = [{ op: 'chooseOption', options: [[RICH], [{ op: 'discard', cards: 'pick', from: 'aside' }], [GAIN]] }];
    const bars = (offer: OfferPolicy<S>) => reasons(game(offer).play(opts, [['2']]).prompts[0] ?? null);
    expect(bars({ deadChoice: 'bar', barReason: 'why' })).toEqual([['0', 'condition'], ['1', 'emptyZone']]);
    expect(bars({ deadChoice: 'bar', decide: (_s, _st, _e, c) => c })).toEqual([['0', 'condition'], ['1', 'emptyZone']]);
    expect(bars({ deadChoice: 'bar' })).toEqual([['0', 'noChange'], ['1', 'noChange']]);
    expect(reasons(game({ noChange: 'bar', barReason: 'why' }).play([{ op: 'may', then: [RICH] }], [['no']]).prompts[0] ?? null)).toEqual([['yes', 'condition']]);
    const ways: Eff = [{ op: 'choosePayment', ways: [[pay(1)], [pay(2)]], then: [{ op: 'if', test: 'poor', then: [GAIN] }] }];
    expect(reasons(game({ deadChoice: 'bar', paid: 'effect', barReason: 'why' }).play(ways, [['0']]).prompts[0] ?? null)).toEqual([['1', 'condition']]);
    expect(reasons(game({ deadChoice: 'bar', paid: 'effect' }).play(ways, [['0']]).prompts[0] ?? null)).toEqual([['1', 'noChange']]);
  });
});

describe('card-language wouldChange (K597): unchanged', () => {
  it('K597 judge and wouldChange answer 1,800 random effects under 3 policies exactly as main did before K597', () => {
    expect(pinned()).toEqual({ hash: 'c210199b3bde6953', count: 1800 });
  }, 240000);
});

describe('card-language resolves (K597): the README recipe runs', () => {
  it('K597 recipe: read how much resolves and why each step is skipped', () => {
    const g = game();
    const { s: state, content } = g.at();
    const pack = g.pack;
    const out: string[] = [];
    // README recipe (K597, K605) starts
    const r = pack.resolves(state, content, [DRAW, { op: 'gain', from: 'aside' }], { seat: 'a' });
    if (r.answer === 'part') for (const k of r.skipped) out.push(`step ${String(k.step)} skipped: ${k.reason}`);
    const why = pack.judge(state, content, [{ op: 'if', test: 'rich', then: [GAIN] }], { seat: 'a' }, { why: true });
    out.push(`${why.answer} ${String(why.reason)}`);
    // README recipe ends
    expect(out).toEqual(['step 1 skipped: emptyZone', 'no condition']);
  });
});

// K597 interface row: the three-way answer against exhaustive real play of every answer. A line of play resolves a top-level
// step when the game's view changed while it ran (or it ended the game); a top-level payThen is two parts, its cost and its
// effect. Full: some line resolves every part; part: some line resolves one, none all; none: no line resolves any.
// Without hidden information the answer is never unknown. With it, the effect is played in every hidden world (the acting
// seat's deck, the other seat's hand, the seed): a known answer must hold in every world, and an unknown one means worlds
// disagree, or a declared case (another seat's choice, a handler error, a random draw or game code reading a card the seat
// cannot see, K583: the check stops there and never looks past it).
describe('card-language resolves (K597): agrees with playing every answer', () => {
  const has = (e: Eff, f: (st: PackStep) => boolean): boolean => e.some((st) => f(st) || Object.values(st).some((v) => Array.isArray(v) && typeof v[0] === 'object' && (Array.isArray(v[0]) ? (v as Eff[]).some((o) => has(o, f)) : has(v as Eff, f))));
  // Declared: in the check, looking at a card the seat already sees (or revealing one all see) is no change (K583); a real run records it.
  const looksAtASeenCard = (e: Eff): boolean => has(e, (st) => (st.op === 'lookAt' || st.op === 'reveal') && st.cards === 'all' && st.from !== 'deck');
  const HIDDEN = ['hand:b', 'deck', 'deck:b'];
  // Declared (K583's guard, on from the start in resolves): a card shown to the seat stops the game code that follows.
  const SHOWS = ['scout', 'draw', 'mill', 'lookAt', 'reveal', 'search', 'discard'];
  const CODE = ['custom', 'if', 'count', 'chooseCards', 'search', 'choosePlayer', 'eachPlayer'];
  const showsAfterACost = (e: Eff): boolean => has(e, (x) => SHOWS.includes(x.op) || (x.op === 'custom' && x.name === 'attempt')) && has(e, (x) => CODE.includes(x.op));
  const secret = (e: Eff): boolean => has(e, (st) => (st.op === 'custom' && ['roll', 'boom', 'back', 'pairs', 'nest'].includes(st.name)) || ['shuffle', 'search', 'mill', 'choosePlayer', 'eachPlayer'].includes(st.op) || (st.op === 'chooseCards' && HIDDEN.includes(st.zone)) || (st.op === 'lookAt' && st.cards !== 'all')) || showsAfterACost(e);
  // Declared (K583): game code that reads a card the seat cannot see is unknown whatever the card is, so worlds may agree.
  const readsUnseen = (e: Eff): boolean => showsAfterACost(e) || has(e, (st) => (st.op === 'chooseCards' && HIDDEN.includes(st.zone) && has(st.then as Eff, (x) => CODE.includes(x.op))) || (st.op === 'search' && st.filter !== undefined));
  const WORLDS = [['d1', 'd2'], ['d2', 'd1'], ['d3', 'd4']].flatMap((deck) => [['b1', 'b2', 'b3'], ['b4', 'b5', 'b6']].map((b) => ({ deck, b, g: offerGame(cardPack<G>, { offer: { branches: 100000 }, deck, b, marks: true }), safe: offerGame(cardPack<G>, { offer: { branches: 100000 }, deck, b, marks: true, viewSafe: true }) })));
  const whole = (x: { answer: string; reason?: string; skipped: readonly { step: number; reason: string }[] }): string => JSON.stringify([x.answer, x.reason, x.skipped.map((k) => [k.step, k.reason])]);
  const [base] = WORLDS;
  // Brute force does not see a step that did some but less than its number (K597 `short`; in these effects only a choice of at least 2 cards can): part where it says full.
  const shortOf = (e: Eff, r: { answer: string }, t: string | undefined): boolean => r.answer === 'part' && t === 'full' && has(e, (st) => st.op === 'chooseCards' && (st.min ?? 0) >= 2);
  if (base === undefined) throw new Error('no world');
  const truth = (g: typeof base.g, effect: Eff, seed: string): string | undefined => {
    const c = (name: string): PackStep => ({ op: 'custom', name });
    // A cost that is not a top-level payThen: two parts, its cost and its effect, at any depth.
    const wrap = (e: Eff): PackStep[] => e.map((st): PackStep => {
      const out = Object.fromEntries(Object.entries(st).map(([k, v]) => [k, Array.isArray(v) && typeof v[0] === 'object' ? (Array.isArray(v[0]) ? (v as Eff[]).map(wrap) : wrap(v as Eff)) : v as unknown])) as unknown as PackStep;
      if (out.op !== 'payThen' && out.op !== 'choosePayment') return out;
      return { op: 'seq', steps: [c('pre2'), { ...out, then: [c('mid2'), ...out.then, c('end2')] }, c('post2')] };
    });
    const top = (st: PackStep): PackStep => (st.op === 'payThen' ? { ...st, cost: wrap(st.cost as Eff), then: [c('paid'), ...wrap(st.then as Eff)] } : wrap([st])[0] ?? st);
    const content = { effect: [{ op: 'custom', name: 'step' } as PackStep, ...effect.flatMap((st, i): PackStep[] => [top(st), { op: 'custom', name: 'step', n: i + 1 }])] };
    const units = effect.reduce((n, st) => n + (st.op === 'payThen' ? 2 : 1), 0);
    let left = 3000;
    let best = 0;
    const grade = (done: number, half: number): number => (done === units ? 2 : done + half > 0 ? 1 : 0);
    const walk = (s: S): boolean => {
      if ((left -= 1) < 0) return false;
      const t = s.steps;
      if (s.result !== null) {
        // K597 fourth look: the step that ended the game resolves, and the steps after it do not count against full.
        const i = t?.next ?? 0;
        const now = effect.flatMap((st, j) => (j < i ? [] : st.op === 'payThen' ? [j, j + 0.5] : [j])).filter((u) => !(t?.done ?? []).includes(u));
        best = Math.max(best, grade((t?.done.length ?? 0) + now.length, (t?.half ?? []).filter((u) => u < i).length));
        return true;
      }
      const p = s.prompt;
      if (p === null) return (best = Math.max(best, grade(t?.done.length ?? 0, t?.half?.length ?? 0))), true;
      const ordered = p.ordered === true || p.kind === 'orderCards' || p.kind === 'orderEffects';
      for (const a of enumerateAnswers({ ...s, prompt: { ...p, ordered } })) if (!walk(applyAction(g.RULES, s, a, content).state)) return false;
      return true;
    };
    try {
      if (!walk(createGame(g.RULES, { seed }, {}, content).state)) return undefined;
    } catch {
      return undefined;
    }
    return (['none', 'part', 'full'] as const)[best];
  };
  it('K597 1,200 random effects: full, part and none match brute force in every hidden world; unknown only where worlds disagree or a declared case', () => {
    const seen: Record<string, number> = { full: 0, part: 0, none: 0, unknown: 0, plain: 0, everyWorld: 0, disagree: 0, declared: 0 };
    const add = (k: string): void => void (seen[k] = (seen[k] ?? 0) + 1);
    for (const seed of [597, 5972]) {
      const eff = gen(seed, true);
      for (let i = 0; i < 600; i += 1) {
        const e = eff(2);
        if (looksAtASeenCard(e)) continue;
        const rs = WORLDS.map((w) => {
          const { s, content } = w.g.at();
          return w.g.pack.resolves(s, content, e, A);
        });
        const r = rs[0];
        if (r === undefined) throw new Error('no answer');
        add(r.answer);
        // The answer is the seat's own: the same in every hidden world.
        // K597 third look: the whole answer, its skipped steps and reasons included.
        if (rs.some((x) => whole(x) !== whole(r))) throw new Error(`answers differ between hidden worlds: ${rs.map(whole).join()}: ${JSON.stringify(e)}`);
        if (r.answer === 'full' ? r.skipped.some((k) => k.reason !== 'gameOver') : r.skipped.length === 0) throw new Error(`skipped ${JSON.stringify(r.skipped)} with ${r.answer}`);
        if (!secret(e)) {
          if (r.answer === 'unknown') throw new Error(`unknown (${String(r.reason)}) with nothing hidden: ${JSON.stringify(e)}`);
          const t = truth(base.g, e, 's');
          if (t !== undefined && t !== r.answer && !shortOf(e, r, t)) throw new Error(`resolves ${r.answer}, brute force ${t}: ${JSON.stringify(e)}`);
          if (t !== undefined) add(t === r.answer ? 'plain' : 'short');
          continue;
        }
        const ts = WORLDS.flatMap((w) => ['s', 't'].map((sd) => truth(w.g, e, sd)));
        if (ts.some((t) => t === undefined)) continue;
        if (r.answer !== 'unknown') {
          if (ts.some((t) => t !== r.answer && !shortOf(e, r, t))) throw new Error(`resolves ${r.answer}, worlds ${ts.join()}: ${JSON.stringify(e)}`);
          add('everyWorld');
        } else if (new Set(ts).size > 1) add('disagree');
        // Declared: the check stops where hidden or random information is read (it never looks past it), so worlds may still agree.
        else if (['otherSeat', 'error', 'nested', 'random'].includes(r.reason ?? '') || (r.reason === 'hidden' && readsUnseen(e))) add('declared');
        else throw new Error(`unknown (${String(r.reason)}) but every world gives ${String(ts[0])}: ${JSON.stringify(e)}`);
      }
    }
    expect(seen.plain).toBeGreaterThan(200);
    expect(seen.everyWorld).toBeGreaterThan(300);
    expect(seen.disagree).toBeGreaterThan(30);
    expect(seen.part).toBeGreaterThan(100);
    expect(seen.none).toBeGreaterThan(150);
    expect(inDryRun()).toBe(false);
  }, 240000);
  it('K597 fourth look: with the custom verbs and the row that read no card flagged viewSafe, fewer answers are unknown; every answer is still the same in every hidden world and agrees with brute force', () => {
    const n = { effects: 0, unknownOff: 0, unknownOn: 0, lostOff: 0, lostOn: 0, hiddenOff: 0, hiddenOn: 0 };
    for (const [seed, depth] of [[5973, 2], [5974, 2], [5975, 3]] as const) for (let i = 0, eff = gen(seed, true); i < 400; i += 1) {
      const e = eff(depth);
      if (looksAtASeenCard(e)) continue;
      const at = (g: typeof base.g) => {
        const { s, content } = g.at();
        return g.pack.resolves(s, content, e, A);
      };
      const on = WORLDS.map((w) => at(w.safe));
      const r = on[0];
      const off = at(base.g);
      if (r === undefined) throw new Error('no answer');
      if (on.some((x) => whole(x) !== whole(r))) throw new Error(`answers differ between hidden worlds: ${on.map(whole).join()}: ${JSON.stringify(e)}`);
      const ts = WORLDS.flatMap((w) => ['s', 't'].map((sd) => truth(w.g, e, sd)));
      if (ts.some((t) => t === undefined)) continue;
      n.effects += 1;
      if (r.answer !== 'unknown' && ts.some((t) => t !== r.answer && !shortOf(e, r, t))) throw new Error(`resolves ${r.answer}, worlds ${ts.join()}: ${JSON.stringify(e)}`);
      const agree = new Set(ts).size === 1;
      const k = (x: typeof r): number => (x.answer === 'unknown' ? 1 : 0);
      n.unknownOff += k(off);
      n.unknownOn += k(r);
      n.lostOff += agree ? k(off) : 0;
      n.lostOn += agree ? k(r) : 0;
      n.hiddenOff += agree && off.reason === 'hidden' ? 1 : 0;
      n.hiddenOn += agree && r.reason === 'hidden' ? 1 : 0;
    }
    console.log(`K597 viewSafe share: ${JSON.stringify(n)}`);
    expect(n.effects).toBeGreaterThan(600);
    expect(n.hiddenOn).toBeLessThan(n.hiddenOff);
    expect(n.lostOn).toBeLessThan(n.lostOff);
  }, 240000);
});
