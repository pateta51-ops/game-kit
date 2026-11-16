// node components/perf/cli.ts --module <file> [--games N] [--driver D] [--seed S] [--warmup N] [--repeats N] [--attempts N]
//   [--budget bucket.stat=ms]... [--json <path>]
// Exit codes: 0 within budget, 1 over budget, 2 bad usage, a module that cannot be loaded or a game that failed.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GameTypes } from '../engine-core/index.ts';
import type { GameSpec } from '../sim-pool/play.ts';
import { formatReport, measure, overBudget, type Budgets, type PerfGame, type PerfReport } from './perf.ts';

/** What the module named by `--module` exports: `perfGame` (or sim-pool's `simGame`), and optionally the rest. */
export interface PerfModule {
  perfGame?: PerfGame<GameTypes>;
  simGame?: PerfGame<GameTypes>;
  budgets?: Budgets;
  specs?: (o: { games: number; seed: string; driver: string }) => GameSpec[];
}

const INTS = ['games', 'warmup', 'repeats', 'attempts'] as const;
const USAGE = 'usage: cli.ts --module <file> [--games N] [--driver D] [--seed S] [--warmup N] [--repeats N] [--attempts N] [--budget bucket.stat=ms]... [--json <path>]';

export async function run(args: readonly string[], out: (line: string) => void = console.log, err: (line: string) => void = console.error): Promise<number> {
  const n = { games: 5, warmup: 1, repeats: 3, attempts: 1 };
  const text: Record<string, string> = { driver: 'random', seed: 'perf' };
  const flagged: Record<string, Record<string, number>> = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = (args[i] as string).replace(/^--/, '');
    const value = args[i + 1];
    const int = INTS.find((k) => k === flag);
    const b = /^([^.=]+)\.(p50|p95|p99|max)=(\d+(?:\.\d+)?)$/.exec(value ?? '');
    if (value === undefined || !(args[i] as string).startsWith('--')) return err(USAGE), 2;
    if (int !== undefined && Number.isInteger(Number(value)) && Number(value) >= (int === 'warmup' ? 0 : 1)) n[int] = Number(value);
    else if (flag === 'budget' && b !== null) (flagged[b[1] as string] ??= {})[b[2] as string] = Number(b[3]);
    else if (int === undefined && ['module', 'driver', 'seed', 'json'].includes(flag)) text[flag] = value;
    else return err(`bad option: --${flag} ${value}\n${USAGE}`), 2;
  }
  if (text.module === undefined) return err(USAGE), 2;
  let mod: PerfModule;
  let content: unknown;
  try {
    mod = (await import(pathToFileURL(resolve(text.module)).href)) as PerfModule;
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e)), 2;
  }
  const game = mod.perfGame ?? mod.simGame;
  if (game === undefined) return err(`${text.module} exports no perfGame or simGame`), 2;
  const o = { games: n.games, seed: text.seed as string, driver: text.driver as string };
  const specs = mod.specs ? mod.specs(o) : Array.from({ length: o.games }, (_, index): GameSpec => ({ index, seed: `${o.seed}-${String(index)}`, driver: o.driver }));
  const budgets: Record<string, Budgets[string]> = {};
  const given: Budgets[] = [mod.budgets ?? {}, flagged];
  for (const src of given) for (const [k, v] of Object.entries(src)) budgets[k] = { ...budgets[k], ...v };
  let report: PerfReport | undefined;
  let bad: string[] = [];
  try {
    content = await game.content();
    for (let a = 0; a < n.attempts && (a === 0 || bad.length > 0); a += 1) {
      report = measure(game, content, specs, n);
      bad = overBudget(report, budgets);
    }
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e)), 2;
  }
  if (report === undefined) return 1;
  formatReport(report).forEach(out);
  if (text.json !== undefined) writeFileSync(resolve(text.json), `${JSON.stringify({ ...report, budgets, over: bad }, null, 2)}\n`);
  if (bad.length > 0) return err(`over budget:\n${bad.join('\n')}`), 1;
  out(Object.keys(budgets).length > 0 ? 'within budget' : 'no budget given');
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await run(process.argv.slice(2));
