// Feats inside a game (K161): detection over the engine's event stream. The game supplies `track` (what an event adds to the
// counters and seen-sets) and the defs; no engine import. FeatState is plain data: keep it inside the game state so Undo rewinds it.
import type { GameSummary } from './achievements.ts';

export interface FeatState {
  counts: Record<string, number>;
  seen: Record<string, string[]>;
}
export const emptyFeatState = (): FeatState => ({ counts: {}, seen: {} });

/** What one event adds: counter deltas and keys met. */
export interface FeatDelta {
  counts?: Record<string, number>;
  seen?: Record<string, string[]>;
}

/** The next state after an event (new object; the old one is untouched, so Undo restores it). */
export function feedFeats<E>(st: FeatState, ev: E, track: (ev: E) => FeatDelta | undefined): FeatState {
  const d = track(ev);
  if (!d) return st;
  const counts = { ...st.counts };
  for (const [k, n] of Object.entries(d.counts ?? {})) counts[k] = (counts[k] ?? 0) + n;
  const seen = { ...st.seen };
  for (const [k, ks] of Object.entries(d.seen ?? {})) seen[k] = [...new Set([...(seen[k] ?? []), ...ks])];
  return { counts, seen };
}

export interface FeatDef<E = unknown> {
  id: string;
  name: string;
  text: string;
  family: string;
  points: number;
  /** True when this event, with the state after it, earns the feat. */
  test: (st: FeatState, ev: E) => boolean;
}

/** Ids of the feats `ev` earns now and that are not in `owned`, in catalogue order. Call after `feedFeats`. */
export const detectFeats = <E>(defs: readonly FeatDef<E>[], st: FeatState, ev: E, owned: readonly string[]): string[] =>
  defs.filter((d) => !owned.includes(d.id) && d.test(st, ev)).map((d) => d.id);

export interface EarnStore {
  /** Everything earned, in order. */
  list(): string[];
  has(id: string): boolean;
  /** Store the ids not yet held; returns those newly stored (once only). Call after the save succeeded. */
  award(ids: readonly string[]): string[];
  /** Cross-game checklist: add keys to `listId`; returns all keys held. */
  tick(listId: string, keys: readonly string[]): string[];
  ticks(listId: string): string[];
}

/** Earns and cross-game checklists kept in `storage` under `key`, outside the game state (Undo never takes them back). */
export function createEarnStore(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string): EarnStore {
  const read = (): { earned: string[]; lists: Record<string, string[]> } => {
    try {
      const j = JSON.parse(storage.getItem(key) ?? '') as { earned?: string[]; lists?: Record<string, string[]> };
      return { earned: Array.isArray(j.earned) ? j.earned : [], lists: j.lists && typeof j.lists === 'object' ? j.lists : {} };
    } catch {
      return { earned: [], lists: {} };
    }
  };
  const write = (v: unknown) => storage.setItem(key, JSON.stringify(v));
  return {
    list: () => read().earned,
    has: (id) => read().earned.includes(id),
    award(ids) {
      const s = read();
      const fresh = [...new Set(ids)].filter((i) => !s.earned.includes(i));
      if (fresh.length) write({ ...s, earned: [...s.earned, ...fresh] });
      return fresh;
    },
    tick(listId, keys) {
      const s = read();
      const all = [...new Set([...(s.lists[listId] ?? []), ...keys])];
      write({ ...s, lists: { ...s.lists, [listId]: all } });
      return all;
    },
    ticks: (listId) => read().lists[listId] ?? [],
  };
}

export type CalloutKind = 'firstLoss' | 'streak' | 'record';
export interface Callout {
  kind: CalloutKind;
  /** The streak length or the new record value. */
  n?: number;
}

/** Brief call-outs for the game just ended (`game`, not yet in `before`): a first defeat, a win streak of `streakAt` or more, a new best `record` value. Practice games give none. The game words them. */
export function calloutsFor(before: readonly GameSummary[], game: GameSummary, o: { streakAt?: number; record?: (g: GameSummary) => number } = {}): Callout[] {
  if (game.practice) return [];
  const prior = before.filter((g) => !g.practice);
  const out: Callout[] = [];
  if (game.result === 'loss' && !prior.some((g) => g.result === 'loss')) out.push({ kind: 'firstLoss' });
  if (game.result === 'win') {
    let n = 1;
    for (const g of [...prior].sort((a, b) => b.at - a.at)) {
      if (g.result !== 'win') break;
      n++;
    }
    let best = 0, run = 0;
    for (const g of [...prior].sort((a, b) => a.at - b.at)) best = Math.max(best, (run = g.result === 'win' ? run + 1 : 0));
    const at = o.streakAt ?? 3;
    if (n >= at && (n === at || n > best)) out.push({ kind: 'streak', n });
  }
  if (o.record) {
    const v = o.record(game);
    if (prior.length && v > Math.max(...prior.map(o.record))) out.push({ kind: 'record', n: v });
  }
  return out;
}
