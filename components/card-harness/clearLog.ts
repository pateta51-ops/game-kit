// K668: a vitest set-up file (`setupFiles`): before each test file runs, its own prompt log is cleared.
import { rmSync } from 'node:fs';
import { beforeAll, expect } from 'vitest';
import { promptLogOf } from './screenLog.ts';

export function clearPromptLog(file: string): void {
  rmSync(file, { force: true });
}
/** Clears the log of the test file now running (`promptLogOf` its path). */
export function clearThisFileLog(): void {
  const t = expect.getState().testPath;
  if (t === undefined) throw new Error('clearLog: no test file is running');
  clearPromptLog(promptLogOf(t));
}
beforeAll(clearThisFileLog);
