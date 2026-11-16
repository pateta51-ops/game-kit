// The invariant run and the fuzz command (stcc scripts/sim/invariantRun.ts, ebr scripts/fuzz.ts): random games with every
// invariant checked after every action; each failure is a seed plus a step, and `--seed X --until N` replays it to there.
import type { GameSpec, SimRecord } from './play.ts';
import { runGames } from './pool.ts';

export type FindingKind = 'violation' | 'runaway' | 'endless' | 'exception';

export interface Finding {
  readonly kind: FindingKind;
  readonly seed: string;
  readonly driver: string;
  /** Applied actions when it failed (0: the new game). */
  readonly step: number;
  readonly messages: readonly string[];
}

export interface FuzzOptions {
  /** Games `<prefix>-0` .. `<prefix>-<games-1>` (default 500 of `fuzz`). */
  readonly games?: number | undefined;
  readonly prefix?: string | undefined;
  readonly driver?: string | undefined;
  readonly workers?: number | undefined;
  /** Play this one game only. */
  readonly seed?: string | undefined;
  /** Stop after this many applied actions. */
  readonly until?: number | undefined;
  readonly worker?: string | undefined;
  /** K101: render the game's `view` at every step. */
  readonly view?: boolean | undefined;
  /** K101: apply the game's `hasten` action after every N actions. */
  readonly hasten?: number | undefined;
  /** The game's settings for a seed, from the seed alone (so a seed replays). */
  readonly settings?: ((seed: string, driver: string) => NonNullable<GameSpec['settings']>) | undefined;
}

export interface FuzzRun {
  readonly records: readonly SimRecord[];
  readonly findings: readonly Finding[];
}

export function findingOf(r: SimRecord): Finding | undefined {
  let kind: FindingKind;
  if (r.violations?.length) kind = 'violation';
  else if (r.error === undefined) return undefined;
  else if (r.errorName === 'EngineBugError' && r.error.startsWith('runaway task loop')) kind = 'runaway';
  else if (/^no result after \d+ actions$/.test(r.error)) kind = 'endless';
  else kind = 'exception';
  const messages = [...(r.violations ?? []).map((v) => `${v.id}: ${v.message}`), ...(r.error === undefined ? [] : [r.error])];
  return { kind, seed: r.seed, driver: r.driver, step: r.actions, messages };
}

/** Play the games of `o` from the module that exports `simGame`, invariants on. */
export async function fuzz(module: string, o: FuzzOptions = {}): Promise<FuzzRun> {
  const driver = o.driver ?? 'random';
  const seeds = o.seed !== undefined ? [o.seed] : Array.from({ length: o.games ?? 500 }, (_, i) => `${o.prefix ?? 'fuzz'}-${String(i)}`);
  const specs = seeds.map((seed, index): GameSpec => ({ index, seed, driver, ...(o.settings ? { settings: o.settings(seed, driver) } : {}) }));
  const records = await runGames({ module, specs, invariants: true, until: o.until, view: o.view, hasten: o.hasten, ...(o.worker !== undefined ? { worker: o.worker } : {}) }, o.workers ?? 1);
  return { records, findings: records.flatMap((r) => findingOf(r) ?? []) };
}

export function formatFuzz(run: FuzzRun, shown = 20): string[] {
  const lines: string[] = [];
  for (const f of run.findings.slice(0, shown)) {
    lines.push(`${f.kind} seed ${f.seed} step ${String(f.step)} (${f.driver})`, ...f.messages.map((m) => `  ${m}`));
    lines.push(`  replay: --seed ${f.seed} --driver ${f.driver} --until ${String(f.step)}`);
  }
  if (run.findings.length > shown) lines.push(`  ... and ${String(run.findings.length - shown)} more finding(s)`);
  const n = (k: FindingKind): string => String(run.findings.filter((f) => f.kind === k).length);
  lines.push(
    `${String(run.records.length)} game(s), ${String(run.records.reduce((s, r) => s + r.actions, 0))} actions checked: exceptions ${n('exception')}, ` +
      `invariant violations ${n('violation')}, runaway guards ${n('runaway')}, never ended ${n('endless')}`,
  );
  return lines;
}

const FLAGS = ['--games', '--prefix', '--driver', '--workers', '--seed', '--until', '--hasten'];
export const FUZZ_USAGE = 'usage: [--games N] [--prefix P] [--driver D] [--workers N] | --seed S [--driver D] [--until STEP]';

/** The command line of both: many games, or `--seed S [--until N]` for one. Returns the exit code: 1 on any finding, 2 on bad arguments. */
export async function fuzzMain(
  args: readonly string[],
  module: string,
  base: FuzzOptions = {},
  out: (line: string) => void = (l) => process.stdout.write(`${l}\n`),
): Promise<number> {
  const given = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i] ?? '';
    const v = args[i + 1];
    const whole = k === '--games' || k === '--workers' || k === '--until' || k === '--hasten';
    if (!FLAGS.includes(k) || v === undefined || (whole && !/^\d+$/.test(v)) || (k === '--until' && !args.includes('--seed')) || (args.includes('--seed') && ['--games', '--prefix', '--workers'].includes(k))) {
      out(FUZZ_USAGE);
      return 2;
    }
    given.set(k.slice(2), v);
  }
  const num = (k: string): number | undefined => (given.has(k) ? Number(given.get(k)) : undefined);
  const run = await fuzz(module, {
    ...base,
    games: num('games') ?? base.games,
    prefix: given.get('prefix') ?? base.prefix,
    driver: given.get('driver') ?? base.driver,
    workers: num('workers') ?? base.workers,
    seed: given.get('seed') ?? base.seed,
    until: num('until') ?? base.until,
    hasten: num('hasten') ?? base.hasten,
  });
  const one = run.records[0];
  if (given.has('seed') && one) out(`seed ${one.seed}: step ${String(one.actions)}, result ${JSON.stringify(one.result)}, actions hash ${one.hash}`);
  for (const line of formatFuzz(run)) out(line);
  return run.findings.length === 0 ? 0 : 1;
}
