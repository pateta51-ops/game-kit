// A generated list kept in step with a plan: reads the first Markdown table after a heading, writes it as a TypeScript
// (or .json) file the app bundles, and `--check` fails when that file is stale.
// Exit codes: 0 written or current, 1 stale, 2 usage, no such table or a failed write.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { flags, isMain, stdio, type Io } from './args';

/** The cells of a table row, or null when the line is not one. `\|` and a pipe inside a code span do not split. */
export function splitRow(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  const cells: string[] = [];
  let cell = '';
  let code = false;
  for (let i = 1; i < t.length; i += 1) {
    const ch = t[i] ?? '';
    if (ch === '\\' && t[i + 1] === '|') {
      cell += '|';
      i += 1;
    } else if (ch === '|' && !code) {
      cells.push(cell.trim());
      cell = '';
    } else {
      if (ch === '`') code = !code;
      cell += ch;
    }
  }
  if (cell.trim() !== '') cells.push(cell.trim());
  return cells;
}

export interface Table {
  header: string[];
  rows: string[][];
}
const isHeading = (l: string | undefined): boolean => /^#+\s/.test(l ?? '');
/** The first table after the first heading line that contains `heading` (the first table of the text when it is empty). */
export function tableAfter(md: string, heading: string): Table | null {
  const lines = md.split(/\r?\n/);
  let i = 0;
  if (heading !== '') {
    i = lines.findIndex((l) => isHeading(l) && l.includes(heading));
    if (i < 0) return null;
    i += 1;
  }
  while (i < lines.length && splitRow(lines[i] ?? '') === null) {
    if (heading !== '' && isHeading(lines[i])) return null;
    i += 1;
  }
  const header = splitRow(lines[i] ?? '');
  if (header === null || !/^\|[\s:|-]+$/.test((lines[i + 1] ?? '').trim())) return null;
  const rows: string[][] = [];
  for (i += 2; i < lines.length; i += 1) {
    const row = splitRow(lines[i] ?? '');
    if (row === null) break;
    rows.push(row);
  }
  return { header, rows };
}

const plain = (s: string): string => s.replace(/`/g, '').replace(/\*\*/g, '').trim();
const key = (h: string, i: number): string =>
  plain(h)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || `col${String(i)}`;

export function records(table: Table): Record<string, string>[] {
  const keys = table.header.map(key);
  return table.rows.map((row) => Object.fromEntries(keys.map((k, i) => [k, plain(row[i] ?? '')])));
}

export function render(name: string, rows: readonly Record<string, string>[], from: string, json: boolean): string {
  if (json) return `${JSON.stringify(rows, null, 2)}\n`;
  return `// GENERATED from ${from} by gen-from-table: do not edit by hand.\nexport const ${name} = [\n${rows.map((r) => `  ${JSON.stringify(r)},\n`).join('')}] as const;\n`;
}

const NAMES = ['plan', 'heading', 'out', 'name'];
const USAGE = 'usage: tsx gen-from-table.ts --plan <md> --out <file.ts or .json> [--heading <text of the heading above the table>] [--name <ROWS>] [--check] [--config <json>]';

export function run(args: readonly string[], io: Io = stdio): number {
  try {
    const f = flags(args, NAMES, ['check']);
    const [plan, out] = [f?.['plan']?.[0], f?.['out']?.[0]];
    const name = f?.['name']?.[0] ?? 'ROWS';
    if (f === null || plan === undefined || out === undefined || !/^[A-Za-z_$][\w$]*$/.test(name)) {
      io.err(USAGE);
      return 2;
    }
    const heading = f['heading']?.[0] ?? '';
    const table = tableAfter(readFileSync(resolve(plan), 'utf8'), heading);
    if (table === null) {
      io.err(`gen-from-table: no table after "${heading}" in ${plan}`);
      return 2;
    }
    const keys = table.header.map(key);
    if (table.rows.length === 0 || new Set(keys).size !== keys.length) {
      io.err(`gen-from-table: the table after "${heading}" in ${plan} has ${table.rows.length === 0 ? 'no rows' : `two columns with the same key (${keys.join(', ')})`}`);
      return 2;
    }
    const rows = records(table);
    const text = render(name, rows, `${basename(plan)}${heading === '' ? '' : ` "${heading}"`}`, out.endsWith('.json'));
    const target = resolve(out);
    if (f['check'] !== undefined) {
      if (!existsSync(target) || readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== text) {
        io.err(`gen-from-table: ${out} is out of date: run it again without --check`);
        return 1;
      }
      io.out(`gen-from-table: ${out} is current (${String(rows.length)} rows)`);
      return 0;
    }
    writeFileSync(target, text, 'utf8');
    io.out(`gen-from-table: wrote ${String(rows.length)} rows to ${out}`);
    return 0;
  } catch (error) {
    io.err(`gen-from-table: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (isMain(import.meta.url)) process.exitCode = run(process.argv.slice(2));
