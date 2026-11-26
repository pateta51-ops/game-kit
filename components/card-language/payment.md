# Pay with substitutable resources

Import `paymentPlans`, `preferredPayment` and their types from [`index.ts`](index.ts). Use this solver when the same resource can pay several requirements and choices must leave specified resources in the pool.

| Public type | Shape |
|---|---|
| `Amounts` | Read-only record of resource ID to nonnegative safe integer |
| `PaymentInput` | `{ pool: Amounts, cost: Amounts, rates?: readonly PaymentRate[], have?: Amounts, maxNodes?: number, maxDominanceChecks?: number }` |
| `PaymentRate` | `{ from: string, to: string, spend: number, cover: number }` |
| `PaymentPlan` | `{ spent: Amounts, remaining: Amounts }` |

Direct payment is 1:1. Each rate batch spends `spend` units of `from` to cover `cover` units of a different resource. Both batch quantities must be positive safe integers. Use at most one rate per ordered pair. Excess coverage is lost and substitutions do not chain. All costs share one pool. `have` reserves quantities **after** the full payment.

`paymentPlans(input)` returns every distinct componentwise-minimal spending vector in ascending lexicographic order by quantities spent in sorted resource ID order. `spent` omits zeros. `remaining` includes every ID in `pool`, `cost` or `have`, including zeros. `preferredPayment(plans, score)` picks the highest score, keeps the first plan on a tie, and returns `undefined` for an empty list. Any nonfinite score throws.

## Rules for agents

1. Use the solver to offer legal plans. Identify options by the amounts spent and use the remaining amounts for display or explicit scoring. The example prefers to keep wild resources.
2. In the action handler, solve the current authoritative cost, pool, rates and retained holdings again. Reject a selected spending vector missing from that result, and refresh choices when the game allows a retry. Commit the fresh remaining resources and effect together. Keep eligibility, card identity, changes in prices, sequential payments and their atomic boundaries in game rules.
3. Use only information visible to the acting player to select from legal answers. The example uses the same solver across prompt, bot preference and commit. Treat `[]` as unaffordable. Surface invalid input or either budget error separately. A budget error carries no partial plans.

| Limit | Default | Counts |
|---|---:|---|
| `maxNodes` | 100,000 | Visited search positions including the root, cost advances, explored dead ends and feasible leaves. Rates unable to pay one batch from the unreserved starting pool are filtered first. |
| `maxDominanceChecks` | 1,000,000 | Per-resource comparisons to reject dominated candidates or remove plans they dominate. A comparison stops at the first resource that disproves dominance. |

Limits must be positive safe integers even for impossible retained holdings. Validation, final sorting and output construction are outside the counters. Exhaustion throws an error naming the limit.

## Executable example

[The shop rules and public preference](examples/payment.ts) buy an item costing 3 gold while retaining 2 gold. Each wild covers up to 2 gold. With 3 gold and 2 wild the prompt offers spending 2 wild, or 1 gold and 1 wild. Preference selects the latter. [The engine tests](payment-example.test.ts) run `createGame`, `enumerateAnswers` and `applyAction` with these rules. They exercise forged and stale answers, changed balances with a still-legal spend, unaffordability, and both budget errors during setup and action resolution.
