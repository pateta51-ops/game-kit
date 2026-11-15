// One gate process per item (a pack, a scenario, a set), side by side, up to one per core; the rows are printed in the
// order of `items` whatever order the gates end in (from EBR). Items listed in `known` fail today for the reason given:
// their failure is reported, never a red run; any other failing item fails the run, with its output printed. A known
// item that now passes is flagged so its line can be removed. The job summary gets a table.
//
//   tsx gate-all.ts [--config path] [--jobs N]
//
// Config (gate-all.config.json): { "command": ["npm", "run", "gate", "--", "--pack", "{id}"], "items": ["a", "b"],
// "known": { "b": "why it fails" }, "title": "Content gate" }. `{id}` in the command is replaced by the item.

import { spawn } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';

export interface Row {
  id: string;
  ok: boolean;
  /** The last line of the gate's output that is not empty, or its exit status. */
  last: string;
  out: string;
}
export interface GateConfig {
  /** The gate's command line; `{id}` is replaced by the item. */
  command: string[];
  items: string[];
  /** Items whose gate fails today, and why. */
  known?: Record<string, string>;
  title?: string;
}

/** An item's row from its gate's exit status and output (stdout, then stderr). */
export function rowOf(id: string, status: number | null, out: string): Row {
  const last = out.split('\n').map((l) => l.trim()).filter((l) => l !== '').pop() ?? `exit ${String(status)}`;
  return { id, ok: status === 0, last, out };
}

/** One item's gate in its own process. */
export function gate(command: readonly string[], id: string): Promise<Row> {
  return new Promise((resolve) => {
    const [cmd = '', ...args] = command.map((a) => a.replaceAll('{id}', id));
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    let settled = false;
    const end = (status: number | null, extra = '') => {
      if (settled) return;
      settled = true;
      resolve(rowOf(id, status, `${stdout}${stderr}${extra}`));
    };
    child.on('error', (e) => end(null, `\nError: ${e.message}`));
    child.on('close', (code) => end(code));
  });
}

/** Every item's gate, at most `jobs` at a time; the rows come back in the order of `ids`. */
export async function gateAll(ids: readonly string[], jobs: number, run: (id: string) => Promise<Row>): Promise<Row[]> {
  const rows: Row[] = new Array<Row>(ids.length);
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const i = next++;
      rows[i] = await run(ids[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, ids.length)) }, worker));
  return rows;
}

export interface Report {
  /** One line per row, in order. */
  lines: string[];
  head: string;
  /** Failing and not listed: these make the run red. */
  unexpected: Row[];
  /** Listed and passing: their lines can be removed. */
  fixed: Row[];
  /** The job summary table. */
  table: string;
}

export function report(rows: readonly Row[], known: Record<string, string> = {}, title = 'Gates'): Report {
  const why = (r: Row) => known[r.id];
  const unexpected = rows.filter((r) => !r.ok && why(r) === undefined);
  const fixed = rows.filter((r) => r.ok && why(r) !== undefined);
  const result = (r: Row) =>
    r.ok ? (why(r) === undefined ? 'passes' : 'passes (remove it from the known-failing list)') : why(r) === undefined ? 'FAILS (unexpected)' : `fails, known: ${why(r) ?? ''}`;
  const passing = rows.filter((r) => r.ok).length;
  const head = `${title}: ${passing} of ${rows.length} pass, ${rows.length - passing - unexpected.length} fail for a known reason, ${unexpected.length} unexpected.`;
  const table = `### ${head}\n\n| Item | Result | Last line |\n| --- | --- | --- |\n${rows.map((r) => `| ${r.id} | ${result(r)} | ${r.last.replace(/\|/g, '\\|')} |`).join('\n')}\n\n`;
  return { lines: rows.map((r) => `${r.id}: ${result(r)}; ${r.last}`), head, unexpected, fixed, table };
}

export async function main(argv: readonly string[]): Promise<void> {
  const at = argv.indexOf('--config');
  const cfg = JSON.parse(readFileSync(at >= 0 ? (argv[at + 1] ?? '') : 'gate-all.config.json', 'utf8')) as GateConfig;
  const j = argv.indexOf('--jobs');
  const asked = j >= 0 ? Number(argv[j + 1]) : availableParallelism();
  const rows = await gateAll(cfg.items, Number.isInteger(asked) && asked > 0 ? asked : 1, (id) => gate(cfg.command, id));
  const rep = report(rows, cfg.known, cfg.title);
  for (const r of rep.unexpected) console.log(`::group::${r.id}: FAILS (unexpected)\n${r.out}\n::endgroup::`);
  console.log(`${rep.lines.join('\n')}\n${rep.head}`);
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary) appendFileSync(summary, rep.table);
  if (rep.fixed.length) console.log(`::notice::gate-all: ${rep.fixed.map((r) => r.id).join(', ')} now pass: remove them from the known-failing list`);
  if (rep.unexpected.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) void main(process.argv.slice(2));
