// What a game gives the tutorial: its `GameRules`, content and options from a seed, and how to read its prompts.
import type { GameRules, GameTypes } from '../engine-core';

export interface TutorialGame<G extends GameTypes> {
  readonly rules: GameRules<G>;
  readonly content: G['content'];
  readonly gameRules: G['rules'];
  /** The game's options for a seed (the script's, or one being tried). */
  options(seed: string): G['options'];
  /** Is the open prompt the player's (default: every prompt is)? */
  human?(state: G['state']): boolean;
  /** The kind of the open prompt, matched against a move step's `prompt`. */
  promptKind?(state: G['state']): string;
  /** The option id a script ref names in the open prompt (default: the ref is an option id), or undefined. */
  findOption?(state: G['state'], ref: string): string | undefined;
  /** Does the open prompt's answer keep its order (default: no, picks are a multiset)? */
  ordered?(state: G['state']): boolean;
  /** An option's words for "The tutorial asks for …" (default: its id). */
  optionWords?(state: G['state'], id: string): string;
  /** An event in words, for failures (default: JSON). */
  eventWords?(state: G['state'], event: G['event']): string;
  /** Does an event's value match the script's (default: equal)? E.g. a card instance against its definition id. */
  same?(state: G['state'], want: unknown, actual: unknown): boolean;
}

