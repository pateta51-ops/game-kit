// The move tool: moves a tracked file or folder and rewrites every path that points at it. In every tracked text file a
// relative path (an import, a markdown link, with or without its extension) is recomputed from the file's new place, and
// a repo-relative path written out in full (docs, configs, scripts) is replaced. Exit 0 done, 2 usage or a failed move.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args';

const EXT = /\.(?:[cm]?[jt]sx?|json|md)$/;
const INDEX = /\/index\.(?:[cm]?[jt]sx?)$/;
const REL = /(?<=['"(])\.{1,2}(?:\/[^'"()\s#?]*)?(?=['")#?])/g;
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Old path to new path for each tracked file under `from` (a file or a folder) moved to `to`. */
export function moveMap(tracked: readonly string[], from: string, to: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of tracked) if (p === from || p.startsWith(`${from}/`)) m.set(p, to + p.slice(from.length));
  return m;
}

/** The file a relative spec reaches: the path itself, with an extension, or a folder's index. Null when it reaches no tracked file. */
function target(resolved: string, all: ReadonlySet<string>): { file: string; kind: 'full' | 'bare' | 'index' } | null {
  if (all.has(resolved)) return { file: resolved, kind: 'full' };
  for (const e of ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.cjs']) if (all.has(resolved + e)) return { file: resolved + e, kind: 'bare' };
  for (const e of ['ts', 'tsx', 'js', 'mjs']) if (all.has(`${resolved}/index.${e}`)) return { file: `${resolved}/index.${e}`, kind: 'index' };
  return null;
}

/** `text` of `file` (now at `newFile`) with its relative paths and written-out repo paths rewritten. */
export function rewrite(text: string, file: string, newFile: string, moves: ReadonlyMap<string, string>, all: ReadonlySet<string>, from: string, to: string): string {
  const [dir, newDir] = [posix.dirname(file), posix.dirname(newFile)];
  let out = text.replace(REL, (spec) => {
    const t = target(posix.normalize(posix.join(dir, spec)), all);
    if (t === null) return spec;
    const dest = moves.get(t.file) ?? t.file;
    const p = t.kind === 'full' ? dest : t.kind === 'bare' || !INDEX.test(`/${dest}`) ? dest.replace(EXT, '') : posix.dirname(dest);
    let rel = posix.relative(newDir, p);
    if (rel === '') rel = '.';
    else if (!rel.startsWith('.')) rel = `./${rel}`;
    return !moves.has(file) && !moves.has(t.file) ? spec : rel;
  });
  out = out.replace(new RegExp(`(?<![\\w./-])${esc(from)}(?![\\w-]|\\.\\w)`, 'g'), to);
  return out;
}

const NAMES = ['from', 'to', 'repo'];
const USAGE = 'usage: tsx move.ts --from <tracked path> --to <new path> [--repo <dir>] [--dry]';

export function run(args: readonly string[], io: Io = stdio): number {
  try {
    const f = flags(args, NAMES, ['dry']);
    const [from, to] = [f?.['from']?.[0]?.replace(/\/+$/, ''), f?.['to']?.[0]?.replace(/\/+$/, '')];
    if (f === null || from === undefined || to === undefined || from === to) {
      io.err(USAGE);
      return 2;
    }
    const repo = resolve(f['repo']?.[0] ?? '.');
    const ls = spawnSync('git', ['-C', repo, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 30 });
    if (ls.status !== 0) {
      io.err(`move: git ls-files failed: ${ls.stderr}${ls.error?.message ?? ''}`);
      return 2;
    }
    const tracked = ls.stdout.split('\0').filter((p) => p !== '');
    const moves = moveMap(tracked, from, to);
    if (moves.size === 0) {
      io.err(`move: no tracked file at ${from}`);
      return 2;
    }
    if (tracked.some((p) => p === to || p.startsWith(`${to}/`))) {
      io.err(`move: ${to} already exists`);
      return 2;
    }
    const all = new Set(tracked);
    let changed = 0;
    for (const p of tracked) {
      const buf = readFileSync(join(repo, p));
      if (buf.includes(0)) continue;
      const text = buf.toString('utf8');
      const next = rewrite(text, p, moves.get(p) ?? p, moves, all, from, to);
      if (next === text) continue;
      changed += 1;
      io.out(`rewrote ${p}`);
      if (f['dry'] === undefined) writeFileSync(join(repo, p), next);
    }
    if (f['dry'] === undefined) {
      mkdirSync(dirname(join(repo, to)), { recursive: true });
      const mv = spawnSync('git', ['-C', repo, 'mv', from, to], { encoding: 'utf8' });
      if (mv.status !== 0) renameSync(join(repo, from), join(repo, to));
    }
    io.err(`move: ${String(moves.size)} file(s) moved, ${String(changed)} file(s) rewritten${f['dry'] === undefined ? '' : ' (dry run)'}`);
    return 0;
  } catch (error) {
    io.err(`move: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
