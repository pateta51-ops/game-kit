import { describe, expect, it } from 'vitest';
import { blocked, type KernelPrompt } from '../engine-core/index.ts';
import { cardsIn } from '../card-zones/index.ts';
import { cardPack, inDryRun, type OfferPolicy, type PackStep } from './pack.ts';
import { DRAW, GAIN, gen, gold, has, offerGame, shortOf, truth, type Eff, type G, type S } from './offerGame.ts';

// K598: in a choice, an option that resolves in full bars the options that resolve only in part (`offer.prefer: 'full'`).
const game = (offer: OfferPolicy<S> = {}, deck?: readonly string[]) => offerGame(cardPack<G>, { offer, ...(deck ? { deck } : {}) });
const FULL: OfferPolicy<S> = { prefer: 'full' };
const RICH: PackStep = { op: 'if', test: 'rich', then: [GAIN] };
const PART: Eff = [GAIN, RICH];
const NONE: Eff = [RICH];
const HIDDEN: Eff = [{ op: 'search', zone: 'deck', filter: 'even' }];
const WIN: Eff = [{ op: 'custom', name: 'win' }];
const choice = (...options: Eff[]): Eff => [{ op: 'chooseOption', options }];
const barred = (p: KernelPrompt | null | undefined) => blocked(p ?? null).map((b) => [b.id, b.reason, b.missing]);
const ask = (offer: OfferPolicy<S>, e: Eff, deck?: readonly string[]) => game(offer, deck).play(e, [], undefined, true).s.prompt;

describe('card-language prefer full (K598): prior-art cases restated on the made-up game', () => {
  it('K598 a full option bars every option that resolves only in part (draw 3 from a deck of 2 beside draw 2), reason partial', () => {
    const { s, prompts } = game(FULL).play(choice([{ op: 'draw', count: 3 }], [{ op: 'draw', count: 2 }]), [['1']]);
    expect([barred(prompts[0]), cardsIn(s, 'hand:a').length]).toEqual([[['0', 'partial', undefined]], 4]);
    expect(barred(ask(FULL, choice(PART, [DRAW], PART)))).toEqual([['0', 'partial', undefined], ['2', 'partial', undefined]]);
  });
  it('K598 poor: with no full option every usable option stays open (part beside part, part beside none)', () => {
    const p = ask(FULL, choice(PART, [DRAW, { op: 'gain', from: 'aside' }], NONE));
    expect([p?.options.length, barred(p)]).toEqual([3, []]);
  });
  it('K598 a forced choice where no option resolves at all is skipped; poor: one part option, or the default policy, still asks', () => {
    const { s } = game(FULL).play(choice(NONE, [{ op: 'discard', cards: 'pick', from: 'play', filter: 'even' }]));
    expect([s.prompt, gold(s)]).toEqual([null, 3]);
    expect(ask(FULL, choice(NONE, PART))?.kind).toBe('chooseOption');
    expect(ask({}, choice(NONE, NONE))?.kind).toBe('chooseOption');
  });
  it('K598 an unknown option is never barred and never bars: beside a full option only the part one is barred; beside part alone, all open; with none, still asked', () => {
    expect(barred(ask(FULL, choice(HIDDEN, PART, [DRAW])))).toEqual([['1', 'partial', undefined]]);
    expect(barred(ask(FULL, choice(HIDDEN, PART)))).toEqual([]);
    expect(ask(FULL, choice(HIDDEN, NONE))?.kind).toBe('chooseOption');
  });
  it('K598 an option that wins the game counts as full and bars a part one', () => {
    expect(barred(ask(FULL, choice(PART, WIN)))).toEqual([['0', 'partial', undefined]]);
  });
  it('K598 a none option beside a full one is not barred for it (deadChoice bars it, with noChange)', () => {
    expect(barred(ask(FULL, choice(NONE, PART, [DRAW])))).toEqual([['1', 'partial', undefined]]);
    expect(barred(ask({ prefer: 'full', deadChoice: 'bar' }, choice(NONE, PART, [DRAW])))).toEqual([['0', 'noChange', undefined], ['1', 'partial', undefined]]);
  });
  it('K598 with barReason why a barred option carries its skipped steps\' reasons in missing', () => {
    expect(barred(ask({ prefer: 'full', barReason: 'why' }, choice(PART, [DRAW], [{ op: 'draw', count: 3 }])))).toEqual([['0', 'partial', 'condition'], ['2', 'partial', 'short']]);
  });
  it('K598 the default (and prefer any) bars nothing: a part option is offered beside a full one', () => {
    for (const offer of [{}, { prefer: 'any' }] as OfferPolicy<S>[]) expect(barred(ask(offer, choice(PART, [DRAW])))).toEqual([]);
  });
  it('K598 the bar is the seat\'s own: an option reading a drawn card is unknown and open whatever the deck order', () => {
    const DREW2: Eff = [DRAW, { op: 'if', test: 'drew2', then: [GAIN] }];
    for (const deck of [['d1', 'd2'], ['d2', 'd1']]) expect(barred(ask(FULL, choice(DREW2, PART, [GAIN]), deck))).toEqual([['1', 'partial', undefined]]);
  });
  it('K598 the README recipe runs', () => {
    // README recipe (K598) starts
    const offer: OfferPolicy<S> = { prefer: 'full', barReason: 'why' };
    const p = offerGame(cardPack<G>, { offer }).play([{ op: 'chooseOption', options: [[GAIN, RICH], [DRAW]] }], [], undefined, true).s.prompt;
    const out = blocked(p).map((b) => `${b.id} ${b.reason} ${String(b.missing)}`);
    // out: ['0 partial condition']
    // README recipe ends
    expect(out).toEqual(['0 partial condition']);
  });
});

// K598 interface row: on random small choices the barred set equals what exhaustive real play of each option gives (full,
// part or none; an option the check answers unknown is open), and is the same in every hidden world.
describe('card-language prefer full (K598): agrees with playing every answer', () => {
  const WORLDS = [['d1', 'd2'], ['d2', 'd1'], ['d3', 'd4']].flatMap((deck) => [['b1', 'b2', 'b3'], ['b4', 'b5', 'b6']].map((b) => offerGame(cardPack<G>, { offer: { prefer: 'full', branches: 3000 }, deck, b, marks: true })));
  it('K598 600 random choices: barred set from real play of every answer, unknown open, the same in every hidden world', () => {
    const n = { choices: 0, barred: 0, skipped: 0, open: 0, unknown: 0 };
    for (const seed of [598, 5981, 5982]) {
      const eff = gen(seed, true);
      for (let i = 0; i < 200; i += 1) {
        const options = Array.from({ length: 2 + (i % 2) }, () => eff(1));
        // Declared (K583, as in K597's comparison): looking at a card the seat already sees is no change in the check; a real run records it.
        if (options.some((o) => has(o, (st) => (st.op === 'lookAt' || st.op === 'reveal') && st.cards === 'all' && st.from !== 'deck'))) continue;
        const shown = WORLDS.map((g) => {
          const p = g.play(choice(...options), [], undefined, true).s.prompt;
          return p === null ? 'skip' : JSON.stringify(blocked(p).map((b) => [b.id, b.reason]));
        });
        if (shown.some((x) => x !== shown[0])) throw new Error(`barred differs between hidden worlds: ${shown.join()}: ${JSON.stringify(options)}`);
        const [w] = WORLDS;
        if (w === undefined) throw new Error('no world');
        const { s, content } = w.at();
        const rs = options.map((o) => w.pack.resolves(s, content, o, { seat: 'a', source: 'p1' }).answer);
        const ts = options.map((o, k) => {
          if (rs[k] === 'unknown') return 'unknown';
          const all = WORLDS.flatMap((g) => ['s', 't'].map((sd) => truth(g, o, sd)));
          if (all.some((t) => t === undefined)) return undefined;
          if (all.some((t) => t !== rs[k] && !shortOf(o, { answer: rs[k] ?? '' }, t))) throw new Error(`resolves ${String(rs[k])}, real play ${all.join()}: ${JSON.stringify(o)}`);
          return rs[k];
        });
        if (ts.some((t) => t === undefined)) continue;
        n.choices += 1;
        n.unknown += ts.includes('unknown') ? 1 : 0;
        const want = ts.every((t) => t === 'none') ? 'skip' : JSON.stringify(ts.includes('full') ? ts.flatMap((t, k) => (t === 'part' ? [[String(k), 'partial']] : [])) : []);
        expect([options, shown[0]]).toEqual([options, want]);
        n[want === 'skip' ? 'skipped' : want === '[]' ? 'open' : 'barred'] += 1;
      }
    }
    console.log(`K598 comparison: ${JSON.stringify(n)}`);
    expect(n.choices).toBeGreaterThan(300);
    expect(n.barred).toBeGreaterThan(20);
    expect(n.skipped).toBeGreaterThan(5);
    expect(n.open).toBeGreaterThan(20);
    expect(n.unknown).toBeGreaterThan(20);
    expect(inDryRun()).toBe(false);
  }, 240000);
});
