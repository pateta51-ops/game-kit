// The printed-text leak check: lines added since a base commit that share a run of N or more consecutive words with the
// private source texts (transcripts, rule texts). Prints file:line, the run length, the source and the first five words
// only. Exit codes: 0 no hit, 1 hits, 2 usage or a failed read.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args';

export const words = (s: string): string[] => s.toLowerCase().replace(/[’']/g, '').match(/[a-z0-9]+/g) ?? [];

export type Grams = Map<string, string>;
export function addGrams(grams: Grams, text: string, src: string, n: number): void {
  const w = words(text);
  for (let i = 0; i + n <= w.length; i += 1) {
    const g = w.slice(i, i + n).join(' ');
    if (!grams.has(g)) grams.set(g, src);
  }
}

/** The strings of a JSON value under any of `keys` (at any depth); every string when `keys` is empty. */
export function jsonStrings(o: unknown, keys: readonly string[], inside = keys.length === 0): string[] {
  if (typeof o === 'string') return inside ? [o] : [];
  if (Array.isArray(o)) return (o as unknown[]).flatMap((v) => jsonStrings(v, keys, inside));
  if (o !== null && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => jsonStrings(v, keys, inside || keys.includes(k)));
  return [];
}

export interface Added {
  file: string;
  line: number;
  text: string;
}
/** The added lines of a `git diff -U0` text. */
export function addedLines(diff: string): Added[] {
  const out: Added[] = [];
  let file: string | null = null;
  let [line, oldLeft, newLeft] = [0, 0, 0];
  for (const l of diff.split(/\r?\n/)) {
    if (oldLeft > 0 || newLeft > 0) {
      if (l.startsWith('+')) {
        if (file !== null) out.push({ file, line, text: l.slice(1) });
        line += 1;
        newLeft -= 1;
      } else if (l.startsWith('-')) oldLeft -= 1;
      else if (!l.startsWith('\\')) {
        line += 1;
        oldLeft -= 1;
        newLeft -= 1;
      }
      continue;
    }
    const m = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(l);
    if (m !== null) [oldLeft, line, newLeft] = [Number(m[1] ?? 1), Number(m[2]), Number(m[3] ?? 1)];
    else if (l.startsWith('+++ ')) file = diffPath(l.slice(4));
  }
  return out;
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r' };
/** The path of a `+++` line: git's quoting undone, the `b/` prefix dropped; null for /dev/null. */
export function diffPath(raw: string): string | null {
  let p = raw.replace(/\t$/, '');
  if (p.startsWith('"') && p.endsWith('"')) {
    const parts = (p.slice(1, -1).match(/\\[0-7]{3}|\\.|[^\\]+/g) ?? []).map((t) => {
      if (!t.startsWith('\\')) return Buffer.from(t, 'utf8');
      if (t.length === 4) return Buffer.from([parseInt(t.slice(1), 8)]);
      return Buffer.from(ESCAPES[t.slice(1)] ?? t.slice(1), 'utf8');
    });
    p = Buffer.concat(parts).toString('utf8');
  }
  if (p === '/dev/null') return null;
  return p.startsWith('b/') ? p.slice(2) : p;
}

export interface Leak {
  file: string;
  line: number;
  run: number;
  src: string;
  head: string;
}
/** For each added line, its longest run of words found in the sources. */
export function leaks(added: readonly Added[], grams: Grams, n: number): Leak[] {
  const out: Leak[] = [];
  const at = (w: string[], i: number): string | undefined => grams.get(w.slice(i, i + n).join(' '));
  for (const a of added) {
    const w = words(a.text);
    const found: Leak[] = [];
    for (let i = 0; i + n <= w.length; ) {
      const src = at(w, i);
      if (src === undefined) {
        i += 1;
        continue;
      }
      let j = i + n;
      while (j < w.length && at(w, j - n + 1) !== undefined) j += 1;
      found.push({ file: a.file, line: a.line, run: j - i, src, head: w.slice(i, i + 5).join(' ') });
      i = j;
    }
    const best = found.sort((x, y) => y.run - x.run)[0];
    if (best !== undefined) out.push(best);
  }
  return out;
}

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .sort()
    .flatMap((name) => files(join(path, name)));
}

/** The word runs of every file under `sources` (a `.json` file gives its strings under `keys`; any other file its whole text). */
export function gramsOf(sources: readonly string[], keys: readonly string[], n: number): Grams {
  const grams: Grams = new Map();
  for (const path of sources.flatMap((s) => files(resolve(s)))) {
    const text = readFileSync(path, 'utf8');
    let parts = [text];
    if (path.endsWith('.json')) {
      try {
        parts = jsonStrings(JSON.parse(text) as unknown, keys);
      } catch {
        parts = [text];
      }
    }
    for (const p of parts) addGrams(grams, p, basename(path), n);
  }
  return grams;
}

const NAMES = ['base', 'diff', 'repo', 'n', 'source', 'json-keys', 'exclude'];
const USAGE =
  'usage: tsx text-leak.ts (--base <commit> [--repo <dir>] [--exclude <path>]... | --diff <file of git diff -U0>) --source <file or dir>... [--json-keys <a,b>] [--n <6>] [--config <json>]';

export function run(args: readonly string[], io: Io = stdio): number {
  try {
    const f = flags(args, NAMES);
    const n = Number(f?.['n']?.[0] ?? 6);
    const sources = f?.['source'] ?? [];
    const [base, diffFile] = [f?.['base']?.[0], f?.['diff']?.[0]];
    if (f === null || sources.length === 0 || !Number.isInteger(n) || n < 2 || (base === undefined) === (diffFile === undefined)) {
      io.err(USAGE);
      return 2;
    }
    const keys = (f['json-keys'] ?? []).flatMap((k) => k.split(',')).filter((k) => k !== '');
    const grams = gramsOf(sources, keys, n);
    if (grams.size === 0) {
      io.err(`text-leak: the sources gave no run of ${String(n)} words (empty folder, wrong --json-keys or texts too short)`);
      return 2;
    }
    let diff: string;
    if (diffFile !== undefined) diff = readFileSync(resolve(diffFile), 'utf8');
    else {
      const r = spawnSync('git', ['-C', resolve(f['repo']?.[0] ?? '.'), 'diff', '-U0', '--src-prefix=a/', '--dst-prefix=b/', '--no-color', '--no-ext-diff', base ?? '', '--', '.', ...(f['exclude'] ?? []).map((e) => `:!${e}`)], {
        encoding: 'utf8',
        maxBuffer: 1 << 30,
        timeout: 120_000,
      });
      if (r.status !== 0) {
        io.err(`text-leak: git diff failed: ${r.stderr}${r.error?.message ?? ''}`);
        return 2;
      }
      diff = r.stdout;
    }
    const hits = leaks(addedLines(diff), grams, n);
    for (const h of hits) io.out(`${h.file}:${String(h.line)}: ${String(h.run)} words ~ ${h.src} | "${h.head} ..."`);
    io.err(`text-leak: ${String(hits.length)} added line(s) with a run of ${String(n)} or more words`);
    return hits.length > 0 ? 1 : 0;
  } catch (error) {
    io.err(`text-leak: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
