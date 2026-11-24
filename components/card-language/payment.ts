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
  /** Maximum visited search positions, including the root. Defaults to 100,000. */
  readonly maxNodes?: number;
  /** Maximum per-resource dominance comparisons. Defaults to 1,000,000. */
  readonly maxDominanceChecks?: number;
}
export interface PaymentPlan {
  readonly spent: Amounts;
  readonly remaining: Amounts;
}
interface RouteChoice {
  readonly target: number;
  readonly route: number;
  readonly rate: PaymentRate;
  readonly available: number;
  readonly needed: number;
  readonly batchesNeeded: number;
  readonly maxBatches: number;
  nextBatches: number;
}
const whole = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;
function amountMap(input: Amounts, label: string): Map<string, number> {
  const entries = Object.entries(input);
  for (const [k, n] of entries) if (!k.trim() || !whole(n)) throw new Error('invalid ' + label + ' amount for ' + k);
  return new Map(entries);
}

/** All distinct componentwise-minimal feasible spending vectors. No transitive substitutions or change. */
export function paymentPlans(input: PaymentInput): PaymentPlan[] {
  const { maxNodes = 100_000, maxDominanceChecks = 1_000_000 } = input;
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1) throw new Error('invalid maxNodes');
  if (!Number.isSafeInteger(maxDominanceChecks) || maxDominanceChecks < 1) throw new Error('invalid maxDominanceChecks');
  const pool = amountMap(input.pool, 'pool');
  const cost = amountMap(input.cost, 'cost');
  const have = amountMap(input.have ?? {}, 'have');
  const resources = [...new Set([...pool.keys(), ...cost.keys(), ...have.keys()])].sort();
  const targets = [...cost.keys()].filter(k => (cost.get(k) ?? 0) > 0).sort();
  const spendable = new Map(resources.map(id => [id, (pool.get(id) ?? 0) - (have.get(id) ?? 0)]));
  const routes = new Map<string, PaymentRate[]>(targets.map(to => [to, (spendable.get(to) ?? 0) > 0 ? [{ from: to, to, spend: 1, cover: 1 }] : []]));
  const pairs = new Map<string, Set<string>>();
  for (const rate of input.rates ?? []) {
    if (!rate.from.trim() || !rate.to.trim() || rate.from === rate.to || !whole(rate.spend) || !whole(rate.cover) || rate.spend === 0 || rate.cover === 0) throw new Error('invalid substitution rate');
    const set = pairs.get(rate.from) ?? new Set<string>();
    if (set.has(rate.to)) throw new Error('duplicate substitution rate: ' + rate.from + ' -> ' + rate.to);
    set.add(rate.to);
    pairs.set(rate.from, set);
    if ((spendable.get(rate.from) ?? 0) >= rate.spend) routes.get(rate.to)?.push(rate);
  }
  for (const n of spendable.values()) if (n < 0) return [];
  const remaining = new Map(spendable);
  let nodes = 0;
  let dominanceChecks = 0;
  const results: number[][] = [];
  const dominates = (a: readonly number[], b: readonly number[]): boolean => a.every((n, i) => {
    if (++dominanceChecks > maxDominanceChecks) throw new Error('payment search exceeded maxDominanceChecks; increase the cap or constrain the pool');
    return n <= (b[i] ?? 0);
  });
  const save = (): void => {
    const spend = resources.map(id => (spendable.get(id) ?? 0) - (remaining.get(id) ?? 0));
    if (results.some(r => dominates(r, spend))) return;
    let kept = 0;
    for (const plan of results) if (!dominates(spend, plan)) results[kept++] = plan;
    results.length = kept;
    results.push(spend);
  };
  const costAt = (i: number): number => cost.get(targets[i] ?? '') ?? 0;
  const stack: RouteChoice[] = [];
  let targetIndex = 0, routeIndex = 0, needed = costAt(0);
  for (;;) {
    if (++nodes > maxNodes) throw new Error('payment search exceeded maxNodes; increase the cap or constrain the pool');
    if (targetIndex >= targets.length) save();
    else if (needed === 0) {
      needed = costAt(++targetIndex);
      routeIndex = 0;
      continue;
    } else {
      const rate = routes.get(targets[targetIndex] ?? '')?.[routeIndex];
      if (rate !== undefined) {
        const available = remaining.get(rate.from) ?? 0;
        const batchesNeeded = Math.ceil(needed / rate.cover);
        stack.push({ target: targetIndex, route: routeIndex, rate, available, needed, batchesNeeded,
          maxBatches: Math.min(Math.floor(available / rate.spend), batchesNeeded), nextBatches: 0 });
      }
    }

    // Backtrack to the next untried batch count, restoring each exhausted choice.
    let choice = stack.at(-1);
    while (choice !== undefined && choice.nextBatches > choice.maxBatches) {
      remaining.set(choice.rate.from, choice.available);
      stack.pop();
      choice = stack.at(-1);
    }
    if (choice === undefined) break;
    const batches = choice.nextBatches++;
    remaining.set(choice.rate.from, choice.available - batches * choice.rate.spend);
    targetIndex = choice.target;
    routeIndex = choice.route + 1;
    needed = batches === choice.batchesNeeded ? 0 : choice.needed - batches * choice.rate.cover;
  }
  results.sort((a,b) => {
    // Compare per-resource counts deterministically without unsafe integer sums.
    for (let i=0; i<a.length; i++) {
      const x=a[i] ?? 0, y=b[i] ?? 0;
      if (x!==y) return x<y ? -1 : 1;
    }
    return 0;
  });
  return results.map(spend => ({
    spent: Object.fromEntries(resources.flatMap((id, i) => (spend[i] ?? 0) > 0 ? [[id, spend[i] ?? 0] as const] : [])),
    remaining: Object.fromEntries(resources.map((id,i) => [id, (pool.get(id) ?? 0) - (spend[i] ?? 0)] as const)),
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
