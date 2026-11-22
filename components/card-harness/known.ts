// K650: one known-findings list for every card check. A line per finding, `<finding> @ <owner>` (or a JSON map finding to owner);
// a new finding fails, a stale line fails, a line whose owner is not open fails (when the game passes `open`), release mode fails any line.
// Writing lines is its own command (`write`), which prints how many it added; a check never writes.

export interface KnownIo { read(path: string): string | null; write(path: string, text: string): void }
export interface KnownFindings {
  readonly file: string;
  /** Owners (fix batches or rows) still open; a line whose owner is not here (or `+`-joined owners not all here) fails. Unset: owners are not checked. */
  readonly open?: readonly string[];
  /** Fail while any line is left. */
  readonly release?: boolean;
  /** Set on a check: it refuses (exit 1). Lines are written only by `writeKnownMain` / `writeKnown` (or `--write-known`). */
  readonly write?: boolean;
  readonly ownerOf?: (finding: string) => string;
  readonly io?: KnownIo;
}
export interface KnownLine { readonly finding: string; readonly owner?: string }
export interface KnownResult { readonly lines: readonly KnownLine[]; readonly fresh: string[]; readonly stale: string[]; readonly closed: KnownLine[]; readonly left: KnownLine[]; readonly problems: string[] }

const MARK = ' @ ';
/** The first line of a known-findings text file; without it every line is a whole finding with no owner (the K513 flat format). */
export const KNOWN_HEADER = '# known findings v1: <finding> @ <owner>';
const isJson = (t: string): boolean => t.trimStart().startsWith('{');
export function parseKnown(text: string): KnownLine[] {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const all: KnownLine[] = isJson(t)
    ? Object.entries(JSON.parse(t) as Record<string, string>).map(([finding, owner]) => ({ finding, owner }))
    : t.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).filter((l) => l !== '' && !l.startsWith('#')).map((l) => {
      const k = hasHeader(t) ? l.lastIndexOf(MARK) : -1;
      return k < 0 ? { finding: l } : { finding: l.slice(0, k).trimEnd(), owner: l.slice(k + MARK.length).trim() };
    });
  const seen = new Set<string>();
  return all.filter((l) => !seen.has(l.finding) && (seen.add(l.finding), true));
}
const hasHeader = (t: string): boolean => t.replace(/\r\n/g, '\n').split('\n').some((l) => l.trimEnd() === KNOWN_HEADER);
const readText = (k: KnownFindings): string => {
  if (!k.io) throw new Error(`known findings ${k.file}: no io`);
  try { return k.io.read(k.file) ?? ''; } catch (e) { if ((e as { code?: string }).code === 'ENOENT') return ''; throw e; }
};
export const readKnown = (k: KnownFindings): KnownLine[] => parseKnown(readText(k));

export function knownCheck(found: readonly string[], k: KnownFindings, lines: readonly KnownLine[] = readKnown(k)): KnownResult {
  const now = new Set(found), had = new Set(lines.map((l) => l.finding)), open = new Set(k.open ?? []);
  const fresh = [...now].filter((f) => !had.has(f));
  const stale = lines.filter((l) => !now.has(l.finding)).map((l) => l.finding);
  const closed = k.open ? lines.filter((l) => now.has(l.finding) && (l.owner === undefined || !l.owner.split('+').every((o) => open.has(o.trim())))) : [];
  const left = k.release ? [...lines] : [];
  const problems = [
    ...fresh,
    ...stale.map((p) => `baseline lists "${p}", which is gone: remove it from ${k.file}`),
    ...closed.map((l) => (l.owner === undefined ? `known finding "${l.finding}" has no owner: give it an open owner in ${k.file}` : `known finding "${l.finding}" has owner "${l.owner}", which is not open: fix it or give it an open owner in ${k.file}`)),
    ...left.map((l) => `release: ${k.file} still lists "${l.finding}"`),
  ];
  return { lines, fresh, stale, closed, left, problems };
}

export function writeKnown(found: readonly string[], k: KnownFindings): { added: number; removed: number; lines: number; text: string } {
  const old = readText(k), lines = parseKnown(old), now = new Set(found), had = new Set(lines.map((l) => l.finding));
  const keep = lines.filter((l) => now.has(l.finding));
  const add = [...now].filter((f) => !had.has(f)).map((finding) => ({ finding, owner: k.ownerOf?.(finding) ?? 'none' }));
  const all = [...keep, ...add];
  const head = old.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).filter((l) => l.startsWith('#') && l !== KNOWN_HEADER);
  const text = isJson(old) ? `${JSON.stringify(Object.fromEntries(all.map((l) => [l.finding, l.owner ?? 'none'])), null, 1)}\n`
    : [KNOWN_HEADER, ...head, ...all.map((l) => `${l.finding}${MARK}${l.owner ?? 'none'}`)].map((l) => `${l}\n`).join('');
  k.io!.write(k.file, text);
  return { added: add.length, removed: lines.length - keep.length, lines: all.length, text };
}

/** The separate write command: writes today's findings (new lines get `ownerOf`, stale ones go), prints the count, exit 0. */
export function writeKnownMain(name: string, found: readonly string[], k: KnownFindings, log: (l: string) => void): number {
  const w = writeKnown(found, k);
  log(`${name}: ${k.file}: ${String(w.added)} added, ${String(w.removed)} removed, ${String(w.lines)} lines`);
  return 0;
}
export const refuseWrite = (name: string, file: string): string => `FAIL ${name}: a check never writes ${file}: run the write command (writeKnownMain) on its own`;
/** A check's tail: prints each problem as `FAIL` and a summary, returns the exit code; `write` set refuses (exit 1), it never writes. */
export function knownGate(name: string, found: readonly string[], k: KnownFindings, log: (l: string) => void): number {
  if (k.write) { log(refuseWrite(name, k.file)); return 1; }
  const r = knownCheck(found, k);
  for (const p of r.problems) log(`FAIL ${p}`);
  log(`${name}: ${String(now(found))} findings, ${String(now(found) - r.fresh.length)} known; ${String(r.fresh.length)} new, ${String(r.stale.length)} stale${k.open ? `, ${String(r.closed.length)} without an open owner` : ''}${k.release ? `, ${String(r.left.length)} left for release` : ''}`);
  return r.problems.length ? 1 : 0;
}
const now = (found: readonly string[]): number => new Set(found).size;
