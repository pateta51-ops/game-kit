// K390: an engine port, for a game that keeps its own engine: `card-harness` Scenario and `tutorial` run it instead of
// a `GameRules`. `kernelPort` turns an engine-core game into one (the two paths give the same results).
import { advance, applyAction, createGame } from './apply.ts';
import type { Draft } from './draft.ts';
import type { GameRules, GameTypes, InvariantViolation } from './types.ts';

export interface PortOption {
  readonly id: string;
  readonly enabled: boolean;
  readonly why?: string;
}
export interface PortPrompt {
  readonly id: number | string;
  readonly options: readonly PortOption[];
}
export interface PortAnswer {
  readonly kind: 'answer';
  readonly promptId: number | string;
  readonly picks: readonly string[];
}
/** The types of a game behind a port; any engine-core `GameTypes` is one. */
export interface PortTypes {
  readonly state: unknown;
  readonly prompt: PortPrompt;
  readonly event: unknown;
  readonly task: unknown;
  readonly content: unknown;
}

/** What a game with its own engine passes in. `W`: where `put` places a card. */
export interface EnginePort<G extends PortTypes, W = never> {
  readonly content: G['content'];
  /** A new game (the tutorial passes its seed; a scenario none). */
  start(seed?: string): G['state'];
  /** Answer the open prompt; an `Error` (or a throw) when the rules refuse. The kit calls `settle` after. */
  apply(s: G['state'], answer: PortAnswer): G['state'] | Error;
  /** Run the game's tasks until a prompt opens or the game ends. */
  settle(s: G['state']): G['state'];
  /** The open prompt, its options normalised (`enabled`, `why`), or null. */
  prompt(s: G['state']): G['prompt'] | null;
  /** Every event so far, in order: the kit takes the ones past the previous state's count as a step's events. */
  events(s: G['state']): readonly G['event'][];
  /** The result once the game is over; null or undefined while it runs. */
  result?(s: G['state']): unknown;
  invariants?(s: G['state'], content: G['content']): readonly InvariantViolation[];
  /** The enabled option ids of the open prompt (default: from `prompt`). */
  options?(s: G['state']): readonly string[];
  /** Put a new instance of `card` at `where` in `s`; its instance id (Scenario `put`). */
  put?(s: Draft<G['state']>, card: string, where: W): string;
  /** Put `tasks` on `s` to run next, the first first (Scenario `run`). */
  push?(s: Draft<G['state']>, tasks: readonly G['task'][]): void;
}

export interface PortStep<G extends PortTypes> {
  readonly state: G['state'];
  readonly events: readonly G['event'][];
}

type AnyPort<G extends PortTypes> = EnginePort<G, never>;

const after = <G extends PortTypes>(port: AnyPort<G>, before: G['state'], state: G['state']): PortStep<G> => ({
  state,
  events: port.events(state).slice(port.events(before).length),
});

/** `settle` with its events. */
export const portSettle = <G extends PortTypes>(port: AnyPort<G>, s: G['state']): PortStep<G> => after(port, s, port.settle(s));

/** `apply` then `settle`, with the events of both; throws when the rules refuse. */
export function portAnswer<G extends PortTypes>(port: AnyPort<G>, s: G['state'], answer: PortAnswer): PortStep<G> {
  const r = port.apply(s, answer);
  if (r instanceof Error) throw r;
  return after(port, s, port.settle(r));
}

export const portOptions = <G extends PortTypes>(port: AnyPort<G>, s: G['state']): readonly string[] =>
  port.options?.(s) ?? (port.prompt(s)?.options ?? []).filter((o) => o.enabled).map((o) => o.id);

export const portResult = <G extends PortTypes>(port: AnyPort<G>, s: G['state']): unknown => port.result?.(s) ?? null;

/** An engine-core game as a port (its events read from `state.log`, so at most `LOG_CAP` per game). */
export function kernelPort<G extends GameTypes, W = never>(
  rules: GameRules<G>,
  content: G['content'],
  o: { start?: () => G['state']; options?: (seed: string) => G['options']; gameRules?: G['rules']; put?: (s: Draft<G['state']>, card: string, where: W) => string } = {},
): EnginePort<G, W> {
  return {
    content,
    start: (seed = '') => o.start?.() ?? createGame(rules, o.options?.(seed) ?? ({ seed }), o.gameRules, content).state,
    apply: (s, a) => applyAction(rules, s, a as G['action'], content).state,
    settle: (s) => (s.stack.length === 0 ? s : advance(rules, s, content).state),
    prompt: (s) => s.prompt,
    events: (s) => s.log,
    result: (s) => s.result,
    invariants: (s, c) => rules.invariants?.(s, c, []) ?? [],
    push: (s, tasks) => {
      for (let i = tasks.length - 1; i >= 0; i -= 1) (s.stack as unknown[]).push(structuredClone(tasks[i]));
    },
    ...(o.put === undefined ? {} : { put: o.put }),
  };
}
