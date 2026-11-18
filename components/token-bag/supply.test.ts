import { describe, expect, it } from 'vitest';
import { countOf, discStack, heapOf, heldAndAside, makeChange, placeTokens, tokenSplit, valueOf } from './supply.ts';

// a fake game's box: coins of 3 and 1, wounds of 5 and 1
const BOX = { coin: { 3: 2, 1: 3 }, wound: { 5: 1, 1: 4 } };

describe('finite supply from the engine integers (K373)', () => {
  it('counts each place from its integer, largest first, out of what is left', () => {
    const r = placeTokens(
      [
        { id: 'mat', kind: 'coin', amount: 7 },
        { id: 'foe1', kind: 'wound', amount: 6 },
        { id: 'foe2', kind: 'wound', amount: 2 },
      ],
      BOX,
    );
    expect(r.places.mat).toEqual({ tokens: [3, 3, 1], short: 0 });
    expect(r.places.foe1).toEqual({ tokens: [5, 1], short: 0 });
    expect(r.places.foe2).toEqual({ tokens: [1, 1], short: 0 });
    expect(r.supply.coin).toEqual({ 3: 0, 1: 2 });
    expect(countOf(r.supply.wound!)).toBe(1);
  });

  it('runs out: what the supply or the cap cannot draw is short', () => {
    expect(makeChange(20, BOX.coin).change).toEqual({ tokens: [3, 3, 1, 1, 1], short: 11 });
    expect(makeChange(9, BOX.coin, 2).change).toEqual({ tokens: [3, 3], short: 3 });
    const r = placeTokens([{ id: 'a', kind: 'wound', amount: 9 }, { id: 'b', kind: 'wound', amount: 3 }], BOX);
    expect(r.places.b).toEqual({ tokens: [], short: 3 });
    expect(valueOf(r.supply.wound!)).toBe(0);
  });

  it('heap keeps its shape; splits, stacks and set-aside pieces', () => {
    expect(heapOf(BOX.coin, BOX.coin)).toHaveLength(5);
    const left = heapOf(BOX.coin, { 3: 1, 1: 3 });
    expect(left).toHaveLength(4);
    expect(heapOf(BOX.coin, BOX.coin).map((t) => t.place)).toEqual([0, 1, 2, 3, 4]);
    expect(tokenSplit(13, [1, 5], 3)).toEqual({ tokens: [5, 5, 1], hidden: 2 });
    expect(discStack(3).map((d) => d.dy)).toEqual([2.8, 1.4, 0]);
    expect(heldAndAside(2, 6)).toEqual({ held: 2, aside: [3, 1] });
  });
});
