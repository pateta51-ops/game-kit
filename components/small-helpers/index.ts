// Small helpers from the outside harvest (K109). Pure functions, no packages.

// Icon emitted with a hidden word (netrunnerdb nrdb.format.js idea): copy, search and text assertions see the word.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const HIDDEN_WORD_STYLE = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
export const iconHtml = (name: string, word: string): string =>
  `<span class="icon icon-${esc(name)}" aria-hidden="true"></span><span class="icon-word" style="${HIDDEN_WORD_STYLE}">${esc(word)}</span>`;
/** The words an emitted string reads as: tags dropped, entities undone. */
export const iconText = (html: string): string =>
  html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Setup legality (arkham.build deck-validation.spec.ts idea): errors as data, one valid and one invalid fixture per rule.
export interface LegalError {
  readonly code: string;
  readonly detail?: unknown;
}
export type LegalRule<S> = (subject: S) => readonly LegalError[];
export interface LegalCase<S> {
  readonly rule: string;
  readonly valid: S;
  readonly invalid: S;
  /** The codes the invalid fixture must give, each exactly once. */
  readonly codes: readonly string[];
}
export const validateAll = <S>(rules: Readonly<Record<string, LegalRule<S>>>, subject: S): LegalError[] =>
  Object.values(rules).flatMap((r) => [...r(subject)]);
/** One line per failure: a rule without a case, a case without a rule, a valid fixture with errors, an invalid one with other codes. */
export function runLegalCases<S>(rules: Readonly<Record<string, LegalRule<S>>>, cases: readonly LegalCase<S>[]): string[] {
  const out: string[] = [];
  for (const name of Object.keys(rules)) if (!cases.some((c) => c.rule === name)) out.push(`${name}: no fixture pair`);
  for (const c of cases) {
    const r = rules[c.rule];
    if (r === undefined) {
      out.push(`${c.rule}: no such rule`);
      continue;
    }
    const v = r(c.valid).map((e) => e.code);
    if (v.length) out.push(`${c.rule}: valid fixture gave ${v.join(', ')}`);
    const i = r(c.invalid).map((e) => e.code).sort().join(',');
    const want = [...c.codes].sort().join(',');
    if (i !== want) out.push(`${c.rule}: invalid fixture gave [${i}], wanted [${want}]`);
  }
  return out;
}

// Precomputed card relation index (arkham.build lookup-tables idea): built once at load, feeds "related cards".
export interface RelationIndex {
  /** Ids the card points to in `table`, in card order. */
  to(table: string, id: string): readonly string[];
  /** Ids that point to the card in `table`. */
  from(table: string, id: string): readonly string[];
  /** `table: id -> target` where the target is no card. */
  readonly dangling: readonly string[];
}
export function relationIndex<C>(cards: readonly C[], idOf: (c: C) => string, tables: Readonly<Record<string, (c: C) => readonly string[]>>): RelationIndex {
  const ids = new Set(cards.map(idOf));
  const fwd = new Map<string, string[]>();
  const rev = new Map<string, string[]>();
  const dangling: string[] = [];
  const add = (m: Map<string, string[]>, k: string, v: string) => m.set(k, [...(m.get(k) ?? []), v]);
  for (const [t, f] of Object.entries(tables))
    for (const c of cards)
      for (const target of f(c)) {
        const id = idOf(c);
        if (!ids.has(target)) dangling.push(`${t}: ${id} -> ${target}`);
        add(fwd, `${t}\0${id}`, target);
        add(rev, `${t}\0${target}`, id);
      }
  return { to: (t, id) => fwd.get(`${t}\0${id}`) ?? [], from: (t, id) => rev.get(`${t}\0${id}`) ?? [], dangling };
}

// Emitted text keys resolve: every key the code or data names exists in the text table.
export function keysIn(texts: Iterable<string>, pattern: RegExp): string[] {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const out = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(re)) if (m[1] !== undefined) out.add(m[1]);
  return [...out];
}
export const missingKeys = (emitted: Iterable<string>, table: Readonly<Record<string, unknown>>): string[] =>
  [...new Set(emitted)].filter((k) => !Object.hasOwn(table, k)).sort();
export * from './download.ts';
