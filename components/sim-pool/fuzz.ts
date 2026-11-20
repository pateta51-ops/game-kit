// The invariant run and the fuzz command (stcc scripts/sim/invariantRun.ts, ebr scripts/fuzz.ts): random games with every
// invariant checked after every action; each failure is a seed plus a step, and `--seed X --until N` replays it to there.
import type { GameSpec, SimRecord } from './play.ts';
import { runGames } from './pool.ts';

export type FindingKind = 'violation' | 'runaway' | 'endless' | 'exception' | 'hidden-info';

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
  /** K274: the hidden-shuffle check (see `PlayOptions.hidden`). */
  readonly hidden?: boolean | number | undefined;
  /** K490: stop a game that runs longer than this many ms (wall clock) as a failed `timeout` record (see `RunRequest.gameTimeoutMs`); default off. */
  readonly gameTimeoutMs?: number | undefined;
  /** The game's settings for a seed, from the seed alone (so a seed replays). */
  readonly settings?: ((seed: string, driver: string) => NonNullable<GameSpec['settings']>) | undefined;
  /** K490: print the whole-game report after the findings and fail on its failures (`fuzzMain`; not with `--until`). */
  readonly whole?: WholeGameOptions | boolean | undefined;
}

/** K490 whole-game report options. */
export interface WholeGameOptions {
  /** Every clause id the game prints; one no game resolved (records' `resolved`, from `SimGame.trace`) fails. */
  readonly clauses?: readonly string[] | undefined;
  /** A record's group; default `<settings.mode>/<settings.tier>` (`-` for one not set). */
  readonly group?: ((r: SimRecord) => string) | undefined;
}

export interface WholeGroup {
  readonly group: string;
  readonly started: number;
  readonly finished: number;
  /** Seeds of the games with no result (an error, a violation or no result). */
  readonly unfinished: readonly string[];
}

export interface WholeGame {
  readonly groups: readonly WholeGroup[];
  readonly byKind: Readonly<Partial<Record<FindingKind, readonly Finding[]>>>;
  /** Clause ids resolved in any game, merged across workers. */
  readonly resolved: readonly string[];
  readonly neverResolved: readonly string[];
  /** One line per failure: `<group>: N of M games did not finish (seeds ...)`, `never resolved: <ids>`. */
  readonly failures: readonly string[];
}

const finished = (r: SimRecord): boolean => r.result !== null && r.result !== undefined && r.error === undefined && !r.violations?.length;

/** K490: games started and finished per group, findings by kind, clause ids never resolved. */
export function wholeGame(run: FuzzRun, o: WholeGameOptions = {}): WholeGame {
  const group = o.group ?? ((r: SimRecord) => `${String(r.settings?.mode ?? '-')}/${String(r.settings?.tier ?? '-')}`);
  const by = new Map<string, SimRecord[]>();
  for (const r of run.records) by.set(group(r), [...(by.get(group(r)) ?? []), r]);
  const groups = [...by].sort(([a], [b]) => a.localeCompare(b)).map(([g, rs]) => ({ group: g, started: rs.length, finished: rs.filter(finished).length, unfinished: rs.filter((r) => !finished(r)).map((r) => r.seed) }));
  const byKind: Partial<Record<FindingKind, Finding[]>> = {};
  for (const f of run.findings) (byKind[f.kind] ??= []).push(f);
  const resolved = [...new Set(run.records.flatMap((r) => r.resolved ?? []))].sort();
  const neverResolved = (o.clauses ?? []).filter((c) => !resolved.includes(c));
  const failures = [
    ...groups.filter((g) => g.unfinished.length > 0).map((g) => `${g.group}: ${String(g.unfinished.length)} of ${String(g.started)} games did not finish (seeds ${g.unfinished.join(', ')})`),
    ...(neverResolved.length ? [`never resolved: ${neverResolved.join(', ')}`] : []),
  ];
  return { groups, byKind, resolved, neverResolved, failures };
}

const replayOf = (f: Finding): string => `--seed ${f.seed} --driver ${f.driver} --until ${String(f.step)}`;

export function formatWholeGame(w: WholeGame, shown = 20): string[] {
  const lines = ['whole-game report:'];
  for (const g of w.groups) lines.push(`  ${g.group}: ${String(g.finished)} of ${String(g.started)} games finished`);
  for (const [k, fs] of Object.entries(w.byKind)) {
    lines.push(`  ${k}: ${String(fs.length)}`, ...fs.slice(0, shown).map((f) => `    seed ${f.seed} step ${String(f.step)}: replay ${replayOf(f)}`));
    if (fs.length > shown) lines.push(`    ... and ${String(fs.length - shown)} more`);
  }
  lines.push(`  clauses resolved: ${String(w.resolved.length)}${w.neverResolved.length ? `, never resolved ${String(w.neverResolved.length)}` : ''}`);
  lines.push(...w.failures);
  return lines;
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
  else if (r.error.startsWith('hidden-info:')) kind = 'hidden-info';
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
  const records = await runGames({ module, specs, invariants: true, until: o.until, view: o.view, hasten: o.hasten, hidden: o.hidden, gameTimeoutMs: o.gameTimeoutMs, ...(o.worker !== undefined ? { worker: o.worker } : {}) }, o.workers ?? 1);
  return { records, findings: records.flatMap((r) => findingOf(r) ?? []) };
}

export function formatFuzz(run: FuzzRun, shown = 20): string[] {
  const lines: string[] = [];
  for (const f of run.findings.slice(0, shown)) {
    lines.push(`${f.kind} seed ${f.seed} step ${String(f.step)} (${f.driver})`, ...f.messages.map((m) => `  ${m}`));
    lines.push(`  replay: ${replayOf(f)}`);
  }
  if (run.findings.length > shown) lines.push(`  ... and ${String(run.findings.length - shown)} more finding(s)`);
  const n = (k: FindingKind): string => String(run.findings.filter((f) => f.kind === k).length);
  lines.push(
    `${String(run.records.length)} game(s), ${String(run.records.reduce((s, r) => s + r.actions, 0))} actions checked: exceptions ${n('exception')}, ` +
      `invariant violations ${n('violation')}, runaway guards ${n('runaway')}, never ended ${n('endless')}${run.findings.some((f) => f.kind === 'hidden-info') ? `, hidden-info ${n('hidden-info')}` : ''}`,
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
  const w = base.whole && !given.has('until') && base.until === undefined ? wholeGame(run, base.whole === true ? {} : base.whole) : undefined;
  if (w) for (const line of formatWholeGame(w)) out(line);
  return run.findings.length === 0 && !w?.failures.length ? 0 : 1;
}
