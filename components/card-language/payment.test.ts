import { describe, expect, it } from 'vitest';
import { paymentPlans, preferredPayment } from './index.ts';

describe('K590 payment plans', () => {
  it('returns all incomparable minimal ways, without change', () => {
    const plans = paymentPlans({ pool: { gold: 3, wild: 2 }, cost: { gold: 3 }, rates: [{ from: 'wild', to: 'gold', spend: 1, cover: 2 }] });
    expect(plans.map(p => p.spent)).toEqual([{ wild: 2 }, { gold: 1, wild: 1 }, { gold: 3 }]);
    expect(plans[0]?.remaining).toEqual({ gold: 3, wild: 0 });
  });
  it('cannot spend the same resource twice on different requirements', () => {
    const rates = [{ from: 'wild', to: 'a', spend: 1, cover: 1 }, { from: 'wild', to: 'b', spend: 1, cover: 1 }];
    expect(paymentPlans({ pool: { wild: 1 }, cost: { a: 1, b: 1 }, rates })).toEqual([]);
    expect(paymentPlans({ pool: { wild: 2 }, cost: { a: 1, b: 1 }, rates }).map(p => p.spent)).toEqual([{ wild: 2 }]);
  });
  it('keeps required holdings after spending and supports exchange batches', () => {
    const rates = [{ from: 'silver', to: 'gold', spend: 2, cover: 1 }];
    expect(paymentPlans({ pool: { silver: 5 }, cost: { gold: 2 }, rates, have: { silver: 2 } })).toEqual([]);
    expect(paymentPlans({ pool: { silver: 5 }, cost: { gold: 2 }, rates, have: { silver: 1 } })[0]?.remaining.silver).toBe(1);
  });
  it('does not chain rates, or credit a resource for excess payment', () => {
    const rates = [{ from: 'a', to: 'b', spend: 1, cover: 2 }, { from: 'b', to: 'c', spend: 1, cover: 1 }];
    expect(paymentPlans({ pool: { a: 1 }, cost: { c: 1 }, rates })).toEqual([]);
    expect(paymentPlans({ pool: { a: 1 }, cost: { b: 1, c: 1 }, rates })).toEqual([]);
  });
  it('returns one free plan for a zero cost and none if holdings are impossible', () => {
    expect(paymentPlans({ pool: { a: 2 }, cost: {} })).toEqual([{ spent: {}, remaining: { a: 2 } }]);
    expect(paymentPlans({ pool: { a: 2 }, cost: {}, have: { a: 3 } })).toEqual([]);
  });
  it('fails closed on invalid inputs or a capped search', () => {
    expect(() => paymentPlans({ pool: { a: -1 }, cost: {} })).toThrow('invalid pool');
    expect(() => paymentPlans({ pool: { a: 3 }, cost: { a: 1 }, maxNodes: 1 })).toThrow('maxNodes');
    expect(() => paymentPlans({ pool: {}, cost: {}, rates: [{ from: 'a', to: 'b', spend: 0, cover: 1 }] })).toThrow('invalid substitution');
  });
  it('applies an explicit preference without silently assuming resource values', () => {
    const plans = paymentPlans({ pool: { gold: 1, wild: 1 }, cost: { gold: 1 }, rates: [{ from: 'wild', to: 'gold', spend: 1, cover: 1 }] });
    expect(preferredPayment(plans, p => p.remaining.wild ?? 0)?.spent).toEqual({ gold: 1 });
    expect(preferredPayment([], () => 1)).toBeUndefined();
    expect(() => preferredPayment(plans, () => NaN)).toThrow('finite');
  });
});
