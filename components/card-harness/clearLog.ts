// K668: a vitest set-up file (`globalSetup`) that clears the card tests' prompt log before each run.
import { rmSync } from 'node:fs';
import { PROMPT_LOG } from './screenLog.ts';

export function clearPromptLog(file: string = PROMPT_LOG): void {
  rmSync(file, { force: true });
}
export default function setup(): void {
  clearPromptLog();
}
