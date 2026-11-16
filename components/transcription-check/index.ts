import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const escRe = (p: string) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The path appears in the note as a whole token, not inside a longer path. */
const names = (note: string, path: string) => new RegExp(`(?<![\\w.\\[\\]])${escRe(path)}(?![\\w.\\[\\]])`).test(note);

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export interface Transcript<D = unknown> {
  id: string;
  source: { transcriber: 'A' | 'B'; from: string; picture?: string; session?: string };
  flags: string[];
  data: D;
}
export interface Verification { id: string; sha256: string; date: string; verifiedBy: string; method: string }
export interface Loaded<D = unknown> { id: string; file: string; text: string; transcript: Transcript<D> }
export interface ItemDiff { id: string; status: 'clean' | 'differs' | 'no-a' | 'no-b'; diffs: Array<{ path: string; resolved: boolean }> }
export interface Gap { id: string; message: string }

/** Paths at which two JSON values differ. */
export function jsonDiff(a: unknown, b: unknown, path = ''): string[] {
  if (a === b) return [];
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return [path || '(root)'];
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: string[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...jsonDiff(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  return [...new Set([...Object.keys(ao), ...Object.keys(bo)])].sort().flatMap((k) => jsonDiff(ao[k], bo[k], path ? `${path}.${k}` : k));
}

export interface Options<D> {
  root: string;
  /** Required item ids (what the game prints and must transcribe). */
  items: readonly string[];
  /** The game's transcript schema: throw on a bad file. Default: checks the Transcript shape only. */
  parse?: (raw: unknown) => Transcript<D>;
  dirA?: string; dirB?: string; pictureDir?: string; ledger?: string;
  /** A difference is resolved when an A flag starts with this prefix and names its path. */
  noteFlag?: string;
}

export function transcriptionCheck<D = unknown>(o: Options<D>) {
  const { root, items } = o;
  const noteFlag = o.noteFlag ?? 'NOTE:';
  const parse = o.parse ?? ((raw: unknown) => {
    const t = raw as Transcript<D> | null;
    if (!t || typeof t.id !== 'string' || !t.source || !Array.isArray(t.flags)) throw new Error('not a Transcript');
    return t;
  });
  const load = (dir: string) => {
    const out = new Map<string, Loaded<D>>();
    const d = join(root, dir);
    if (!existsSync(d)) return out;
    for (const name of readdirSync(d).filter((n) => n.endsWith('.json')).sort()) {
      const file = join(d, name);
      const text = readFileSync(file, 'utf8');
      let transcript: Transcript<D>;
      try { transcript = parse(JSON.parse(text)); } catch (e) { throw new Error(`${file}: ${(e as Error).message}`, { cause: e }); }
      out.set(transcript.id, { id: transcript.id, file, text, transcript });
    }
    return out;
  };
  const ledgerFile = join(root, o.ledger ?? 'VERIFIED.json');
  const pictureDir = join(root, o.pictureDir ?? 'pictures');
  const loadA = () => load(o.dirA ?? 'a');
  const loadB = () => load(o.dirB ?? 'b');
  const verifications = (): Verification[] => (existsSync(ledgerFile) ? (JSON.parse(readFileSync(ledgerFile, 'utf8')) as Verification[]) : []);
  const pictureOf = (id: string) => pictures().find((p) => p.startsWith(`${id}.`));
  /** Hash of A, B and the source picture together: a change to any of them undoes the verification. */
  const digest = (id: string, a: Map<string, Loaded<D>>, b: Map<string, Loaded<D>>) => {
    const p = pictureOf(id);
    return sha256(`${a.get(id)?.text ?? ''}
${b.get(id)?.text ?? ''}
${p ? sha256(readFileSync(join(pictureDir, p)).toString('latin1')) : ''}`);
  };
  const pictures = () => (existsSync(pictureDir) ? readdirSync(pictureDir) : []);

  /** A against B per item; a difference is resolved when a NOTE flag in A names its path. */
  const diff = (): ItemDiff[] => {
    const a = loadA();
    const b = loadB();
    return [...new Set([...items, ...a.keys(), ...b.keys()])].map((id): ItemDiff => {
      const fa = a.get(id);
      const fb = b.get(id);
      if (!fa) return { id, status: 'no-a', diffs: [] };
      if (!fb) return { id, status: 'no-b', diffs: [] };
      const notes = fa.transcript.flags.filter((f) => f.startsWith(noteFlag));
      const diffs = jsonDiff(fa.transcript.data, fb.transcript.data).map((path) => ({ path, resolved: notes.some((n) => names(n, path)) }));
      return { id, status: diffs.length ? 'differs' : 'clean', diffs };
    });
  };
  const openCount = (d: ItemDiff[]) => d.reduce((n, x) => n + x.diffs.filter((y) => !y.resolved).length, 0);

  /** DIFF.md text; the caller fails the build while openCount is above 0. */
  const diffMarkdown = (d = diff()) => {
    const lines = ['# Transcription diff (A against B)', '', 'Generated. The picture wins: fix the wrong file and add a `NOTE: <path> ...` flag to A.', ''];
    for (const x of d) {
      if (x.status === 'clean') continue;
      lines.push(`## ${x.id} - ${x.status}`);
      for (const y of x.diffs) lines.push(`- ${y.resolved ? '[resolved]' : '[OPEN]'} \`${y.path}\``);
      lines.push('');
    }
    lines.push(`Unresolved differences: ${openCount(d)}`);
    return `${lines.join('\n')}\n`;
  };

  /** Progress table: item, picture, A, B, diff, verified. */
  const progressMarkdown = (d = diff()) => {
    const a = loadA();
    const b = loadB();
    const v = verifications();
    const pics = pictures();
    const lines = ['# Progress', '', 'Generated. Continue with the first item that is not verified.', '', '| Item | Picture | A | B | Diff | Verified |', '|---|---|---|---|---|---|'];
    for (const x of d) {
      const f = a.get(x.id);
      const e = v.find((y) => y.id === x.id);
      const ok = f && e && e.sha256 === digest(x.id, a, b);
      lines.push(`| ${x.id} | ${pics.some((p) => p.startsWith(`${x.id}.`)) ? 'yes' : '-'} | ${x.status === 'no-a' ? '-' : 'yes'} | ${x.status === 'no-a' || x.status === 'no-b' ? '-' : 'yes'} | ${x.status} | ${ok ? `yes (${e.date})` : '-'} |`);
    }
    return `${lines.join('\n')}\n`;
  };

  /** Required items not yet verified: missing file, no ledger entry, or edited since. Empty = pass. */
  const gate = (): Gap[] => {
    const a = loadA();
    const b = loadB();
    const v = verifications();
    return items.flatMap((id): Gap[] => {
      const f = a.get(id);
      const e = v.find((x) => x.id === id);
      if (!f) return [{ id, message: 'transcription missing' }];
      if (!e) return [{ id, message: 'not verified' }];
      return e.sha256 === digest(id, a, b) ? [] : [{ id, message: 'changed since it was verified' }];
    });
  };

  /** Owner confirmed these items: record the hash of A, B and the picture. Refuses an item with no B or an open difference. */
  const verify = (ids: string[], date: string, verifiedBy = 'owner', method = 'physical-item') => {
    const a = loadA();
    const b = loadB();
    const d = diff();
    const v = verifications().filter((x) => !ids.includes(x.id));
    for (const id of ids) {
      const f = a.get(id);
      const x = d.find((y) => y.id === id);
      if (!f) throw new Error(`${id}: no transcription A`);
      if (!x || x.status === 'no-b' || x.diffs.some((y) => !y.resolved)) throw new Error(`${id}: B missing or a difference is open`);
      v.push({ id, sha256: digest(id, a, b), date, verifiedBy, method });
    }
    writeFileSync(ledgerFile, `${JSON.stringify(v, null, 2)}\n`);
    return v;
  };

  /** Writes DIFF.md (default `DIFF.md` under root). */
  const writeDiff = (file = join(root, 'DIFF.md')) => { const d = diff(); writeFileSync(file, diffMarkdown(d)); return d; };
  /** Writes DIFF.md and sets a non-zero exit code while any difference is open; returns the open count. */
  const check = (file?: string) => { const n = openCount(writeDiff(file)); if (n > 0) process.exitCode = 1; return n; };

  return { writeDiff, check, loadA, loadB, verifications, diff, diffMarkdown, openCount, progressMarkdown, gate, verify };
}
