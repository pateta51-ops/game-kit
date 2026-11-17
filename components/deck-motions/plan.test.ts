import { describe, expect, it } from 'vitest';
import { DEAL_MS, REFILL_GAP_MS, RIFFLE_MS, STAGGER_MS, cycleMove, planDeal, riffleFrames, type Move } from './index.ts';

const out = (id: string, extra: Partial<Move> = {}): Move => ({ id, dir: 'out', pile: 'deck', at: () => null, faceDown: true, ...extra });

describe('planDeal', () => {
  it('staggers cards out in turn', () => {
    const p = planDeal([out('a'), out('b')]);
    expect(p.timed.map((t) => t.delay)).toEqual([0, STAGGER_MS]);
    expect(p.timed[0]!.ms).toBe(DEAL_MS);
  });
  it('puts a cycled card in first, riffles the deck, then deals', () => {
    const p = planDeal([out('a'), cycleMove('c', 'discard', 'deck')], { shuffled: ['deck', 'other'] });
    expect(p.shuffling).toEqual(['deck']);
    expect(p.shuffleAt).toBe(DEAL_MS);
    expect(p.dealAt).toBe(DEAL_MS + RIFFLE_MS);
    expect(p.timed.find((t) => t.move.id === 'a')!.delay).toBe(p.dealAt);
    expect(p.timed.find((t) => t.move.id === 'c')!.vanish).toBe(true);
  });
  it('refills together after the departing card, far ones longer, never after a shuffle', () => {
    const p = planDeal([out('a', { refill: true }), out('b', { refill: true, far: true })], { departs: true, shuffled: ['deck'] });
    expect(p.timed.map((t) => t.delay)).toEqual([DEAL_MS + REFILL_GAP_MS, DEAL_MS + REFILL_GAP_MS]);
    expect(p.timed[1]!.ms).toBe(DEAL_MS * 1.5);
    expect(p.timed[0]!.lift).toBe(1.06);
  });
  it('scales by speed and is empty at 0', () => {
    expect(planDeal([out('a'), out('b')], { speed: 0.5 }).timed[1]!.delay).toBe(STAGGER_MS / 2);
    expect(planDeal([out('a')], { speed: 0 }).timed).toEqual([]);
  });
  it('riffle keyframes: 11 frames for each of 12 cards, ending at rest', () => {
    for (let n = 0; n < 12; n++) {
      const f = riffleFrames(n, 100, 1);
      expect(f).toHaveLength(11);
      expect(f.at(-1)!.transform).toBe('none');
    }
  });
});
