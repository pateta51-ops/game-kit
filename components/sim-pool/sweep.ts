// A grid sweep (7is scripts/sweep.ts): every cell of a settings grid plays the same seeds through `runResumable`; one CSV
// row per cell with the mean, standard deviation and standard error of each metric over the games that did not fail.
import { writeFileSync } from 'node:fs';
import type { GameSpec, SimRecord } from './play';
import { runResumable } from './resume';

export type Cell = NonNullable<GameSpec['settings']>;

export interface SweepOptions<S = unknown> {
  readonly module: string;
  readonly cells: readonly Cell[];
  /** Games per cell: seeds `<prefix>-0` .. (default prefix `sweep`), the same for every cell. */
  readonly games: number;
  readonly prefix?: string | undefined;
  readonly driver: string;
  /** Settings of every game; a cell's own come on top. */
  readonly settings?: Cell | undefined;
  /** One number per game that did not fail; a column each, with `_sd` and `_se`. */
  readonly metrics: Readonly<Record<string, (r: SimRecord<S>) => number>>;
  readonly workers: number;
  /** The resume file and its settings label (`runResumable`). */
  readonly file: string;
  readonly label: string;
  /** Write the CSV here too. */
  readonly out?: string | undefined;
  readonly worker?: string | undefined;
  readonly invariants?: boolean | undefined;
  readonly onRecord?: ((r: SimRecord) => void) | undefined;
}

export interface Spread {
  readonly mean: number;
  readonly sd: number;
  readonly se: number;
}

export interface SweepCell {
  readonly cell: Cell;
  readonly games: number;
  readonly failed: number;
  readonly stats: Readonly<Record<string, Spread>>;
}

export interface Sweep<S = unknown> {
  readonly records: readonly SimRecord<S>[];
  readonly cells: readonly SweepCell[];
  readonly csv: string;
}

/** Every combination of the axes' values, the first axis slowest. */
export const grid = (axes: Readonly<Record<string, readonly (string | number | boolean)[]>>): Cell[] =>
  Object.entries(axes).reduce<Cell[]>((cells, [k, values]) => cells.flatMap((c) => values.map((v) => ({ ...c, [k]: v }))), [{}]);

/** Mean, sample standard deviation and standard error (all NaN for no values; sd and se 0 for one). */
export function spread(xs: readonly number[]): Spread {
  const n = xs.length;
  const mean = xs.reduce((a, x) => a + x, 0) / n;
  const sd = n === 0 ? Number.NaN : n === 1 ? 0 : Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1));
  return { mean, sd, se: sd / Math.sqrt(n) };
}

const field = (v: string | number | boolean | undefined): string => {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Number(v.toFixed(6))) : '';
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export async function sweep<S = unknown>(o: SweepOptions<S>): Promise<Sweep<S>> {
  const n = o.games;
  const specs: GameSpec[] = o.cells.flatMap((cell, c) =>
    Array.from({ length: n }, (_, i) => ({ index: c * n + i, seed: `${o.prefix ?? 'sweep'}-${String(i)}`, driver: o.driver, settings: { ...o.settings, ...cell } })),
  );
  const request = { module: o.module, specs, ...(o.worker !== undefined ? { worker: o.worker } : {}), ...(o.invariants !== undefined ? { invariants: o.invariants } : {}) };
  const records = (await runResumable(request, o.workers, o.file, o.label, o.onRecord)) as SimRecord<S>[];
  const keys = [...new Set(o.cells.flatMap((c) => Object.keys(c)))];
  const names = Object.keys(o.metrics);
  const cells = o.cells.map((cell, c): SweepCell => {
    const all = records.filter((r) => r.index >= c * n && r.index < (c + 1) * n);
    const ok = all.filter((r) => r.error === undefined && !r.violations?.length);
    return { cell, games: ok.length, failed: all.length - ok.length, stats: Object.fromEntries(names.map((m) => [m, spread(ok.map((r) => (o.metrics[m] as (r: SimRecord<S>) => number)(r)))])) };
  });
  const rows = [[...keys, 'games', 'failed', ...names.flatMap((m) => [m, `${m}_sd`, `${m}_se`])].map(field).join(',')];
  for (const c of cells) {
    const stats = names.flatMap((m) => {
      const s = c.stats[m] as Spread;
      return [s.mean, s.sd, s.se];
    });
    rows.push([...keys.map((k) => c.cell[k]), c.games, c.failed, ...stats].map(field).join(','));
  }
  const csv = `${rows.join('\n')}\n`;
  if (o.out !== undefined) writeFileSync(o.out, csv);
  return { records, cells, csv };
}
