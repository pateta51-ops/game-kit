import { describe, expect, it } from 'vitest';
import { chance, outcomes } from './index.ts';

describe('dice-odds', () => {
  it('multisets of 3d6 are 56 and weights sum to 1', () => {
    const o = outcomes(3);
    expect(o.length).toBe(56);
    expect(o.reduce((a, b) => a + b.p, 0)).toBeCloseTo(1, 12);
  });
  it('weights are multinomial', () => {
    expect(chance(2, (d) => d[0] === 1 && d[1] === 2)).toBeCloseTo(2 / 36, 12);
    expect(chance(3, (d) => d.every((x) => x === 4))).toBeCloseTo(1 / 216, 12);
  });
  it('at least one six on 3d6', () => {
    expect(chance(3, (d) => d.includes(6))).toBeCloseTo(1 - (5 / 6) ** 3, 12);
  });
  it('extra die of another size', () => {
    const o = outcomes(2, { extraSides: 4 });
    expect(o.length).toBe(21 * 4);
    expect(chance(2, (d, e) => d[0] === 6 && d[1] === 6 && e === 4, { extraSides: 4 })).toBeCloseTo(1 / 144, 12);
  });
  it('zero dice and caching', () => {
    expect(chance(0, () => true)).toBeCloseTo(1, 12);
    expect(outcomes(3)).toBe(outcomes(3));
  });
});
