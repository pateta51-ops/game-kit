// K668: every prompt a card test opens is logged for cards:screen. Beside `cardCase`; imports vitest.
import { expect } from 'vitest';
import { cardCaseLog } from './cardCase.ts';
import { Scenario } from './scenario.ts';
import type { ScreenPrompt } from './screen.ts';
import { PROMPT_LOG, recordOpened, recordPrompt } from './screenLog.ts';

export interface PromptRecorder {
  /** The log file; default `PROMPT_LOG`. */
  file?: string;
  /** Which first title words are clause ids; default: the clause of a `cardCase`. */
  clause?: RegExp;
  /** The entry for an open prompt (the words shown, line, raw, path...), or null to leave it out; `clause` defaults to the test's. */
  entry(prompt: unknown, sc: object): (Omit<ScreenPrompt, 'clause'> & { clause?: string }) | null;
}

/** Sets `Scenario.onPrompt` so each prompt a card test leaves open is recorded once; returns the undo. */
export function recordCardPrompts(r: PromptRecorder): () => void {
  let last = '';
  Scenario.onPrompt = (prompt, sc) => {
    const st = expect.getState();
    const name = st.currentTestName?.split(' > ').at(-1)?.split(' ')[0] ?? '';
    if (name === '' || !(r.clause ? r.clause.test(name) : cardCaseLog.some((c) => c.clause === name))) return;
    const key = `${st.testPath ?? ''}|${st.currentTestName ?? ''}|${JSON.stringify((prompt as { id?: unknown }).id)}`;
    if (key === last) return;
    last = key;
    const e = r.entry(prompt, sc);
    if (e === null) return;
    const file = r.file ?? PROMPT_LOG, clause = e.clause ?? name;
    recordOpened(file, clause);
    recordPrompt(file, { ...e, clause });
  };
  return () => { Scenario.onPrompt = undefined; };
}
