// Lifted from warps src/ui/glossary/iconWords.ts: a word of a generated text that names something the game shows as an
// icon is drawn as that icon; the word stays its label and opens the same lookup. The word -> icon table is the game's
// data, applied to the links a glossary matcher found. Not replaced: words inside a proper name the game lists, and
// words whose icon already leads their line (`lead`). No React, no DOM.

/** The segments of the kit glossary's `matchText` (same shape, so this needs no other component). */
export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'term'; text: string; id: string }
  | { kind: 'icon'; code: string; raw: string; id: string | null };

export interface IconWordRule {
  /** The glossary entry the link must open. */
  entry: string;
  /** The link's words ({n} a digit, {L} one of the game's letters); any words of that entry when absent. */
  words?: string;
  /** `words` exactly as written (no other case, no plural ending). */
  case?: boolean;
  /** What the text just before the link ends with; consumed into the icon. */
  before?: string;
  /** What the text just after the link starts with; consumed into the icon. */
  after?: string;
  /** The icon's code ({n}/{L} filled in). */
  icon: string;
  /** How it is drawn: the game's style key ({n}/{L} filled in), also the name `lead` knows it by. */
  style: string;
}

export interface IconWordFile {
  rules: IconWordRule[];
}

/** An icon that stands for words of the text: `text` the words as written (its label), `id` the entry it opens. */
export interface IconWordSegment {
  kind: 'iconWord';
  text: string;
  id: string;
  code: string;
  style: string;
}

export type IconSegment = Segment | IconWordSegment;

interface Compiled {
  rule: IconWordRule;
  words: RegExp | null;
  before: RegExp | null;
  after: RegExp | null;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD = /[A-Za-z0-9]/;
const isWord = (c: string | undefined): boolean => c !== undefined && WORD.test(c);

/** A template as a regex source: {n} a digit, {L} a letter, the rest literal. */
function sourceOf(t: string, letters: string): string {
  return t
    .split(/(\{n\}|\{L\})/)
    .map((p) => (p === '{n}' ? '(\\d)' : p === '{L}' ? `([${letters}])` : escape(p)))
    .join('');
}

export interface IconWordTable {
  byEntry: ReadonlyMap<string, readonly Compiled[]>;
  /** Proper names (case as written) inside which nothing is replaced, longest first. */
  names: readonly string[];
  memo: Map<string, IconSegment[]>;
}

/** `names`: the game's proper names; `letters`: what {L} stands for, as the inside of a regex class. */
export function compileIconWords(
  file: IconWordFile,
  names: readonly string[] = [],
  letters = 'A-Za-z',
): IconWordTable {
  const source = (t: string): string => sourceOf(t, letters);
  const byEntry = new Map<string, Compiled[]>();
  for (const rule of file.rules) {
    const list = byEntry.get(rule.entry) ?? [];
    list.push({
      rule,
      words:
        rule.words === undefined
          ? null
          : rule.case === true
            ? new RegExp(`^${source(rule.words)}$`)
            : new RegExp(`^${source(rule.words)}(?:es|s)?$`, 'i'),
      before: rule.before === undefined ? null : new RegExp(`${source(rule.before)}$`, 'i'),
      after: rule.after === undefined ? null : new RegExp(`^${source(rule.after)}`, 'i'),
    });
    byEntry.set(rule.entry, list);
  }
  const unique = [...new Set(names.filter((n) => n.trim() !== ''))].sort((a, b) => b.length - a.length);
  return { byEntry, names: unique, memo: new Map() };
}

/** The spans of a text covered by a proper name (whole words, case as written). */
function protectedSpans(table: IconWordTable, text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const name of table.names) {
    let at = text.indexOf(name);
    while (at >= 0) {
      const end = at + name.length;
      if (!isWord(text[at - 1]) && !isWord(text[end])) out.push([at, end]);
      at = text.indexOf(name, at + 1);
    }
  }
  return out;
}

const fill = (t: string, n: string | undefined, letter: string | undefined): string =>
  t.replace('{n}', n ?? '').replace('{L}', (letter ?? '').toUpperCase());

/** The length of a segment in the text. */
const segLength = (s: IconSegment): number => (s.kind === 'icon' ? s.raw.length : s.text.length);

interface Placed {
  seg: IconSegment;
  start: number;
  end: number;
}

/** The part [from, to) of a placed text or term segment, as plain text (a term cut in two is no longer a link). */
function cut(text: string, p: Placed, from: number, to: number): Placed | null {
  if (to <= from) return null;
  if (p.seg.kind === 'text' || p.seg.kind === 'term')
    return { seg: { kind: 'text', text: text.slice(from, to) }, start: from, end: to };
  return null;
}

/**
 * The segments of `text` (from matchText) with every word the table names replaced by its icon. `lead` holds the icon
 * names (style keys) that already lead the line: a word whose icon is one of them keeps its words.
 */
export function iconizeSegments(
  table: IconWordTable,
  text: string,
  segs: readonly Segment[],
  lead: readonly string[] = [],
): IconSegment[] {
  const key = `${lead.join(',')}\u0000${text}`;
  const hit = table.memo.get(key);
  if (hit !== undefined) return hit;
  const spans = protectedSpans(table, text);
  const inName = (a: number, b: number): boolean => spans.some(([s, e]) => a < e && b > s);
  const skip = new Set(lead);
  const out: Placed[] = [];
  let consumedTo = 0;
  let at = 0;
  for (const seg of segs) {
    const start = at;
    const end = at + segLength(seg);
    at = end;
    if (end <= consumedTo) continue;
    if (start < consumedTo) {
      // the start of this segment went into the previous icon (its `after`)
      const rest = cut(text, { seg, start, end }, consumedTo, end);
      if (rest !== null) out.push(rest);
      continue;
    }
    const icon = seg.kind === 'term' && !inName(start, end) ? matchRule(table, text, seg, start, end) : null;
    if (icon === null || skip.has(icon.style)) {
      out.push({ seg, start, end });
      continue;
    }
    // take back what the icon's `before` covers
    while (out.length > 0) {
      const last = out[out.length - 1];
      if (last === undefined || last.end <= icon.start) break;
      out.pop();
      const keep = cut(text, last, last.start, icon.start);
      if (keep !== null) out.push(keep);
    }
    out.push({
      seg: {
        kind: 'iconWord',
        text: text.slice(icon.start, icon.end),
        id: icon.id,
        code: icon.code,
        style: icon.style,
      },
      start: icon.start,
      end: icon.end,
    });
    consumedTo = icon.end;
  }
  const result = out.map((p) => p.seg);
  if (table.memo.size > 5000) table.memo.clear();
  table.memo.set(key, result);
  return result;
}

function matchRule(
  table: IconWordTable,
  text: string,
  seg: Extract<Segment, { kind: 'term' }>,
  start: number,
  end: number,
): { id: string; start: number; end: number; code: string; style: string } | null {
  for (const c of table.byEntry.get(seg.id) ?? []) {
    let n: string | undefined;
    let letter: string | undefined;
    const take = (m: RegExpExecArray): void => {
      const g = m[1];
      if (g === undefined) return;
      if (/\d/.test(g)) n = g;
      else letter = g;
    };
    let from = start;
    let to = end;
    if (c.words !== null) {
      const m = c.words.exec(seg.text);
      if (m === null) continue;
      take(m);
    }
    if (c.before !== null) {
      const m = c.before.exec(text.slice(0, start));
      if (m === null || isWord(text[m.index - 1])) continue;
      take(m);
      from = m.index;
    }
    if (c.after !== null) {
      const m = c.after.exec(text.slice(end));
      if (m === null || (isWord(m[0][m[0].length - 1]) && isWord(text[end + m[0].length]))) continue;
      take(m);
      to = end + m[0].length;
    }
    const r = c.rule;
    if ((r.icon.includes('{n}') || r.style.includes('{n}')) && n === undefined) continue;
    if ((r.icon.includes('{L}') || r.style.includes('{L}')) && letter === undefined) continue;
    return {
      id: seg.id,
      start: from,
      end: to,
      code: fill(r.icon, n, letter),
      style: fill(r.style, n, letter),
    };
  }
  return null;
}

/** A printed icon followed by its own word is rendered once, as the icon. */
export function withoutIconWords(text: string, match: (text: string) => Segment[]): string {
  const parts = match(text).map((part) => ({ ...part }));
  return parts
    .map((part, i) => {
      if (part.kind !== 'icon' || part.id === null) return part.kind === 'icon' ? part.raw : part.text;
      const gap = parts[i + 1];
      const word = parts[i + 2];
      if (gap?.kind === 'text' && /^\s+$/.test(gap.text) && word?.kind === 'term' && word.id === part.id) {
        gap.text = '';
        // Copying below avoids changing the matcher's memoized segments.
        word.text = '';
      }
      return part.raw;
    })
    .join('');
}
