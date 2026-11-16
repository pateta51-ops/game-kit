// The shapes the kernel works on. A game declares its own types (extending these) in one `GameTypes` bundle and
// implements `GameRules` over it.
import type { Draft } from './draft.ts';
import type { TimingState } from './timing.ts';

export interface RngWords {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

export interface KernelTask {
  readonly kind: string;
  /** For a resume task: the answer once given. */
  readonly answer?: readonly string[];
  /** K93: the batch this task belongs to (`cancelBatch` removes it). */
  readonly batch?: number;
  /** K222: the id of the prompt whose answer this task resumes (set by `ctx.ask`). */
  readonly prompt?: number;
}

export interface KernelOption {
  readonly id: string;
  readonly enabled: boolean;
  /** Why a disabled option is disabled. */
  readonly why?: string;
  /** K91: legal, but choosing it changes nothing (the game's words why). Not read by `validateAction`; the UI warns, never hides. */
  readonly idle?: string;
  /** K88: a barred option's reason code (the game's, e.g. condition, cannotChoose, cannotPay, noTarget). */
  readonly reason?: string;
  /** K88: for a missing target, what was missing, read when the prompt opened. */
  readonly missing?: string;
  /** K114: good or bad for the chooser, so an automatic answer (`outcomePicks`, a bot) can pick without per-card code. */
  readonly outcome?: 'good' | 'bad';
}

export interface KernelPrompt {
  readonly id: number;
  readonly options: readonly KernelOption[];
  readonly min: number;
  readonly max: number;
  /** K222: what is asked (prompt-host picks the widget by it). */
  readonly kind?: string;
  /** K222: the seat that answers (sim-pool `bySeat`, opponent, learned-opponent and prompt-host read it). */
  readonly seat?: string | number;
}

export interface KernelEvent {
  readonly seq: number;
  /** An action whose events reveal hidden information cannot be undone in Safe mode. */
  readonly reveal?: boolean;
  /** K79: why a number moved (a rule id, or an effect record and its printed line); stamped by `inCause`. */
  readonly cause?: { readonly rule: string } | { readonly effect: string; readonly line: string };
  /** K100: emitted by a debug edit, not by play (a game log skips or marks it). */
  readonly debug?: true;
  /** K93: the batch and occurrence of an event the timing kit emitted when an occurrence happened. */
  readonly batch?: number;
  readonly occurrence?: number;
}

/** K100: a debug edit as an engine action, recorded, replayed and undone like an answer. Kernel verbs: `set`, `force`, `close`; others are the game's `GameRules.debug`. */
export interface DebugAction {
  readonly kind: 'debug';
  readonly verb: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

/** K100: one forced result of the next `ctx.rng.int` (with that name, or any when unnamed). */
export interface ForcedRoll {
  readonly value: number;
  readonly name?: string;
}

/** K100: a game's debug verb. Writes the draft through `own`; returns words to refuse the edit (nothing changes). */
export type DebugHandler<G extends GameTypes> = (ctx: Ctx<G>, args: Readonly<Record<string, unknown>>) => string | undefined;

export interface AnswerAction {
  readonly kind: 'answer';
  readonly promptId: number;
  readonly picks: readonly string[];
  /** Fresh randomness: replaces `state.rng` before the answer resolves. Recorded with the action, so replay is exact. */
  readonly reseed?: RngWords;
}

/** The fields of a state the kernel reads and writes; `result` is null until the game is over. */
export interface KernelState {
  readonly rng: RngWords;
  readonly stack: readonly KernelTask[];
  readonly prompt: KernelPrompt | null;
  readonly result: unknown;
  readonly seq: number;
  readonly promptSeq: number;
  readonly log: readonly KernelEvent[];
  /** K100: results queued by the `force` debug edit; absent when none. */
  readonly forced?: readonly ForcedRoll[];
  /** K93: batches, occurrences and open windows (`timing.md`); absent until the game starts a batch. */
  readonly timing?: TimingState;
}

/** The types of one game. `stamped`: the event fields `GameRules.stamp` fills (never when none). */
export interface GameTypes {
  readonly state: KernelState;
  /** `AnswerAction`, or `AnswerAction | DebugAction` for a game that takes debug edits (K100). */
  readonly action: AnswerAction | DebugAction;
  readonly task: KernelTask;
  readonly prompt: KernelPrompt;
  readonly event: KernelEvent;
  readonly stamped: string;
  readonly content: unknown;
  readonly options: { readonly seed: string };
  readonly rules: unknown;
}

export interface InvariantViolation {
  readonly id: string;
  readonly message: string;
}

export interface ApplyResult<G extends GameTypes> {
  readonly state: G['state'];
  readonly events: readonly G['event'][];
  readonly violations: readonly InvariantViolation[];
}

/** An event as a handler emits it: the context stamps `seq` and the `stamped` fields. */
export type EventInput<G extends GameTypes> = G['event'] extends infer E
  ? E extends unknown
    ? Omit<E, 'seq' | G['stamped']>
    : never
  : never;

/** The random source of a context (sfc32 over `state.rng`). */
export interface CtxRng {
  nextUint32(): number;
  shuffle<T>(xs: readonly T[], name?: string): T[];
  int(max: number, name?: string): number;
}

export interface Ctx<G extends GameTypes> {
  s: G['state']; // the working draft
  readonly content: G['content'];
  readonly rng: CtxRng;
  then(...tasks: readonly G['task'][]): void; // pushed so the first runs first
  /** K222: `resume` is pushed and bound to the prompt; without it the handler must have pushed the resume task first. */
  ask(prompt: Omit<G['prompt'], 'id'>, resume?: G['task']): void;
  emit(event: EventInput<G>): void;
}

export type TaskHandler<G extends GameTypes> = (ctx: Ctx<G>, task: G['task']) => void;

/** One handler per task kind. */
export type HandlerTable<G extends GameTypes> = Readonly<Record<string, TaskHandler<G>>>;

/** What a game gives the kernel. */
export interface GameRules<G extends GameTypes> {
  readonly handlers: HandlerTable<G>;
  /** A new state: rng seeded from `options.seed`, empty stack and log, no prompt, no result. */
  blank(options: G['options'], rules: G['rules'], content: G['content']): Draft<G['state']>;
  /** Schedules (or runs) the setup; `createGame` runs the stack after it. */
  setup?(ctx: Ctx<G>): void;
  /** The hash of the content a game is played with (checked by replay and saves). */
  contentHash(content: G['content']): string;
  /** The fields stamped on every event after `seq`. */
  stamp?(s: G['state']): object;
  /** Checks run after every action while invariant checking is on. */
  invariants?(
    state: G['state'],
    content: G['content'],
    events: readonly G['event'][],
    prev?: G['state'],
  ): readonly InvariantViolation[];
  /** Why a revealing event cannot be undone in Safe mode, in the game's words. */
  revealWords?(event: G['event']): string | undefined;
  /** When set, an action that used `state.rng` (the words changed) bars Safe undo like a reveal, with this reason (boardgame.io's randomness-used flag). */
  randomWords?: string;
  /** K100: opt-in debug edits. Set (even `{}`) to accept `DebugAction`s: the kernel verbs plus these. Unset: refused. */
  readonly debug?: Readonly<Record<string, DebugHandler<G>>>;
  /** K124: derived data read on demand by name (`query`), never stored in the state or the view. */
  readonly queries?: Readonly<Record<string, (state: G['state'], content: G['content'], player?: string, arg?: unknown) => unknown>>;
}
