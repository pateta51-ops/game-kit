// Owner rule: rule, ruling and decision ids (TURN-07, AR-12, D-044) are for agents and tests; a person never sees them.
export interface IdFamilies {
  /** Regex sources. An id is FAMILY-n (1 to 3 digits, an optional letter): TURN-07, MAP-CD-02, TURN-07A. */
  long?: readonly string[];
  /** Regex sources. An id is FAMILY-nn (2 to 4 digits), so "A-5 cards" and "Pay 1 R-1" stay: AR-026, R-48. */
  short?: readonly string[];
}
export type Strip = (text: string) => string;
export interface RuleIdFilter {
  source: string;
  /** `source` with its edges: not after or before a word character or a hyphen. Use this one in other patterns. */
  pattern: string;
  /** Matches a rule id; for scans of rendered text in tests. */
  test: RegExp;
  strip: Strip;
}

export function ruleIdSource(f: IdFamilies): string {
  const long = f.long ?? [];
  const short = f.short ?? [];
  const parts = [
    ...(long.length > 0 ? [`(?:${long.join('|')})-\\d{1,3}[a-zA-Z]?`] : []),
    ...(short.length > 0 ? [`(?:${short.join('|')})-\\d{2,4}`] : []),
  ];
  return parts.length === 0 ? '(?!)' : `(?:${parts.join('|')})(?:\\.\\d+)?`;
}

const SEP = String.raw`(?:\s*[,;·/&–—]\s*|\s+(?:to|and|or)\s+|\s*\.\.\s*)`;
const LEAD = String.raw`(?:[Bb]y|[Aa]nd|[Oo]r|[Tt]o|[Pp]er|[Ss]ee|[Cc]f\.?|[Vv]ia)`;
const DANGLING = /(?:^|\s+)(?:by|and|or|to|per|see|cf\.?|via|·)\s*(?=[,.;:)]|$)/gi;

export function ruleIdFilter(families: IdFamilies): RuleIdFilter {
  const source = ruleIdSource(families);
  const ID = String.raw`(?<![\w-])${source}(?![\w-])`;
  const LIST = `${ID}(?:${SEP}${ID})*`;
  const test = new RegExp(ID);
  const ID_G = new RegExp(ID, 'g');
  const BRACKETED = new RegExp(String.raw`\s*[(\[]\s*(?:(?:[Ss]ee|[Cc]f\.?|[Pp]er|[Rr]ules?)\s+)?${LIST}\s*[)\]]`, 'g');
  // An id list with the colon or lead-in word before it ("ruled by AR-026 here" gives "ruled here").
  const BARE_LIST = new RegExp(String.raw`(?:\s*:|(?:^|\s+)${LEAD})?\s*${LIST}`, 'g');
  const strip = (text: string): string => {
    if (!test.test(text)) return text;
    const s = text
      .replace(BRACKETED, '')
      .replace(BARE_LIST, '')
      .replace(ID_G, '')
      .replace(DANGLING, '')
      .replace(/\(\s*[,;·\s]*\)/g, '')
      .replace(/[,;]\s*\)/g, ')')
      .replace(/\s+([,.;:!?)])/g, '$1')
      .replace(/\(\s+/g, '(')
      .replace(/([,;:])\s*\./g, '.')
      .replace(/^[\s,;:·.]+/, '')
      .replace(/[\s,;:·]+$/, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    return /[\p{L}\p{N}]/u.test(s) ? s : '';
  };
  return { source, pattern: ID, test, strip };
}

/** The prompt with the named string fields of every option stripped (a label that would be empty is kept); the same object when nothing changed. */
export function plainPrompt<P extends { options: readonly object[] }>(p: P, strip: Strip, keys: readonly string[] = ['label', 'reason']): P {
  const options = p.options.map((o) => {
    const r = o as Record<string, unknown>;
    const changed: Record<string, string> = {};
    for (const k of keys) {
      const v = r[k];
      if (typeof v !== 'string') continue;
      const t = strip(v);
      if (t !== v && !(k === 'label' && t === '')) changed[k] = t;
    }
    return Object.keys(changed).length === 0 ? o : { ...o, ...changed };
  });
  return options.some((o, i) => o !== p.options[i]) ? { ...p, options } : p;
}

/** The view with its open prompt stripped. */
export function plainView<V extends { prompt: { options: readonly object[] } | null }>(v: V, strip: Strip, keys?: readonly string[]): V {
  const before = v.prompt;
  if (before === null) return v;
  const prompt = plainPrompt(before, strip, keys);
  return prompt === before ? v : { ...v, prompt };
}

/** Text a player must never see: a code identifier (camelCase), "=", a section mark with a number. */
export const CODE_TEXT = String.raw`\b[a-z]+[A-Z][A-Za-z]*\b|=|§\s*\d`;

/** CODE_TEXT plus the game's own sources (a filter's `pattern`, "\\bD\\d+\\b"), for a test over rendered text. */
export function forbiddenText(...extra: readonly string[]): RegExp {
  return new RegExp([CODE_TEXT, ...extra].join('|'));
}

/** What a person can read of an element: its text and the title, alt and placeholder attributes of it and of what it holds. */
export function visibleText(el: {
  textContent: string | null;
  getAttribute?(name: string): string | null;
  querySelectorAll(selector: string): ArrayLike<{ getAttribute(name: string): string | null }>;
}): string {
  const nodes: { getAttribute?(name: string): string | null }[] = [el, ...Array.from(el.querySelectorAll('[title], [alt], [placeholder]'))];
  const attrs = nodes.flatMap((e) => ['title', 'alt', 'placeholder'].map((a) => e.getAttribute?.(a) ?? '')).filter((a) => a !== '');
  return [el.textContent ?? '', ...attrs].join('\n');
}

/** The sentences of `text` (split after . ! ? or a line break) with more than `max` words; `strip` runs first when given. For prompt and option wording. */
export function longSentences(text: string, max = 20, strip?: Strip): { sentence: string; words: number }[] {
  const t = strip === undefined ? text : strip(text);
  return t
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .map((s) => ({ sentence: s, words: s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length }))
    .filter((s) => s.words > max);
}
