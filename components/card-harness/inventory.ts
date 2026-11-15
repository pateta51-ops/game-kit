// The card-language inventory: the game's language pieces and distinct printed clauses (data: ids and card ids only,
// never card text), the test files, and which test cites which. A piece is cited by a test file that matches one of
// its `cite` patterns (default: its id as a whole word) or names a card that uses it; a clause by a file naming its id
// or one of its cards. `runInventory` writes the report or, with `check`, fails when the written one is stale, when a
// piece or clause is uncited and not in the baseline, or when the baseline lists one that is cited or gone.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface Piece {
  readonly kind: string;
  readonly id: string;
  /** Regular expressions (sources) a test file matches to cite the piece directly. */
  readonly cite?: readonly string[];
  /** The cards whose encoding uses it. */
  readonly cards?: readonly string[];
}
export interface Clause {
  readonly id: string;
  readonly cards: readonly string[];
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
  readonly report: string;
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (s: string): RegExp => new RegExp(`(?<![\\w-])${esc(s)}(?![\\w-])`);
const TITLE = /\b(?:it|test|describe)(?:\.\w+)*\(\s*(['"`])((?:(?!\1).)*)\1/g;

/** The files cited: `path` or `path › title` for the test titles that match. */
function cites(tests: readonly TestFile[], res: readonly RegExp[], titleOnly = false): string[] {
  const out: string[] = [];
  for (const t of tests) {
    if (!titleOnly && !res.some((r) => r.test(t.text))) continue;
    const titles = [...t.text.matchAll(TITLE)].map((m) => m[2] ?? '').filter((x) => res.some((r) => r.test(x)));
    out.push(...(titles.length > 0 ? titles.map((x) => `${t.path} › ${x}`) : titleOnly ? [] : [t.path]));
  }
  return out;
}

export function inventory(input: InventoryInput): Inventory {
  const tests = [...input.tests].sort((a, b) => (a.path < b.path ? -1 : 1));
  const named = (cards: readonly string[]): string[] =>
    cards.length === 0 ? [] : tests.filter((t) => cards.some((c) => word(c).test(t.text))).map((t) => t.path);
  const row = (kind: string, id: string, res: RegExp[], cards: readonly string[], titleOnly = false): Row => {
    const direct = cites(tests, res, titleOnly);
    const directFiles = new Set(direct.map((d) => d.split(' › ')[0]));
    return {
      key: `${kind}:${id}`,
      kind,
      id,
      cards: cards.length,
      examples: [...cards].sort().slice(0, 6),
      direct,
      via: input.directOnly === true ? [] : named(cards).filter((p) => !directFiles.has(p)),
    };
  };
  const rows = [
    ...input.pieces.map((p) => row(p.kind, p.id, (p.cite ?? []).map((c) => new RegExp(c)).concat(p.cite === undefined ? [word(p.id)] : []), p.cards ?? [], input.titleOnly === true && p.cite === undefined)),
    ...(input.clauses ?? []).map((c) => row('clause', c.id, [word(c.id)], c.cards, input.titleOnly === true)),
  ];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.key)) throw new Error(`inventory: ${r.key} is listed twice`);
    seen.add(r.key);
  }
  const base = new Set(input.baseline ?? []);
  const cited = (r: Row): boolean => r.direct.length + r.via.length > 0;
  const uncited = rows.filter((r) => !cited(r) && !base.has(r.key)).map((r) => r.key);
  const staleBaseline = [...base].filter((k) => !seen.has(k) || cited(rows.find((r) => r.key === k) as Row)).sort();

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
  for (const k of kinds) {
    lines.push(`## ${k}`, '', '| Piece | Cards | Examples | Direct | Via cards |', '|---|---|---|---|---|');
    for (const r of rows.filter((x) => x.kind === k))
      lines.push(`| \`${r.id}\` | ${String(r.cards)} | ${r.examples.join(', ')}${r.cards > 6 ? ', …' : ''} | ${r.direct.join('<br>')} | ${r.via.join('<br>')} |`);
    lines.push('');
  }
  return { rows, uncited, staleBaseline, report: lines.join('\n') };
}

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
  const inv = inventory(input);
  let code = 0;
  if (check) {
    if (io.read(out) !== inv.report) {
      io.log(`inventory: ${out} is stale; run the inventory again`);
      code = 1;
    }
  } else io.write(out, inv.report);
  for (const k of inv.uncited) io.log(`inventory: ${k} is cited by no test`);
  for (const k of inv.staleBaseline) io.log(`inventory: baseline lists ${k}, which is cited or gone`);
  if (inv.uncited.length + inv.staleBaseline.length > 0) code = 1;
  io.log(`inventory: ${String(inv.rows.length)} pieces and clauses, ${String(inv.uncited.length)} uncited${code === 0 ? '; ok' : ''}`);
  return code;
}
