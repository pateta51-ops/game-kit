// K642: a tiny fake game for restated trigger and queue cases. The one player answers `go`; the test supplies what `go`
// does (`script`), the timing config and extra task handlers. State is counters (`n`), lists and a trace of what ran.
import { applyAction, createGame, draftOf, seedRng, timingHandlers, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState, type KernelTask, type TimingConfig } from '../index.ts';

export interface QEvent { readonly type: string; readonly n?: number; readonly what?: string; readonly seq: number; readonly batch?: number; readonly occurrence?: number }
export interface QSetup {
  readonly n?: Readonly<Record<string, number>>;
  readonly lists?: Readonly<Record<string, readonly string[]>>;
}
export interface QState extends KernelState {
  readonly n: Readonly<Record<string, number>>;
  readonly lists: Readonly<Record<string, readonly string[]>>;
  readonly trace: readonly string[];
  readonly log: readonly QEvent[];
  readonly prompt: KernelPrompt | null;
  readonly result: { readonly done: true } | null;
}
export interface Q {
  readonly state: QState;
  readonly action: AnswerAction;
  readonly task: KernelTask & { readonly occ?: number };
  readonly prompt: KernelPrompt;
  readonly event: QEvent;
  readonly stamped: never;
  readonly content: null;
  readonly options: { readonly seed: string };
  readonly rules: QSetup;
}

export const add = (ctx: Ctx<Q>, key: string, by: number): void => {
  const s = draftOf(ctx);
  s.n = { ...s.n, [key]: (s.n[key] ?? 0) + by };
};
export const note = (ctx: Ctx<Q>, what: string): void => {
  const s = draftOf(ctx);
  s.trace = [...s.trace, what];
};
export const setList = (ctx: Ctx<Q>, key: string, list: readonly string[]): void => {
  const s = draftOf(ctx);
  s.lists = { ...s.lists, [key]: [...list] };
};
export const list = (s: QState, key: string): readonly string[] => s.lists[key] ?? [];
export const num = (s: QState, key: string): number => s.n[key] ?? 0;

export function queueGame(cfg: Partial<TimingConfig<Q>>, script: (ctx: Ctx<Q>) => void, extra: GameRules<Q>['handlers'] = {}): GameRules<Q> {
  return {
    handlers: {
      ...timingHandlers<Q>({ happen: () => undefined, ...cfg }),
      turn: (ctx: Ctx<Q>) => {
        ctx.ask({ min: 1, max: 1, options: [{ id: 'go', enabled: true }] }, { kind: 'go' });
      },
      go: (ctx: Ctx<Q>) => {
        ctx.then({ kind: 'end' });
        script(ctx);
      },
      end: (ctx: Ctx<Q>) => {
        draftOf(ctx).result = { done: true };
      },
      ...extra,
    },
    blank(options, rules): Draft<QState> {
      const [a, b, c, d] = seedRng(options.seed);
      return { rng: { a, b, c, d }, n: { ...rules.n }, lists: Object.fromEntries(Object.entries(rules.lists ?? {}).map(([k, v]) => [k, [...v]])), trace: [], stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
    },
    setup: (ctx) => ctx.then({ kind: 'turn' }),
    contentHash: () => 'k642',
  };
}

export const pick = (g: GameRules<Q>, s: QState, id: string): { state: QState; events: readonly QEvent[] } => applyAction(g, s, { kind: 'answer', promptId: s.prompt?.id ?? -1, picks: [id] }, null);
export const go = (g: GameRules<Q>, setup: QSetup = {}): { state: QState; events: readonly QEvent[] } => pick(g, createGame(g, { seed: 'k642' }, setup, null).state, 'go');
