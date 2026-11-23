import { plainLine, type Narrated } from '../game-log/index.ts';
import type { Steps } from '../paced-view/index.ts';

// log: event kind -> words with {slots}; a kind with no words is silent
export type Words = Readonly<Record<string, string>>;
export interface LogLine { readonly id: number; readonly turn: number; readonly seat?: string; readonly text: string }
export const fill = (words: string, slots: Readonly<Record<string, string | number | boolean | null | undefined>>): string =>
  words.replace(/\{(\w+)\}/g, (_, k: string) => (slots[k] === undefined || slots[k] === null ? '' : String(slots[k]))).replace(/\s+/g, ' ').trim();
export interface LogOptions<E> { turnOf?: (e: E) => number; seatOf?: (e: E) => string | undefined; slots?: (e: E) => Readonly<Record<string, string | number | boolean | null | undefined>> }
export function logLines<E extends { readonly type: string; readonly seat?: string; readonly turn?: number }>(events: readonly E[], words: Words, o: LogOptions<E> = {}): LogLine[] {
  const out: LogLine[] = [];
  events.forEach((e, i) => {
    const w = words[e.type];
    if (w === undefined) return;
    const seat = o.seatOf ? o.seatOf(e) : e.seat;
    const turn = o.turnOf ? o.turnOf(e) : (e.turn ?? 0);
    const text = fill(w, o.slots ? o.slots(e) : (e));
    out.push(seat === undefined ? { id: i, turn, text } : { id: i, turn, seat, text });
  });
  return out;
}
// game-log rows as lines (the row carries no turn or seat: the game says which)
export function rowLines(rows: readonly (Narrated & { readonly id: number })[], turnOf: (r: Narrated) => number, seatOf?: (r: Narrated) => string | undefined): LogLine[] {
  return rows.map((r) => { const seat = seatOf?.(r); const base = { id: r.id, turn: turnOf(r), text: plainLine(r) }; return seat === undefined ? base : { ...base, seat }; });
}
// a seat of null shows all; a line with no seat (the table's own) passes every filter
export const filterSeat = (lines: readonly LogLine[], seat: string | null): LogLine[] => (seat === null ? [...lines] : lines.filter((l) => l.seat === undefined || l.seat === seat));
export function groupByTurn(lines: readonly LogLine[]): { turn: number; lines: LogLine[] }[] {
  const out: { turn: number; lines: LogLine[] }[] = [];
  for (const l of lines) { const g = out[out.length - 1]; if (g && g.turn === l.turn) g.lines.push(l); else out.push({ turn: l.turn, lines: [l] }); }
  return out;
}
// K710: a box of boxPx shows floor(boxPx / linePx) whole lines
export const wholeLinesHeight = (boxPx: number, linePx: number): number => (linePx > 0 ? Math.floor(boxPx / linePx) * linePx : boxPx);

// opponent turn: the steps paced-view plays; `describe` returns what `viewer` may read of a step, null when it is hidden from them
export interface StepLine { readonly index: number; readonly text: string; readonly hidden: boolean }
export interface OpponentTurn { readonly done: StepLine[]; readonly current: StepLine | null; readonly left: number; readonly total: number }
export function opponentTurn<V, E>(s: Steps<V, E>, isStep: (e: E) => boolean, describe: (e: E, viewer: string) => string | null, viewer: string): OpponentTurn {
  const all = s.events.filter(isStep);
  const line = (e: E, index: number): StepLine => { const t = describe(e, viewer); return { index, text: t ?? '', hidden: t === null }; };
  const first = Math.max(0, all.length - s.queue.length);
  const cur = s.queue[0];
  return { done: all.slice(0, first).map(line), current: cur === undefined ? null : line(cur, first), left: Math.max(0, s.queue.length - 1), total: all.length };
}

// game over: ranking from the game's scoring function ({seat: score}); equal scores share a rank
export interface Standing { readonly seat: string; readonly score: number; readonly rank: number }
export interface GameResult { readonly standings: Standing[]; readonly winners: string[]; readonly tied: boolean }
export function gameResult(scores: Readonly<Record<string, number>>, o: { lowWins?: boolean } = {}): GameResult {
  const sign = o.lowWins ? -1 : 1;
  const sorted = Object.entries(scores).sort((a, b) => sign * (b[1] - a[1]));
  const standings = sorted.map(([seat, score]) => ({ seat, score, rank: 1 + sorted.findIndex(([, s]) => s === score) }));
  const winners = standings.filter((x) => x.rank === 1).map((x) => x.seat);
  return { standings, winners, tied: winners.length > 1 };
}

// turn banner
export interface Phase { readonly id: string; readonly name: string }
export interface Banner { readonly turn: number; readonly seat: string; readonly phase: string; readonly index: number; readonly count: number }
export function banner(phases: readonly Phase[], turn: number, seat: string, phaseId: string): Banner {
  const index = phases.findIndex((p) => p.id === phaseId);
  return { turn, seat, phase: phases[index]?.name ?? phaseId, index, count: phases.length };
}
// true when the phase, turn or seat differs from the one before; the first banner is not a change
export const phaseChanged = (prev: Pick<Banner, 'turn' | 'seat' | 'phase'> | null, next: Pick<Banner, 'turn' | 'seat' | 'phase'>): boolean =>
  prev !== null && (prev.phase !== next.phase || prev.turn !== next.turn || prev.seat !== next.seat);
// K716: entries of mixed heights (top/bottom in px from the content start); the height of the whole entries that fit from the start, or from the end (oldest-first scrolled to the newest; endPx is the scroll end, trailing margins and padding included)
export function wholeEntriesHeight(boxPx: number, entries: readonly { top: number; bottom: number }[], fromEnd = false, endPx?: number): number | null {
  if (!entries.length) return null;
  const end = endPx ?? Math.max(...entries.map((e) => e.bottom));
  let h = 0;
  for (const e of entries) { const t = fromEnd ? end - e.top : e.bottom; if (t <= boxPx && t > h) h = t; }
  return h || null;
}
