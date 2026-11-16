// The playing time of the game in progress: the time between two moves counts up to `idleMs` (a longer gap is a pause).
// Kept under one storage key so it survives a reload; when storage refuses it holds for this page.
import { localStats, type StatsStorage } from './stats';

export interface PlaySession {
  readonly id: string;
  readonly playMs: number;
}

export interface PlayClockOptions {
  key: string;
  /** Default 5 minutes. */
  idleMs?: number;
  storage?: StatsStorage;
  now?: () => number;
}

export function createPlayClock(o: PlayClockOptions) {
  const st = o.storage ?? localStats;
  const now = o.now ?? (() => Date.now());
  const idle = o.idleMs ?? 300_000;
  let mem: PlaySession | null | undefined;
  let last: number | null = null;
  const read = (): PlaySession | null => {
    if (mem !== undefined) return mem;
    mem = null;
    try {
      const s = JSON.parse(st.getItem(o.key) ?? 'null') as Partial<PlaySession> | null;
      if (s !== null && typeof s === 'object' && typeof s.id === 'string' && typeof s.playMs === 'number' && Number.isFinite(s.playMs) && s.playMs >= 0)
        mem = { id: s.id, playMs: s.playMs };
    } catch {
      /* no session */
    }
    return mem;
  };
  const write = (s: PlaySession | null): void => {
    mem = s;
    try {
      if (s === null) st.removeItem(o.key);
      else st.setItem(o.key, JSON.stringify(s));
    } catch {
      /* held in memory */
    }
  };
  const start = (id: string): void => {
    write({ id, playMs: 0 });
    last = now();
  };
  const tick = (): void => {
    const s = read();
    const t = now();
    if (last === null || !Number.isFinite(t)) return;
    if (s !== null) write({ id: s.id, playMs: s.playMs + Math.max(0, Math.min(t - last, idle)) });
    last = t;
  };
  return {
    /** A new game: its clock starts at zero. */
    start,
    /** Continue (a reload, a loaded save, the page shown again): the same game's clock goes on, else a new one starts. */
    resume(id: string): void {
      if (read()?.id === id) last = now();
      else start(id);
    },
    /** A move. Nothing while paused or before `start` / `resume`. */
    tick,
    /** The page hidden: the time so far counts, the time until `resume` does not. */
    pause(): void {
      tick();
      last = null;
    },
    /** No game to time (a tutorial, a demo). */
    stop(): void {
      write(null);
      last = null;
    },
    session: read,
  };
}

export type PlayClock = ReturnType<typeof createPlayClock>;
