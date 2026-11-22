// K497: a played game hands its prompts and opened texts to the screen scan: JSON lines appended to a file, read back as `prompts` / `opened`.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface LoggedPrompt { clause: string; shown: string; screenOptions?: readonly string[]; engineOptions?: readonly unknown[]; step?: number }
export type ScreenLogEntry = ({ t: 'prompt' } & LoggedPrompt) | { t: 'opened'; clause: string };

const add = (file: string, e: ScreenLogEntry): void => { mkdirSync(dirname(file), { recursive: true }); appendFileSync(file, `${JSON.stringify(e)}\n`); };
/** One call per prompt shown (clause id, the words shown, optional option lists). */
export function recordPrompt(file: string, p: LoggedPrompt): void {
  add(file, { t: 'prompt', ...p });
}
/** One call per text opened (the clause whose resolution opened a prompt). */
export function recordOpened(file: string, clause: string): void {
  add(file, { t: 'opened', clause });
}
/** Reads recorded files into `ScreenInput`'s `prompts` and `opened`; a missing file counts as empty. */
export function readScreenLogs(files: readonly string[], read: (f: string) => string = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } }): { prompts: LoggedPrompt[]; opened: string[]; warnings: string[] } {
  const prompts: LoggedPrompt[] = [];
  const opened = new Set<string>();
  const warnings: string[] = [];
  for (const f of files) for (const [n, l] of read(f).split('\n').entries()) {
    if (l.trim() === '') continue;
    let e: ScreenLogEntry;
    try { e = JSON.parse(l) as ScreenLogEntry; if (typeof e.clause !== 'string') throw new Error('no clause'); } catch { warnings.push(`${f} line ${String(n + 1)}: skipped, not a record`); continue; }
    opened.add(e.clause);
    if (e.t === 'prompt') { const { t: _t, ...p } = e; prompts.push(p); }
  }
  return { prompts, opened: [...opened], warnings };
}
