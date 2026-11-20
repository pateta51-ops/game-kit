// K497: a played game hands its prompts and opened texts to the screen scan: JSON lines appended to a file, read back as `prompts` / `opened`.
import { appendFileSync, readFileSync } from 'node:fs';

interface LoggedPrompt { clause: string; shown: string; screenOptions?: readonly string[]; engineOptions?: readonly unknown[] }
export type ScreenLogEntry = ({ t: 'prompt' } & LoggedPrompt) | { t: 'opened'; clause: string };

/** One call per prompt shown (clause id, the words shown, optional option lists). */
export function recordPrompt(file: string, p: LoggedPrompt): void {
  appendFileSync(file, `${JSON.stringify({ t: 'prompt', ...p })}\n`);
}
/** One call per text opened (the clause whose resolution opened a prompt). */
export function recordOpened(file: string, clause: string): void {
  appendFileSync(file, `${JSON.stringify({ t: 'opened', clause })}\n`);
}
/** Reads recorded files into `ScreenInput`'s `prompts` and `opened`; a missing file counts as empty. */
export function readScreenLogs(files: readonly string[], read: (f: string) => string = (f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } }): { prompts: LoggedPrompt[]; opened: string[] } {
  const prompts: LoggedPrompt[] = [];
  const opened = new Set<string>();
  for (const f of files) for (const l of read(f).split('\n')) {
    if (l.trim() === '') continue;
    const e = JSON.parse(l) as ScreenLogEntry;
    opened.add(e.clause);
    if (e.t === 'prompt') { const { t: _t, ...p } = e; prompts.push(p); }
  }
  return { prompts, opened: [...opened] };
}
