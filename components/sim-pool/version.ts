// The code version a resumable sweep records (ebr scripts/sim/version.ts): a resume after the code changed would mix
// games of two rule sets. Put it in the settings label of `runResumable`, which refuses a file with another label.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

function addSources(h: ReturnType<typeof createHash>, root: string, rel: string): void {
  const p = path.join(root, rel);
  if (!existsSync(p)) return;
  if (statSync(p).isDirectory()) {
    for (const e of readdirSync(p).sort()) if (e !== 'node_modules' && !e.startsWith('.')) addSources(h, root, `${rel}/${e}`);
  } else h.update(`${rel}\0`).update(readFileSync(p).toString('latin1').replace(/\r\n/g, '\n'), 'latin1').update('\0');
}

/** A hash of the files and folders (paths under `root`, with `/`) that decide how a game plays. Works without git, and sees uncommitted edits; CRLF counts as LF; `node_modules` and dot folders are skipped. */
export function sourceHash(sources: readonly string[], root = '.'): string {
  const h = createHash('sha256');
  for (const s of sources) addSources(h, root, s);
  return h.digest('hex').slice(0, 10);
}

/** The short id of the commit of the repository whose top folder is `root`, or `nogit`. */
export function gitShort(root = '.'): string {
  try {
    if (!existsSync(path.join(root, '.git'))) return 'nogit';
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'nogit';
  }
}

export const codeVersion = (sources: readonly string[], root = '.'): string => `${gitShort(root)}.${sourceHash(sources, root)}`;
