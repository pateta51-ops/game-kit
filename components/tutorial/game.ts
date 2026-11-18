// What a game gives the tutorial: its `GameRules`, content and options from a seed, and how to read its prompts.
// K390: or, for a game with its own engine, an engine port with the same reading hooks (`TutorialPort`).
import { applyAction, createGame, portAnswer, portResult, type AnswerAction, type EnginePort, type GameRules, type GameTypes, type PortAnswer, type PortPrompt, type PortTypes } from '../engine-core/index.ts';

export interface TutorialHooks<S, E> {
  /** Is the open prompt the player's (default: every prompt is)? */
  human?(state: S): boolean;
  /** The kind of the open prompt, matched against a move step's `prompt`. */
  promptKind?(state: S): string;
  /** The option id a script ref names in the open prompt (default: the ref is an option id), or undefined. */
  findOption?(state: S, ref: string): string | undefined;
  /** Does the open prompt's answer keep its order (default: no, picks are a multiset)? */
  ordered?(state: S): boolean;
  /** An option's words for "The tutorial asks for …" (default: its id). */
  optionWords?(state: S, id: string): string;
  /** An event in words, for failures (default: JSON). */
  eventWords?(state: S, event: E): string;
  /** Does an event's value match the script's (default: equal)? E.g. a card instance against its definition id. */
  same?(state: S, want: unknown, actual: unknown): boolean;
}

export interface TutorialGame<G extends GameTypes> extends TutorialHooks<G['state'], G['event']> {
  readonly rules: GameRules<G>;
  readonly content: G['content'];
  readonly gameRules: G['rules'];
  /** The game's options for a seed (the script's, or one being tried). */
  options(seed: string): G['options'];
}

/** K390: a game with its own engine; `start(seed)` is the new game on the script's seed. */
export interface TutorialPort<G extends PortTypes> extends EnginePort<G>, TutorialHooks<G['state'], G['event']> {}

export type TutorialEngine<G extends PortTypes> = TutorialGame<G & GameTypes> | TutorialPort<G>;

export type TutorialAction<G extends PortTypes> = G extends GameTypes ? AnswerAction : PortAnswer;

export interface Drive<G extends PortTypes> {
  start(seed: string): G['state'];
  answer(s: G['state'], a: PortAnswer): { readonly state: G['state']; readonly events: readonly G['event'][] };
  prompt(s: G['state']): PortPrompt | null;
  result(s: G['state']): unknown;
  readonly hooks: TutorialHooks<G['state'], G['event']>;
}

type K = GameTypes['state'];
export function drive<G extends PortTypes>(game: TutorialEngine<G>): Drive<G> {
  const hooks = game as TutorialHooks<G['state'], G['event']>;
  if ('rules' in game)
    return {
      start: (seed) => createGame(game.rules, game.options(seed), game.gameRules, game.content).state,
      answer: (s, a) => applyAction(game.rules, s as G['state'] & K, a as AnswerAction, game.content),
      prompt: (s) => (s as K).prompt,
      result: (s) => (s as K).result,
      hooks,
    };
  const port = game;
  return { start: (seed) => port.settle(port.start(seed)), answer: (s, a) => portAnswer(port, s, a), prompt: (s) => port.prompt(s), result: (s) => portResult(port, s), hooks };
}
