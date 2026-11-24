import { draftOf, IllegalActionError, seedRng, type AnswerAction, type GameRules, type KernelPrompt, type KernelState } from '../../engine-core/index.ts';
import { paymentPlans, preferredPayment, type Amounts, type PaymentInput, type PaymentPlan } from '../index.ts';

interface Offer extends KernelPrompt {
  readonly options: readonly (KernelPrompt['options'][number] & { readonly plan: PaymentPlan })[];
}

interface ShopState extends KernelState {
  readonly pool: Amounts;
  readonly prompt: Offer | null;
}

interface Shop {
  readonly state: ShopState;
  readonly action: AnswerAction;
  readonly task: { readonly kind: string; readonly answer?: readonly string[] };
  readonly prompt: Offer;
  readonly event: ShopState['log'][number];
  readonly stamped: never;
  readonly options: { readonly seed: string; readonly pool: Amounts };
  readonly rules: Record<string, never>;
  readonly content: null;
}

type Limits = Pick<PaymentInput, 'maxNodes' | 'maxDominanceChecks'>;

function plansFor(pool: Amounts, limits: Limits = {}): PaymentPlan[] {
  return paymentPlans({
    pool,
    cost: { gold: 3 },
    have: { gold: 2 },
    rates: [{ from: 'wild', to: 'gold', spend: 1, cover: 2 }],
    ...limits,
  });
}

// The option ID identifies the spending vector. The prompt's remaining balances are display data.
const planId = (plan: PaymentPlan): string => JSON.stringify(Object.entries(plan.spent).sort());

export function preferredPaymentAnswer(
  publicPool: Amounts,
  legalAnswers: readonly AnswerAction[],
  limits?: Limits,
): AnswerAction | undefined {
  if (legalAnswers.length === 0) return undefined;
  const byPlan = new Map(legalAnswers.filter(answer => answer.picks.length === 1).map(answer => [answer.picks[0], answer]));
  const legalPlans = plansFor(publicPool, limits).filter(plan => byPlan.has(planId(plan)));
  const preferred = preferredPayment(legalPlans, plan => plan.remaining.wild ?? 0);
  return preferred && byPlan.get(planId(preferred));
}

export function makePaymentGame(limits: Limits = {}): GameRules<Shop> {
  return {
    blank({ seed, pool }) {
      const [a, b, c, d] = seedRng(seed);
      return {
        rng: { a, b, c, d }, seq: 0, promptSeq: 0, stack: [], prompt: null, log: [], result: null,
        pool: { ...pool },
      };
    },
    contentHash: () => 'shop-payment',
    setup(ctx) { ctx.then({ kind: 'quote' }); },
    handlers: {
      quote(ctx) {
        const plans = plansFor(ctx.s.pool, limits);
        if (plans.length === 0) {
          draftOf(ctx).result = 'unaffordable';
          return;
        }
        ctx.ask({
          min: 1,
          max: 1,
          options: plans.map(plan => ({ id: planId(plan), enabled: true, plan })),
        }, { kind: 'purchase' });
      },
      purchase(ctx, task) {
        const chosen = plansFor(ctx.s.pool, limits).find(plan => planId(plan) === task.answer?.[0]);
        if (!chosen) throw new IllegalActionError('payment is no longer legal');
        const state = draftOf(ctx);
        state.pool = { ...chosen.remaining };
        state.result = 'bought';
      },
    },
  };
}
