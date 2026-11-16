// Rule-id traceability gate (from Jarl, with EBR's stricter title rules). Every rule id of the plan's rules section,
// found with the configured id families, must appear twice: in a test title (it/test only; describe, .skip, .todo,
// .fails and titles listing more than `maxIdsPerTitle` ids count for none; .skipIf/.runIf do count) and in a code comment
// of a source file. Ids in titles that name a family but are not defined are reported. Scenario ids (`<prefix>-nnn`
// rows of the plan) must each appear in exactly one title. Everything game-specific comes from trace.config.json.
//
//   node check-traceability.ts [--config path] [--strict] [--release] [--quiet] [--warn]
//
// Exit codes: 0 ok (or warning mode), 1 findings in error mode (or a pending id with --release), 2 bad usage.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export interface Config {
  plan: string;
  ruleSection: number;
  families: string[];
  pending: string;
  testDirs: string[];
  testSrcDirs: string[];
  sourceDirs: string[];
  selfTest: string;
  scenarioPrefix: string;
  maxIdsPerTitle: number;
  deferred: Record<string, string>;
  /** K67 options; README.md has the table. */
  countDescribe: boolean;
  countSkipped: boolean;
  requireComment: boolean;
  reportUnknown: boolean;
  idTail: string;
  idsAtLineStart: boolean;
  deferredPrefixes: string[];
  extraRuleHeadings: string[];
  hollowTitlePrefixes: string[];
  scenarioDigits: string;
  scenarios: 'once' | 'required';
  phaseTable: string;
  progress: string;
  phaseDone: string;
  strictFromPhase: string;
  strictIdEnd: boolean;
  unlistedCountsDeferred: boolean;
  rulePendingInlineOnly: boolean;
  skipInsideSkippedDescribe: boolean;
  ignoreTemplateSubstitutions: boolean;
  rejectTemplateTitles: boolean;
  testFilePattern: string;
  staleFails: boolean;
  /** K136 options; README.md has the table. */
  idPattern: string;
  headingDot: boolean;
  scenarioReport: boolean;
  rejectedTitles: boolean;
  countsLine: boolean;
  /** K172 */
  citeFiles: string[];
}
export const DEFAULT_CONFIG: Config = {
  plan: 'docs/BUILD_PLAN.md',
  ruleSection: 3,
  families: ['R'],
  pending: 'traceability-pending.json',
  testDirs: ['tests', 'e2e'],
  testSrcDirs: ['src'],
  sourceDirs: ['src'],
  selfTest: '',
  scenarioPrefix: 'SC',
  maxIdsPerTitle: 6,
  deferred: {},
  countDescribe: false,
  countSkipped: false,
  requireComment: true,
  reportUnknown: true,
  idTail: '\\d{2,3}',
  idsAtLineStart: false,
  deferredPrefixes: [],
  extraRuleHeadings: [],
  hollowTitlePrefixes: [],
  scenarioDigits: '3',
  scenarios: 'once',
  phaseTable: '',
  progress: 'docs/PROGRESS.md',
  phaseDone: '^- (?:Phase|Batch) ([0-9A-Za-z]+)\\b',
  strictFromPhase: '',
  strictIdEnd: false,
  unlistedCountsDeferred: false,
  rulePendingInlineOnly: false,
  skipInsideSkippedDescribe: false,
  ignoreTemplateSubstitutions: false,
  rejectTemplateTitles: false,
  testFilePattern: '',
  staleFails: true,
  idPattern: '',
  headingDot: false,
  scenarioReport: false,
  rejectedTitles: false,
  countsLine: false,
  citeFiles: [],
};
const USAGE = 'usage: node check-traceability.ts [--config path] [--strict] [--release] [--quiet] [--warn]';

/** The pending ids (scripts/traceability-pending.json `pending`: id → the batch that will name it); {} when absent. */
export function readPending(io: Pick<Io, 'readText'>, cfg: Config): Record<string, string> {
  try {
    const parsed = JSON.parse(io.readText(cfg.pending)) as { pending?: unknown };
    const pending = parsed.pending;
    if (typeof pending !== 'object' || pending === null) return {};
    return Object.fromEntries(
      Object.entries(pending as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}

/** The rule-id regexp for the configured families (longest first, so `R` never reads the tail of `RL-005`). */
const idSource = (cfg: Config): string =>
  cfg.idPattern !== '' ? `(?:${cfg.idPattern})` : `(?:${[...cfg.families].sort((a, b) => b.length - a.length).join('|')})-(?:${cfg.idTail})${cfg.strictIdEnd ? '(?![A-Za-z0-9_])' : '(?![0-9])'}`;
export const ruleIdPattern = (cfg: Config): RegExp => new RegExp(cfg.idPattern !== '' ? cfg.idPattern : `(?<![A-Za-z0-9-])${idSource(cfg)}`, 'g');
const isDeferred = (cfg: Config, id: string): boolean =>
  cfg.deferred[id] !== undefined || cfg.deferredPrefixes.some((p) => id.startsWith(p));
/** The rule ids one plan line defines: any id of the line, or (idsAtLineStart) the bold id opening a list item or the first cell of a table row. */
const lineIds = (line: string, cfg: Config): string[] =>
  cfg.idsAtLineStart
    ? [new RegExp(`^(?:\\s*[-*]\\s+\\*\\*|\\|\\s*)(${idSource(cfg)})`).exec(line)?.[1]].filter((x): x is string => x !== undefined)
    : [...line.matchAll(ruleIdPattern(cfg))].map((m) => m[0]);

// ---------------------------------------------------------------------------------------------------------------------
// Rule ids of the plan

/** The lines of section `number` (heading excluded), ignoring headings and lines inside code fences. */
function sectionLines(markdown: string, number: number, dot = false): string[] {
  const out: string[] = [];
  let inFence = false;
  let inSection = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = (dot ? /^## (\d+)\./ : /^## (\d+)(?:\.|\s|$)/).exec(line);
    if (heading !== null) {
      if (inSection) break;
      inSection = Number(heading[1]) === number;
      continue;
    }
    if (inSection) out.push(line);
  }
  return out;
}

/** The lines under the heading that starts with `heading`, up to the next heading of its level or higher. */
function headingLines(markdown: string, heading: string): string[] {
  const all = markdown.split(/\r?\n/);
  const at = all.findIndex((l) => l.startsWith(heading));
  if (at < 0) return [];
  const level = (/^#+/.exec(heading)?.[0] ?? '#').length;
  const out: string[] = [];
  for (const l of all.slice(at + 1)) {
    const h = /^(#+) /.exec(l);
    if (h !== null && (h[1] ?? '').length <= level) break;
    out.push(l);
  }
  return out;
}

function ruleLines(markdown: string, cfg: Config): string[] {
  const lines = sectionLines(markdown, cfg.ruleSection, cfg.headingDot);
  if (lines.length === 0) throw new Error(`section "## ${String(cfg.ruleSection)}." not found in the plan`);
  return [...lines, ...cfg.extraRuleHeadings.flatMap((h) => headingLines(markdown, h))];
}

/** The rule ids the rules section defines, in document order without duplicates or exclusions. Throws without a the rules section. */
export function extractRuleIds(markdown: string, cfg: Config = DEFAULT_CONFIG): string[] {
  const lines = ruleLines(markdown, cfg);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    for (const id of lineIds(line, cfg)) {
      if (seen.has(id) || isDeferred(cfg, id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------------------------------------------------
// Test titles

/** A quoted string starting at `start` (the escapes are resolved only far enough for ids); null when there is none. */
function readString(src: string, start: number): { value: string; end: number } | null {
  const quote = src.charAt(start);
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let value = '';
  for (let i = start + 1; i < src.length; i++) {
    const ch = src.charAt(i);
    if (ch === '\\') {
      value += src.charAt(i + 1);
      i++;
    } else if (ch === quote) {
      return { value, end: i + 1 };
    } else {
      value += ch;
    }
  }
  return null;
}

interface Title {
  title: string;
  /** '' when the title counts; otherwise why it does not. */
  why: string;
}
const memo = new WeakMap<Config, Map<string, Title[]>>();

/** The titles of `it`, `test` and `describe` calls (K136: a TypeScript parse, so strings and comments hold no tests). */
function readTitles(source: string, cfg: Config, path = 'test.ts'): Title[] {
  const key = `${path}\0${source}`;
  const cached = memo.get(cfg)?.get(key);
  if (cached !== undefined) return cached;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const out: Title[] = [];
  const visit = (node: ts.Node, inSkipped: boolean): void => {
    let childSkipped = inSkipped;
    if (ts.isCallExpression(node) && !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
      const mods: string[] = [];
      let e: ts.Expression = node.expression;
      for (;;) {
        if (ts.isPropertyAccessExpression(e)) {
          mods.push(e.name.text);
          e = e.expression;
        } else if (ts.isCallExpression(e)) e = e.expression;
        else if (ts.isTaggedTemplateExpression(e)) e = e.tag;
        else break;
      }
      const root = ts.isIdentifier(e) && /^x?(?:it|test|describe)$/.test(e.text) ? e.text : '';
      const skip = root.startsWith('x') || mods.includes('skip') || mods.includes('todo');
      if (cfg.skipInsideSkippedDescribe && root.endsWith('describe') && skip) childSkipped = true;
      let t: ts.Expression | undefined = node.arguments[0];
      if (!cfg.ignoreTemplateSubstitutions) while (t !== undefined && ts.isBinaryExpression(t)) t = t.left;
      if (root !== '' && t !== undefined && (ts.isStringLiteral(t) || ts.isNoSubstitutionTemplateLiteral(t) || (ts.isTemplateExpression(t) && !cfg.ignoreTemplateSubstitutions))) {
        const title = ts.isTemplateExpression(t) ? t.getText(file).slice(1, -1) : t.text;
        const n = new Set(title.match(ruleIdPattern(cfg)) ?? []).size;
        out.push({
          title,
          why:
            root.endsWith('describe') && (!cfg.countDescribe || root.startsWith('x'))
              ? 'describe'
              : root.startsWith('x') || inSkipped || (!cfg.countSkipped && skip)
                ? 'unconditional skip or todo'
                : (!cfg.countSkipped && mods.includes('fails')) || cfg.hollowTitlePrefixes.some((p) => title.startsWith(p))
                  ? 'pending expected failure'
                  : cfg.rejectTemplateTitles && ts.isTemplateExpression(t)
                    ? 'a template title with ${...}'
                    : cfg.maxIdsPerTitle > 0 && n > cfg.maxIdsPerTitle
                    ? `a title with ${String(n)} ids`
                    : '',
        });
      }
    }
    ts.forEachChild(node, (child) => {
      visit(child, childSkipped);
    });
  };
  visit(file, false);
  if (!memo.has(cfg)) memo.set(cfg, new Map());
  memo.get(cfg)?.set(key, out);
  return out;
}

/**
 * The counting titles of the tests in one source file: the first argument of `it` and `test` calls (with `.only`, …), also
 * of `it.each(table)('title', …)` and `it.runIf(cond)('title', …)`. Not counted (EBR): `describe`,
 * `.skip`, `.todo`, `.fails`, `x`-prefixed calls and titles with too many ids. `.skipIf` counts.
 * Template literals count with their `${…}` parts as written.
 */
export const extractTitles = (source: string, cfg: Config = DEFAULT_CONFIG, path = 'test.ts'): string[] =>
  readTitles(source, cfg, path)
    .filter((t) => t.why === '')
    .map((t) => t.title);

// ---------------------------------------------------------------------------------------------------------------------
// Code comments

/**
 * The comments of one source file: `// …` to the end of the line and `/* … *\/` blocks. Strings are skipped, so a URL in a
 * string is not a comment; a regular expression literal holding `//` may be read as one, which only ever adds text.
 */
export function extractComments(source: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < source.length; i++) {
    const ch = source.charAt(i);
    if (ch === "'" || ch === '"' || ch === '`') {
      const s = readString(source, i);
      if (s === null) break;
      i = s.end - 1;
    } else if (ch === '/' && source.charAt(i + 1) === '/') {
      const end = source.indexOf('\n', i);
      const stop = end < 0 ? source.length : end;
      out.push(source.slice(i + 2, stop));
      i = stop;
    } else if (ch === '/' && source.charAt(i + 1) === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end;
      out.push(source.slice(i + 2, stop));
      i = stop + 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Coverage

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The id as a whole word, optionally with one sub-letter ("SET-01a" names SET-01); "SET-01" is not found in "SET-010". */
function idPattern(id: string, strictEnd = false): RegExp {
  return new RegExp(`(?<![A-Za-z0-9-])${escapeRegExp(id)}${strictEnd ? '(?![A-Za-z0-9_])' : '[a-z]?(?![A-Za-z0-9-])'}`);
}

export interface SourceFile {
  path: string;
  text: string;
}

export interface Coverage {
  ids: string[];
  /** id → the test files with a title that names it. */
  titled: Map<string, string[]>;
  /** id → the source files under src/ (not tests) with a comment that cites it. */
  cited: Map<string, string[]>;
  /** Ids both titled and cited. */
  covered: string[];
  /** Ids not named in any test title. */
  untitled: string[];
  /** Ids not cited in any code comment. */
  uncited: string[];
  /** Ids in test titles that name a rule family but that the rules section does not define. */
  unknown: string[];
}

function filesNaming(id: string, files: readonly { path: string; texts: string[] }[], strictEnd = false): string[] {
  const pattern = idPattern(id, strictEnd);
  return files.filter((file) => file.texts.some((text) => pattern.test(text))).map((file) => file.path);
}

export function computeCoverage(
  plan: string,
  tests: readonly SourceFile[],
  sources: readonly SourceFile[],
  cfg: Config = DEFAULT_CONFIG,
): Coverage {
  const ids = extractRuleIds(plan, cfg);
  const testTexts = tests.map((file) => ({ path: file.path, texts: extractTitles(file.text, cfg, file.path) }));
  const sourceTexts = sources.map((file) => ({ path: file.path, texts: extractComments(file.text) }));
  const titled = new Map<string, string[]>();
  const cited = new Map<string, string[]>();
  for (const id of ids) {
    const t = filesNaming(id, testTexts, cfg.strictIdEnd);
    if (t.length > 0) titled.set(id, t);
    const c = filesNaming(id, sourceTexts, cfg.strictIdEnd);
    if (c.length > 0) cited.set(id, c);
  }
  const known = new Set(ids);
  const unknown = new Set<string>();
  for (const file of testTexts) {
    for (const text of file.texts) {
      for (const match of text.matchAll(ruleIdPattern(cfg))) {
        if (cfg.reportUnknown && !known.has(match[0]) && !isDeferred(cfg, match[0])) unknown.add(match[0]);
      }
    }
  }
  return {
    ids,
    unknown: [...unknown].sort(),
    titled,
    cited,
    covered: ids.filter((id) => titled.has(id) && (cited.has(id) || !cfg.requireComment)),
    untitled: ids.filter((id) => !titled.has(id)),
    uncited: cfg.requireComment ? ids.filter((id) => !cited.has(id)) : [],
  };
}

/** `SET-01 SET-02 ARR-01` → `SET       01 02` and `ARR       01`: one line per family keeps a long list readable. */
export function groupByPrefix(ids: readonly string[]): string[] {
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const dash = id.lastIndexOf('-');
    const prefix = id.slice(0, dash);
    groups.set(prefix, [...(groups.get(prefix) ?? []), id.slice(dash + 1)]);
  }
  return [...groups].map(([prefix, rest]) => `  ${prefix.padEnd(9)} ${[...rest].sort().join(' ')}`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Scenarios (§10.3: every SC id of §10.4 appears in exactly one test title)

const scId = (cfg: Config): RegExp => new RegExp(`(?<![A-Za-z0-9-])${cfg.scenarioPrefix}-\\d{${cfg.scenarioDigits}}(?![0-9])`, 'g');

/** The SC ids of the plan's scenario catalogue (table rows starting `| SC-nnn |`). */
export function extractScenarioIds(markdown: string, cfg: Config = DEFAULT_CONFIG): string[] {
  const out: string[] = [];
  for (const m of markdown.matchAll(new RegExp(`^\\| (${cfg.scenarioPrefix}-\\d{${cfg.scenarioDigits}}) \\|`, 'gm'))) if (!out.includes(m[1] as string)) out.push(m[1] as string);
  return out;
}

export interface ScenarioCoverage {
  /** SC id → the number of test titles naming it. */
  readonly counts: Map<string, number>;
  /** Catalogue ids named in no test title (expected until the batch that builds them). */
  readonly missing: string[];
  /** Ids named in more than one test title. */
  readonly repeated: string[];
  /** SC ids in titles that the catalogue does not define. */
  readonly unknown: string[];
}

export function scenarioCoverage(plan: string, tests: readonly SourceFile[], cfg: Config = DEFAULT_CONFIG): ScenarioCoverage {
  const ids = extractScenarioIds(plan, cfg);
  const counts = new Map<string, number>();
  for (const file of tests) {
    for (const title of extractTitles(file.text, cfg, file.path)) {
      for (const id of new Set([...title.matchAll(scId(cfg))].map((m) => m[0]))) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return {
    counts,
    missing: ids.filter((id) => !counts.has(id)),
    repeated: [...counts].filter(([, n]) => n > 1).map(([id]) => id).sort(),
    unknown: [...counts.keys()].filter((id) => !ids.includes(id)).sort(),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Phases (from EBR): a family is due once the phase that lists it in the phase table is in the progress file; a line with
// `pending: <phase>` waits for that phase.

export const familyOf = (id: string): string => id.replace(/-\d+$/, '');

/** Phase → rule families, from the table under `cfg.phaseTable` (phase in the first column, families in the third). */
export function phaseFamilies(plan: string, cfg: Config): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const line of headingLines(plan, cfg.phaseTable)) {
    const cells = line.split('|').map((c) => c.trim());
    const phase = cells[1] ?? '';
    if (cells.length < 5 || !/^(?:\d+[a-z]?|[A-Z][A-Z0-9]{0,2})$/.test(phase)) continue;
    out.set(
      phase,
      (cells[3] ?? '')
        .replace(/[()]/g, '')
        .replace(/\ball\b/g, '')
        .split(',')
        .map((f) => f.trim().replace(/-\*$/, ''))
        .filter((f) => /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/.test(f)),
    );
  }
  return out;
}

export const mergedPhases = (progress: string, cfg: Config): Set<string> =>
  new Set([...progress.matchAll(new RegExp(cfg.phaseDone, 'gm'))].map((m) => m[1] ?? ''));

/** id → phase, for the lines carrying `pending: <phase>` or under a line that is only `pending: <phase>` (until the next heading). */
export function inlinePending(lines: readonly string[], idOf: (line: string) => string | undefined, groups = true): Map<string, string> {
  const out = new Map<string, string>();
  let group: string | undefined;
  for (const line of lines) {
    if (line.startsWith('#')) group = undefined;
    const g = /^pending: ?([0-9A-Za-z]+)\.?\s*$/.exec(line);
    if (g !== null && groups) group = g[1];
    const phase = /\bpending: ?([0-9A-Za-z]+)\b/.exec(line)?.[1] ?? group;
    const id = idOf(line);
    if (phase !== undefined && id !== undefined) out.set(id, phase);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Command line

export interface Io {
  readText(path: string): string;
  /** The test sources: every .ts/.tsx file under tests/ and e2e/, and the .test.ts(x) files of src/. */
  testFiles(): SourceFile[];
  /** The code under src/: every .ts/.tsx file that is not a test. */
  sourceFiles(): SourceFile[];
  out(line: string): void;
  err(line: string): void;
}

function walk(dir: string, accept: (name: string) => boolean, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // a missing folder is fine
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, accept, out);
    else if (accept(entry.name)) out.push(full);
  }
}

const isSource = (name: string): boolean => /\.tsx?$/.test(name);
const isTest = (name: string): boolean => /\.test\.tsx?$/.test(name);

const readAll = (root: string, found: readonly string[]): SourceFile[] =>
  found.map((full) => ({ path: full.slice(root.length).replace(/\\/g, '/'), text: readFileSync(full, 'utf8') }));

export const makeIo = (root: string, cfg: Config): Io => ({
  readText: (path) => readFileSync(join(root, path), 'utf8'),
  testFiles: () => {
    const found: string[] = [];
    for (const d of cfg.testDirs) walk(join(root, d), cfg.testFilePattern === '' ? isSource : (name) => new RegExp(cfg.testFilePattern).test(name), found);
    for (const d of cfg.testSrcDirs) walk(join(root, d), isTest, found);
    return readAll(root, found).filter((file) => file.path !== cfg.selfTest);
  },
  sourceFiles: () => {
    const found: string[] = [];
    for (const d of new Set([...cfg.sourceDirs, ...cfg.citeFiles])) walk(join(root, d), (name) => isSource(name) && !isTest(name), found);
    return readAll(root, found);
  },
  out: (line) => {
    console.log(line);
  },
  err: (line) => {
    console.error(line);
  },
});

export function run(args: readonly string[], io: Io, cfg: Config = DEFAULT_CONFIG): number {
  const unknown = args.filter(
    (a) => a !== '--strict' && a !== '--warn' && a !== '--quiet' && a !== '--release',
  );
  if (unknown.length > 0) {
    io.err(`unknown argument: ${unknown.join(' ')}\n${USAGE}`);
    return 2;
  }
  const release = args.includes('--release');
  const quiet = args.includes('--quiet');

  const plan = io.readText(cfg.plan);
  let merged = new Set<string>();
  try {
    merged = mergedPhases(io.readText(cfg.progress), cfg);
  } catch {
    // no progress file: no phase has merged
  }
  const strict =
    (args.includes('--strict') || release || (cfg.strictFromPhase !== '' && merged.has(cfg.strictFromPhase))) && !args.includes('--warn');
  const tests = io.testFiles();
  const coverage = computeCoverage(plan, tests, io.sourceFiles(), cfg);
  const { ids, covered } = coverage;
  const pending = readPending(io, cfg);
  const known = new Set(ids);
  const stale = Object.keys(pending).filter((id) => !known.has(id));
  const notDue = new Set<string>();
  let unlisted: string[] = [];
  let due = ids;
  let implementedList = '';
  if (cfg.phaseTable !== '') {
    const fams = phaseFamilies(plan, cfg);
    const implemented = new Set([...fams].filter(([p]) => merged.has(p)).flatMap(([, f]) => f));
    const listed = new Set([...fams.values()].flat());
    due = ids.filter((id) => implemented.has(familyOf(id)));
    implementedList = [...implemented].sort().join(', ');
    const inline = inlinePending(
      cfg.rulePendingInlineOnly ? sectionLines(plan, cfg.ruleSection, cfg.headingDot) : ruleLines(plan, cfg),
      (l) => lineIds(l, cfg)[0],
      !cfg.rulePendingInlineOnly,
    );
    for (const id of ids) {
      const ph = inline.get(id);
      if (!implemented.has(familyOf(id)) || (ph !== undefined && !merged.has(ph))) notDue.add(id);
    }
    unlisted = [...new Set((cfg.unlistedCountsDeferred ? ruleLines(plan, cfg).flatMap((l) => lineIds(l, cfg)) : ids).map(familyOf))].filter((f) => !listed.has(f)).sort();
    io.out(`phases: ${String(notDue.size)} rule ids not due yet (their phase is not in ${cfg.progress})`);
    if (unlisted.length > 0) io.err(`rule families missing from the phase table: ${unlisted.join(' ')}`);
  }
  const missingTitle = coverage.untitled.filter((id) => pending[id] === undefined && !notDue.has(id));
  const missingCite = coverage.uncited.filter((id) => pending[id] === undefined && !notDue.has(id));
  const waiting = ids.filter((id) => pending[id] !== undefined && !covered.includes(id));
  const done = Object.keys(pending).filter((id) => covered.includes(id));
  const mode = release ? 'release mode' : strict ? 'error mode' : 'warning mode';
  io.out(
    `traceability (${mode}): ${String(ids.length)} rule ids in the rules section (deferred ones excluded), ${String(covered.length)} titled and cited, ${String(waiting.length)} pending (${cfg.pending}), ${String(missingTitle.length)} not in a test title, ${String(missingCite.length)} not in a code comment`,
  );
  if (missingTitle.length > 0 && !quiet) {
    io.out('not named in any test title, and not pending:');
    for (const line of groupByPrefix(missingTitle)) io.out(line);
  }
  if (missingCite.length > 0 && !quiet) {
    io.out('not cited in any code comment under src/, and not pending:');
    for (const line of groupByPrefix(missingCite)) io.out(line);
  }
  if (done.length > 0 && !quiet)
    io.out(`titled and cited but still pending (remove them): ${done.join(' ')}`);
  if (stale.length > 0) io.err(`pending ids that the rules section does not define: ${stale.join(' ')}`);
  if (release && Object.keys(pending).length > 0) {
    io.err(`release: ${String(Object.keys(pending).length)} rule id(s) are still pending`);
    return 1;
  }
  if (coverage.unknown.length > 0 && !quiet)
    io.out(`named in a test title but not defined in the rules section: ${coverage.unknown.join(' ')}`);
  const sc: ScenarioCoverage =
    cfg.scenarioPrefix === '' ? { counts: new Map(), missing: [], repeated: [], unknown: [] } : scenarioCoverage(plan, tests, cfg);
  const required = cfg.scenarios === 'required';
  const scRow = new RegExp(`^\\| (${cfg.scenarioPrefix}-\\d{${cfg.scenarioDigits}}) \\|`);
  const scWaits = inlinePending(plan.split(/\r?\n/), (l) => scRow.exec(l)?.[1]);
  const scMissing = required
    ? sc.missing.filter((id) => {
        const ph = scWaits.get(id);
        return ph === undefined || merged.has(ph);
      })
    : [];
  const scRepeated = required ? [] : sc.repeated;
  if (sc.counts.size > 0 || sc.missing.length > 0) {
    io.out(
      `scenarios: ${String(sc.counts.size)} of the catalogue in test titles, ${String(sc.missing.length)} not yet (a later batch), ${String(sc.repeated.length)} in more than one title`,
    );
  }
  if (scRepeated.length > 0) io.err(`scenario ids in more than one test title: ${scRepeated.join(' ')}`);
  if (scMissing.length > 0)
    io.err(
      cfg.scenarioReport
        ? `${String(scMissing.length)} scenario row(s) have no test: ${scMissing.map((id) => (scWaits.has(id) ? `${id} (pending: ${scWaits.get(id) ?? ''}, which is merged)` : id)).join(', ')}`
        : `scenario ids in no test title, and not pending: ${scMissing.join(' ')}`,
    );
  if (sc.unknown.length > 0) io.err(`scenario ids in test titles that the plan's scenario catalogue does not define: ${sc.unknown.join(' ')}`);
  if (cfg.countsLine) {
    const rows = cfg.scenarioPrefix === '' ? 0 : extractScenarioIds(plan, cfg).length;
    const missing = new Set([...missingTitle, ...missingCite]);
    io.out(
      `counts: ${String(ids.length)} rules defined; ${String(due.length)} in implemented families (${implementedList || 'none'}); ${String(due.filter((id) => !missing.has(id)).length)} cited or pending; ${String(rows - scMissing.length)} of ${String(rows)} scenarios tested or pending.`,
    );
  }
  if (cfg.rejectedTitles) {
    const ok = new Set<string>();
    const hollow = new Map<string, string>();
    for (const f of tests)
      for (const t of readTitles(f.text, cfg, f.path))
        for (const id of new Set(t.title.match(ruleIdPattern(cfg)) ?? [])) {
          if (t.why === '') ok.add(id);
          else if (t.why !== 'describe' && !hollow.has(id)) hollow.set(id, t.why);
        }
    const only = [...hollow].filter(([id]) => !ok.has(id));
    if (only.length > 0)
      io.out(`${String(only.length)} id(s) are named only by titles the gate rejects: ${only.map(([id, why]) => `${id} [${why}]`).join(', ')}`);
  }
  const sourcesAll = io.sourceFiles();
  const noCite = cfg.citeFiles.length === 0 ? [] : sourcesAll.filter((f) => cfg.citeFiles.some((d) => f.path.startsWith(d.replace(/\\/g, '/').replace(/\/+$/, '') + '/')) && !extractComments(f.text).some((t) => (t.match(ruleIdPattern(cfg)) ?? []).some((id) => known.has(id)))).map((f) => f.path).filter((p, i, a) => a.indexOf(p) === i);
  if (noCite.length > 0) io.out(`files under ${cfg.citeFiles.join(', ')} citing no rule id in a comment: ${noCite.join(', ')}`);
  const failed =
    noCite.length > 0 ||
    missingTitle.length > 0 ||
    missingCite.length > 0 ||
    (cfg.staleFails && stale.length > 0) ||
    coverage.unknown.length > 0 ||
    scRepeated.length > 0 ||
    scMissing.length > 0 ||
    unlisted.length > 0 ||
    sc.unknown.length > 0;
  return strict && failed ? 1 : 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--config');
  const file = at >= 0 ? (args.splice(at, 2)[1] ?? '') : 'trace.config.json';
  const root = process.cwd();
  const cfg: Config = { ...DEFAULT_CONFIG, ...(JSON.parse(readFileSync(join(root, file), 'utf8')) as Partial<Config>) };
  process.exitCode = run(args, makeIo(root + '/', cfg), cfg);
}
