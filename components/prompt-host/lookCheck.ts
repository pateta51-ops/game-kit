// K235 A6: which words of a look are still the kit's placeholders (the option id as label, the English Done, Confirm, ...).
import { defaultLook } from './look.ts';

const WORDS = ['label', 'done', 'less', 'more', 'confirm', 'cancel', 'count'] as const;

/** One line per word the game did not supply; `[]` when every word is the game's. A game's test calls it with the look it passes. */
export function checkLook(look: Partial<Record<(typeof WORDS)[number], unknown>>): string[] {
  const d = defaultLook as unknown as Record<string, unknown>;
  return WORDS.filter((k) => look[k] === undefined || look[k] === d[k]).map((k) => `look.${k} is the kit placeholder: supply the game's words`);
}

const warned = new Set<string>();
/** Dev only (Vite `DEV`): warns once per word that the host shows a placeholder. */
export function warnLook(look: object | undefined): void {
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV !== true) return;
  for (const w of checkLook(look ?? {})) if (!warned.has(w)) { warned.add(w); console.warn(`PromptHost: ${w}`); }
}
