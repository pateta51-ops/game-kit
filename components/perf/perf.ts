// The engine speed budget (stcc scripts/perf.ts made generic over the sim-pool game contract; the slowest list from ebr,
// the injected clock and "no call was timed" from unst, measure/formatReport from imp).
import { applyAction, createGame, type ApplyResult, type GameTypes } from '../engine-core/index';
import { legalAnswers, type GameSpec, type SimGame } from '../sim-pool/play';
import { DriverRng } from '../sim-pool/rng';

export const REPEATS = 3;
export const SLOWEST = 10;
const STATS = ['p50', 'p95', 'p99', 'max'] as const;

/** The sim-pool game, plus where each timed call is counted. */
export interface PerfGame<G extends GameTypes> extends SimGame<G> {
  /** The bucket a call counts in (default `apply`); null leaves it out (early turns, say). */
  bucket?(before: G['state'], result: ApplyResult<G>): string | null;
  /** The kind of the open prompt, for the slowest list (default: its `kind` field, else `prompt`). */
  promptKind?(state: G['state']): string;
}

export interface Sample {
  readonly game: string;
  readonly index: number;
  readonly prompt: string;
  readonly bucket: string;
  readonly ms: number;
}

export interface Distribution {
  samples: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface PerfReport {
  games: number;
  buckets: Record<string, Distribution>;
  slowest: Sample[];
}

/** Limits in ms per bucket; a value at or over its limit fails, and so does a budgeted bucket with no sample. */
export type Budgets = Readonly<Record<string, Readonly<Partial<Record<(typeof STATS)[number], number>>>>>;

export interface TimeOptions {
  /** Each call is timed this many times on the same state; the fastest counts (default 3). */
  repeats?: number;
  /** Games played first and not counted (default 1). */
  warmup?: number;
  now?: () => number;
}

/** Nearest rank; 0 for no values. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length))) - 1] as number;
}

export function distribution(values: readonly number[]): Distribution {
  return { samples: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), p99: percentile(values, 0.99), max: percentile(values, 1) };
}

/** Play `spec` to its end and time every `applyAction`; the driver's thinking is not timed. Throws when the game fails. */
export function timeGame<G extends GameTypes>(game: PerfGame<G>, content: G['content'], spec: GameSpec, o: TimeOptions = {}): Sample[] {
  const now = o.now ?? (() => performance.now());
  const repeats = o.repeats ?? REPEATS;
  const out: Sample[] = [];
  const start = game.start(spec, content);
  const first = createGame(game.rules, start.options, start.rules, content);
  const v0 = first.violations[0];
  if (v0 !== undefined) throw new Error(`seed ${spec.seed} setup: ${v0.id} ${v0.message}`);
  let s: G['state'] = first.state;
  const driver = game.driver(spec.driver, spec, content);
  const cap = game.maxActions ?? 100_000;
  for (let i = 0; s.result === null; i += 1) {
    const p = s.prompt;
    if (p === null) throw new Error(`seed ${spec.seed}: no prompt is open and the game has no result`);
    if (i >= cap) throw new Error(`seed ${spec.seed}: no result after ${String(cap)} actions`);
    const rng = new DriverRng(`${spec.seed}|${spec.driver}|${String(p.id)}`);
    const answers = game.answers ? game.answers(s, content, rng) : (legalAnswers(p, rng) as G['action'][]);
    const a = driver.choose(s, answers, rng);
    const before = s;
    let t = now();
    const r = applyAction(game.rules, before, a, content);
    let ms = now() - t;
    for (let k = 1; k < repeats; k += 1) {
      t = now();
      applyAction(game.rules, before, a, content);
      ms = Math.min(ms, now() - t);
    }
    const v = r.violations[0];
    if (v !== undefined) throw new Error(`seed ${spec.seed} action ${String(i)}: ${v.id} ${v.message}`);
    const bucket = game.bucket ? game.bucket(before, r) : 'apply';
    const kind = (p as { kind?: unknown }).kind;
    if (bucket !== null) out.push({ game: spec.seed, index: i, prompt: game.promptKind ? game.promptKind(before) : typeof kind === 'string' ? kind : 'prompt', bucket, ms });
    s = r.state;
  }
  return out;
}

export function reportOf(games: number, samples: readonly Sample[]): PerfReport {
  const by: Record<string, number[]> = {};
  for (const s of samples) (by[s.bucket] ??= []).push(s.ms);
  return {
    games,
    buckets: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, distribution(v)])),
    slowest: [...samples].sort((a, b) => b.ms - a.ms).slice(0, SLOWEST),
  };
}

/** Time `specs` after the warm-up games (the first spec under another seed). */
export function measure<G extends GameTypes>(game: PerfGame<G>, content: G['content'], specs: readonly GameSpec[], o: TimeOptions = {}): PerfReport {
  const first = specs[0];
  if (first !== undefined) for (let w = 0; w < (o.warmup ?? 1); w += 1) timeGame(game, content, { ...first, seed: `${first.seed}-warm${String(w)}` }, o);
  return reportOf(specs.length, specs.flatMap((s) => timeGame(game, content, s, o)));
}

/** What is over budget; empty when all is within. */
export function overBudget(report: PerfReport, budgets: Budgets): string[] {
  const bad: string[] = [];
  for (const [name, limits] of Object.entries(budgets)) {
    const d = report.buckets[name];
    if (d === undefined || d.samples === 0) {
      bad.push(`${name}: no call was timed`);
      continue;
    }
    for (const stat of STATS) {
      const limit = limits[stat];
      if (limit !== undefined && d[stat] >= limit) bad.push(`${name}: ${stat} ${d[stat].toFixed(3)} ms, budget under ${String(limit)} ms`);
    }
  }
  return bad;
}

const f = (x: number): string => x.toFixed(3);

export function formatReport(report: PerfReport): string[] {
  return [
    ...Object.entries(report.buckets).map(([name, d]) => `${name}: ${String(d.samples)} calls in ${String(report.games)} games, p50 ${f(d.p50)}  p95 ${f(d.p95)}  p99 ${f(d.p99)}  max ${f(d.max)} ms`),
    'slowest:',
    ...report.slowest.map((s) => `  ${f(s.ms)} ms  ${s.bucket}  game ${s.game}  action ${String(s.index)}  ${s.prompt}`),
  ];
}

/** For a budgets test: measure up to `attempts` times (a busy machine), return the first report within budget, else throw. */
export function expectBudgets(run: () => PerfReport, budgets: Budgets, attempts = 3, out: (line: string) => void = console.log): PerfReport {
  let bad: string[] = [];
  for (let a = 1; a <= attempts; a += 1) {
    const report = run();
    out(`attempt ${String(a)}: ${formatReport(report).slice(0, Object.keys(report.buckets).length).join('; ')}`);
    bad = overBudget(report, budgets);
    if (bad.length === 0) return report;
  }
  throw new Error(`over budget after ${String(attempts)} attempts:\n${bad.join('\n')}`);
}
