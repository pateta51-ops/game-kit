// Copy to your engine (e.g. src/engine/verbs.ts), point the imports at kit/card-language and kit/engine-core, set G to
// your GameTypes bundle and replace the placeholder verb. One union member and one table row per verb.
import type { GameTypes } from '../../engine-core/index.ts';
import { str, verbHandler, type VerbTable } from '../index.ts';

type G = GameTypes; // your game's GameTypes bundle

export type Step = { readonly op: 'todo'; readonly note: string };

export const VERBS: VerbTable<G, Step> = {
  // Cite the rule id here, never in the text. `run: null` / `text: null` mark a verb not built yet (the test fails).
  todo: { fields: { note: str }, run: () => undefined, text: (s) => s.note },
};

// Spread into GameRules.handlers; run a card's effect with ctx.then(...effectTasks(card.effect, env)).
export const verbHandlers = { verb: verbHandler<G>(VERBS) };
