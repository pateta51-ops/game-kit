// K123 (Jarl src/ui/prompts/autoAnswer.ts): the "answer obvious choices" setting. The UI answers for the player only when
// one option is enabled and the answer is forced (engine-core `onlyOne`), never for the kinds the game lists in `never`.
import { onlyOne, type KernelPrompt } from '../engine-core/index.ts';

/** The picks the UI sends on its own, or null when the player must answer. */
export function autoAnswer<P extends KernelPrompt & { readonly kind: string }>(prompt: P, enabled: boolean, never: readonly P['kind'][] = []): string[] | null {
  if (!enabled || never.includes(prompt.kind)) return null;
  const n = onlyOne(prompt);
  return n === null ? null : [n.taken];
}
