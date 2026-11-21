// K488: the four parts of a game's `cards:check` (clauses, restrictions, patterns, readings), `--list-restrictions`,
// `--record` (a reading judge's PR comment written to docs/cards/readings/<batch>.md with a hash per clause), the
// clause tools for `cards:catalogue` and the catalogue.json contract. Pure functions; the game script passes data.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export interface CatalogueClause { readonly id: string; readonly card: string; readonly text: string }
export interface CataloguePattern { readonly id: string; readonly name?: string; readonly clauses: readonly CatalogueClause[]; readonly [k: string]: unknown }
/** docs/cards/catalogue.json: at least these keys; a game may add more. */
export interface Catalogue {
  readonly summary: { readonly clauses: number; readonly [k: string]: unknown };
  readonly patterns: readonly CataloguePattern[];
  readonly oneOffs: readonly CatalogueClause[];
  readonly interactions: readonly { readonly id: string; readonly [k: string]: unknown }[];
  readonly [k: string]: unknown;
}
/** A printed face: `text` may hold ' ¶ ' paragraph marks; several faces of one card join in order. `clauses`: the content's count. */
export interface Face { readonly card: string; readonly text: string; readonly clauses?: number }
/** An encoded record: `clause` names the printed clause it encodes; restriction keys and `why` sit on it as data. */
export interface CardRecord { readonly id: string; readonly clause: string; readonly [k: string]: unknown }
export interface OpenClause { readonly clause: string; readonly reason: string }

const PARA = ' ¶ ';
const norm = (s: string): string => s.split('¶').join(' ').replace(/\s+/g, ' ').trim();
const byId = (a: CatalogueClause, b: CatalogueClause): number => a.id.localeCompare(b.id, 'en', { numeric: true });

// ---- clause tools (cards:catalogue) ----

/** Split a face's text into clauses: first at each ' ¶ ', then inside a paragraph before each match of `lead` (a lookahead). */
export function splitClauses(text: string, lead?: RegExp): string[] {
  return text.split('¶').flatMap((p) => (lead ? p.split(lead) : [p])).map((s) => s.trim()).filter((s) => s !== '');
}
/** Number a card's clauses in printed order: `<card>#<n>` from `from` (default 1). Several faces: pass them in order. */
export function numberClauses(card: string, texts: readonly string[], lead?: RegExp, from = 1): CatalogueClause[] {
  return texts.flatMap((t) => splitClauses(t, lead)).map((text, i) => ({ id: `${card}#${String(i + from)}`, card, text }));
}
/** The wording with numbers as `N`, icon amounts `{code:3}` as `{code:N}` and each name (longest first) as `NAME`. */
export function maskClause(text: string, names: readonly string[] = []): string {
  let s = text;
  for (const n of [...names].filter((x) => x !== '').sort((a, b) => b.length - a.length)) s = s.split(n).join('NAME');
  return s.replace(/\d+/g, 'N');
}
/** Group clauses whose masked wording is equal; the biggest group first. */
export function groupClauses(clauses: readonly CatalogueClause[], names: readonly string[] = []): { key: string; clauses: CatalogueClause[] }[] {
  const m = new Map<string, CatalogueClause[]>();
  for (const c of clauses) { const k = maskClause(c.text, names); m.set(k, [...(m.get(k) ?? []), c]); }
  return [...m].map(([key, cs]) => ({ key, clauses: cs })).sort((a, b) => b.clauses.length - a.clauses.length || (a.key < b.key ? -1 : 1));
}
export function catalogueClauses(cat: Catalogue): CatalogueClause[] {
  return [...cat.patterns.flatMap((p) => p.clauses), ...cat.oneOffs];
}
/** cards:catalogue --check: each clause in exactly one pattern or the one-offs; no one-clause pattern; the summary's count. */
export function catalogueProblems(cat: Catalogue): string[] {
  const out: string[] = [];
  const where = new Map<string, string[]>();
  for (const p of cat.patterns) for (const c of p.clauses) where.set(c.id, [...(where.get(c.id) ?? []), p.id]);
  for (const c of cat.oneOffs) where.set(c.id, [...(where.get(c.id) ?? []), 'one-offs']);
  for (const [id, w] of where) if (w.length > 1) out.push(`${id} is in ${String(w.length)} places: ${w.join(', ')}`);
  for (const p of cat.patterns) if (p.clauses.length < 2) out.push(`${p.id} has ${String(p.clauses.length)} clause(s)`);
  if (cat.summary.clauses !== where.size) out.push(`summary says ${String(cat.summary.clauses)} clauses, counted ${String(where.size)}`);
  return out;
}

// ---- part 1: clauses ----

export interface ClauseInput { readonly faces: readonly Face[]; readonly catalogue: Catalogue; readonly records: readonly CardRecord[]; readonly open?: readonly OpenClause[] }
const ENDS = /[.!?…:;)\]"'”’]$/;
export function clauseProblems(i: ClauseInput): string[] {
  const out: string[] = [];
  const all = catalogueClauses(i.catalogue);
  const ids = new Set(all.map((c) => c.id));
  const cards = [...new Set(i.faces.map((f) => f.card))];
  for (const card of cards) {
    const faces = i.faces.filter((f) => f.card === card);
    const mine = all.filter((c) => c.card === card).sort(byId);
    const text = faces.map((f) => f.text).join(PARA);
    if (mine.length === 0) { if (norm(text) !== '') out.push(`missing row ${card}`); continue; }
    if (norm(mine.map((c) => c.text).join(' ')) !== norm(text)) out.push(`${card}: clauses do not rejoin`);
    else {
      let at = 0;
      const flat = text.replace(/\s+/g, ' ');
      mine.slice(0, -1).forEach((c) => {
        const t = c.text.replace(/\s+/g, ' ').trim();
        const k = flat.indexOf(t, at);
        if (k < 0) return;
        at = k + t.length;
        if (!ENDS.test(t) && !flat.slice(at).startsWith(PARA)) out.push(`${c.id} does not end a sentence`);
      });
    }
    const counted = faces.reduce<number | undefined>((s, f) => (f.clauses === undefined ? s : (s ?? 0) + f.clauses), undefined);
    if (counted !== undefined && counted !== mine.length) out.push(`${card}: ${String(counted)} clauses in content, ${String(mine.length)} in the catalogue`);
  }
  for (const c of all) if (!cards.includes(c.card)) out.push(`catalogued clause ${c.id} is on no face`);
  const recorded = new Set(i.records.map((r) => r.clause));
  for (const r of i.records) if (!ids.has(r.clause)) out.push(`orphan record ${r.id} (clause ${r.clause} does not exist)`);
  const open = new Map((i.open ?? []).map((o) => [o.clause, o.reason]));
  for (const c of all) if (!recorded.has(c.id) && !open.has(c.id)) out.push(`no record: ${c.id}`);
  for (const [c, reason] of open) {
    if (!ids.has(c)) out.push(`open clause ${c} does not exist`);
    else if (reason.trim() === '') out.push(`open clause ${c} has no reason`);
  }
  return out;
}

// ---- part 2: restrictions ----

/** `words`: `"<key>:<value>"` (value as `String(v)`) to the printed phrases that justify it, e.g. `"moment:start": ["Start of"]`. */
export interface RestrictionInput {
  readonly catalogue: Catalogue;
  readonly records: readonly CardRecord[];
  /** The grammar's restriction keys (phase, moment, trigger, condition, limit, optional, duration). */
  readonly keys: readonly string[];
  readonly words: Readonly<Record<string, readonly string[]>>;
  /** Ruling ids (AR map and rulings log). */
  readonly rulings: readonly string[];
  /** A record that leaves something lasting; it must carry `durationKey` (default `duration`). */
  readonly lasting?: (r: CardRecord) => boolean;
  readonly durationKey?: string;
  /** The key holding a record's ruling id(s) (default `why`). */
  readonly whyKey?: string;
  /** A problem allowed as data: the record or clause, the key, the ruling. Uncited or matching nothing fails. */
  readonly exceptions?: readonly { readonly id: string; readonly key: string; readonly ar: string }[];
}
const val = (v: unknown): string => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
const has = (text: string, phrase: string): boolean => text.toLowerCase().includes(phrase.toLowerCase());
const cites = (why: unknown, rulings: ReadonlySet<string>): boolean => [why].flat().some((w) => typeof w === 'string' && [...rulings].some((r) => new RegExp(`(^|[^\\w-])${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(w)));
export function restrictionProblems(i: RestrictionInput): string[] {
  const rulings = new Set(i.rulings);
  const text = new Map(catalogueClauses(i.catalogue).map((c) => [c.id, c.text]));
  const whyKey = i.whyKey ?? 'why', dk = i.durationKey ?? 'duration';
  const found: { id: string; key: string; message: string }[] = [];
  for (const r of i.records) {
    const t = text.get(r.clause) ?? '';
    for (const k of new Set([...i.keys, ...(i.lasting?.(r) ? [dk] : [])])) {
      if (r[k] === undefined) continue;
      const v = val(r[k]);
      if ((i.words[`${k}:${v}`] ?? []).some((p) => has(t, p)) || cites(r[whyKey], rulings)) continue;
      found.push({ id: r.id, key: k, message: `${r.id}: ${k}=${v} has no printed source and no AR` });
    }
    if (i.lasting?.(r) && r[dk] === undefined) found.push({ id: r.id, key: dk, message: `${r.id}: lasting effect with no duration` });
  }
  for (const [c, t] of text) {
    const recs = i.records.filter((r) => r.clause === c);
    if (recs.length === 0) continue;
    for (const [kv, phrases] of Object.entries(i.words)) {
      const p = phrases.find((x) => has(t, x));
      const k = kv.slice(0, kv.indexOf(':')), v = kv.slice(kv.indexOf(':') + 1);
      if (p !== undefined && !recs.some((r) => r[k] !== undefined && val(r[k]) === v)) found.push({ id: c, key: k, message: `${c}: printed "${p}" has no restriction ${k}=${v}` });
    }
  }
  const used = new Set<object>();
  const out = found.filter((f) => {
    const e = (i.exceptions ?? []).find((x) => x.id === f.id && x.key === f.key && rulings.has(x.ar));
    if (e) used.add(e);
    return e === undefined;
  }).map((f) => f.message);
  for (const e of i.exceptions ?? []) {
    if (!rulings.has(e.ar)) out.push(`exception ${e.id} ${e.key} cites no known ruling (${e.ar})`);
    else if (!used.has(e)) out.push(`exception ${e.id} ${e.key} matches nothing`);
  }
  return out;
}
/** The clauses with the most restriction words, most first (`--list-restrictions`). */
export function restrictionCounts(clauses: readonly CatalogueClause[], words: Readonly<Record<string, readonly string[]>>): { clause: CatalogueClause; count: number; words: string[] }[] {
  const phrases = [...new Set(Object.values(words).flat())];
  return clauses.map((c) => { const w = phrases.filter((p) => has(c.text, p)); return { clause: c, count: w.length, words: w }; })
    .sort((a, b) => b.count - a.count || byId(a.clause, b.clause));
}

// ---- part 3: patterns ----

export interface PatternInput {
  readonly catalogue: Catalogue;
  readonly records: readonly CardRecord[];
  /** AR-map rows of patterns: `ar` the ruling ids or `not read`; `split` when the map splits the pattern. */
  readonly arMap: readonly { readonly id: string; readonly ar: string; readonly split?: boolean }[];
  /** A record's shape (default: its sorted keys but `id`, `clause` and `why`). */
  readonly shape?: (r: CardRecord) => string;
  /** K509: compare shapes only among clauses of one wording key (`true`: the text with numbers as N, `maskClause`). */
  readonly wording?: true | ((c: CatalogueClause) => string);
  /** K509: a non-null reason leaves that clause out of the shape comparison. */
  readonly allowShape?: (clauseId: string, records: CardRecord[]) => string | null;
}
const SKIP = new Set(['id', 'clause', 'why']);
/** K509: `<clause> excused: <reason>` for each encoded pattern clause `allowShape` excuses (notes, not problems). */
export function patternNotes(i: PatternInput): string[] {
  return i.catalogue.patterns.flatMap((p) => p.clauses.flatMap((c) => {
    const recs = i.records.filter((r) => r.clause === c.id);
    const why = recs.length ? i.allowShape?.(c.id, recs) : null;
    return why == null ? [] : [`${c.id} excused: ${why}`];
  }));
}
export function patternProblems(i: PatternInput): string[] {
  const out: string[] = [];
  const shape = i.shape ?? ((r: CardRecord) => Object.keys(r).filter((k) => !SKIP.has(k)).sort().join(','));
  const key = i.wording === undefined ? undefined : i.wording === true ? (c: CatalogueClause) => c.text.replace(/\{[^}]*\}|\d+/g, (m) => (m.startsWith('{') ? m : 'N')) : i.wording;
  for (const p of i.catalogue.patterns) {
    const shapes = new Map<string, string>();
    const groups = new Map<string, Map<string, string>>();
    let encoded = false;
    for (const c of p.clauses) {
      const recs = i.records.filter((r) => r.clause === c.id);
      if (!recs.length) continue;
      encoded = true;
      if (i.allowShape?.(c.id, recs) != null) continue;
      const s = recs.map(shape).sort().join(' + ');
      let g = shapes;
      if (key) { const k = key(c); g = groups.get(k) ?? new Map<string, string>(); groups.set(k, g); }
      if (!g.has(s)) g.set(s, c.id);
    }
    if (!encoded) continue;
    const row = i.arMap.find((r) => r.id === p.id);
    if (row === undefined) out.push(`${p.id} has no AR-map row`);
    else if (row.ar.trim() === '' || /not read/i.test(row.ar)) out.push(`${p.id}: AR-map row is not read`);
    if (row?.split !== true) for (const [k, g] of groups) if (g.size > 1) out.push(`${p.id} wording "${k}" has ${String(g.size)} shapes: ${[...g].map(([s, c]) => `${c} {${s}}`).join('; ')}`);
    if (shapes.size > 1 && row?.split !== true) out.push(`${p.id} has ${String(shapes.size)} shapes: ${[...shapes].map(([s, c]) => `${c} {${s}}`).join('; ')}`);
  }
  return out;
}

// ---- part 4: readings ----

export type Verdict = 'ok' | 'wrong' | 'ambiguous' | 'render-gap';
export interface ReadingLine { readonly clause: string; readonly verdict: Verdict; readonly note: string; readonly hash?: string }
const VERDICT = /^(ok|wrong|ambiguous|render-gap)$/;
const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v !== null && typeof v === 'object' ? `{${Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v) ?? 'null';
/** The hash of a clause's records now (key order and keys holding `undefined` do not count): 12 hex digits. */
export function recordsHash(records: readonly CardRecord[]): string {
  return createHash('sha256').update(stable([...records].map(stable).sort())).digest('hex').slice(0, 12);
}
/** The verdict lines of a judge's comment (`<clause> | <verdict> | <note>`, bare, bulleted or as a table row) or of a readings file (a fourth cell, the hash). */
export function parseReadings(text: string): ReadingLine[] {
  return text.split(/\r?\n/).flatMap((l) => {
    const cells = l.trim().replace(/^[-*]\s+/, '').replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim().replace(/^`|`$/g, ''));
    const [clause, verdict] = cells;
    if (clause === undefined || clause === '' || verdict === undefined || !VERDICT.test(verdict)) return [];
    const hash = cells.length > 3 && /^[0-9a-f]{12}$/.test(cells[cells.length - 1] ?? '') ? cells[cells.length - 1] : undefined;
    const note = cells.slice(2, hash === undefined ? undefined : -1).join(' | ');
    return [{ clause, verdict: verdict as Verdict, note, ...(hash === undefined ? {} : { hash }) }];
  });
}
export interface ReadingInput { readonly records: readonly CardRecord[]; readonly readings: readonly ReadingLine[]; readonly rulings: readonly string[] }
/** Every encoded clause: a current `ok` line (its hash equals the records now) or an `ambiguous` line citing a ruling. */
export function readingProblems(i: ReadingInput): string[] {
  const out: string[] = [];
  const rulings = new Set(i.rulings);
  for (const c of [...new Set(i.records.map((r) => r.clause))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const lines = i.readings.filter((l) => l.clause === c);
    const l = lines[lines.length - 1];
    const h = recordsHash(i.records.filter((r) => r.clause === c));
    if (l === undefined) out.push(`no reading for ${c}`);
    else if (l.verdict === 'ambiguous') { if (!cites(l.note, rulings)) out.push(`${c}: ambiguous, no AR`); }
    else if (l.verdict !== 'ok') out.push(`${c}: judged ${l.verdict}: ${l.note}`);
    else if (l.hash !== h) out.push(`no reading for ${c} (records changed since the judge)`);
  }
  return out;
}

// ---- --record ----

export interface RecordIo {
  /** The PR's comment bodies, oldest first (default: `gh pr view <n> --json comments`). */
  comments(pr: number): string[];
  write(path: string, text: string): void;
  /** Runs git with these arguments and returns its output (default: `git` in the current folder); throws on failure. */
  git(args: readonly string[]): string;
  /** K497: reads a file as text (for `--words <path>`). */
  read?(path: string): string;
}
export const realRecordIo = (fs: { readFileSync?: (p: string, e: 'utf8') => string; writeFileSync: (p: string, t: string) => void; mkdirSync: (p: string, o: { recursive: true }) => unknown }): RecordIo => ({
  comments: (pr) => (JSON.parse(execFileSync('gh', ['pr', 'view', String(pr), '--json', 'comments'], { encoding: 'utf8' })) as { comments: { body: string }[] }).comments.map((c) => c.body),
  write: (p, t) => { fs.mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true }); fs.writeFileSync(p, t); },
  git: (args) => execFileSync('git', args as string[], { encoding: 'utf8' }),
  ...(fs.readFileSync ? { read: (p: string) => fs.readFileSync!(p, 'utf8') } : {}),
});
export interface RecordInput { readonly batch: string; readonly pr: number; readonly clauses: readonly string[]; readonly records: readonly CardRecord[]; readonly dir?: string }
/** Writes the latest judge comment of the PR (the last with verdict lines) to `<dir>/<batch>.md` with a hash per clause, commits, pushes. */
/** Refuses on the default branch, with anything staged, or with other changes to the readings file; commits only that file. */
export function recordReadings(i: RecordInput, io: RecordIo): { failed: boolean; problems: string[]; path: string; unchanged?: boolean } {
  const path = `${i.dir ?? 'docs/cards/readings'}/${i.batch}.md`;
  const body = [...io.comments(i.pr)].reverse().find((b) => parseReadings(b).length > 0);
  const lines = body === undefined ? [] : parseReadings(body);
  const problems: string[] = [];
  if (body === undefined) problems.push(`PR #${String(i.pr)} has no judge comment`);
  const batch = new Set(i.clauses);
  for (const l of lines) if (!batch.has(l.clause)) problems.push(`judge line names no clause of ${i.batch}: ${l.clause}`);
  for (const c of i.clauses) if (!lines.some((l) => l.clause === c)) problems.push(`${c} has no judge line`);
  const branch = io.git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  let def = 'main';
  try { def = io.git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).trim().replace(/^origin\//, '') || def; } catch { /* no origin HEAD: main */ }
  if ([def, 'main', 'master'].includes(branch)) problems.push(`refusing to record on ${branch}: switch to the batch's branch`);
  const staged = io.git(['diff', '--cached', '--name-only']).trim();
  if (staged !== '') problems.push(`refusing to record with staged files: ${staged.split(/\s+/).join(', ')}`);
  if (io.git(['status', '--porcelain', '--', path]).trim() !== '') problems.push(`refusing to record: ${path} has uncommitted changes`);
  if (problems.length) return { failed: true, problems, path };
  const text = [`# Readings: ${i.batch}`, '', `The reading judge's lines from PR #${String(i.pr)}, recorded by \`--record\`; the last cell is the hash of the clause's records when judged. Never edit by hand.`, '',
    '| Clause | Verdict | Note | Hash |', '|---|---|---|---|',
    ...lines.map((l) => `| ${l.clause} | ${l.verdict} | ${l.note.replace(/\|/g, '/')} | ${recordsHash(i.records.filter((r) => r.clause === l.clause))} |`), ''].join('\n');
  io.write(path, text);
  if (io.git(['status', '--porcelain', '--', path]).trim() === '') return { failed: false, problems, path, unchanged: true };
  io.git(['add', '--', path]);
  io.git(['commit', '-m', `readings: ${i.batch} from PR #${String(i.pr)}`, '--', path]);
  io.git(['push']);
  return { failed: false, problems, path };
}

// ---- the whole cards:check ----

export interface CardsCheckInput extends ClauseInput, Omit<RestrictionInput, 'catalogue' | 'records' | 'words'>, Omit<PatternInput, 'catalogue' | 'records'> {
  /** Optional (K497): when missing, `cardsCheckMain` loads `RESTRICTION_WORDS_PATH` (or `--words <path>`) through `io.read` if the file exists. */
  readonly words?: RestrictionInput['words'];
  readonly readings: readonly ReadingLine[];
  /** The clause ids of a batch (for `--list-restrictions` and `--record`). */
  readonly batch?: (id: string) => readonly string[];
  /** K513: a file of allowed problem lines (`--baseline <path>` wins); needs a RecordIo with `read` and `write`. */
  readonly baseline?: string;
}
export function cardsCheck(i: CardsCheckInput): { clauses: string[]; restrictions: string[]; patterns: string[]; readings: string[] } {
  return { clauses: clauseProblems(i), restrictions: restrictionProblems({ ...i, words: i.words ?? {} }), patterns: patternProblems(i), readings: readingProblems(i) };
}
/** K497: the restriction words file: `--words <path>` in `argv`, else `dflt`. */
export const RESTRICTION_WORDS_PATH = 'content/restriction-words.json';
export const wordsPathOf = (argv: readonly string[], dflt = RESTRICTION_WORDS_PATH): string => { const k = argv.indexOf('--words'); return k < 0 ? dflt : argv[k + 1] ?? dflt; };
/** The game script's entry: `[]`, `--list-restrictions <batch> [n]` or `--record <batch> --pr <n>`. Returns the exit code. */
export function cardsCheckMain(argv: readonly string[], input: CardsCheckInput, log: (l: string) => void = console.log, io?: RecordIo): number {
  let i: CardsCheckInput & { words: RestrictionInput['words'] } = { ...input, words: input.words ?? {} };
  if (argv.includes('--words')) {
    if (!io?.read) { log('FAIL --words needs a RecordIo with read'); return 1; }
    try { i = { ...i, words: JSON.parse(io.read(wordsPathOf(argv))) as Record<string, readonly string[]> }; } catch (e) { log(`FAIL --words ${wordsPathOf(argv)}: ${(e as Error).message}`); return 1; }
  } else if (input.words === undefined && io?.read) {
    let t: string | undefined;
    try { t = io.read(RESTRICTION_WORDS_PATH); } catch { t = undefined; }
    if (t !== undefined) { try { i = { ...i, words: JSON.parse(t) as Record<string, readonly string[]> }; } catch (e) { log(`FAIL ${RESTRICTION_WORDS_PATH}: ${(e as Error).message}`); return 1; } }
  }
  const arg = (f: string): string | undefined => { const k = argv.indexOf(f); return k < 0 ? undefined : argv[k + 1]; };
  const batchOf = (b: string): readonly string[] => { if (!i.batch) throw new Error('cardsCheck: no batch() given'); return i.batch(b); };
  const lr = arg('--list-restrictions');
  if (lr !== undefined) {
    const ids = new Set(batchOf(lr));
    const n = Number(argv[argv.indexOf('--list-restrictions') + 2] ?? 10) || 10;
    for (const r of restrictionCounts(catalogueClauses(i.catalogue).filter((c) => ids.has(c.id)), i.words).slice(0, n)) log(`${r.clause.id} ${String(r.count)} [${r.words.join('; ')}] ${r.clause.text}`);
    return 0;
  }
  const rec = arg('--record');
  if (rec !== undefined) {
    const pr = Number(arg('--pr'));
    if (!Number.isInteger(pr) || pr <= 0) { log('FAIL --record needs --pr <n>'); return 1; }
    if (!io) throw new Error('cardsCheck: --record needs a RecordIo (realRecordIo(fs) in a script)');
    const r = recordReadings({ batch: rec, pr, clauses: batchOf(rec), records: i.records }, io);
    for (const p of r.problems) log(`FAIL ${p}`);
    if (!r.failed) log(r.unchanged ? `readings unchanged: ${r.path}` : `recorded ${r.path}`);
    return r.failed ? 1 : 0;
  }
  const r = cardsCheck(i);
  const bf = arg('--baseline') ?? i.baseline, wb = argv.includes('--write-baseline');
  if (bf !== undefined || wb) {
    if (bf === undefined) { log('FAIL --write-baseline needs a baseline path'); return 1; }
    const found = Object.entries(r).flatMap(([part, ps]) => ps.map((p) => `${part}: ${p}`));
    if (wb) {
      if (!io) { log('FAIL --write-baseline needs a RecordIo'); return 1; }
      io.write(bf, `# cards:check problems allowed for now; this file only shrinks\n${found.join('\n')}${found.length ? '\n' : ''}`);
      log(`cards:check: baseline written, ${String(found.length)} lines`);
      return 0;
    }
    if (!io?.read) { log('FAIL --baseline needs a RecordIo with read'); return 1; }
    let t: string;
    try { t = io.read(bf); } catch { t = ''; }
    const base = t.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'));
    const now = new Set(found), had = new Set(base);
    const fresh = found.filter((p) => !had.has(p)), stale = base.filter((p) => !now.has(p));
    for (const p of fresh) log(`FAIL ${p}`);
    for (const p of stale) log(`FAIL baseline lists "${p}", which is gone: remove it from ${bf}`);
    log(`cards:check: ${Object.entries(r).map(([k, ps]) => `${k} ${String(ps.length)}`).join(', ')} (${String(base.length)} in the baseline); ${String(fresh.length)} new, ${String(stale.length)} stale`);
    for (const n of patternNotes(i)) log(`NOTE ${n}`);
    return fresh.length + stale.length ? 1 : 0;
  }
  let bad = 0;
  for (const [part, ps] of Object.entries(r)) { log(`${ps.length ? 'FAIL' : 'ok  '} ${part} (${String(ps.length)})`); for (const p of ps) log(`  ${p}`); bad += ps.length; }
  for (const n of patternNotes(i)) log(`NOTE ${n}`);
  return bad ? 1 : 0;
}
