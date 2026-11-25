// The invariant run and the fuzz command (stcc scripts/sim/invariantRun.ts, ebr scripts/fuzz.ts): random games with every
// invariant checked after every action; each failure is a seed plus a step, and `--seed X --until N` replays it to there.
import { readFileSync, writeFileSync } from 'node:fs';
import { DriverRegistrationError, type GameSpec, type SimRecord } from './play.ts';
import type { Proof } from './unreached.ts';
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
  /** K651: play these seeds (overrides `games` and `prefix`). */
  readonly seeds?: readonly string[] | undefined;
  /** Stop after this many applied actions. */
  readonly until?: number | undefined;
  readonly worker?: string | undefined;
  /** K101: render the game's `view` at every step. */
  readonly view?: boolean | undefined;
  /** K101: apply the game's `hasten` action after every N actions. */
  readonly hasten?: number | undefined;
  /** K737: apply the game's `randomDebug` edit after every N actions. */
  readonly debug?: number | undefined;
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
  /** K651: clauses no game reaches, each proven by a passing full-resolve test of this run (`proof`). Given, a listed clause that resolved fails as stale and one with no proof fails; unset, the report is as before. */
  readonly unreached?: readonly UnreachedEntry[] | undefined;
  /** K651: `provenClauses` (unreached.ts) over the log `proveResolved` (prove.ts) wrote in this run; its `problems` fail the check. */
  readonly proof?: Proof | undefined;
  /** K651: coverage rounds after the run (`fuzzMain`), steering toward the clauses still unreached. */
  readonly rounds?: CoverageRounds | undefined;
  /** K651: write each finding with its seed, driver and settings to this JSON file (`fuzzMain`); `--finding S` replays one from it. */
  readonly findings?: string | undefined;
}

/** K651: a clause no game resolves, with why. */
export interface UnreachedEntry {
  readonly clause: string;
  readonly why?: string;
}

/** K651: rounds of `games` games (seeds `<prefix>-r<k>-<n>`) until a round resolves no new clause or `max` rounds (default 10) are played. */
export interface CoverageRounds {
  readonly games: number;
  readonly max?: number;
  /** A round game's settings, given the clause ids still unreached (default: the run's `settings`). */
  readonly settings?: ((seed: string, driver: string, unreached: readonly string[]) => NonNullable<GameSpec['settings']>) | undefined;
}

export interface CoverageRound {
  readonly round: number;
  readonly games: number;
  readonly added: number;
  readonly unreached: number;
}

/** K651: one line of the findings file. */
export interface FindingEntry extends Finding {
  readonly settings?: GameSpec['settings'];
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
  /** K651: ids resolved only with no change (`SimGame.changed`) and never with one. */
  readonly noOp: readonly string[];
  /** K651: listed unreached clauses with their proof. */
  readonly proven: readonly { readonly clause: string; readonly tests: readonly string[] }[];
  /** K651: listed clauses that resolved in the run. */
  readonly stale: readonly string[];
  /** K651: listed clauses never resolved with no proof. */
  readonly unproven: readonly string[];
  readonly rounds?: { readonly rounds: readonly CoverageRound[]; readonly capped: boolean };
  /** One line per failure: `<group>: N of M games did not finish (seeds ...)`, `never resolved: <ids>`. */
  readonly failures: readonly string[];
}

const finished = (r: SimRecord): boolean => r.result !== null && r.result !== undefined && r.error === undefined && !r.violations?.length;

/** K490: games started and finished per group, findings by kind, clause ids never resolved. */
export function wholeGame(run: FuzzRun, o: WholeGameOptions = {}, rounds?: WholeGame['rounds']): WholeGame {
  const group = o.group ?? ((r: SimRecord) => `${String(r.settings?.mode ?? '-')}/${String(r.settings?.tier ?? '-')}`);
  const by = new Map<string, SimRecord[]>();
  for (const r of run.records) by.set(group(r), [...(by.get(group(r)) ?? []), r]);
  const groups = [...by].sort(([a], [b]) => a.localeCompare(b)).map(([g, rs]) => ({ group: g, started: rs.length, finished: rs.filter(finished).length, unfinished: rs.filter((r) => !finished(r)).map((r) => r.seed) }));
  const byKind: Partial<Record<FindingKind, Finding[]>> = {};
  for (const f of run.findings) (byKind[f.kind] ??= []).push(f);
  const resolved = [...new Set(run.records.flatMap((r) => r.resolved ?? []))].sort();
  const never = (o.clauses ?? []).filter((c) => !resolved.includes(c));
  const listed = new Set((o.unreached ?? []).map((u) => u.clause));
  const neverResolved = o.unreached ? never.filter((c) => !listed.has(c)) : never;
  const noOp = [...new Set(run.records.flatMap((r) => r.noOp ?? []))].filter((c) => !resolved.includes(c)).sort();
  const stale = [...listed].filter((c) => resolved.includes(c));
  const proofOf = (c: string): readonly string[] => o.proof?.proven[c] ?? [];
  const unproven = never.filter((c) => listed.has(c) && proofOf(c).length === 0);
  const proven = never.filter((c) => listed.has(c) && proofOf(c).length > 0).map((c) => ({ clause: c, tests: proofOf(c) }));
  const failures = [
    ...groups.filter((g) => g.unfinished.length > 0).map((g) => `${g.group}: ${String(g.unfinished.length)} of ${String(g.started)} games did not finish (seeds ${g.unfinished.join(', ')})`),
    ...(neverResolved.length ? [`never resolved: ${neverResolved.join(', ')}`] : []),
    ...(stale.length ? [`stale unreached entry (resolved in a game): ${stale.join(', ')}`] : []),
    ...(unproven.length ? [`unreached with no counted full-resolve test: ${unproven.join(', ')}`] : []),
    ...(o.unreached ? (o.proof?.problems ?? []) : []),
  ];
  return { groups, byKind, resolved, neverResolved, noOp, proven, stale, unproven, ...(rounds ? { rounds } : {}), failures };
}

const replayOf = (f: Finding): string => `--seed ${f.seed} --driver ${f.driver} --until ${String(f.step)}`;

export function formatWholeGame(w: WholeGame, shown = 20): string[] {
  const lines = ['whole-game report:'];
  for (const g of w.groups) lines.push(`  ${g.group}: ${String(g.finished)} of ${String(g.started)} games finished`);
  for (const [k, fs] of Object.entries(w.byKind)) {
    lines.push(`  ${k}: ${String(fs.length)}`, ...fs.slice(0, shown).map((f) => `    seed ${f.seed} step ${String(f.step)}: replay ${replayOf(f)}`));
    if (fs.length > shown) lines.push(`    ... and ${String(fs.length - shown)} more`);
  }
  for (const r of w.rounds?.rounds ?? []) lines.push(`  coverage round ${String(r.round)}: ${String(r.games)} games, +${String(r.added)} clause(s), ${String(r.unreached)} unreached`);
  if (w.rounds) lines.push(w.rounds.capped ? `  coverage: stopped at the round cap of ${String(w.rounds.rounds.length)}` : `  coverage: stopped after ${String(w.rounds.rounds.length)} round(s), the last added nothing`);
  lines.push(`  clauses resolved: ${String(w.resolved.length)}${w.neverResolved.length ? `, never resolved ${String(w.neverResolved.length)}` : ''}`);
  if (w.noOp.length) lines.push(`  resolved but changed nothing: ${w.noOp.join(', ')}`);
  for (const p of w.proven) lines.push(`  unreached, proven by ${p.tests.join('; ')}: ${p.clause}`);
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

class ViewRunError extends Error {}

/** Play the games of `o` from the module that exports `simGame`, invariants on. */
export async function fuzz(module: string, o: FuzzOptions = {}): Promise<FuzzRun> {
  const driver = o.driver ?? 'random';
  const seeds = o.seed !== undefined ? [o.seed] : o.seeds ? [...o.seeds] : Array.from({ length: o.games ?? 500 }, (_, i) => `${o.prefix ?? 'fuzz'}-${String(i)}`);
  if (o.view && seeds.length === 0) throw new ViewRunError('view validation requires at least one game');
  const specs = seeds.map((seed, index): GameSpec => ({ index, seed, driver, ...(o.settings ? { settings: o.settings(seed, driver) } : {}) }));
  const records = await runGames({ module, specs, invariants: true, until: o.until, view: o.view, hasten: o.hasten, debug: o.debug, hidden: o.hidden, gameTimeoutMs: o.gameTimeoutMs, ...(o.worker !== undefined ? { worker: o.worker } : {}) }, o.workers ?? 1);
  const findings = records.flatMap((r) => findingOf(r) ?? []);
  if (o.view && findings.length === 0 &&
      (records.length !== specs.length || records.some((record) => record.viewValidation?.status !== 'executed' || record.viewValidation.checked === 0)))
    throw new ViewRunError('requested view validation lacks executed checks; check the worker version and adapters');
  return { records, findings };
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

/** K651: rounds after `first` until one resolves no new clause of `clauses`, or `max` rounds; returns every record and finding with the rounds. */
export async function coverRounds(module: string, o: FuzzOptions, clauses: readonly string[], r: CoverageRounds, first: FuzzRun): Promise<{ run: FuzzRun; rounds: CoverageRound[]; capped: boolean }> {
  const records = [...first.records];
  const findings = [...first.findings];
  const rounds: CoverageRound[] = [];
  const left = (): string[] => {
    const seen = new Set(records.flatMap((x) => x.resolved ?? []));
    return clauses.filter((c) => !seen.has(c));
  };
  for (let k = 1; k <= (r.max ?? 10); k++) {
    const before = left();
    const steer = r.settings;
    const seeds = Array.from({ length: r.games }, (_, i) => `${o.prefix ?? 'fuzz'}-r${String(k)}-${String(i)}`);
    const run = await fuzz(module, { ...o, seed: undefined, until: undefined, seeds, settings: steer ? (seed, d) => steer(seed, d, before) : o.settings });
    records.push(...run.records);
    findings.push(...run.findings);
    const after = left();
    rounds.push({ round: k, games: run.records.length, added: before.length - after.length, unreached: after.length });
    if (after.length === before.length) return { run: { records, findings }, rounds, capped: false };
  }
  return { run: { records, findings }, rounds, capped: true };
}

/** K651: the findings file's lines for a run: each finding with its game's settings. */
export const findingEntries = (run: FuzzRun): FindingEntry[] =>
  run.findings.map((f) => {
    const settings = run.records.find((r) => r.seed === f.seed && r.driver === f.driver)?.settings;
    return settings ? { ...f, settings } : f;
  });

const FLAGS = ['--games', '--prefix', '--driver', '--workers', '--seed', '--until', '--hasten', '--debug', '--finding'];
export const FUZZ_USAGE = 'usage: [--games N] [--prefix P] [--driver D] [--workers N] [--hasten N] [--debug N] | --seed S [--driver D] [--until STEP] | --finding S (replays a seed of the findings file)';

/** The command line of both: many games, or `--seed S [--until N]` for one. Returns the exit code: 1 on any finding, 2 on bad arguments. */
export function fuzzMain(
  args: readonly string[],
  module: string,
  base: FuzzOptions = {},
  out: (line: string) => void = (l) => process.stdout.write(`${l}\n`),
): Promise<number> {
  return runFuzzMain(args, module, base, out).catch((error: unknown) => {
    if (!(error instanceof DriverRegistrationError) && !(error instanceof ViewRunError)) throw error;
    out(error.message);
    return 2;
  });
}

async function runFuzzMain(
  args: readonly string[],
  module: string,
  base: FuzzOptions,
  out: (line: string) => void,
): Promise<number> {
  const given = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i] ?? '';
    const v = args[i + 1];
    const whole = k === '--games' || k === '--workers' || k === '--until' || k === '--hasten' || k === '--debug';
    if (!FLAGS.includes(k) || v === undefined || (whole && !/^\d+$/.test(v)) || (k === '--until' && !args.includes('--seed')) || (args.includes('--seed') && ['--games', '--prefix', '--workers'].includes(k))) {
      out(FUZZ_USAGE);
      return 2;
    }
    given.set(k.slice(2), v);
  }
  const num = (k: string): number | undefined => (given.has(k) ? Number(given.get(k)) : undefined);
  const wo = typeof base.whole === 'object' ? base.whole : undefined;
  if (given.has('finding')) {
    const seed = given.get('finding') as string;
    const file = wo?.findings;
    const was = file === undefined ? undefined : (JSON.parse(readFileSync(file, 'utf8')) as FindingEntry[]).find((f) => f.seed === seed);
    if (was === undefined) {
      out(file === undefined ? 'no findings file: pass whole.findings' : `no finding with seed ${seed} in ${file}`);
      return 2;
    }
    const settings = was.settings;
    const again = await fuzz(module, { ...base, seed, driver: was.driver, until: undefined, settings: settings ? () => settings : undefined });
    for (const line of formatFuzz(again)) out(line);
    const f = again.findings[0];
    const same = f !== undefined && f.kind === was.kind && f.step === was.step && f.messages.join('\n') === was.messages.join('\n');
    out(f === undefined ? `finding ${seed}: no longer fails` : same ? `finding ${seed}: the same failure again` : `finding ${seed}: fails differently (recorded ${was.kind} at step ${String(was.step)})`);
    return f === undefined ? 0 : 1;
  }
  let run = await fuzz(module, {
    ...base,
    games: num('games') ?? base.games,
    prefix: given.get('prefix') ?? base.prefix,
    driver: given.get('driver') ?? base.driver,
    workers: num('workers') ?? base.workers,
    seed: given.get('seed') ?? base.seed,
    until: num('until') ?? base.until,
    hasten: num('hasten') ?? base.hasten,
    debug: num('debug') ?? base.debug,
  });
  const one = run.records[0];
  if (given.has('seed') && one) out(`seed ${one.seed}: step ${String(one.actions)}, result ${JSON.stringify(one.result)}, actions hash ${one.hash}`);
  for (const line of formatFuzz(run)) out(line);
  const on = base.whole && !given.has('until') && base.until === undefined;
  let rounds: WholeGame['rounds'];
  if (on && wo?.rounds) {
    const c = await coverRounds(module, { ...base, prefix: given.get('prefix') ?? base.prefix, driver: given.get('driver') ?? base.driver, workers: num('workers') ?? base.workers }, wo.clauses ?? [], wo.rounds, run);
    run = c.run;
    rounds = { rounds: c.rounds, capped: c.capped };
  }
  if (on && wo?.findings !== undefined) writeFileSync(wo.findings, `${JSON.stringify(findingEntries(run), null, 1)}\n`);
  const w = on ? wholeGame(run, wo ?? {}, rounds) : undefined;
  if (w) for (const line of formatWholeGame(w)) out(line);
  return run.findings.length === 0 && !w?.failures.length ? 0 : 1;
}
