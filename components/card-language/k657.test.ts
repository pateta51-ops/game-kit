import { describe, expect, it } from 'vitest';
import { blocked } from '../engine-core/index.ts';
import { cardsIn } from '../card-zones/index.ts';
import { describeEffect } from './index.ts';
import { cardPack, type PackEnv, type PackStep } from './pack.ts';
import { gold, offerGame, type G, type GameOpts } from './offerGame.ts';

// K657, K658, K660 on the made-up game of offerGame.ts. Seat a: 3 gold, hand h1 h2, deck d1 d2; seat b holds no resource.
const game = (offer?: GameOpts['offer'], opts: GameOpts = {}) => offerGame(cardPack<G>, { ...opts, ...(offer ? { offer } : {}) });
const A: PackEnv = { seat: 'a', source: 'p1' };
const gemX: PackStep = { op: 'gainResource', res: 'gem', amount: 'X' };
const numbers = (min: number, max: number): PackStep => ({ op: 'chooseNumber', min, max, then: [{ op: 'payThen', cost: [{ op: 'pay', res: 'gold', amount: 'X' }], then: [{ op: 'gainResource', res: 'gem', amount: 'X' }] }] });

describe('card-language K657: gaining 0 of a resource never held is no change', () => {
  it('K657: wouldChange, resolves and grade judge "gain X gems" (X unbound) no change; a seat with no record gaining 0 gold too; also under a game view; the real run still writes the 0', () => {
    const g = game();
    const { s, content } = g.at();
    expect([g.check([gemX]), g.check([{ op: 'gainResource', res: 'gold', amount: 'X' }], { seat: 'b' })]).toEqual(['no', 'no']);
    expect([g.pack.resolves(s, content, [gemX], A).answer, g.pack.grade(s, content, [gemX], A).answer]).toEqual(['none', 'none']);
    expect(game({ noChange: 'skip', view: ({ res }) => ({ res }) }).check([gemX])).toBe('no');
    expect(g.check([{ op: 'gainResource', res: 'gem', amount: 1 }])).toBe('yes');
    const after = g.play([gemX]).s;
    expect([after.res?.a, gold(after, 'a', 'gem')]).toEqual([{ gold: 3, gem: 0 }, 0]);
  });
});

describe('card-language K658: a step picks among the cards a mover just moved', () => {
  const drawDiscard: PackStep = { op: 'draw', count: 2, then: [{ op: 'discard', cards: 'pick', from: 'moved', count: 1 }] };
  it('K658 recipe: "draw 2, then discard 1 of them" (README) offers only the two drawn, also when the draw reshuffles, and prints "of them"', () => {
    const { s, prompts } = game(undefined, { deck: ['d1'], cfg: { reshuffle: () => 'discard:a' } }).play([{ op: 'move', cards: 'chosen', from: 'hand', to: 'discard' }, drawDiscard], [], { seat: 'a', cards: ['h2'] }, true);
    expect([prompts, s.prompt?.options.map((o) => o.id), cardsIn(s, 'hand:a')]).toEqual([[], ['d1', 'h2'], ['h1', 'd1', 'h2']]);
    expect(describeEffect(game().pack.verbs, [drawDiscard])).toBe('Draw 2 cards. Discard 1 card of them.');
  });
  it('K658: cards moved where the picking seat cannot see them are offered blind, and the pick takes the one at that place', () => {
    const { s, prompts } = game().play([{ op: 'move', cards: 'top', from: 'deck', to: 'hand:b', count: 2, then: [{ op: 'discard', cards: 'pick', from: 'moved', count: 1 }] }], [['#1']]);
    expect([prompts[0]?.options.map((o) => [o.id, o.unseen]), cardsIn(s, 'discard:a'), cardsIn(s, 'hand:b')]).toEqual([[['#0', true], ['#1', true]], ['d2'], ['d1', 'b1', 'b2', 'b3']]);
  });
  it('K658: in the check a test that reads env.moved after a draw keeps K597\'s hidden-card guard (unknown, hidden); after the draw, outside its then, one that reads gold is answered', () => {
    const g = game(undefined, { cfg: { tests: { evenMoved: (_s, e) => (e.moved ?? []).some((c) => c.endsWith('2')), rich: (st) => gold(st) >= 9 } } });
    const { s, content } = g.at();
    const r = g.pack.resolves(s, content, [{ op: 'draw', count: 2, then: [{ op: 'if', test: 'evenMoved', then: [{ op: 'gainResource', res: 'gold', amount: 1 }] }] }], A);
    expect([r.answer, r.reason]).toEqual(['unknown', 'hidden']);
    expect(g.pack.resolves(s, content, [{ op: 'draw', count: 2 }, { op: 'if', test: 'rich', else: [{ op: 'gainResource', res: 'gold', amount: 1 }], then: [] }], A).answer).toBe('full');
  });
});

describe('card-language K660: chooseNumber under deadChoice', () => {
  it('K660: under bar the reason of a number whose cost cannot be paid is cannotPay; with every number dead (bar or skip) it is not offered; under skip with one live all are offered', () => {
    const bar = game({ deadChoice: 'bar' }).play([numbers(1, 5)], [['3']]).prompts;
    expect(blocked(bar[0] ?? null).map((b) => [b.id, b.reason])).toEqual([['4', 'cannotPay'], ['5', 'cannotPay']]);
    for (const deadChoice of ['bar', 'skip'] as const) {
      const { s, prompts } = game({ deadChoice }).play([numbers(4, 5)]);
      expect([deadChoice, prompts, gold(s), gold(s, 'a', 'gem')]).toEqual([deadChoice, [], 3, 0]);
    }
    const skip = game({ deadChoice: 'skip' }).play([numbers(2, 5)], [['2']]);
    expect([skip.prompts[0]?.options.map((o) => [o.id, o.enabled]), gold(skip.s, 'a', 'gem')]).toEqual([[['2', true], ['3', true], ['4', true], ['5', true]], 2]);
  });
});
