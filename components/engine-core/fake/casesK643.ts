// K643: a fake game of named counters for the replacement, prevention and window cases: player p1 answers "go", the
// rules' items become one batch, then the after-window opens and the game ends. What an occurrence does is the test's.
import { createGame, draftOf, seedRng, timingHandlers, would, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState, type KernelTask, type OccurrenceInput, type TimingConfig } from '../index.ts';

export interface CaseEvent {
  readonly type: 'did';
  readonly kind: string;
  readonly n: number;
  readonly seq: number;
  readonly batch?: number;
  readonly occurrence?: number;
}
export interface CaseRules {
  readonly items: readonly OccurrenceInput[];
  readonly n?: Readonly<Record<string, number>>;
}
export interface CaseState extends KernelState {
  readonly n: Readonly<Record<string, number>>;
  readonly rules: CaseRules;
  readonly log: readonly CaseEvent[];
  readonly prompt: KernelPrompt | null;
  readonly result: { readonly done: true } | null;
}
export interface Cases {
  readonly state: CaseState;
  readonly action: AnswerAction;
  readonly task: KernelTask & { readonly occ?: number };
  readonly prompt: KernelPrompt;
  readonly event: CaseEvent;
  readonly stamped: never;
  readonly content: null;
  readonly options: { readonly seed: string };
  readonly rules: CaseRules;
}

export function add(ctx: Ctx<Cases>, key: string, by = 1): void {
  const s = draftOf(ctx);
  s.n = { ...s.n, [key]: (s.n[key] ?? 0) + by };
}

export function caseGame(cfg: TimingConfig<Cases>, extra: GameRules<Cases>['handlers'] = {}): GameRules<Cases> {
  return {
    handlers: {
      ...timingHandlers({ event: (o) => ({ type: 'did', kind: o.kind, n: o.amount ?? 1 }), ...cfg }),
      turn: (ctx: Ctx<Cases>) => {
        ctx.ask({ min: 1, max: 1, options: [{ id: 'go', enabled: true }], seat: 'p1' }, { kind: 'chosen' });
      },
      chosen: (ctx: Ctx<Cases>) => {
        ctx.then({ kind: 'timing.triggers' }, { kind: 'end' });
        would(ctx, ctx.s.rules.items);
      },
      end: (ctx: Ctx<Cases>) => {
        draftOf(ctx).result = { done: true };
      },
      ...extra,
    },
    blank(options, rules): Draft<CaseState> {
      const [a, b, c, d] = seedRng(options.seed);
      return { rng: { a, b, c, d }, n: { ...rules.n }, rules: rules as Draft<CaseRules>, stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
    },
    setup: (ctx) => ctx.then({ kind: 'turn' }),
    contentHash: () => 'k643',
  };
}

export const startCases = (g: GameRules<Cases>, rules: CaseRules): CaseState => createGame(g, { seed: 'k643' }, rules, null).state;
export const answer = (s: CaseState, pick: string): AnswerAction => ({ kind: 'answer', promptId: s.prompt?.id ?? -1, picks: [pick] });
