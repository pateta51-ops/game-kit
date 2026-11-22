// A tiny fake game for the timing tests (K93, K111): player p1 hits; the hit is one batch of occurrences (default 3 damage
// to u1, owned by p2) with the kit's windows. Fixture cards: Shield (prevents 2 damage), Ward (prevents all, one use).
import { createGame, draftOf, seedRng, timingHandlers, would, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState, type KernelTask, type OccurrenceInput, type Prevention, type SharedKey, type TimingConfig, type TriggerCandidate } from '../index.ts';

export type TimedEvent =
  | { readonly type: 'damaged'; readonly n: number; readonly target: string; readonly seq: number; readonly batch?: number; readonly occurrence?: number }
  | { readonly type: 'healed'; readonly n: number; readonly seq: number; readonly batch?: number }
  | { readonly type: 'dropped'; readonly ability: string; readonly why: string; readonly seq: number };

export interface TimedRules {
  readonly items: readonly OccurrenceInput[];
  readonly shared?: readonly SharedKey[];
}

export interface TimedState extends KernelState {
  readonly hp: number;
  readonly used: Readonly<Record<string, number>>;
  readonly rules: TimedRules;
  readonly log: readonly TimedEvent[];
  readonly prompt: (KernelPrompt & { readonly player?: string }) | null;
  readonly result: { readonly hp: number } | null;
}

export interface Timed {
  readonly state: TimedState;
  readonly action: AnswerAction;
  readonly task: KernelTask & { readonly occ?: number };
  readonly prompt: KernelPrompt & { readonly player?: string };
  readonly event: TimedEvent;
  readonly stamped: never;
  readonly content: { readonly triggers: Readonly<Record<string, readonly TriggerCandidate[]>>; readonly cards?: Readonly<Record<string, { readonly doubles?: boolean }>> } | null;
  readonly options: { readonly seed: string };
  readonly rules: TimedRules;
}

export const SHIELD: Prevention = { prevents: 'damage', max: 2 };
export const WARD: Prevention = { prevents: 'damage', uses: 1 };
export const HIT: OccurrenceInput = { kind: 'damage', keys: { player: 'p2', source: 'p1', target: 'u1' }, amount: 3 };

export function timedGame(cfg: Partial<TimingConfig<Timed>> = {}, extra: GameRules<Timed>['handlers'] = {}): GameRules<Timed> {
  const full: TimingConfig<Timed> = {
    happen: (ctx, o) => {
      draftOf(ctx).hp -= o.amount ?? 0;
    },
    event: (o) => ({ type: 'damaged', n: o.amount ?? 0, target: o.keys.target ?? '' }),
    prompt: (base, info) => ({ ...base, player: info.player }),
    ...cfg,
  };
  return {
    handlers: {
      ...timingHandlers(full),
      turn: (ctx: Ctx<Timed>) => {
        ctx.then({ kind: 'chosen' });
        ctx.ask({ min: 1, max: 1, options: [{ id: 'hit', enabled: true }], player: 'p1' });
      },
      chosen: (ctx: Ctx<Timed>) => {
        ctx.then({ kind: 'end' });
        would(ctx, ctx.s.rules.items, ctx.s.rules.shared === undefined ? {} : { shared: ctx.s.rules.shared });
      },
      end: (ctx: Ctx<Timed>) => {
        draftOf(ctx).result = { hp: ctx.s.hp };
      },
      heal: (ctx: Ctx<Timed>) => {
        draftOf(ctx).hp += 1;
        ctx.emit({ type: 'healed', n: 1 });
      },
      ...extra,
    },
    blank(options, rules): Draft<TimedState> {
      const [a, b, c, d] = seedRng(options.seed);
      return { rng: { a, b, c, d }, hp: 10, used: {}, rules: rules as Draft<TimedRules>, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
    },
    setup: (ctx) => ctx.then({ kind: 'turn' }),
    contentHash: () => 'timed',
  };
}

export const startTimed = (g: GameRules<Timed>, rules: TimedRules = { items: [HIT] }): TimedState => createGame(g, { seed: 'k93' }, rules, null).state;
export const answer = (s: TimedState, pick: string): AnswerAction => ({ kind: 'answer', promptId: s.prompt?.id ?? -1, picks: [pick] });
