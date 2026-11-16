// Weight tuning for a weighted greedy opponent (warps engine-rs/train/minmax.py): a cross-entropy search over simulated
// games, and paired validation of a tuned set against a baseline on fresh seeds.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SimRecord } from './play.ts';
import { runGames } from './pool.ts';
import { DriverRng } from './rng.ts';

export type Weights = Readonly<Record<string, number>>;

/** One weight: its start value, the search's first step, bounds; `scale` weights move as start × exp(z), others as start + z. */
export interface WeightDef {
  readonly start: number;
  readonly step: number;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly scale?: boolean | undefined;
  /** Keeps its start value. */
  readonly fixed?: boolean | undefined;
}

export type WeightSpace = Readonly<Record<string, WeightDef>>;

/** A weights file: the values, their bounds, the code version and the training seed prefix. */
export interface WeightsFile {
  readonly version: string;
  readonly seed: string;
  readonly generation: number;
  readonly weights: Weights;
  readonly bounds: Readonly<Record<string, { min?: number; max?: number }>>;
}

export interface Outcome {
  readonly win: boolean | number;
  readonly score?: number | undefined;
}

export type PlayFn = (weights: Weights, seed: string, setup: string) => Outcome | Promise<Outcome>;
export interface Job {
  readonly weights: Weights;
  readonly seed: string;
  readonly setup: string;
}
/** Plays many games at once, results in job order (`inThread(play)` or `poolBatch(...)`). */
export type Batch = (jobs: readonly Job[]) => Promise<Outcome[]>;

export const inThread =
  (play: PlayFn): Batch =>
  async (jobs) => {
    const out: Outcome[] = [];
    for (const j of jobs) out.push(await play(j.weights, j.seed, j.setup));
    return out;
  };

/**
 * The sim-pool workers as a batch: each job is a game with `settings` = the weights plus `setup` (the game's driver reads
 * them from `spec.settings`); `outcome(record)` reads win and score from the record. A failed game throws.
 */
export function poolBatch<S = unknown>(o: { module: string; driver: string; workers: number; outcome: (r: SimRecord<S>) => Outcome; settings?: Readonly<Record<string, string | number | boolean>>; worker?: string }): Batch {
  return async (jobs) => {
    const specs = jobs.map((j, index) => ({ index, seed: j.seed, driver: o.driver, settings: { ...o.settings, ...j.weights, setup: j.setup } }));
    const records = (await runGames({ module: o.module, specs, ...(o.worker !== undefined ? { worker: o.worker } : {}) }, o.workers)) as SimRecord<S>[];
    return records.map((r) => {
      if (r.error !== undefined || r.violations?.length) throw new Error(`game ${r.seed} failed: ${r.error ?? 'violation'}`);
      return o.outcome(r);
    });
  };
}

const num = (w: boolean | number): number => (typeof w === 'number' ? w : w ? 1 : 0);

export function toWeights(space: WeightSpace, z: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(space).map(([k, d]) => {
      const x = z[k] ?? 0;
      const v = d.scale ? d.start * Math.exp(x) : d.start + x;
      return [k, Math.min(d.max ?? Infinity, Math.max(d.min ?? -Infinity, v))];
    }),
  );
}

export function fromWeights(space: WeightSpace, w: Weights): Record<string, number> {
  return Object.fromEntries(Object.entries(space).map(([k, d]) => [k, w[k] === undefined ? 0 : d.scale ? Math.log(w[k] / d.start) : w[k] - d.start]));
}

export const weightsFile = (space: WeightSpace, weights: Weights, version: string, seed: string, generation: number): WeightsFile => ({
  version,
  seed,
  generation,
  weights,
  bounds: Object.fromEntries(Object.entries(space).filter(([, d]) => d.min !== undefined || d.max !== undefined).map(([k, d]) => [k, { ...(d.min !== undefined ? { min: d.min } : {}), ...(d.max !== undefined ? { max: d.max } : {}) }])),
});

interface Scored {
  readonly score: number;
  readonly win: number;
  readonly per: Record<string, number>;
  readonly games: Record<string, number[]>;
}

/** Plays one weight set on the same seeds of every setup: win rate per setup, their mean (setups equal), mean score. */
async function scoreSets(batch: Batch, sets: readonly Weights[], setups: readonly string[], seeds: readonly string[], scoreWeight: number): Promise<Scored[]> {
  const jobs = sets.flatMap((weights) => setups.flatMap((setup) => seeds.map((seed) => ({ weights, seed, setup }))));
  const res = await batch(jobs);
  const n = seeds.length * setups.length;
  return sets.map((_, s) => {
    const mine = res.slice(s * n, (s + 1) * n);
    const games = Object.fromEntries(setups.map((u, i) => [u, mine.slice(i * seeds.length, (i + 1) * seeds.length).map((r) => num(r.win))]));
    const per = Object.fromEntries(Object.entries(games).map(([k, v]) => [k, v.reduce((a, x) => a + x, 0) / v.length]));
    const win = Object.values(per).reduce((a, x) => a + x, 0) / setups.length;
    const score = mine.reduce((a, r) => a + (r.score ?? 0), 0) / mine.length;
    return { score: win + scoreWeight * score, win, per, games };
  });
}

export interface TuneOptions {
  readonly space: WeightSpace;
  readonly setups: readonly string[];
  readonly play?: PlayFn | undefined;
  readonly batch?: Batch | undefined;
  /** Writes `gen-<n>.json` (the report) and `best.json` (a `WeightsFile`) here; a stopped run resumes from the last report. */
  readonly out: string;
  /** Training seeds are `tune:<tag>:<generation>-<i>`; validate refuses them. */
  readonly tag: string;
  readonly version: string;
  /** Start from these weights (default: every weight's `start`). */
  readonly from?: Weights | undefined;
  readonly generations?: number | undefined;
  readonly population?: number | undefined;
  readonly elite?: number | undefined;
  /** Games per setup per weight set (default 600). */
  readonly games?: number | undefined;
  /** A set's score = mean win rate + scoreWeight × mean score (default 0: wins only). */
  readonly scoreWeight?: number | undefined;
  /** Noise schedule: step = max(keep × step + (1 - keep) × elite spread, floor × first step) (defaults 0.6, 0.15). */
  readonly keep?: number | undefined;
  readonly floor?: number | undefined;
  readonly onGeneration?: ((report: GenerationReport) => void) | undefined;
}

export interface GenerationReport {
  readonly generation: number;
  readonly tag: string;
  readonly version: string;
  readonly seed: string;
  readonly games: number;
  readonly baselineWin: number;
  readonly meanWin: number;
  readonly bestWin: number;
  readonly eliteWin: number;
  readonly best: Weights;
  readonly z: Readonly<Record<string, number>>;
  readonly step: Readonly<Record<string, number>>;
}

function normal(rng: DriverRng): number {
  const u = (rng.nextUint32() + 1) / 4294967297;
  const v = rng.nextUint32() / 4294967296;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** The cross-entropy tuner: returns the last generation's mean weights (also in `<out>/best.json`). */
export async function tune(o: TuneOptions): Promise<WeightsFile> {
  const batch = o.batch ?? (o.play ? inThread(o.play) : undefined);
  if (!batch) throw new Error('tune: give play or batch');
  const [generations, population, elite, games, keep, floor] = [o.generations ?? 15, o.population ?? 24, o.elite ?? 6, o.games ?? 600, o.keep ?? 0.6, o.floor ?? 0.15];
  const names = Object.keys(o.space);
  const first = Object.fromEntries(names.map((k) => [k, o.space[k]?.fixed ? 0 : (o.space[k]?.step ?? 0)]));
  let z: Record<string, number> = fromWeights(o.space, o.from ?? {});
  let step: Record<string, number> = { ...first };
  let start = 0;
  mkdirSync(o.out, { recursive: true });
  const done = readdirSync(o.out).map((f) => /^gen-(\d+)\.json$/.exec(f)?.[1]).filter((n) => n !== undefined).map(Number).sort((a, b) => b - a)[0];
  let file = existsSync(path.join(o.out, 'best.json')) ? (JSON.parse(readFileSync(path.join(o.out, 'best.json'), 'utf8')) as WeightsFile) : weightsFile(o.space, toWeights(o.space, z), o.version, `tune:${o.tag}`, -1);
  if (done !== undefined) {
    const last = JSON.parse(readFileSync(path.join(o.out, `gen-${String(done)}.json`), 'utf8')) as GenerationReport;
    if (last.tag !== o.tag || last.version !== o.version) throw new Error(`tune: ${o.out} holds tag ${last.tag} version ${last.version}, not ${o.tag} ${o.version}`);
    z = { ...last.z };
    step = { ...last.step };
    start = done + 1;
  }
  for (let gen = start; gen < generations; gen += 1) {
    const seed = `tune:${o.tag}:${String(gen)}`;
    const rng = new DriverRng(seed);
    const zs = [z, ...Array.from({ length: population - 1 }, () => Object.fromEntries(names.map((k) => [k, (z[k] ?? 0) + (step[k] ?? 0) * normal(rng)])))];
    const seeds = Array.from({ length: games }, (_, i) => `${seed}-${String(i)}`);
    const scored = await scoreSets(batch, [...zs.map((x) => toWeights(o.space, x)), toWeights(o.space, {})], o.setups, seeds, o.scoreWeight ?? 0);
    const base = scored.pop() as Scored;
    const order = scored.map((_, i) => i).sort((a, b) => (scored[b]?.score ?? 0) - (scored[a]?.score ?? 0)).slice(0, elite);
    const ez = order.map((i) => zs[i] as Record<string, number>);
    z = Object.fromEntries(names.map((k) => [k, ez.reduce((a, x) => a + (x[k] ?? 0), 0) / ez.length]));
    step = Object.fromEntries(
      names.map((k) => {
        const sd = Math.sqrt(ez.reduce((a, x) => a + ((x[k] ?? 0) - (z[k] ?? 0)) ** 2, 0) / ez.length);
        return [k, (first[k] ?? 0) === 0 ? 0 : Math.max(keep * (step[k] ?? 0) + (1 - keep) * sd, floor * (first[k] ?? 0))];
      }),
    );
    const best = toWeights(o.space, z);
    const report: GenerationReport = {
      generation: gen,
      tag: o.tag,
      version: o.version,
      seed,
      games: games * o.setups.length * (zs.length + 1),
      baselineWin: base.win,
      meanWin: scored[0]?.win ?? 0,
      bestWin: scored[order[0] ?? 0]?.win ?? 0,
      eliteWin: order.reduce((a, i) => a + (scored[i]?.win ?? 0), 0) / order.length,
      best,
      z,
      step,
    };
    file = weightsFile(o.space, best, o.version, `tune:${o.tag}`, gen);
    writeFileSync(path.join(o.out, 'best.json'), JSON.stringify(file, null, 1));
    writeFileSync(path.join(o.out, `gen-${String(gen)}.json`), JSON.stringify(report, null, 1));
    o.onGeneration?.(report);
  }
  return file;
}

export interface SetupCheck {
  readonly candidate: number;
  readonly baseline: number;
  readonly diff: number;
  /** Standard error of the paired difference. */
  readonly se: number;
}

export interface Validation {
  readonly seed: string;
  readonly games: number;
  readonly setups: Readonly<Record<string, SetupCheck>>;
  /** Over the setups, each counted equally; `z` = diff / se; `low` to `high` = diff ± 1.96 se (95 %). */
  readonly all: SetupCheck & { readonly z: number; readonly low: number; readonly high: number };
}

/** Paired validation: candidate and baseline on the same fresh seeds `<seed>-<i>` of every setup; never the training seeds. */
export async function validate(o: { candidate: Weights | WeightsFile; baseline: Weights | WeightsFile; setups: readonly string[]; games: number; seed: string; play?: PlayFn; batch?: Batch; out?: string }): Promise<Validation> {
  const batch = o.batch ?? (o.play ? inThread(o.play) : undefined);
  if (!batch) throw new Error('validate: give play or batch');
  const trained = [o.candidate, o.baseline].map((w) => ('weights' in w && typeof w.seed === 'string' ? w.seed : undefined)).filter((s) => s !== undefined);
  if (o.seed.startsWith('tune:') || trained.some((s) => o.seed.startsWith(s) || s.startsWith(o.seed))) throw new Error(`validate: seed ${o.seed} overlaps the training seeds`);
  const w = (x: Weights | WeightsFile): Weights => ('weights' in x && typeof x.weights === 'object' ? (x as WeightsFile).weights : (x as Weights));
  const seeds = Array.from({ length: o.games }, (_, i) => `${o.seed}-${String(i)}`);
  const [c, b] = (await scoreSets(batch, [w(o.candidate), w(o.baseline)], o.setups, seeds, 0)) as [Scored, Scored];
  const setups = Object.fromEntries(
    o.setups.map((u) => {
      const d = (c.games[u] ?? []).map((x, i) => x - (b.games[u]?.[i] ?? 0));
      const m = d.reduce((a, x) => a + x, 0) / d.length;
      const v = d.length > 1 ? d.reduce((a, x) => a + (x - m) ** 2, 0) / (d.length - 1) / d.length : 0;
      return [u, { candidate: c.per[u] ?? 0, baseline: b.per[u] ?? 0, diff: m, se: Math.sqrt(v) }];
    }),
  );
  const k = o.setups.length;
  const diff = c.win - b.win;
  const se = Math.sqrt(Object.values(setups).reduce((a, s) => a + s.se ** 2, 0)) / k;
  const res: Validation = { seed: o.seed, games: o.games, setups, all: { candidate: c.win, baseline: b.win, diff, se, z: se > 0 ? diff / se : 0, low: diff - 1.96 * se, high: diff + 1.96 * se } };
  if (o.out !== undefined) writeFileSync(o.out, JSON.stringify(res, null, 1));
  return res;
}
