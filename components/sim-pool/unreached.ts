// K651: the proof for an unreached clause comes from what ran, not from test text: `proveResolved` (prove.ts) writes a record
// when card-harness's `expectResolved` saw the clause resolve in a test that then passed (never an `it.fails` test).
// `provenClauses` reads that log and keeps only records of this run: written under this exact project root, and newer
// than the test file and every source path given. Anything else is a problem line, and the whole-game check fails on it.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** One line of the proof log. */
export interface ProofRecord {
  readonly clause: string;
  /** The test file, relative to `root`. */
  readonly file: string;
  readonly test: string;
  readonly root: string;
  /** ms since the epoch, when the test finished. */
  readonly at: number;
}

export interface Proof {
  /** Clause id to the passing tests (`<file> › <test>`) in which it resolved. */
  readonly proven: Readonly<Record<string, readonly string[]>>;
  /** Log lines that are no proof of this run; each fails the whole-game check. */
  readonly problems: readonly string[];
}

const norm = (p: string): string => resolve(p).replace(/\\/g, '/');
const newest = (p: string): number => {
  if (!existsSync(p)) return 0;
  const s = statSync(p);
  if (!s.isDirectory()) return s.mtimeMs;
  return Math.max(0, ...readdirSync(p).filter((n) => !n.startsWith('.') && n !== 'node_modules').map((n) => newest(join(p, n))));
};

/** The proof of `clauses` from the log `proveResolved` wrote in this run. `sources`: files and folders (under `root` or absolute) the tests cover. */
export function provenClauses(o: { readonly log: string; readonly root: string; readonly clauses: readonly string[]; readonly sources?: readonly string[] | undefined }): Proof {
  const root = norm(o.root);
  const problems: string[] = [];
  const proven: Record<string, string[]> = {};
  if (!existsSync(o.log)) return { proven, problems: [`proof log ${o.log} is missing: run the card tests first`] };
  const src = Math.max(0, ...(o.sources ?? []).map((p) => newest(resolve(root, p))));
  for (const line of readFileSync(o.log, 'utf8').split('\n').filter((l) => l.trim())) {
    const r = JSON.parse(line) as ProofRecord;
    if (!o.clauses.includes(r.clause)) continue;
    if (r.root.replace(/\\/g, '/') !== root) problems.push(`proof log ${o.log}: ${r.clause} was recorded under ${r.root}, not this project ${root}`);
    else if (r.at <= Math.max(src, newest(join(root, r.file)))) problems.push(`proof log ${o.log}: ${r.clause} was recorded before its test or a source changed: run the card tests again`);
    else (proven[r.clause] ??= []).push(`${r.file} › ${r.test}`);
  }
  return { proven, problems: [...new Set(problems)] };
}
