import { describe, expect, it } from 'vitest';
import { paymentPlans, preferredPayment, type Amounts, type PaymentPlan, type PaymentRate } from './index.ts';

const resources = ['a', 'b', 'c'] as const;
type Resource = typeof resources[number];

// Exhaust all allocations by source, including payments above the cost, then remove dominated vectors.
function referencePlans(pool: Record<Resource, number>, cost: Amounts, have: Amounts, rates: readonly PaymentRate[]): PaymentPlan[] {
  if (resources.some(id => (have[id] ?? 0) > pool[id])) return [];
  const routes = resources.flatMap(from => [{ from, to: from, spend: 1, cover: 1 }, ...rates.filter(rate => rate.from === from)]);
  const spent: Record<Resource, number> = { a: 0, b: 0, c: 0 };
  const covered = new Map<string, number>();
  const feasible = new Map<string, typeof spent>();
  function allocate(i: number): void {
    const route = routes[i];
    if (route === undefined) {
      if (Object.entries(cost).every(([id, required]) => (covered.get(id) ?? 0) >= required)) {
        feasible.set(resources.map(id => spent[id]).join(','), { ...spent });
      }
      return;
    }
    const from = route.from as Resource;
    const initial = spent[from], previous = covered.get(route.to) ?? 0;
    const free = pool[from] - (have[from] ?? 0) - initial;
    for (let batches = 0; batches * route.spend <= free; batches++) {
      spent[from] = initial + batches * route.spend;
      covered.set(route.to, previous + batches * route.cover);
      allocate(i + 1);
    }
    spent[from] = initial;
    covered.set(route.to, previous);
  }
  allocate(0);
  const all = [...feasible.values()];
  return all.filter(plan => !all.some(other => other !== plan && resources.every(id => other[id] <= plan[id])))
    .sort((a, b) => a.a - b.a || a.b - b.b || a.c - b.c)
    .map(plan => ({
      spent: Object.fromEntries(resources.filter(id => plan[id] > 0).map(id => [id, plan[id]])),
      remaining: { a: pool.a - plan.a, b: pool.b - plan.b, c: pool.c - plan.c },
    }));
}

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
  it('ignores 20,000 unavailable routes without exhausting the call stack', () => {
    const rates = Array.from({ length: 20_000 }, (_, i) => ({ from: `r${String(i)}`, to: 'a', spend: 1, cover: 1 }));
    expect(paymentPlans({ pool: {}, cost: { a: 1 }, rates, maxNodes: 100_000 })).toEqual([]);
  });
  it('enforces the node limit even with thousands of payable routes', () => {
    const rates = Array.from({ length: 20_000 }, (_, i) => ({ from: `r${String(i)}`, to: 'a', spend: 2, cover: 1 }));
    const pool = Object.fromEntries(rates.map(rate => [rate.from, 2]));
    expect(() => paymentPlans({ pool, cost: { a: 1 }, rates, maxNodes: 15_000 })).toThrow('maxNodes');
  });
  it('validates both limits before returning for impossible retained holdings', () => {
    const input = { pool: { a: 0 }, cost: {}, have: { a: 1 } };
    for (const invalid of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => paymentPlans({ ...input, maxNodes: invalid })).toThrow('invalid maxNodes');
      const dominance = { ...input, maxDominanceChecks: invalid };
      expect(() => paymentPlans(dominance)).toThrow('invalid maxDominanceChecks');
    }
  });
  it('bounds work checking a wide nondominated frontier without returning partial results', () => {
    const rates = Array.from({ length: 32 }, (_, i) => ({ from: `r${String(i).padStart(2, '0')}`, to: 'a', spend: 1, cover: 1 }));
    const pool = Object.fromEntries(rates.map(rate => [rate.from, 1]));
    const input = { pool, cost: { a: 1 }, rates, maxDominanceChecks: 100 };
    expect(() => paymentPlans(input)).toThrow('maxDominanceChecks');
    const complete = { ...input, maxDominanceChecks: 100_000 };
    const plans = paymentPlans(complete);
    expect(plans.map(p => p.spent)).toEqual([...rates].reverse().map(rate => ({ [rate.from]: 1 })));
    expect(paymentPlans({ ...complete, rates: [...rates].reverse() })).toEqual(plans);
    for (const plan of plans) for (const [id, units] of Object.entries(pool)) {
      expect((plan.spent[id] ?? 0) + (plan.remaining[id] ?? 0)).toBe(units);
    }
  });
  it('throws on node exhaustion after discovering a feasible payment', () => {
    const input = { pool: { a: 1, c: 1 }, cost: { a: 1 }, rates: [{ from: 'c', to: 'a', spend: 1, cover: 1 }] };
    expect(() => paymentPlans({ ...input, maxNodes: 6 })).toThrow('maxNodes');
    expect(paymentPlans({ ...input, maxNodes: 7 }).map(plan => plan.spent)).toEqual([{ c: 1 }, { a: 1 }]);
  });
  it('matches all minimal payments in 8,192 exhaustive small-pool cases', () => {
    const tables: PaymentRate[][] = [
      [],
      [{ from: 'c', to: 'a', spend: 1, cover: 1 }, { from: 'c', to: 'b', spend: 1, cover: 1 }],
      [{ from: 'c', to: 'a', spend: 2, cover: 3 }, { from: 'a', to: 'b', spend: 2, cover: 1 }],
      [{ from: 'a', to: 'b', spend: 1, cover: 2 }, { from: 'b', to: 'a', spend: 1, cover: 1 }, { from: 'c', to: 'b', spend: 2, cover: 2 }],
    ];
    const holdings: Amounts[] = [{}, { a: 1, c: 1 }];
    for (let i = 0; i < 64; i++) {
      const pool = { a: i % 4, b: Math.floor(i / 4) % 4, c: Math.floor(i / 16) };
      for (let j = 0; j < 16; j++) {
        const cost = { a: j % 4, b: Math.floor(j / 4) };
        for (const rates of tables) for (const have of holdings) {
          const input = { pool, cost, rates, have };
          expect(paymentPlans(input), JSON.stringify(input)).toEqual(referencePlans(pool, cost, have, rates));
        }
      }
    }
  });
  it('applies an explicit preference without silently assuming resource values', () => {
    const plans = paymentPlans({ pool: { gold: 1, wild: 1 }, cost: { gold: 1 }, rates: [{ from: 'wild', to: 'gold', spend: 1, cover: 1 }] });
    expect(preferredPayment(plans, p => p.remaining.wild ?? 0)?.spent).toEqual({ gold: 1 });
    expect(preferredPayment([], () => 1)).toBeUndefined();
    expect(() => preferredPayment(plans, () => NaN)).toThrow('finite');
  });
});
