// Achievements as pure functions over finished-game summaries: nothing is earned or stored, so a new definition applies
// to old games. Only the small summary is written when a game ends, in a play-stats store.
import { createPlayStats, type PlayRecord, type PlayStats, type PlayStatsOptions } from '../play-stats';

export const SUMMARY_VERSION = 1;

export interface GameSummary extends PlayRecord {
  /** Summary version: a field added later bumps it; older rows are read as they are. */
  v: number;
  result: 'win' | 'loss';
  /** Why it was lost (the game's own key), when it was. */
  lossReason?: string;
  rounds: number;
  /** Named counts (enemies defeated, cards played). */
  counts: Record<string, number>;
  /** Named sets of keys met in the game (heroes used, scenarios won): the source of checklists. */
  sets: Record<string, string[]>;
  /** Practice or tutorial games never count. */
  practice?: boolean;
}

export const makeSummary = (s: Omit<GameSummary, 'v'>): GameSummary => ({ ...s, v: SUMMARY_VERSION });

const isStrings = (x: unknown): boolean => Array.isArray(x) && x.every((e) => typeof e === 'string');

export const validSummary = (r: Record<string, unknown>): boolean => {
  const c = r['counts'], s = r['sets'];
  return (
    typeof r['v'] === 'number' && (r['result'] === 'win' || r['result'] === 'loss') && typeof r['rounds'] === 'number' &&
    typeof c === 'object' && c !== null && Object.values(c).every((n) => typeof n === 'number') &&
    typeof s === 'object' && s !== null && Object.values(s).every(isStrings)
  );
};

/** The summary store: a play-stats store with the summary check; the game adds its key and the ordering (default latest first). */
export function createSummaryStore(o: Omit<PlayStatsOptions<GameSummary>, 'valid' | 'compare'> & Partial<Pick<PlayStatsOptions<GameSummary>, 'compare'>>): PlayStats<GameSummary> {
  return createPlayStats<GameSummary>({ compare: (a, b) => b.at - a.at, ...o, valid: validSummary });
}

export interface Measure {
  current: number;
  target: number;
  /** For a checklist: the keys done so far. */
  done?: string[];
}

export interface AchievementDef {
  id: string;
  name: string;
  text: string;
  /** The group on a list screen. */
  family: string;
  points: number;
  /** A checklist's stable item keys; `measure` then reports the done ones (see `checklist`). */
  checklist?: string[];
  /** Progress over the counted games (never the practice ones); earned when `current >= target`. */
  measure: (games: readonly GameSummary[]) => Measure;
}

export interface Status {
  id: string;
  earned: boolean;
  current: number;
  target: number;
  done?: string[];
}

/** `target` games for which `pred` holds. */
export const countGames = (pred: (g: GameSummary) => boolean, target: number): AchievementDef['measure'] => (games) => ({
  current: Math.min(target, games.filter(pred).length),
  target,
});

/** Every key of `keys` met across games: `itemsOf` gives the keys one game contributes (say a won game's hero). */
export const checklist = (keys: readonly string[], itemsOf: (g: GameSummary) => readonly string[]): AchievementDef['measure'] => (games) => {
  const seen = new Set(games.flatMap(itemsOf));
  const done = keys.filter((k) => seen.has(k));
  return { current: done.length, target: keys.length, done };
};

/** The best single count over games reaches `target` (say 10 enemies in one game). */
export const bestCount = (value: (g: GameSummary) => number, target: number): AchievementDef['measure'] => (games) => ({
  current: Math.min(target, Math.max(0, ...games.map(value))),
  target,
});

/** Where each definition stands over the summaries; practice games are left out. Pure: same list in, same answer. */
export function evaluate(defs: readonly AchievementDef[], games: readonly GameSummary[]): Status[] {
  const counted = games.filter((g) => !g.practice);
  return defs.map((d) => {
    const m = d.measure(counted);
    const s: Status = { id: d.id, earned: m.target > 0 && m.current >= m.target, current: m.current, target: m.target };
    if (m.done) s.done = m.done;
    return s;
  });
}

/** Earned in `after` and not in `before` (say before and after the newest game): the call-out list. */
export function newlyEarned(defs: readonly AchievementDef[], before: readonly GameSummary[], after: readonly GameSummary[]): string[] {
  const was = new Set(evaluate(defs, before).filter((s) => s.earned).map((s) => s.id));
  return evaluate(defs, after).filter((s) => s.earned && !was.has(s.id)).map((s) => s.id);
}

/** Per family: earned, total and points, in the order the families first appear. */
export function byFamily(defs: readonly AchievementDef[], statuses: readonly Status[]): { family: string; earned: number; total: number; points: number }[] {
  const out = new Map<string, { family: string; earned: number; total: number; points: number }>();
  for (const d of defs) {
    const f = out.get(d.family) ?? { family: d.family, earned: 0, total: 0, points: 0 };
    f.total++;
    if (statuses.find((s) => s.id === d.id)?.earned) {
      f.earned++;
      f.points += d.points;
    }
    out.set(d.family, f);
  }
  return [...out.values()];
}
