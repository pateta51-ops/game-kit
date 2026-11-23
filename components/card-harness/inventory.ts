// The card-language inventory: the game's language pieces and distinct printed clauses (data: ids and card ids only,
// never card text), the test files, and which test cites which. A piece is cited by a test file that matches one of
// its `cite` patterns (default: its id as a whole word) or names a card that uses it; a clause by a file naming its id
// or one of its cards. `runInventory` writes the report or, with `check`, fails when the written one is stale, when a
// piece or clause is uncited and not in the baseline, or when the baseline lists one that is cited or gone.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { asserts, callsHelper, testCalls } from './depth.ts';
import { knownCheck, refuseWrite, type KnownFindings } from './known.ts';

export interface Piece {
  readonly kind: string;
  readonly id: string;
  /** Regular expressions (sources) a test file matches to cite the piece directly. */
  readonly cite?: readonly string[];
  /** The cards whose encoding uses it (an `interaction` piece: the cards in the row). */
  readonly cards?: readonly string[];
  /** An `interaction` piece: the record ids in the row. */
  readonly records?: readonly string[];
}
export interface Clause {
  readonly id: string;
  readonly cards: readonly string[];
  /** K487: the printed text. Given, the clause is cited only by a `cardCase` quoting it word for word with a known `ar`. */
  readonly text?: string;
  /** K415: it has a condition or a cost (the game decides): it also needs a `<id> poor` test calling expectNotOffered or expectNotFired. Marking any clause (true or false) turns the depth gate on. */
  readonly conditional?: boolean;
  /** K415: the family the depth report groups it under (default `clauses`). */
  readonly family?: string;
}
export interface TestFile {
  readonly path: string;
  readonly text: string;
}
export interface InventoryInput {
  readonly pieces: readonly Piece[];
  readonly clauses?: readonly Clause[];
  readonly tests: readonly TestFile[];
  /** `kind:id` (a clause: `clause:id`) allowed uncited for now. */
  readonly baseline?: readonly string[];
  /** Count only direct citations, not a test naming a card that uses the piece. */
  readonly directOnly?: boolean;
  /** Count an id only when it is in a test title (default: anywhere in the file). */
  readonly titleOnly?: boolean;
  readonly title?: string;
  /** Printed lines, each with the ids of the records that own it. */
  readonly lines?: readonly { readonly id: string; readonly records: readonly string[] }[];
  /** Line ids allowed unowned for now. */
  readonly openLines?: readonly string[];
  /** Record verbs, checked against `routes` (the verbs the engine routes by). */
  readonly records?: readonly { readonly id: string; readonly verb: string }[];
  readonly routes?: readonly string[];
  /** K487: the ruling ids a `cardCase` may cite. */
  readonly rulings?: readonly string[];
  /** K487: record or card ids that must sit in an `interaction` piece's `records` or `cards` (see `interactionNeeds`). */
  readonly interacting?: readonly string[];
  /** K497: known `interacting` ids pending a row: id to the fix that clears it (a game's JSON map). Listed ids are reported as pending, not failed; one no longer a finding is `stale pending entry`. */
  readonly interactingPending?: Readonly<Record<string, string>>;
  /** K415: the depth gate (on too when any clause has `conditional`): a clause is cited only by a test titled with its id (not its poor test) whose body asserts; a conditional one also needs `poor:<id>`. */
  readonly depth?: boolean;
  /** K650: one known-findings list for every inventory finding (`inventoryFindings`): `kind:id` uncited or not counted (the old `baseline` lines read as they are), an `interacting` id in no row (the K497 JSON map reads as it is), `line:<id>` unowned. Replaces `baseline`, `openLines` and `interactingPending`. Its io defaults to `runInventory`'s. */
  readonly known?: KnownFindings;
  /** K663: rule 11 mixed mode: a clause with `text` that has a `cardCase` is quote-checked; one without is cited by a test title like a clause without `text`. */
  readonly mixed?: boolean;
  /** K707: the run log (`readRanLog`): a piece of a `ranKinds` kind is cited only by a full-resolve test (depth on: one counted for a clause; else any test not titled `... poor`) whose record ran it; its text in a test file no longer counts. Record `file` must equal the test's `path`. */
  readonly ran?: readonly RanRecord[];
  /** K707: the piece kinds `ran` judges (default every kind but `interaction`). */
  readonly ranKinds?: readonly string[];
}
/** K707: one passing test's run-probe notes (written by `recordRan` in ranLog.ts). */
export interface RanRecord {
  /** The test file, relative to `root`, with `/`. */
  readonly file: string;
  /** The test's own title (not its describe blocks). */
  readonly test: string;
  /** `kind:id` of each piece noted, sorted. */
  readonly ran: readonly string[];
  readonly root: string;
}
/** K707: the records of `log` written under `root` (default the working directory); a missing log throws (delete it before the card test run, never skip it). */
export function readRanLog(log: string, root = process.cwd().replace(/\\/g, '/')): RanRecord[] {
  if (!existsSync(log)) throw new Error(`run log ${log} is missing: run the card tests with recordRan first`);
  return readFileSync(log, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as RanRecord).filter((r) => r.root === root);
}
export interface Row {
  readonly key: string;
  readonly kind: string;
  readonly id: string;
  readonly cards: number;
  readonly examples: readonly string[];
  readonly direct: readonly string[];
  readonly via: readonly string[];
}
export interface Inventory {
  readonly rows: readonly Row[];
  readonly uncited: readonly string[];
  readonly staleBaseline: readonly string[];
  readonly unowned: readonly string[];
  readonly staleOpen: readonly string[];
  readonly unrouted: readonly string[];
  readonly quoteDiffers: readonly string[];
  readonly outOfRows: readonly string[];
  readonly pendingRows: readonly string[];
  readonly staleInteracting: readonly string[];
  /** K415: tests titled with a clause id that do not count (`<path> › <title>: <why>`), clause not in the baseline. */
  readonly notCounted: readonly string[];
  /** K650: the clause key (`clause:<id>` or `poor:<id>`) of each `notCounted` line. */
  readonly notCountedKey: Readonly<Record<string, string>>;
  readonly depth: boolean;
  readonly report: string;
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (s: string): RegExp => new RegExp(`(?<![\\w-])${esc(s)}(?![\\w-])`);
const TITLE = /\b(?:it|test|describe)(?:\.\w+)*\(\s*(['"`])((?:(?!\1).)*)\1/g;

export interface CardCaseInfo {
  readonly clause: string;
  readonly printed: string;
  readonly ar: string;
  /** Added to the test title after the clause id (`poor`, `IX-03 with …`). */
  readonly title?: string;
  /** K663: `printed` is not a literal or a same-file const: its source text. */
  readonly printedRef?: string;
}
const CONST = /(?<![\w$.])const\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*(?:(['"])((?:\\[\s\S]|(?!\2)[^\\\n])*)\2|`((?:\\[\s\S]|[^`\\$]|\$(?!\{))*)`)\s*(?:as const\s*)?(?=[;\n\r,]|$)/g;
const KEY = /(?<![\w$])(clause|printed|ar|title)\s*:\s*(['"`])((?:\\[\s\S]|(?!\2)[^\\])*)\2/g;
const ESC: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0', '\n': '', '\r': '', '\r\n': '', ' ': '', ' ': '' };
const unescape = (s: string): string =>
  s.replace(/\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(\r\n|[\s\S]))/g, (_, cp?: string, u?: string, x?: string, c?: string) =>
    cp !== undefined ? String.fromCodePoint(parseInt(cp, 16)) : (u ?? x) !== undefined ? String.fromCharCode(parseInt((u ?? x) as string, 16)) : (ESC[c as string] ?? (c as string)));

/** K487: the string-literal fields of each `cardCase({ ... })` call in a test file's text; a field that is not a literal is absent. */
export function cardCasesIn(text: string): Partial<CardCaseInfo>[] {
  const out: Partial<CardCaseInfo>[] = [];
  const consts = new Map<string, string>();
  const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const decls = new Map<string, number>();
  for (const d of code.matchAll(/(?<![\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) decls.set(d[1] as string, (decls.get(d[1] as string) ?? 0) + 1);
  for (const c of code.matchAll(CONST)) if (decls.get(c[1] as string) === 1) consts.set(c[1] as string, unescape(c[3] ?? c[4] ?? ''));
  for (const m of text.matchAll(/\bcardCase\(\s*\{/g)) {
    const from = (m.index ?? 0) + m[0].length;
    let i = from;
    let depth = 1;
    let q = '';
    for (; i < text.length && depth > 0; i++) {
      const ch = text[i];
      if (q !== '') {
        if (ch === '\\') i++;
        else if (ch === q) q = '';
      } else if (ch === "'" || ch === '"' || ch === '`') q = ch;
      else if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    const o: Record<string, string> = {};
    const body = text.slice(from, i - 1);
    for (const k of body.matchAll(KEY)) o[k[1] as string] ??= unescape(k[3] ?? '');
    const ref = /(?<![\w$])printed\s*:\s*(?!['"`])([^,}\n]+)/.exec(body)?.[1]?.trim();
    if (ref !== undefined && o.printed === undefined) {
      if (consts.has(ref)) o.printed = consts.get(ref) as string;
      else o.printedRef = ref;
    }
    out.push(o);
  }
  return out;
}
const caseTitle = (c: Partial<CardCaseInfo>): string => (c.title === undefined ? (c.clause ?? '') : `${c.clause ?? ''} ${c.title}`);
const titlesOf = (text: string): string[] => [...[...text.matchAll(TITLE)].map((m) => m[2] ?? ''), ...cardCasesIn(text).map(caseTitle)];

/** K487: the ids `interaction` rows must hold: every modifier and lasting record, and each card with several limited records. */
export function interactionNeeds<R extends { readonly id: string; readonly card: string }>(
  records: readonly R[],
  is: { modifier(r: R): boolean; lasting(r: R): boolean; limited(r: R): boolean },
): string[] {
  const out = records.filter((r) => is.modifier(r) || is.lasting(r)).map((r) => r.id);
  const n = new Map<string, number>();
  for (const r of records) if (is.limited(r)) n.set(r.card, (n.get(r.card) ?? 0) + 1);
  return [...out, ...[...n].filter(([, k]) => k > 1).map(([c]) => c)];
}

/** The files cited: `path` or `path › title` for the test titles that match. */
function cites(tests: readonly TestFile[], res: readonly RegExp[], titleOnly = false): string[] {
  const out: string[] = [];
  for (const t of tests) {
    if (!titleOnly && !res.some((r) => r.test(t.text))) continue;
    const titles = titlesOf(t.text).filter((x) => res.some((r) => r.test(x)));
    out.push(...(titles.length > 0 ? titles.map((x) => `${t.path} › ${x}`) : titleOnly ? [] : [t.path]));
  }
  return out;
}

/** Clause ids: `kind` plus the shortest word prefix of the printed text that no other text of the kind shares. */
export function clauseIds(items: readonly { readonly kind: string; readonly text: string }[]): string[] {
  const w = items.map((i) => ({ k: i.kind, w: i.text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [] }));
  return w.map((a, i) => {
    for (let n = 1; ; n++) {
      const key = (x: string[]): string => x.slice(0, n).join(' ') + ' '.repeat(Math.max(0, n - x.length));
      if (n > a.w.length || !w.some((b, j) => j !== i && b.k === a.k && b.w.join(' ') !== a.w.join(' ') && key(b.w) === key(a.w)))
        return `${a.k}-${a.w.slice(0, n).join('-')}`;
    }
  });
}

export function inventory(input: InventoryInput): Inventory {
  const tests = [...input.tests].sort((a, b) => (a.path < b.path ? -1 : 1));
  const named = (cards: readonly string[]): string[] =>
    cards.length === 0 ? [] : tests.filter((t) => cards.some((c) => word(c).test(t.text))).map((t) => t.path);
  const rulings = new Set(input.rulings ?? []);
  const quoteDiffers: string[] = [];
  const quoted = (c: Clause): string[] =>
    tests.flatMap((t) =>
      cardCasesIn(t.text)
        .filter((k) => k.clause === c.id)
        .filter((k) => {
          if (k.printedRef !== undefined) quoteDiffers.push(`${c.id}: printed is not a literal or a same-file const: ${k.printedRef}`);
          else if (k.printed !== c.text) quoteDiffers.push(`${c.id}: quote differs (${t.path})`);
          else if (k.ar === undefined || !rulings.has(k.ar)) quoteDiffers.push(`${c.id}: quote differs (${t.path}: ${k.ar ?? 'ar'} is not a known ruling)`);
          else return true;
          return false;
        })
        .map((k) => `${t.path} › ${caseTitle(k)}`),
    );
  const quotes = (c: Clause): boolean => c.text !== undefined && (input.mixed !== true || tests.some((t) => cardCasesIn(t.text).some((k) => k.clause === c.id)));
  const depth = input.depth === true || (input.clauses ?? []).some((c) => c.conditional !== undefined);
  const calls = depth ? tests.flatMap((t) => testCalls(t.text).filter((c) => !c.skipped).map((c) => ({ ...c, path: t.path }))) : [];
  const fullRe = (id: string): RegExp => new RegExp(`(?<![\\w-])${esc(id)}(?![\\w-])(?! poor\\b)`);
  const poorRe = (id: string): RegExp => new RegExp(`(?<![\\w-])${esc(id)} poor\\b`);
  const notCounted: string[] = [];
  const fulls = new Map<string, string[]>();
  const full = (c: Clause): string[] => {
    if (!fulls.has(c.id)) fulls.set(c.id, fullOnce(c));
    return fulls.get(c.id) as string[];
  };
  const fullOnce = (c: Clause): string[] => {
    const q = !quotes(c) ? undefined : new Set(quoted(c));
    return calls
      .filter((k) => fullRe(c.id).test(k.title) && (q === undefined || (k.card !== undefined && q.has(`${k.path} › ${k.title}`))))
      .filter((k) => asserts(k) || void notCounted.push(`clause:${c.id}|${k.path} › ${k.title}: its body asserts nothing`))
      .map((k) => `${k.path} › ${k.title}`);
  };
  const poor = (c: Clause): string[] =>
    calls
      .filter((k) => poorRe(c.id).test(k.title))
      .filter((k) => callsHelper(k) || void notCounted.push(`poor:${c.id}|${k.path} › ${k.title}: a poor test that calls neither expectNotOffered nor expectNotFired`))
      .map((k) => `${k.path} › ${k.title}`);
  const row = (kind: string, id: string, res: RegExp[], cards: readonly string[], titleOnly = false, given?: string[]): Row => {
    const direct = given ?? cites(tests, res, titleOnly);
    const directFiles = new Set(direct.map((d) => d.split(' › ')[0]));
    return {
      key: `${kind}:${id}`,
      kind,
      id,
      cards: cards.length,
      examples: [...cards].sort().slice(0, 6),
      direct,
      via: input.directOnly === true || given !== undefined || kind === 'interaction' ? [] : named(cards).filter((p) => !directFiles.has(p)),
    };
  };
  const ranKinds = input.ran && new Set(input.ranKinds ?? [...new Set(input.pieces.map((p) => p.kind))].filter((k) => k !== 'interaction'));
  const resolving = input.ran && depth ? new Set((input.clauses ?? []).flatMap((c) => full(c))) : undefined;
  const ranBy = (key: string): string[] => [
    ...new Set((input.ran ?? []).filter((r) => r.ran.includes(key) && (resolving ? resolving.has(`${r.file} › ${r.test}`) : !/ poor\b/.test(r.test))).map((r) => `${r.file} › ${r.test}`)),
  ];
  const rows = [
    ...input.pieces.map((p) => row(p.kind, p.id, (p.cite ?? []).map((c) => new RegExp(c)).concat(p.cite === undefined ? [word(p.id)] : []), p.cards ?? [], p.kind === 'interaction' || (input.titleOnly === true && p.cite === undefined), ranKinds?.has(p.kind) === true ? ranBy(`${p.kind}:${p.id}`) : undefined)),
    ...(input.clauses ?? []).map((c) => row('clause', c.id, [word(c.id)], c.cards, input.titleOnly === true || (input.mixed === true && !quotes(c)), depth ? full(c) : !quotes(c) ? undefined : quoted(c))),
    ...(input.clauses ?? []).filter((c) => depth && c.conditional === true).map((c) => row('poor', c.id, [], c.cards, true, poor(c))),
  ];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.key)) throw new Error(`inventory: ${r.key} is listed twice`);
    seen.add(r.key);
  }
  const base = new Set(input.baseline ?? []);
  const cited = (r: Row): boolean => r.direct.length + r.via.length > 0;
  const uncited = rows.filter((r) => !cited(r) && !base.has(r.key)).map((r) => r.key);
  const failing = [...new Set(notCounted.filter((n) => !base.has(n.split('|')[0] as string)).map((n) => n.slice(n.indexOf('|') + 1)))];
  const staleBaseline = [...base].filter((k) => !seen.has(k) || cited(rows.find((r) => r.key === k) as Row)).sort();

  const owned = new Set((input.lines ?? []).filter((l) => l.records.length > 0).map((l) => l.id));
  const open = new Set(input.openLines ?? []);
  const lineIds = new Set((input.lines ?? []).map((l) => l.id));
  const unowned = [...lineIds].filter((id) => !owned.has(id) && !open.has(id));
  const staleOpen = [...open].filter((id) => !lineIds.has(id) || owned.has(id)).sort();
  const routes = new Set(input.routes ?? []);
  const unrouted = (input.records ?? []).filter((r) => !routes.has(r.verb)).map((r) => `${r.id}:${r.verb}`);
  const inRows = new Set(input.pieces.filter((p) => p.kind === 'interaction').flatMap((p) => [...(p.cards ?? []), ...(p.records ?? [])]));
  const missing = (input.interacting ?? []).filter((id) => !inRows.has(id));
  const pend = input.interactingPending ?? {};
  const outOfRows = missing.filter((id) => !(id in pend));
  const pendingRows = missing.filter((id) => id in pend);
  const staleInteracting = Object.keys(pend).filter((id) => !missing.includes(id)).sort();

  const kinds = [...new Set(rows.map((r) => r.kind))];
  const lines = [
    `# ${input.title ?? 'Card language: inventory and coverage'}`,
    '',
    'Generated; do not edit by hand. **cards**: cards that use the piece; **direct**: tests that cite it; **via cards**: test files that name a card using it.',
    '',
    '| Kind | Pieces | Used by cards | Direct | Via cards only | Uncited | Baseline |',
    '|---|---|---|---|---|---|---|',
  ];
  const sum = [0, 0, 0, 0, 0, 0];
  for (const k of kinds) {
    const rs = rows.filter((r) => r.kind === k);
    const n = [
      rs.length,
      rs.filter((r) => r.cards > 0).length,
      rs.filter((r) => r.direct.length > 0).length,
      rs.filter((r) => r.direct.length === 0 && r.via.length > 0).length,
      rs.filter((r) => !cited(r)).length,
      rs.filter((r) => base.has(r.key)).length,
    ];
    n.forEach((x, i) => (sum[i] = (sum[i] ?? 0) + x));
    lines.push(`| ${k} | ${n.join(' | ')} |`);
  }
  lines.push(`| **all** | ${sum.join(' | ')} |`, '');
  if (depth) {
    lines.push('## Depth by family', '', '| Family | Clauses | Conditional | Full resolve | Poor test | Baseline |', '|---|---|---|---|---|---|');
    const cl = input.clauses ?? [];
    const has = (k: string): boolean => (rows.find((x) => x.key === k)?.direct.length ?? 0) > 0;
    for (const f of [...new Set(cl.map((c) => c.family ?? 'clauses'))]) {
      const cs = cl.filter((c) => (c.family ?? 'clauses') === f);
      const n = (p: (c: Clause) => boolean): string => String(cs.filter(p).length);
      lines.push(`| ${f} | ${String(cs.length)} | ${n((c) => c.conditional === true)} | ${n((c) => has(`clause:${c.id}`))} | ${n((c) => has(`poor:${c.id}`))} | ${n((c) => base.has(`clause:${c.id}`) || base.has(`poor:${c.id}`))} |`);
    }
    lines.push('');
  }
  for (const k of kinds) {
    lines.push(`## ${k}`, '', '| Piece | Cards | Examples | Direct | Via cards |', '|---|---|---|---|---|');
    for (const r of rows.filter((x) => x.kind === k))
      lines.push(`| \`${r.id}\` | ${String(r.cards)} | ${r.examples.join(', ')}${r.cards > 6 ? ', …' : ''} | ${r.direct.join('<br>')} | ${r.via.join('<br>')} |`);
    lines.push('');
  }
  const notCountedKey = Object.fromEntries(notCounted.map((n) => [n.slice(n.indexOf('|') + 1), n.split('|')[0] as string]));
  return { rows, uncited, staleBaseline, unowned, staleOpen, unrouted, quoteDiffers, outOfRows, pendingRows, staleInteracting, notCounted: failing, notCountedKey, depth, report: lines.join('\n') };
}

/** K650: the inventory's findings as known-list lines: uncited `kind:id`, the key of a test not counted, an `interacting` id in no row, `line:<id>` unowned. */
export const inventoryFindings = (inv: Inventory): string[] =>
  [...new Set([...inv.uncited, ...inv.notCounted.map((t) => inv.notCountedKey[t] as string), ...inv.outOfRows, ...inv.unowned.map((l) => `line:${l}`)])];

/** The test files under `dirs` of `root` whose names match `re`, with paths relative to `root`. */
export function testFiles(root: string, dirs: readonly string[], re = /\.test\.tsx?$/): TestFile[] {
  const walk = (d: string): string[] =>
    !existsSync(d) ? [] : readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : re.test(n) ? [join(d, n)] : []));
  return dirs
    .flatMap((d) => walk(join(root, d)))
    .map((f) => ({ path: relative(root, f).replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }));
}

export interface InventoryIo {
  read(path: string): string | null;
  write(path: string, text: string): void;
  log(line: string): void;
}

/** Write the report to `out`, or with `check` compare it; the exit code. */
export function runInventory(input: InventoryInput, out: string, check: boolean, io: InventoryIo): number {
  const kf = input.known && { io, ...input.known };
  if (kf && (input.interactingPending || input.baseline || input.openLines)) throw new Error('inventory: known replaces baseline, openLines and interactingPending: pass known alone');
  if (kf?.write) { io.log(refuseWrite('inventory', kf.file)); return 1; }
  const inv = inventory(input);
  const pend = input.interactingPending ?? {};
  const kr = kf && knownCheck(inventoryFindings(inv), kf);
  const fresh = (key: string): boolean => !kr || kr.fresh.includes(key);
  let code = kr?.problems.length ? 1 : 0;
  if (check) {
    if (io.read(out) !== inv.report) {
      io.log(`inventory: ${out} is stale; run the inventory again`);
      code = 1;
    }
  } else io.write(out, inv.report);
  for (const k of inv.uncited.filter(fresh))
    io.log(
      k.startsWith('interaction:')
        ? `inventory: interaction ${k.slice(12)} has no test`
        : inv.depth && k.startsWith('clause:')
          ? `inventory: ${k} has no full-resolve test (titled with its id, its body asserts)`
          : inv.depth && k.startsWith('poor:')
            ? `inventory: ${k} has no poor test (titled '${k.slice(5)} poor', calling expectNotOffered or expectNotFired)`
            : `inventory: ${k} is cited by no test`,
    );
  for (const k of inv.notCounted.filter((t) => fresh(inv.notCountedKey[t] as string))) io.log(`inventory: ${k} (not counted)`);
  for (const k of inv.quoteDiffers) io.log(`inventory: ${k}`);
  for (const k of inv.outOfRows.filter(fresh)) io.log(`inventory: ${k} is in no interaction row`);
  for (const p of kr?.problems.slice(kr.fresh.length) ?? []) io.log(`inventory: ${p}`);
  for (const k of inv.pendingRows) io.log(`inventory: ${k} is in no interaction row (pending: ${pend[k]!})`);
  for (const k of inv.staleInteracting) io.log(`inventory: stale pending entry: ${k}`);
  for (const k of inv.staleBaseline) io.log(`inventory: baseline lists ${k}, which is cited or gone`);
  for (const k of inv.unowned.filter((l) => fresh(`line:${l}`))) io.log(`inventory: printed line ${k} is owned by no record and not listed open`);
  for (const k of inv.staleOpen) io.log(`inventory: open list has ${k}, which is owned or gone`);
  for (const k of inv.unrouted) io.log(`inventory: record ${k} has a verb the engine does not route`);
  if (kr ? inv.unrouted.length + inv.quoteDiffers.length > 0 : inv.uncited.length + inv.staleBaseline.length + inv.unowned.length + inv.staleOpen.length + inv.unrouted.length + inv.quoteDiffers.length + inv.outOfRows.length + inv.staleInteracting.length + inv.notCounted.length > 0) code = 1;
  io.log(`inventory: ${String(inv.rows.length)} pieces and clauses, ${String(inv.uncited.length)} uncited${code === 0 ? '; ok' : ''}`);
  return code;
}
