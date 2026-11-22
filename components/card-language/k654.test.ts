import { describe, expect, it } from 'vitest';
import { blocked, type Ctx, type KernelPrompt, would } from '../engine-core/index.ts';
import { cardsIn } from '../card-zones/index.ts';
import { cardPack, hasMark, type PackEnv, type PackStep } from './pack.ts';
import { DRAW, GAIN, gold, offerGame, pay, type Eff, type G, type GameOpts, type S } from './offerGame.ts';

// K654: the older engines' cases restated on the made-up game of offerGame.ts. Seat a: 3 gold, hand h1 h2, deck d1 d2, p1 in play.
const game = (offer?: GameOpts['offer'], opts: GameOpts = {}) => offerGame(cardPack<G>, { ...opts, ...(offer ? { offer } : {}) });
const A: PackEnv = { seat: 'a', source: 'p1' };
const z = (s: S, name: string): readonly string[] => cardsIn(s, name);
const kinds = (p: readonly KernelPrompt[]): (string | undefined)[] => p.map((x) => x.kind);
const paid = (cost: Eff, then: Eff): PackStep => ({ op: 'payThen', cost, then });
const TRIG: PackStep = { op: 'custom', name: 'triggers' };
const res = (r: string, amount: number | 'X'): PackStep => ({ op: 'gainResource', res: r, amount });
const MILL3: PackStep = { op: 'mill', count: 3 };
const PAYX: PackStep = { op: 'pay', res: 'gold', amount: 'X' };

describe('card-language (K654): the older engines\' cases on the fake game', () => {
  it('K654 S-B18: "exhaust this card and exhaust a card" with the source the only card in play is not offered under cost = whole', () => {
    const tap: Eff = [paid([{ op: 'exhaust' }, { op: 'exhaust', cards: 'pick', from: 'play', count: 1 }], [DRAW, DRAW])];
    expect(game({ cost: 'whole' }).check(tap)).toBe('no');
    const { s, prompts } = game({ cost: 'whole' }).play(tap);
    expect([prompts, z(s, 'hand:a').length, s.marks]).toEqual([[], 2, undefined]);
  });
  it('K654 S-B18 today: under cost = parts (default) each exhaust is judged alone, so the one card pays both and the effect is offered', () => {
    expect(game().check([paid([{ op: 'exhaust' }, { op: 'exhaust', cards: 'pick', from: 'play', count: 1 }], [DRAW, DRAW])])).toBe('yes');
  });

  // S-B19: the rules of the new game give the number; today the pack makes no reshuffle when the zone shuffled in is empty.
  const tide = { p1: { when: [{ on: 'reshuffle', then: [res('coin', 2)] }] } };
  const turned = (): ReturnType<typeof game> => game(undefined, { deck: [], pool: tide, cfg: { reshuffle: () => 'discard:a' } });
  it('K654 S-B19 today: draw 3 from an empty deck with an empty discard makes no reshuffle, so "after your deck turns over" never fires', () => {
    const { s } = turned().play([{ op: 'draw', count: 3 }, TRIG]);
    expect([z(s, 'hand:a').length, gold(s, 'b', 'coin')]).toEqual([2, 0]);
  });
  it('K654 S-B19 today: with one card in the discard, draw 3 reshuffles once and draws that card', () => {
    const { s } = turned().play([{ op: 'move', cards: 'source', from: 'play', to: 'discard' }, { op: 'draw', count: 3 }, TRIG]);
    expect([z(s, 'hand:a').length, gold(s, 'b', 'coin')]).toEqual([3, 2]);
  });
  it('K654 S-B19 recipe: a game whose every draw attempt on an empty deck and discard is an event draws one at a time and starts its own occurrence', () => {
    const turnOver = { run: (ctx: Ctx<G>, _st: PackStep, env: PackEnv) => void would(ctx, [{ kind: 'turnOver', keys: { player: env.seat } }]), text: () => 'Turn over.' };
    const g = game(undefined, { deck: [], pool: { p1: { when: [{ on: 'turnOver', then: [res('coin', 2)] }] } }, cfg: {
      reshuffle: () => 'discard:a', tests: { bare: (s) => z(s, 'deck:a').length + z(s, 'discard:a').length === 0 },
      custom: { turnOver, triggers: { run: (ctx) => ctx.then({ kind: 'timing.triggers' }), text: () => 'Triggers.' } },
    } });
    const { s } = g.play([{ op: 'repeat', times: 3, then: [{ op: 'if', test: 'bare', then: [{ op: 'custom', name: 'turnOver' }, TRIG], else: [DRAW] }] }]);
    expect([z(s, 'hand:a').length, gold(s, 'b', 'coin')]).toEqual([2, 6]);
  });

  it('K654 S-B22: a for-each count is taken once: "for each gold you have, gain 1 gold" with 3 gold gives 6', () => {
    const g = game(undefined, { cfg: { counts: { gold: (s, e) => gold(s, e.seat) } } });
    expect(gold(g.play([{ op: 'count', what: 'gold', then: [{ op: 'repeat', times: 'X', then: [GAIN] }] }]).s)).toBe(6);
    expect(gold(g.play([{ op: 'count', what: 'gold', then: [GAIN, res('gold', 'X')] }]).s)).toBe(7);
  });

  it('K654 S-B24: only the gain verb raises "after you gain": search, taking from the other seat and attaching do not', () => {
    const g = game(undefined, { pool: { p1: { when: [{ on: 'gain', then: [GAIN] }] } } });
    const others = g.play([{ op: 'search', zone: 'deck', count: 1 }, { op: 'move', cards: 'top', from: 'hand:b', to: 'hand', count: 1 }, { op: 'attach', cards: 'top', from: 'deck', count: 1 }, TRIG], [['d1']]).s;
    expect([z(others, 'hand:a').length, z(others, 'attached:p1').length, gold(others, 'b')]).toEqual([4, 1, 0]);
    const gained = g.play([{ op: 'gain', cards: 'top', from: 'deck', to: 'hand', count: 1 }, TRIG]).s;
    expect([z(gained, 'hand:a').length, gold(gained, 'b')]).toEqual([3, 1]);
  });

  it('K654 I-B12 today (cannot be expressed): "draw 2, discard 1 of them" has no pick among the cards just moved; a pick in the hand lists the whole hand', () => {
    const { prompts } = game().play([{ op: 'draw', count: 2 }, { op: 'chooseCards', zone: 'hand', max: 1, then: [{ op: 'discard', cards: 'chosen' }] }], [['d1']]);
    expect(prompts[0]?.options.map((o) => o.id)).toEqual(['h1', 'h2', 'd1', 'd2']);
  });

  const choice = (other = 'gold'): PackStep => ({ op: 'chooseOption', options: [
    [{ op: 'count', what: 'gold', then: [{ op: 'if', test: 'two', then: [paid([PAYX], [res('wood', 'X')])] }] }],
    [res(other, 'X')],
  ] });
  const xg = (offer?: GameOpts['offer']) => game(offer, { cfg: { counts: { gold: (s, e) => gold(s, e.seat) }, tests: { two: (s, e) => gold(s, e.seat) >= 2 } } });
  it('K654 I-B22: X bound in one option is not read in another: "gain X gold" is not offered (barred, noChange) under deadChoice = bar', () => {
    const { s, prompts } = xg({ deadChoice: 'bar' }).play([choice()], [['0']]);
    expect(blocked(prompts[0] ?? null).map((b) => [b.id, b.reason])).toEqual([['1', 'noChange']]);
    expect([gold(s), gold(s, 'a', 'wood')]).toEqual([0, 3]);
  });
  it.fails('K654 I-B22 fix row needed: gaining 0 of a resource the seat never held is judged a change, so "gain X gems" with X unbound is not barred', () => {
    const { prompts } = xg({ deadChoice: 'bar' }).play([choice('gem')], [['0']]);
    expect(blocked(prompts[0] ?? null).map((b) => [b.id, b.reason])).toEqual([['1', 'noChange']]);
  });
  it('K654 I-B22: with 1 gold "pay all (at least 2) and gain X wood" pays nothing and gains nothing', () => {
    const { s } = xg().play([pay(2), choice()], [['0']]);
    expect([gold(s), gold(s, 'a', 'wood')]).toEqual([1, 0]);
  });
  it('K654 I-B22 today: under deadChoice = today (default) the option that reads an unbound X is offered and gains 0', () => {
    const { s, prompts } = xg().play([choice()], [['1']]);
    expect([blocked(prompts[0] ?? null), gold(s)]).toEqual([[], 3]);
  });

  const deckGame = (pool?: GameOpts['pool']) => game(undefined, { deck: ['d1', 'd2', 'd3'], cfg: { reshuffle: () => 'discard:a' }, ...(pool ? { pool } : {}) });
  it('K654 I-B24: draw 2 from an empty deck and discard draws nothing, without an error', () => {
    const { s } = deckGame().play([MILL3, { op: 'move', cards: 'all', from: 'discard', to: 'aside' }, { op: 'draw', count: 2 }]);
    expect([z(s, 'hand:a'), z(s, 'deck:a')]).toEqual([['h1', 'h2'], []]);
  });
  it('K654 I-B24: draw 5 with 3 in the discard draws 3, and an optional step at each reshuffle is asked at most twice', () => {
    const g = deckGame({ p1: { when: [{ on: 'reshuffle', optional: true, then: [pay(1)] }] } });
    const eff: Eff = [MILL3, { op: 'draw', count: 5 }, TRIG];
    let asked = 0;
    let st = g.play(eff, [], A, true).s;
    while (st.prompt !== null && asked < 5) st = g.play(eff, Array.from({ length: ++asked }, () => ['no']), A, true).s;
    expect([asked > 0, asked <= 2]).toEqual([true, true]);
    expect([st.prompt, z(st, 'hand:a').length, z(st, 'discard:a')]).toEqual([null, 5, []]);
  });
  it('K654 I-B24 today (cannot be expressed as a draw): a draw "if able" has no field; a move from deck to hand never reshuffles', () => {
    const { s } = deckGame().play([MILL3, { op: 'move', cards: 'top', from: 'deck', to: 'hand', count: 2 }]);
    expect([z(s, 'hand:a').length, z(s, 'discard:a').length]).toEqual([2, 3]);
  });

  it('K654 E-B9: the card chosen before a cost is the one the effect changes', () => {
    const { s } = game().play([{ op: 'chooseCards', zone: 'hand', max: 1, then: [paid([pay(1)], [{ op: 'exhaust', cards: 'chosen' }, { op: 'flip', cards: 'chosen' }])] }], [['h2']]);
    expect([gold(s), hasMark(s, 'h2', 'exhausted'), hasMark(s, 'h2', 'flipped'), hasMark(s, 'h1', 'exhausted')]).toEqual([2, true, true, false]);
  });
  it('K654 E-B9: a number chosen is the amount paid and the amount applied', () => {
    const { s } = game().play([{ op: 'chooseNumber', min: 1, max: 3, then: [paid([PAYX], [res('gem', 'X')])] }], [['2']]);
    expect([gold(s), gold(s, 'a', 'gem')]).toEqual([1, 2]);
  });
  it('K654 E-B9 recipe: a number larger than what can be paid is not offered when the max is a count of what is held', () => {
    const g = game(undefined, { cfg: { counts: { gold: (s, e) => gold(s, e.seat) } } });
    const { prompts } = g.play([{ op: 'count', what: 'gold', then: [{ op: 'chooseNumber', min: 1, max: 'X', then: [paid([PAYX], [res('gem', 'X')])] }] }], [['3']]);
    expect(prompts[0]?.options.map((o) => o.id)).toEqual(['1', '2', '3']);
  });
  it('K654 E-B9 today: with a printed max above what is held, the unpayable numbers are offered and enabled; one picked pays and gains nothing', () => {
    const { s, prompts } = game({ deadChoice: 'bar' }).play([{ op: 'chooseNumber', min: 1, max: 5, then: [paid([PAYX], [res('gem', 'X')])] }], [['5']]);
    expect([blocked(prompts[0] ?? null), kinds(prompts), gold(s), gold(s, 'a', 'gem')]).toEqual([[], ['chooseNumber'], 3, 0]);
  });
});
