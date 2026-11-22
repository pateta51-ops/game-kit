// K668: every prompt a card test opens is logged for cards:screen. Beside `cardCase`; imports vitest.
import { expect } from 'vitest';
import { cardCaseLog } from './cardCase.ts';
import { Scenario } from './scenario.ts';
import type { ScreenPrompt } from './screen.ts';
import { promptLogOf, recordOpened, recordPrompt } from './screenLog.ts';

export interface PromptRecorder {
  /** The log file; default `promptLogOf(<the test file>)`, one file per test file. */
  file?: string;
  /** Which first title words are clause ids; default: the clause of a `cardCase`. */
  clause?: RegExp;
  /** The entry for an open prompt (the words shown, line, raw, path...), or null to leave it out; `clause` defaults to the test's. */
  entry(prompt: unknown, sc: object): (Omit<ScreenPrompt, 'clause'> & { clause?: string }) | null;
}

/** Sets `Scenario.onPrompt` so each prompt a card test leaves open is recorded once per scenario; returns the undo (the hook before). */
export function recordCardPrompts(r: PromptRecorder): () => void {
  const prev = Scenario.onPrompt;
  const last = new WeakMap<object, string>();
  Scenario.onPrompt = (prompt, sc) => {
    const st = expect.getState();
    const name = st.currentTestName?.split(' > ').at(-1)?.split(' ')[0] ?? '';
    if (name === '' || !(r.clause ? r.clause.test(name) : cardCaseLog.some((c) => c.clause === name))) return;
    const key = `${st.testPath ?? ''}|${st.currentTestName ?? ''}|${JSON.stringify((prompt as { id?: unknown }).id)}`;
    if (last.get(sc) === key) return;
    last.set(sc, key);
    const e = r.entry(prompt, sc);
    if (e === null) return;
    const file = r.file ?? promptLogOf(st.testPath ?? 'unknown'), clause = e.clause ?? name;
    recordOpened(file, clause);
    recordPrompt(file, { ...e, clause });
  };
  return () => { Scenario.onPrompt = prev; };
}
