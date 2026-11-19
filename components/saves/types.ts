// K419: the save types over what a game must have (engine-core's PortTypes); `options`, `rules` and `action` default to what an engine port saves.
import type { PortAnswer, PortTypes } from '../engine-core/index.ts';

export type OptionsOf<G extends PortTypes> = G extends { readonly options: infer O } ? O : { readonly seed: string };
export type RulesOf<G extends PortTypes> = G extends { readonly rules: infer R } ? R : unknown;
export type ActionOf<G extends PortTypes> = G extends { readonly action: infer A } ? A : PortAnswer;
export interface SaveOf<G extends PortTypes> {
  readonly version: number;
  readonly appCommit: string;
  readonly contentHash: string;
  readonly options: OptionsOf<G>;
  readonly rules: RulesOf<G>;
  readonly actions: readonly ActionOf<G>[];
  readonly finalHash: string;
  readonly undoUsed: boolean;
  readonly savedAt: string;
}
export interface HistoryOf<G extends PortTypes> {
  readonly options: OptionsOf<G>;
  readonly rules: RulesOf<G>;
  readonly actions: readonly ActionOf<G>[];
  readonly cursor: number;
  readonly undoUsed: boolean;
}
export type RestoreOf<G extends PortTypes> = { readonly ok: true; readonly save: SaveOf<G>; readonly state: G['state'] } | { readonly ok: false; readonly error: string };
