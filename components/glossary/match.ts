// The one matcher every lookup uses (lifted from warps src/ui/glossary/match.ts and src/content/glossary.ts; the linking
// index from stcc). It finds glossary terms in a text by their `term` and `aliases`, longest match first, and resolves icon
// codes to the entry that explains them. No React, no DOM: the links (GlossaryText), the check and the tests share it.
// The entries are data the game passes in.
//
// Matching rules:
//   - A name matches at a word boundary on both sides (the characters around it are not letters or digits).
//   - Case as printed (`isPrinted`): a name with a word in capitals matches only as written (`PROTECTED`); the others
//     ignore case ("Gain" at the start of a sentence).
//   - A name may take an ending: s, es, d, ed, ing, or its last consonant doubled before ed/ing (stunned, stunning).
//   - At each position the longest name wins ("laser token" over "laser").
//   - Icons: `{code}` or `[[code]]` (or the game's own pattern). A code resolves by an entry's `icon` or `tokens`; in
//     those, `*` stands for any value and `#` for a number (`laser-token:*`, `strength #`).
//   - The linking index (default) leaves out `searchAliases`, and a `plain` entry keeps only its names in capitals; the
//     coverage index (`{ coverage: true }`) keeps every name, so a check can prove a word has an entry at all.

export interface GlossaryEntry {
  id: string;
  term: string;
  aliases?: readonly string[];
  /** The game's group of the entry (its heading in the lookup). */
  kind?: string;
  /** The icon code the entry explains. */
  icon?: string;
  /** More codes the entry explains (number tokens). */
  tokens?: readonly string[];
  /** Names that find the entry in a search and in the coverage index, but are never linked in a text. */
  searchAliases?: readonly string[];
  /** Linked only by its names in capitals; its other names count for coverage only. */
  plain?: boolean;
  summary: string;
  /** Paragraphs separated by a blank line. */
  body?: string;
  /** The rule ids the entry explains. */
  rules?: readonly string[];
  /** Ids of related entries. */
  see?: readonly string[];
}

export type Segment =
  | { kind: 'text'; text: string }
  /** A glossary term in the text: its words as written, and the entry. */
  | { kind: 'term'; text: string; id: string }
  /** An icon code, as written in the text (`raw`), and the entry that explains it (null when none does). */
  | { kind: 'icon'; code: string; raw: string; id: string | null };

interface Name {
  name: string;
  /** The name lowercased, or null when it matches only as written (`isPrinted`). */
  lower: string | null;
  id: string;
}

export interface GlossaryIndex {
  entries: ReadonlyMap<string, GlossaryEntry>;
  /** Names by their first character, lowercased; longest first. */
  names: ReadonlyMap<string, readonly Name[]>;
  /** Exact icon codes (lowercased) → entry id. */
  icons: ReadonlyMap<string, string>;
  patterns: readonly { re: RegExp; id: string }[];
  /** The icon markup; group 1 or 2 is the code. */
  iconRe: RegExp;
  /** Memo of matched texts (a log and prompts render the same lines many times). */
  memo: Map<string, Segment[]>;
}

const WORD = /[A-Za-z0-9]/;
const isWord = (c: string | undefined): boolean => c !== undefined && WORD.test(c);
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `{code}` or `[[code]]`. A `{code}` is lowercase letters, digits, `-`, `:` and `+`. */
export const ICON = /\{([a-z0-9][a-z0-9:+-]*)\}|\[\[([^\]]+)\]\]/gi;

/** A name with a word in capitals (`PROTECTED`, `SANDS OF TIME`) matches only as written. Two names must not share a key. */
export const isPrinted = (name: string): boolean => /(?:^|[^A-Za-z])[A-Z]{2,}(?![a-z])/.test(name);
export const nameKey = (name: string): string => (isPrinted(name) ? name : name.toLowerCase());

/** A stable, readable id: lowercase words joined by hyphens. */
export const GLOSSARY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function buildIndex(
  entries: readonly GlossaryEntry[],
  { coverage = false, icon = ICON }: { coverage?: boolean; icon?: RegExp } = {},
): GlossaryIndex {
  const byId = new Map<string, GlossaryEntry>();
  const all: Name[] = [];
  const icons = new Map<string, string>();
  const patterns: { re: RegExp; id: string }[] = [];
  for (const e of entries) {
    byId.set(e.id, e);
    const names = [e.term, ...(e.aliases ?? []), ...(coverage ? (e.searchAliases ?? []) : [])];
    for (const name of names) {
      if (!coverage && e.plain === true && !isPrinted(name)) continue;
      all.push({ name, lower: isPrinted(name) ? null : name.toLowerCase(), id: e.id });
    }
    for (const t of [...(e.icon === undefined ? [] : [e.icon]), ...(e.tokens ?? [])]) {
      const key = t.toLowerCase();
      if (/[*#]/.test(key))
        patterns.push({ re: new RegExp(`^${escape(key).replaceAll('\\*', '.+').replaceAll('#', '\\d+')}$`), id: e.id });
      else icons.set(key, e.id);
    }
  }
  all.sort((a, b) => b.name.length - a.name.length);
  const names = new Map<string, Name[]>();
  for (const n of all) {
    const k = (n.name[0] ?? '').toLowerCase();
    const list = names.get(k) ?? [];
    list.push(n);
    names.set(k, list);
  }
  return { entries: byId, names, icons, patterns, iconRe: new RegExp(icon.source, icon.flags.includes('g') ? icon.flags : `${icon.flags}g`), memo: new Map() };
}

/** The entry that explains an icon code, or null. */
export function iconEntry(index: GlossaryIndex, code: string): string | null {
  const key = code.trim().toLowerCase();
  const hit = index.icons.get(key);
  if (hit !== undefined) return hit;
  for (const p of index.patterns) if (p.re.test(key)) return p.id;
  return null;
}

function endings(name: Name): string[] {
  const last = name.name[name.name.length - 1] ?? '';
  const out = ['ing', 'ed', 'es', 's', 'd', ''];
  if (/[bdgmnprt]/.test(last)) out.unshift(`${last}ing`, `${last}ed`);
  return out;
}

/** The length of the match of `name` at `at` in `text` (its ending included), or 0. */
function matchAt(text: string, lower: string, at: number, name: Name): number {
  const end = at + name.name.length;
  if (end > text.length) return 0;
  if (name.lower === null ? !text.startsWith(name.name, at) : !lower.startsWith(name.lower, at)) return 0;
  for (const ending of endings(name)) {
    const stop = end + ending.length;
    if (ending !== '' && lower.slice(end, stop) !== ending) continue;
    // a name that ends in a non-word character (`(side A)`) needs no boundary after it
    if (!isWord(name.name[name.name.length - 1]) || !isWord(text[stop])) return stop - at;
  }
  return 0;
}

function matchWords(index: GlossaryIndex, text: string, out: Segment[]): void {
  const lower = text.toLowerCase();
  let plain = 0;
  let i = 0;
  while (i < text.length) {
    if (i > 0 && isWord(text[i - 1]) && isWord(text[i])) {
      i += 1;
      continue;
    }
    let found: { len: number; id: string } | null = null;
    for (const name of index.names.get(lower[i] ?? '') ?? []) {
      const len = matchAt(text, lower, i, name);
      if (len > 0) {
        found = { len, id: name.id };
        break;
      }
    }
    if (found === null) {
      i += 1;
      continue;
    }
    if (i > plain) out.push({ kind: 'text', text: text.slice(plain, i) });
    out.push({ kind: 'term', text: text.slice(i, i + found.len), id: found.id });
    i += found.len;
    plain = i;
  }
  if (plain < text.length) out.push({ kind: 'text', text: text.slice(plain) });
}

/** A text as plain parts, glossary terms and icons. */
export function matchText(index: GlossaryIndex, text: string): Segment[] {
  const hit = index.memo.get(text);
  if (hit !== undefined) return hit;
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(index.iconRe)) {
    if (m.index > last) matchWords(index, text.slice(last, m.index), out);
    const code = (m[1] ?? m[2] ?? '').trim();
    out.push({ kind: 'icon', code, raw: m[0], id: iconEntry(index, code) });
    last = m.index + m[0].length;
  }
  if (last < text.length) matchWords(index, text.slice(last), out);
  if (index.memo.size > 5000) index.memo.clear();
  index.memo.set(text, out);
  return out;
}

/** The entry ids a text links to, in order. */
export function linkedIds(index: GlossaryIndex, text: string): string[] {
  return matchText(index, text).flatMap((s) => (s.kind === 'term' ? [s.id] : s.kind === 'icon' && s.id !== null ? [s.id] : []));
}

/** Which characters of a text a link covers. */
export function coveredChars(index: GlossaryIndex, text: string): boolean[] {
  const covered = new Array<boolean>(text.length).fill(false);
  let at = 0;
  for (const seg of matchText(index, text)) {
    const len = seg.kind === 'icon' ? seg.raw.length : seg.text.length;
    if (seg.kind === 'term' || (seg.kind === 'icon' && seg.id !== null)) for (let i = at; i < at + len; i += 1) covered[i] = true;
    at += len;
  }
  return covered;
}

/** The paragraphs of an entry's body (blank-line separated). */
export const paragraphs = (body: string | undefined): string[] =>
  (body ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '');

/** Entries whose term or a name holds every word of the query (case ignored), terms first. */
export function searchEntries(entries: readonly GlossaryEntry[], query: string): GlossaryEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return [...entries];
  const hits = (name: string): boolean => words.every((w) => name.toLowerCase().includes(w));
  const byTerm = entries.filter((e) => hits(e.term));
  return [...byTerm, ...entries.filter((e) => !byTerm.includes(e) && [...(e.aliases ?? []), ...(e.searchAliases ?? [])].some(hits))];
}

/** Problems in the entries: ids, duplicate ids or names, empty words, `see` links to ids that do not exist. */
export function glossaryProblems(entries: readonly GlossaryEntry[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const names = new Map<string, string>();
  for (const e of entries) {
    if (!GLOSSARY_ID.test(e.id)) problems.push(`${e.id}: the id is not lowercase words joined by hyphens`);
    if (ids.has(e.id)) problems.push(`duplicate id ${e.id}`);
    ids.add(e.id);
    if (e.summary.trim() === '') problems.push(`${e.id}: empty summary`);
    for (const name of [e.term, ...(e.aliases ?? []), ...(e.searchAliases ?? [])]) {
      if (name.trim() === '') problems.push(`${e.id}: an empty name`);
      const key = nameKey(name);
      const other = names.get(key);
      if (other !== undefined && other !== e.id) problems.push(`"${name}" names both ${other} and ${e.id}`);
      names.set(key, e.id);
    }
  }
  for (const e of entries) {
    for (const s of e.see ?? []) if (!ids.has(s)) problems.push(`${e.id}: see "${s}" is not an entry`);
    if (e.see?.includes(e.id)) problems.push(`${e.id}: sees itself`);
  }
  return problems;
}
