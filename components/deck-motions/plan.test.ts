import { describe, expect, it } from 'vitest';
import { DEAL_MS, FLIP_START, REFILL_GAP_MS, RIFFLE_MS, STAGGER_MS, cycleMove, flipFrames, planDeal, riffleFrames, type Move } from './index.ts';

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

describe('K406 flipFrames', () => {
  const fr = flipFrames({ x: -134, y: 20, sx: 1, sy: 1 });
  const pos = (k: Keyframe) => String(k.transform).split(' perspective')[0];
  const deg = (k: Keyframe) => Number(/rotate[XY]\((-?[\d.]+)deg\)/.exec(String(k.transform))?.[1]);
  it('K406: both sides fly one path: no position jump at the swap', () => {
    expect(fr.first.map((k) => k.offset)).toEqual(fr.second.map((k) => k.offset));
    fr.first.forEach((k, i) => { expect(pos(k)).toBe(pos(fr.second[i]!)); });
    const swap = fr.first.findIndex((k) => k.opacity === 0);
    const x = (k: Keyframe) => Number(/translate\((-?[\d.]+)px/.exec(String(k.transform))?.[1]);
    expect(Math.abs(x(fr.second[swap]!) - x(fr.first[swap - 1]!))).toBeLessThan(1);
  });
  it('K406: every frame has perspective, and the card lifts at edge-on', () => {
    for (const k of [...fr.first, ...fr.second]) expect(String(k.transform)).toContain('perspective(800px)');
    const edge = fr.first.find((k) => deg(k) === 90)!;
    expect(String(edge.transform)).toContain('scale(1.08)');
  });
  it('K406: the face is hidden before 90 degrees and shown after; the back the other way', () => {
    for (let i = 0; i < fr.first.length; i++) {
      const b = fr.first[i]!;
      const f = fr.second[i]!;
      if (b.opacity === 1) { expect(deg(b)).toBeLessThanOrEqual(90); expect(f.opacity).toBe(0); expect(deg(f)).toBe(-90); }
      else { expect(f.opacity).toBe(1); expect(deg(f)).toBeGreaterThanOrEqual(-90); }
    }
    expect(deg(fr.first[0]!)).toBe(0);
    expect(deg(fr.second.at(-1)!)).toBe(0);
    expect(fr.first.find((k) => k.offset === FLIP_START)?.opacity).toBe(1);
  });
  it('K406: turns about rotateX with axis y and the other way with direction -1', () => {
    const y = flipFrames({ x: 0, y: 0, sx: 1, sy: 1 }, { axis: 'y', direction: -1 });
    expect(String(y.first.at(-1)!.transform)).toContain('rotateX(-90deg)');
  });
});

describe('K443', () => {
  const m = (id: string) => out(id);
  it('K443: planDeal takes flight and stagger timing; defaults unchanged', () => {
    const p = planDeal([m('a'), m('b')], { dealMs: 680, staggerMs: 190 });
    expect(p.timed.map((x) => x.delay)).toEqual([0, 190]);
    expect(p.timed[0]!.ms).toBe(680);
    expect(planDeal([m('a'), m('b')], { dealMs: 680, staggerMs: 190, speed: 0 }).timed).toEqual([]);
    expect(planDeal([m('a'), m('b')]).timed.map((x) => x.delay)).toEqual([0, STAGGER_MS]);
  });
  it('K443: flipFrames takes a lift curve and peak', () => {
    const f = flipFrames({ x: 0, y: 0, sx: 1, sy: 1 }, { lift: 1.07, start: 0, end: 1, liftCurve: (u) => 1 - Math.abs(2 * u - 1) });
    expect(String(f.first.find((k) => k.offset === 0.25)!.transform)).toContain('scale(1.035)');
    expect(String(f.first.find((k) => k.offset === 0.5)!.transform)).toContain('scale(1.07)');
  });
  it('K443: flipFrames starts from a tilt and ends at a resting turn', () => {
    const f = flipFrames({ x: 10, y: 0, sx: 0.9, sy: 0.9, rot: 8, rest: -3 });
    expect(String(f.first[0]!.transform)).toContain('rotate(8deg)');
    expect(String(f.second.at(-1)!.transform)).toContain('rotate(-3deg)');
    expect(String(flipFrames({ x: 10, y: 0, sx: 1, sy: 1 }).first[0]!.transform)).not.toContain('rotate(');
  });
});

describe('K445 flipFrames resize box', () => {
  const box = { from: { left: 100, top: 50, width: 80, height: 112 }, to: { left: 400, top: 300, width: 200, height: 280 } };
  const f = flipFrames({ x: 0, y: 0, sx: 1, sy: 1 }, { box });
  const px = (k: Keyframe, key: string) => Number(String((k as Record<string, unknown>)[key]).replace('px', ''));
  const deg = (k: Keyframe) => Number(/rotateY\((-?[\d.]+)deg\)/.exec(String(k.transform))?.[1]);
  it('K445: both sides animate one box from the pile size to the fan size, no jump', () => {
    expect(f.first.map((k) => k.offset)).toEqual(f.second.map((k) => k.offset));
    f.first.forEach((k, i) => { for (const key of ['left', 'top', 'width', 'height']) expect(px(k, key)).toBe(px(f.second[i]!, key)); });
    expect([px(f.first[0]!, 'width'), px(f.first[0]!, 'height'), px(f.first[0]!, 'left')]).toEqual([80, 112, 100]);
    expect([px(f.second.at(-1)!, 'width'), px(f.second.at(-1)!, 'height'), px(f.second.at(-1)!, 'top')]).toEqual([200, 280, 300]);
    expect(px(f.first.find((k) => k.offset === 0.5)!, 'width')).toBe(140);
  });
  it("K445: the swap is exactly edge-on, the perspective is the parent's (4x the start height), none in the transform", () => {
    const i = f.first.findIndex((k) => k.opacity === 0);
    expect(deg(f.first[i - 1]!)).toBe(90);
    expect(deg(f.second[i]!)).toBe(-90);
    expect(f.first[i - 1]!.offset).toBe(0.5);
    expect(f.perspective).toBe(448);
    for (const k of [...f.first, ...f.second]) expect(String(k.transform)).not.toContain('perspective(');
    expect(deg(f.first[0]!)).toBe(0);
    expect(deg(f.second.at(-1)!)).toBe(0);
  });
  it('K445: defaults unchanged without a box', () => {
    const d = flipFrames({ x: 3, y: 4, sx: 1, sy: 1 });
    expect(d.perspective).toBe(800);
    expect(String(d.first[0]!.transform)).toContain('perspective(800px)');
    expect(d.first[0]).not.toHaveProperty('left');
  });
});
