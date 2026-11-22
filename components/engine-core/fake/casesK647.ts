// K647: a fake game of counters and zones for the lasting-effect, number and state-check cases: player p1 answers "go",
// the test's `play` handler runs, then the game ends. Every card, zone and word here is made up.
import { createGame, draftOf, seedRng, timingHandlers, type AnswerAction, type Ctx, type Draft, type GameRules, type KernelPrompt, type KernelState, type KernelTask, type TimingConfig } from '../index.ts';

export interface PlayEvent {
  readonly type: 'said' | 'did';
  readonly text: string;
  readonly seq: number;
  readonly reveal?: boolean;
  readonly batch?: number;
  readonly occurrence?: number;
}
export interface PlayRules {
  readonly n?: Readonly<Record<string, number>>;
  readonly z?: Readonly<Record<string, readonly string[]>>;
}
export interface PlayState extends KernelState {
  readonly n: Readonly<Record<string, number>>;
  readonly z: Readonly<Record<string, readonly string[]>>;
  readonly log: readonly PlayEvent[];
  readonly prompt: KernelPrompt | null;
  readonly result: { readonly done: true } | { readonly ended: string } | null;
}
export interface Play {
  readonly state: PlayState;
  readonly action: AnswerAction;
  readonly task: KernelTask & { readonly occ?: number; readonly id?: string };
  readonly prompt: KernelPrompt;
  readonly event: PlayEvent;
  readonly stamped: never;
  readonly content: null;
  readonly options: { readonly seed: string };
  readonly rules: PlayRules;
}

export function add(ctx: Ctx<Play>, key: string, by = 1): void {
  const s = draftOf(ctx);
  s.n = { ...s.n, [key]: (s.n[key] ?? 0) + by };
}
/** Move a card: out of every zone, onto the end of `to`. */
export function put(ctx: Ctx<Play>, card: string, to: string): void {
  const s = draftOf(ctx);
  const z = Object.fromEntries(Object.entries(s.z).map(([k, v]) => [k, v.filter((x) => x !== card)]));
  s.z = { ...z, [to]: [...(z[to] ?? []), card] };
}
export const say = (ctx: Ctx<Play>, text: string): void => ctx.emit({ type: 'said', text });
export const said = (s: PlayState): string[] => s.log.filter((e) => e.type === 'said').map((e) => e.text);
export const zoneOf = (s: PlayState, card: string): string | undefined => Object.keys(s.z).find((k) => s.z[k]?.includes(card));
export const pickOne = (kind: string, ids: readonly string[]): Omit<KernelPrompt, 'id'> => ({ kind, seat: 'p1', min: 1, max: 1, options: ids.map((id) => ({ id, enabled: true })) });

export function playGame(cfg: Partial<TimingConfig<Play>>, handlers: GameRules<Play>['handlers']): GameRules<Play> {
  return {
    handlers: {
      ...timingHandlers({ happen: () => undefined, ...cfg }),
      turn: (ctx: Ctx<Play>) => {
        ctx.then({ kind: 'end' });
        ctx.ask(pickOne('turn', ['go']), { kind: 'play' });
      },
      end: (ctx: Ctx<Play>) => {
        draftOf(ctx).result = { done: true };
      },
      ...handlers,
    },
    blank(options, rules): Draft<PlayState> {
      const [a, b, c, d] = seedRng(options.seed);
      return { rng: { a, b, c, d }, n: { ...rules.n }, z: Object.fromEntries(Object.entries(rules.z ?? {}).map(([k, v]) => [k, [...v]])), stack: [], prompt: null, result: null, seq: 1, promptSeq: 1, log: [] };
    },
    setup: (ctx) => ctx.then({ kind: 'turn' }),
    contentHash: () => 'k647',
  };
}

export const startPlay = (g: GameRules<Play>, rules: PlayRules = {}, seed = 'k647'): PlayState => createGame(g, { seed }, rules, null).state;
export const answer = (s: PlayState, ...picks: string[]): AnswerAction => ({ kind: 'answer', promptId: s.prompt?.id ?? -1, picks });
