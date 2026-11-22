import { describe, expect, it } from 'vitest';
import { drawPieces, gainPieces, makeStocks, moveIds, piecesIn, returnPieces, whereIs, type ShortBagRules, type StockRng } from './stock.ts';
import { placeTokens } from './index.ts';

// a seeded stand-in for the engine's ctx.rng (mulberry32)
const seeded = (seed: number): StockRng => {
  let a = seed >>> 0;
  return {
    int(max) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
    },
  };
};

// a made-up game: dice in a supply, cubes and crystals in a bag, a hand, a discard, the box
const RULES = { setup: { do: 'drawLeft' }, turn: { do: 'refill', from: 'discard' }, effect: { do: 'fail' } } as const satisfies ShortBagRules;
const fresh = () =>
  makeStocks({ supply: { die: 6 }, bag: { cube: 3, crystal: 2 }, hand: {}, discard: { cube: 4 }, removed: {} });

describe('finite stocks and a bag (K593)', () => {
  it('a finite stock of 6 dice runs out: the seventh gain gives nothing and says so', () => {
    let s = fresh();
    for (let i = 0; i < 6; i++) {
      const r = gainPieces(s, 'supply', 'hand', 1, 'die');
      expect(r.ids).toHaveLength(1);
      expect(r.reason).toBeUndefined();
      s = r.state;
    }
    expect(piecesIn(s, 'supply', 'die')).toBe(0);
    expect(piecesIn(s, 'hand', 'die')).toBe(6);
    const last = gainPieces(s, 'supply', 'hand', 1, 'die');
    expect(last).toMatchObject({ ids: [], short: 1, reason: 'empty' });
    expect(last.why).toBe('No die left in supply: nothing gained.');
    expect(piecesIn(last.state, 'hand', 'die')).toBe(6);
  });

  it('a gain from an empty stock gives nothing and no substitute', () => {
    const s = fresh();
    const r = gainPieces(s, 'removed', 'hand', 2, 'die');
    expect(r).toMatchObject({ ids: [], short: 2, reason: 'empty' });
    expect(piecesIn(r.state, 'hand')).toBe(0);
    expect(r.state.places).toEqual(s.places);
  });

  it('a gain from a short stock gives what is there and says how many it could not', () => {
    const r = gainPieces(fresh(), 'bag', 'hand', 4, 'crystal');
    expect(r).toMatchObject({ short: 2, reason: 'short', why: 'Only 2 crystal left in bag: 2 not gained.' });
    expect(r.ids.map((id) => r.state.kinds[id])).toEqual(['crystal', 'crystal']);
    expect(piecesIn(r.state, 'bag')).toBe(3);
  });

  it('a short bag under drawLeft: draws what is left and says so', () => {
    const r = drawPieces(fresh(), seeded(1), 'bag', 'hand', 7, RULES.setup);
    expect(r).toMatchObject({ short: 2, reason: 'short', refilled: 0, failed: false });
    expect(r.ids).toHaveLength(5);
    expect(piecesIn(r.state, 'bag')).toBe(0);
    expect(piecesIn(r.state, 'hand')).toBe(5);
    expect(piecesIn(r.state, 'discard')).toBe(4);
  });

  it('a short bag under refill: the named place goes into the bag first, then the draw goes on', () => {
    const r = drawPieces(fresh(), seeded(2), 'bag', 'hand', 7, RULES.turn);
    expect(r).toMatchObject({ short: 0, refilled: 4, failed: false });
    expect(r.reason).toBeUndefined();
    expect(piecesIn(r.state, 'hand')).toBe(7);
    expect(piecesIn(r.state, 'discard')).toBe(0);
    expect(piecesIn(r.state, 'bag')).toBe(2);
  });

  it('a short bag under refill that is still short: draws everything and says so', () => {
    const r = drawPieces(fresh(), seeded(3), 'bag', 'hand', 12, RULES.turn);
    expect(r).toMatchObject({ short: 3, reason: 'short', refilled: 4 });
    expect(piecesIn(r.state, 'hand')).toBe(9);
  });

  it('a full bag under refill moves nothing into it', () => {
    const r = drawPieces(fresh(), seeded(3), 'bag', 'hand', 5, RULES.turn);
    expect(r.refilled).toBe(0);
    expect(piecesIn(r.state, 'discard')).toBe(4);
  });

  it('a short bag under fail: nothing drawn, the state is unchanged, the reason says why', () => {
    const s = fresh();
    const r = drawPieces(s, seeded(4), 'bag', 'hand', 6, RULES.effect);
    expect(r).toMatchObject({ ids: [], short: 6, failed: true, reason: 'short', why: 'Only 5 left in bag, 6 needed: nothing drawn.' });
    expect(r.state).toBe(s);
    const ok = drawPieces(s, seeded(4), 'bag', 'hand', 5, RULES.effect);
    expect(ok.failed).toBe(false);
    expect(ok.ids).toHaveLength(5);
  });

  it('an empty bag says empty', () => {
    const s = moveIds(fresh(), ['cube#1', 'cube#2', 'cube#3', 'crystal#1', 'crystal#2'], 'removed');
    expect(drawPieces(s, seeded(5), 'bag', 'hand', 1, { do: 'drawLeft' })).toMatchObject({ ids: [], reason: 'empty', why: 'Nothing left in bag: nothing drawn.' });
  });

  it('a draw is the same for the same seed, and the seed matters', () => {
    const a = drawPieces(fresh(), seeded(42), 'bag', 'hand', 3, { do: 'drawLeft' });
    const b = drawPieces(fresh(), seeded(42), 'bag', 'hand', 3, { do: 'drawLeft' });
    expect(a.ids).toEqual(b.ids);
    expect(a.state).toEqual(b.state);
    const seen = new Set(Array.from({ length: 20 }, (_, i) => drawPieces(fresh(), seeded(i), 'bag', 'hand', 3, { do: 'drawLeft' }).ids.join()));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('returns, whereIs and the state as plain data', () => {
    const g = gainPieces(fresh(), 'supply', 'hand', 2, 'die');
    const back = returnPieces(g.state, g.ids, 'supply');
    expect(piecesIn(back, 'supply', 'die')).toBe(6);
    expect(whereIs(back, 'die#1')).toBe('supply');
    expect(JSON.parse(JSON.stringify(back))).toEqual(back);
    expect(() => gainPieces(back, 'nowhere', 'hand')).toThrow('no place "nowhere"');
    expect(() => moveIds(back, ['die#99'], 'hand')).toThrow('no piece "die#99"');
  });

  it('a game that does not use it sees no change: placeTokens still gives the same change', () => {
    const { places } = placeTokens([{ id: 'mat', kind: 'coin', amount: 7, cap: 7 }], { coin: { 3: 6, 1: 10 } });
    expect(places.mat).toEqual({ tokens: [3, 3, 1], short: 0 });
  });

  it('the README recipe runs', () => {
    // "Finite stocks and a bag" in README.md, line for line
    const rules = { turn: { do: 'refill', from: 'discard' }, effect: { do: 'fail' } } as const satisfies ShortBagRules;
    let s = makeStocks({ supply: { die: 6 }, bag: { cube: 2 }, hand: {}, discard: { cube: 3 } });
    const got = gainPieces(s, 'supply', 'bag', 1, 'die'); // a gain from a named stock
    s = got.state;
    const d = drawPieces(s, seeded(7), 'bag', 'hand', 4, rules.turn); // pass ctx.rng in the engine
    expect(d).toMatchObject({ short: 0, refilled: 3 });
    expect(piecesIn(d.state, 'hand')).toBe(4);
    expect(piecesIn(d.state, 'bag') + piecesIn(d.state, 'hand', 'cube') + piecesIn(d.state, 'hand', 'die')).toBe(6);
  });
});
