// The printed-words check (lifted from 7th Inning Stretch scripts/glossary-check.ts, PRINTED): every entry's summary and
// each body paragraph occurs in the game's source documents, icons and punctuation aside. Never a paraphrase.
// CLI: node kit/glossary/printed.ts --entries <glossary.json> --source <file or folder> [--source ...]
//        [--icon <regex>] [--strip <regex>]... [--letters <character class>] [--exempt <field>=<value>]...
// Uses node:fs, so it is not exported from index.ts.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GlossaryEntry } from './match.ts';

export const PRINTED_ICON = /\{[a-z0-9-]+(?::[^}]*)?\}/g;

export interface PrintedInput {
  entries: readonly GlossaryEntry[];
  /** The text of each source document. */
  sources: readonly string[];
  /** Icon markup, left out of both sides (default `{code}` and `{code:value}`). */
  icon?: RegExp;
  /** Markup removed from the sources before comparing (BBCode tags and the like). */
  strip?: readonly RegExp[];
  /** The characters that count, as a character class body (default `a-z0-9`); the rest is punctuation. Compared in lower case. */
  letters?: string;
  /** An entry that is not a quotation (an arbiter's explanation). */
  exempt?: (entry: GlossaryEntry) => boolean;
}

const all = (re: RegExp): RegExp => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);

export function printedFindings(input: PrintedInput): string[] {
  const icon = all(input.icon ?? PRINTED_ICON);
  const other = new RegExp(`[^${input.letters ?? 'a-z0-9'}]+`, 'g');
  const norm = (t: string): string => t.replace(icon, ' ').replace(/-\s*\n\s*/g, '').toLowerCase().replace(other, ' ').trim();
  let joined = input.sources.join(' | ');
  for (const s of input.strip ?? []) joined = joined.replace(all(s), '');
  const sources = norm(joined);
  const out: string[] = [];
  for (const e of input.entries) {
    if (input.exempt?.(e) === true) continue;
    for (const [part, t] of [['summary', e.summary], ['body', e.body]] as const)
      for (const p of (t ?? '').split(/\n\n/).filter(Boolean))
        if (!sources.includes(norm(p))) out.push(`PRINTED ${e.id} ${part} is not printed in the source documents: ${p}`);
  }
  return out;
}

const FLAGS = ['--entries', '--source', '--icon', '--strip', '--letters', '--exempt'];

/** The CLI: 0 clean, 1 findings, 2 bad arguments. */
export function runPrintedCheck(args: readonly string[], out: (l: string) => void = console.log, err: (l: string) => void = console.error): 0 | 1 | 2 {
  const opt: Record<string, string[]> = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i] ?? '';
    const v = args[i + 1];
    if (!FLAGS.includes(k) || v === undefined) {
      err(`glossary:printed: bad argument ${k}; flags: ${FLAGS.join(' ')}`);
      return 2;
    }
    (opt[k] ??= []).push(v);
  }
  const file = opt['--entries']?.[0];
  const paths = opt['--source'] ?? [];
  if (file === undefined || paths.length === 0) {
    err('glossary:printed: needs --entries <glossary.json> and at least one --source <file or folder>');
    return 2;
  }
  const files = paths.flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).sort().map((f) => join(p, f)).filter((f) => statSync(f).isFile()) : [p]));
  const exempt = (opt['--exempt'] ?? []).map((x) => [x.slice(0, x.indexOf('=')), x.slice(x.indexOf('=') + 1)] as const);
  const entries = JSON.parse(readFileSync(file, 'utf8')) as GlossaryEntry[];
  const iconSrc = opt['--icon']?.[0];
  const letters = opt['--letters']?.[0];
  const findings = printedFindings({
    entries,
    sources: files.map((f) => readFileSync(f, 'utf8')),
    strip: (opt['--strip'] ?? []).map((s) => new RegExp(s, 'g')),
    exempt: (e) => exempt.some(([f, v]) => (e as unknown as Record<string, unknown>)[f] === v),
    ...(iconSrc === undefined ? {} : { icon: new RegExp(iconSrc, 'g') }),
    ...(letters === undefined ? {} : { letters }),
  });
  for (const f of findings) err(f);
  if (findings.length > 0) {
    err(`glossary:printed: ${String(findings.length)} finding(s)`);
    return 1;
  }
  out(`glossary:printed: ${String(entries.length)} entries are printed in ${String(files.length)} source document(s)`);
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = runPrintedCheck(process.argv.slice(2));
