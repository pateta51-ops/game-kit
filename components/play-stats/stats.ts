// Finished-game records under one storage key, as `{ version: 1, records }`. The game supplies its fields, their check
// and the score comparison. Every storage call is guarded: a refusal is reported once and the game goes on.
export interface StatsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const localStats: StatsStorage = {
  getItem: (k) => window.localStorage.getItem(k),
  setItem: (k, v) => {
    window.localStorage.setItem(k, v);
  },
  removeItem: (k) => {
    window.localStorage.removeItem(k);
  },
};

export interface PlayRecord {
  /** The game's identity: the same game finished again replaces its record. */
  readonly id: string;
  /** When it ended (ms since the epoch). */
  readonly at: number;
}

export interface PlayStatsOptions<R extends PlayRecord> {
  key: string;
  /** The game's own fields are there, with their types (`id` and `at` are checked already). */
  valid: (r: Record<string, unknown>) => boolean;
  /** Sort order: negative when `a` ranks before (is better than) `b`. */
  compare: (a: R, b: R) => number;
  /** The same ending (say, final hash and seed): never added twice; the first record keeps its id and date. */
  same?: (a: R, b: R) => boolean;
  /** The most records kept (default 5000); past it the oldest go, or the worst with `dropWorst`. Never the new one. */
  max?: number;
  dropWorst?: boolean;
  storage?: StatsStorage;
  /** Called once per store, on the first refusal or unreadable text; default one console warning. */
  onError?: (what: 'read' | 'write' | 'unreadable', error: unknown) => void;
}

export interface PlayStats<R extends PlayRecord> {
  /** Latest first; a refusal, junk or an entry that is not a whole record reads as none. */
  read(): R[];
  /** The record as stored (its id may be an earlier record's, see `same`), or null when the write was refused. */
  record(rec: R): R | null;
  /** An Undo past the end: the game's record goes. False when the write was refused. */
  remove(id: string): boolean;
  clear(): boolean;
}

export function createPlayStats<R extends PlayRecord>(o: PlayStatsOptions<R>): PlayStats<R> {
  const st = o.storage ?? localStats;
  const max = o.max ?? 5000;
  const warned = new Set<boolean>();
  const fail = (what: 'read' | 'write' | 'unreadable', e: unknown): void => {
    if (warned.has(what === 'unreadable')) return;
    warned.add(what === 'unreadable');
    if (o.onError) o.onError(what, e);
    else console.warn(`play-stats: ${what} failed for ${o.key}`, e);
  };
  const isRec = (x: unknown): x is R => {
    if (typeof x !== 'object' || x === null) return false;
    const r = x as Record<string, unknown>;
    return typeof r['id'] === 'string' && typeof r['at'] === 'number' && Number.isFinite(r['at']) && o.valid(r);
  };
  const load = (): { records: R[]; unreadable: string | null } => {
    let text: string | null;
    try {
      text = st.getItem(o.key);
    } catch (e) {
      fail('read', e);
      return { records: [], unreadable: null };
    }
    if (text === null || text === '') return { records: [], unreadable: null };
    let entries: unknown;
    try {
      entries = (JSON.parse(text) as { records?: unknown } | null)?.records;
    } catch {
      return { records: [], unreadable: text };
    }
    if (!Array.isArray(entries)) return { records: [], unreadable: text };
    const records = (entries as unknown[]).filter(isRec);
    return { records, unreadable: records.length === entries.length ? null : text };
  };
  const write = (records: readonly R[], unreadable: string | null): boolean => {
    try {
      if (unreadable !== null) {
        if (st.getItem(`${o.key}.unreadable`) === null) st.setItem(`${o.key}.unreadable`, unreadable);
        fail('unreadable', unreadable);
      }
      st.setItem(o.key, JSON.stringify({ version: 1, records }));
      return true;
    } catch (e) {
      fail('write', e);
      return false;
    }
  };
  return {
    read: () => load().records.sort((a, b) => b.at - a.at),
    record(rec) {
      const s = load();
      const same = o.same;
      const twin = same ? s.records.find((r) => same(r, rec)) : undefined;
      const merged: R = twin ? { ...rec, id: twin.id, at: twin.at } : rec;
      const others = s.records
        .filter((r) => r.id !== rec.id && r.id !== merged.id && !same?.(r, rec))
        .sort(o.dropWorst ? o.compare : (a, b) => b.at - a.at)
        .slice(0, Math.max(0, max - 1));
      return write([merged, ...others], s.unreadable) ? merged : null;
    },
    remove(id) {
      const s = load();
      return s.records.some((r) => r.id === id) ? write(s.records.filter((r) => r.id !== id), s.unreadable) : true;
    },
    clear() {
      try {
        st.removeItem(o.key);
        return true;
      } catch (e) {
        fail('write', e);
        return false;
      }
    },
  };
}

/** Best first. */
export const ranked = <R>(list: readonly R[], compare: (a: R, b: R) => number): R[] => [...list].sort(compare);

/** One record per group (its best), best first. */
export function bestBy<R>(list: readonly R[], group: (r: R) => string, compare: (a: R, b: R) => number): R[] {
  const best = new Map<string, R>();
  for (const r of ranked(list, compare)) if (!best.has(group(r))) best.set(group(r), r);
  return [...best.values()];
}

/** The best earlier record of the same group that `rec` beats; null when it does not, or there is no earlier game. */
export function personalBest<R extends PlayRecord>(
  rec: R,
  list: readonly R[],
  compare: (a: R, b: R) => number,
  sameGroup: (a: R, b: R) => boolean = () => true,
): R | null {
  const previous = ranked(
    list.filter((r) => r.id !== rec.id && r.at <= rec.at && sameGroup(r, rec)),
    compare,
  )[0];
  return previous !== undefined && compare(rec, previous) < 0 ? previous : null;
}

/** Games, and how many of each kind (say win, loss); with `value`, its sum and average (null when no games). */
export function totals<R>(
  list: readonly R[],
  kind: (r: R) => string,
  value?: (r: R) => number,
): { games: number; by: Record<string, number>; sum: number; average: number | null } {
  const by = Object.create(null) as Record<string, number>;
  let sum = 0;
  for (const r of list) {
    by[kind(r)] = (by[kind(r)] ?? 0) + 1;
    if (value) sum += value(r);
  }
  return { games: list.length, by, sum, average: value && list.length > 0 ? sum / list.length : null };
}
