/** One substitution batch consumes spend units of from and covers cover units of to. Excess is lost. */
export interface PaymentRate {
  readonly from: string;
  readonly to: string;
  readonly spend: number;
  readonly cover: number;
}
export type Amounts = Readonly<Record<string, number>>;
export interface PaymentInput {
  readonly pool: Amounts;
  readonly cost: Amounts;
  readonly rates?: readonly PaymentRate[];
  /** Required unspent holdings, checked after the entire payment. */
  readonly have?: Amounts;
  /** Hard search-node cap; exceeding it throws, never returns an incomplete list. */
  readonly maxNodes?: number;
}
export interface PaymentPlan {
  readonly spent: Amounts;
  readonly remaining: Amounts;
}
const whole = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
function amountMap(input: Amounts, label: string): Map<string, number> {
  const entries = Object.entries(input);
  for (const [k, n] of entries) if (!k.trim() || !whole(n)) throw new Error('invalid ' + label + ' amount for ' + k);
  return new Map(entries);
}

/** All distinct componentwise-minimal feasible spending vectors. No transitive substitutions or change. */
export function paymentPlans(input: PaymentInput): PaymentPlan[] {
  const pool = amountMap(input.pool, 'pool');
  const cost = amountMap(input.cost, 'cost');
  const have = amountMap(input.have ?? {}, 'have');
  const resources = [...new Set([...pool.keys(), ...cost.keys(), ...have.keys()])].sort();
  const targets = [...cost.keys()].filter(k => (cost.get(k) ?? 0) > 0).sort();
  const routes = new Map<string, PaymentRate[]>(targets.map(to => [to, [{ from: to, to, spend: 1, cover: 1 }]]));
  const pairs = new Map<string, Set<string>>();
  for (const rate of input.rates ?? []) {
    if (!rate.from.trim() || !rate.to.trim() || rate.from === rate.to || !whole(rate.spend) || !whole(rate.cover) || rate.spend === 0 || rate.cover === 0) throw new Error('invalid substitution rate');
    const set = pairs.get(rate.from) ?? new Set<string>();
    if (set.has(rate.to)) throw new Error('duplicate substitution rate: ' + rate.from + ' -> ' + rate.to);
    set.add(rate.to);
    pairs.set(rate.from, set);
    routes.get(rate.to)?.push(rate);
  }
  for (const [id, n] of have) if ((pool.get(id) ?? 0) < n) return [];
  const remaining = new Map(resources.map(id => [id, (pool.get(id) ?? 0) - (have.get(id) ?? 0)]));
  const limit = input.maxNodes ?? 100_000;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('invalid maxNodes');
  let nodes = 0;
  const results: number[][] = [];
  const current = (): number[] => resources.map(id => (pool.get(id) ?? 0) - (have.get(id) ?? 0) - (remaining.get(id) ?? 0));
  const dominates = (a: readonly number[], b: readonly number[]): boolean => a.every((n, i) => n <= (b[i] ?? 0));
  const save = (): void => {
    const spend = current();
    if (results.some(r => dominates(r, spend))) return;
    for (let i = results.length - 1; i >= 0; i--) if (dominates(spend, results[i] ?? [])) results.splice(i, 1);
    results.push(spend);
  };
  const tick = (): void => {
    if (++nodes > limit) throw new Error('payment search exceeded maxNodes; increase the cap or constrain the pool');
  };
  const search = (targetIndex: number, routeIndex: number, needed: number): void => {
    tick();
    if (targetIndex >= targets.length) { save(); return; }
    if (needed <= 0) {
      const next = targets[targetIndex + 1];
      search(targetIndex + 1, 0, next === undefined ? 0 : cost.get(next) ?? 0);
      return;
    }
    const to = targets[targetIndex];
    const rate = to === undefined ? undefined : routes.get(to)?.[routeIndex];
    if (!rate) return;
    const available = remaining.get(rate.from) ?? 0;
    const max = Math.min(Math.floor(available / rate.spend), Math.ceil(needed / rate.cover));
    for (let batches = 0; batches <= max; batches++) {
      const paid = batches * rate.spend;
      if (batches > 0) remaining.set(rate.from, available - paid);
      const uncovered = batches >= Math.ceil(needed / rate.cover) ? 0 : needed - batches * rate.cover;
      search(targetIndex, routeIndex + 1, uncovered);
      if (batches > 0) remaining.set(rate.from, available);
    }
  };
  const first = targets[0];
  search(0, 0, first === undefined ? 0 : cost.get(first) ?? 0);
  results.sort((a,b) => {
    // Compare per-resource counts deterministically without unsafe integer sums.
    for (let i=0; i<a.length; i++) {
      const x=a[i] ?? 0, y=b[i] ?? 0;
      if (x!==y) return x<y ? -1 : 1;
    }
    return 0;
  });
  return results.map(spend => ({
    spent: Object.fromEntries(resources.flatMap((id, i) => (spend[i] ?? 0) > 0 ? [[id, spend[i] ?? 0]] : [])),
    remaining: Object.fromEntries(resources.map((id,i) => [id, (pool.get(id) ?? 0) - (spend[i] ?? 0)])),
  }));
}

/** Auto-pay only by explicit game policy. Ties retain the solver's deterministic order. */
export function preferredPayment(plans: readonly PaymentPlan[], score: (plan: PaymentPlan) => number): PaymentPlan | undefined {
  let best: PaymentPlan | undefined;
  let bestScore = -Infinity;
  for (const plan of plans) {
    const value = score(plan);
    if (!Number.isFinite(value)) throw new Error('payment score must be finite');
    if (best === undefined || value > bestScore) { best = plan; bestScore = value; }
  }
  return best;
}
