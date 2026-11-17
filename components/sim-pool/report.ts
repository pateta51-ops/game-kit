// K273: the standard balance report of a run: completion, failures by kind, game length, win share by seat and by first player.
import { CRASH_HASH, type SimRecord } from './play.ts';

export type Seat = string | number;
export type FailKind = 'timeout' | 'crash' | 'violation' | 'error';

export interface ReportOptions<S = unknown> {
  /** The winning seat of a completed game, or undefined for none; default: the result itself when a string or number, else its `winner`. */
  readonly winner?: (r: SimRecord<S>) => Seat | undefined;
  /** The seat that played first; default none (no first-player table). */
  readonly first?: (r: SimRecord<S>) => Seat | undefined;
}

export interface Lengths {
  readonly min: number;
  readonly median: number;
  readonly max: number;
}

export interface Report {
  readonly games: number;
  readonly completed: number;
  /** completed / games (0 for no games). */
  readonly completedShare: number;
  readonly failures: Readonly<Record<FailKind, number>>;
  /** Actions per completed game; undefined for none. */
  readonly length: Lengths | undefined;
  /** Wins of each seat, and the same over completed games. */
  readonly winsBySeat: Readonly<Record<string, number>>;
  readonly winShareBySeat: Readonly<Record<string, number>>;
  /** Wins of the first player's seat over completed games that name one: first seat → { games, wins, share }. */
  readonly firstPlayer: Readonly<Record<string, { readonly games: number; readonly wins: number; readonly share: number }>>;
}

const failKind = (r: SimRecord<unknown>): FailKind | undefined => {
  if (r.errorName === 'timeout') return 'timeout';
  if (r.hash === CRASH_HASH) return 'crash';
  if (r.violations?.length) return 'violation';
  if (r.error !== undefined) return 'error';
  return undefined;
};

const defaultWinner = (r: SimRecord<unknown>): Seat | undefined => {
  const x = r.result;
  if (typeof x === 'string' || typeof x === 'number') return x;
  const w = typeof x === 'object' && x !== null ? (x as { winner?: unknown }).winner : undefined;
  return typeof w === 'string' || typeof w === 'number' ? w : undefined;
};

const median = (xs: readonly number[]): number => {
  const m = xs.length >> 1;
  return xs.length % 2 === 1 ? (xs[m] as number) : ((xs[m - 1] as number) + (xs[m] as number)) / 2;
};

export function report<S = unknown>(records: readonly SimRecord<S>[], o: ReportOptions<S> = {}): Report {
  const failures: Record<FailKind, number> = { timeout: 0, crash: 0, violation: 0, error: 0 };
  const lens: number[] = [];
  const wins: Record<string, number> = {};
  const first: Record<string, { games: number; wins: number; share: number }> = {};
  let completed = 0;
  for (const r of records) {
    const k = failKind(r);
    if (k !== undefined) {
      failures[k] += 1;
      continue;
    }
    completed += 1;
    lens.push(r.actions);
    const w = (o.winner ?? defaultWinner)(r);
    if (w !== undefined) wins[String(w)] = (wins[String(w)] ?? 0) + 1;
    const f = o.first?.(r);
    if (f !== undefined) {
      const e = (first[String(f)] ??= { games: 0, wins: 0, share: 0 });
      e.games += 1;
      if (w !== undefined && String(w) === String(f)) e.wins += 1;
    }
  }
  for (const e of Object.values(first)) e.share = e.wins / e.games;
  lens.sort((a, b) => a - b);
  return {
    games: records.length,
    completed,
    completedShare: records.length === 0 ? 0 : completed / records.length,
    failures,
    length: lens.length === 0 ? undefined : { min: lens[0] as number, median: median(lens), max: lens[lens.length - 1] as number },
    winsBySeat: wins,
    winShareBySeat: Object.fromEntries(Object.entries(wins).map(([s, n]) => [s, n / completed])),
    firstPlayer: first,
  };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

/** A short text render of a report. */
export function formatReport(r: Report): string {
  const f = r.failures;
  const lines = [
    `games ${String(r.games)}, completed ${String(r.completed)} (${pct(r.completedShare)})`,
    `failures: timeout ${String(f.timeout)}, crash ${String(f.crash)}, violation ${String(f.violation)}, error ${String(f.error)}`,
  ];
  if (r.length) lines.push(`length (actions): min ${String(r.length.min)}, median ${String(r.length.median)}, max ${String(r.length.max)}`);
  const seats = Object.keys(r.winsBySeat).sort();
  if (seats.length) lines.push(`win share by seat: ${seats.map((s) => `${s} ${pct(r.winShareBySeat[s] as number)} (${String(r.winsBySeat[s])})`).join(', ')}`);
  const firsts = Object.keys(r.firstPlayer).sort();
  if (firsts.length) lines.push(`first player wins: ${firsts.map((s) => `${s} ${pct((r.firstPlayer[s] as { share: number }).share)} of ${String((r.firstPlayer[s] as { games: number }).games)}`).join(', ')}`);
  return lines.join('\n');
}
