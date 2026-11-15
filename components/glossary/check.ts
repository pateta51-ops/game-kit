// The glossary check (lifted from warps scripts/glossary-check.ts; the game's lists and file readers are passed in): the
// glossary covers every word and icon the game can show. The game reads its text sources (printed fields of its content,
// describe output) and calls `runGlossaryCheck` from its own script. Findings:
//   SCHEMA    duplicate id or name, bad id, empty summary, a `see` to no entry;
//   RULE      an entry cites a rule id the game does not define (when `ruleIds` is given);
//   ICON      an icon code of the game's set (`iconCodes`), or one a text writes, has no entry;
//   REQUIRED  a name in `required` is not one whole entry name;
//   HEADING   a word in capitals in a text is not inside a link (when `headings` is on);
//   VOCAB     a game word (`vocab`, regex sources matched at word boundaries, case ignored) has no entry: it is neither
//             inside a link nor covered by a `plain` entry or a search alias (the coverage index);
//   LANGUAGE  a generated text links no entry at all (unless `nothingToLink` says it names nothing of the game).
import { buildIndex, coveredChars, glossaryProblems, iconEntry, matchText, type GlossaryEntry, type GlossaryIndex } from './match';

export type CheckKind = 'SCHEMA' | 'RULE' | 'ICON' | 'REQUIRED' | 'HEADING' | 'VOCAB' | 'LANGUAGE';
export interface Finding {
  check: CheckKind;
  what: string;
}

/** A text the game can show, and where it comes from. */
export interface ShownText {
  where: string;
  text: string;
  /** A generated sentence (describe output): LANGUAGE checks it links something. */
  generated?: boolean;
}

export interface GlossaryCheckInput {
  entries: readonly GlossaryEntry[];
  texts: readonly ShownText[];
  iconCodes?: readonly string[];
  required?: readonly string[];
  vocab?: readonly string[];
  headings?: boolean;
  ruleIds?: readonly string[];
  nothingToLink?: (text: string) => boolean;
  /** The game's icon markup, as given to `buildIndex`. */
  icon?: RegExp;
}

/** A run of words in capitals. */
const UPPER = /(?<![A-Za-z0-9])[A-Z][A-Z'-]*[A-Z](?:\s+[A-Z][A-Z'-]*[A-Z])*(?![A-Za-z0-9])/g;

function uncovered(index: GlossaryIndex, text: string, re: RegExp): string[] {
  const covered = coveredChars(index, text);
  return [...text.matchAll(re)].filter((m) => covered[m.index] !== true).map((m) => m[0]);
}

function firstPlaces(check: CheckKind, index: GlossaryIndex, texts: readonly ShownText[], re: RegExp, what: string, fold: boolean): Finding[] {
  const found = new Map<string, string>();
  for (const { where, text } of texts)
    for (const word of uncovered(index, text, re)) {
      const key = fold ? word.toLowerCase() : word;
      if (!found.has(key)) found.set(key, where);
    }
  return [...found].map(([word, where]) => ({ check, what: `"${word}" (first in ${where}) ${what}` }));
}

/** The whole of `name` is one link. */
function wholeLink(index: GlossaryIndex, name: string): string | null {
  const segs = matchText(index, name);
  const only = segs[0];
  return segs.length === 1 && only?.kind === 'term' ? only.id : null;
}

export function checkGlossary(input: GlossaryCheckInput): Finding[] {
  const opts = input.icon === undefined ? {} : { icon: input.icon };
  const index = buildIndex(input.entries, opts);
  const cover = buildIndex(input.entries, { ...opts, coverage: true });
  const out: Finding[] = glossaryProblems(input.entries).map((what) => ({ check: 'SCHEMA', what }));
  if (input.ruleIds !== undefined) {
    const defined = new Set(input.ruleIds);
    for (const e of input.entries)
      for (const r of e.rules ?? []) if (!defined.has(r)) out.push({ check: 'RULE', what: `${e.id} cites ${r}, which the game does not define` });
  }
  for (const code of input.iconCodes ?? []) if (iconEntry(index, code) === null) out.push({ check: 'ICON', what: `{${code}} (icon set) has no entry` });
  const seen = new Set<string>();
  for (const { where, text } of input.texts)
    for (const seg of matchText(index, text))
      if (seg.kind === 'icon' && seg.id === null && !seen.has(seg.code)) {
        seen.add(seg.code);
        out.push({ check: 'ICON', what: `${seg.raw} (first in ${where}) has no entry` });
      }
  for (const name of input.required ?? []) if (wholeLink(index, name) === null) out.push({ check: 'REQUIRED', what: `"${name}" has no entry of its own` });
  if (input.headings === true) out.push(...firstPlaces('HEADING', index, input.texts, UPPER, 'is not a link', false));
  if (input.vocab !== undefined && input.vocab.length > 0) {
    const re = new RegExp(`(?<![A-Za-z0-9-])(?:${input.vocab.join('|')})(?![A-Za-z0-9])`, 'gi');
    out.push(...firstPlaces('VOCAB', cover, input.texts, re, 'is a game word with no entry', true));
  }
  for (const t of input.texts)
    if (t.generated === true && input.nothingToLink?.(t.text) !== true && !matchText(index, t.text).some((s) => s.kind === 'term' || (s.kind === 'icon' && s.id !== null)))
      out.push({ check: 'LANGUAGE', what: `${t.where}: "${t.text}" links no entry` });
  return out;
}

/** Prints the findings and returns the exit code: 0 clean, 1 findings. */
export function runGlossaryCheck(
  input: GlossaryCheckInput,
  { out = console.log, err = console.error, quiet = false }: { out?: (l: string) => void; err?: (l: string) => void; quiet?: boolean } = {},
): 0 | 1 {
  const findings = checkGlossary(input);
  for (const f of findings) err(`${f.check} ${f.what}`);
  if (findings.length > 0) {
    err(`glossary:check: ${String(findings.length)} finding(s)`);
    return 1;
  }
  if (!quiet) out(`glossary:check: ${String(input.entries.length)} entries cover ${String(input.texts.length)} texts`);
  return 0;
}
