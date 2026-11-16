// The screen-side rule for an "answer obvious choices" setting.
// onlyForcedAnswer: lifted from jarl src/ui/prompts/autoAnswer.ts (the never-list is the game's: pass `never`).
// probedAnswer: the probe-and-compare shape of unst src/ui/play/obvious.ts (the cost function is the game's).

export interface ObviousPrompt<Id> {
  min: number;
  options: readonly { id: Id; enabled: boolean }[];
}

/** The picks the screen sends on its own, or null: only when the setting is on, the answer is forced and one option is enabled. */
export function onlyForcedAnswer<Id>(prompt: ObviousPrompt<Id>, on: boolean, never = false): Id[] | null {
  if (!on || never || prompt.min < 1) return null;
  const open = prompt.options.filter((o) => o.enabled);
  const only = open[0];
  if (open.length !== 1 || only === undefined) return null;
  return [only.id];
}

/**
 * `answer` when applying it to the game costs and reveals nothing, else null. `apply` must be pure and returns null (or
 * throws) when the engine refuses; `cost` names what the player lost or learned between the two states, or null.
 */
export function probedAnswer<S, A>(
  state: S,
  answer: A,
  apply: (state: S, answer: A) => S | null,
  cost: (before: S, after: S) => string | null,
): A | null {
  let after: S | null;
  try {
    after = apply(state, answer);
  } catch {
    return null;
  }
  return after !== null && cost(state, after) === null ? answer : null;
}
