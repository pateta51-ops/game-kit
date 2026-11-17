// Port of unstoppable-fan-prototype src/ui/board/flightLedger.ts (D-159), generalised: place keys are strings, the store is
// made per table (`createFlightLedger`), not a module global. While a token flies its place of arrival draws one token of its
// value fewer (it has not landed yet) and its place of departure one more until it takes off, so a token is in one place at a
// time. Numbers written beside tokens are always the final ones. Pure arithmetic; no React.
import type { Move } from './flights.ts';

type Counts = Readonly<Record<string, Readonly<Record<number, number>>>>;

export interface Ledger {
  /** Tokens flying to a place (or waiting to set off for it): not drawn there yet. */
  incoming: Counts;
  /** Tokens that have not yet left a place (a stagger or a hold keeps them): still drawn there. */
  outgoing: Counts;
}

export const EMPTY_LEDGER: Ledger = { incoming: {}, outgoing: {} };

function bump(counts: Counts, key: string, value: number, by: number): Counts {
  const at = { ...(counts[key] ?? {}) };
  const n = Math.max(0, (at[value] ?? 0) + by);
  if (n === 0) delete at[value];
  else at[value] = n;
  const next = { ...counts };
  if (Object.keys(at).length === 0) delete next[key];
  else next[key] = at;
  return next;
}

/** A flight is booked: its token is not drawn where it goes, and is still drawn where it comes from. */
export const book = (l: Ledger, m: Move): Ledger => ({
  incoming: bump(l.incoming, m.to, m.value, 1),
  outgoing: bump(l.outgoing, m.from, m.value, 1),
});

/** The token takes off: its place of departure no longer draws it. */
export const takeOff = (l: Ledger, m: Move): Ledger => ({ ...l, outgoing: bump(l.outgoing, m.from, m.value, -1) });

/** The token lands: its place of arrival draws it. */
export const land = (l: Ledger, m: Move): Ledger => ({ ...l, incoming: bump(l.incoming, m.to, m.value, -1) });

const countAt = (counts: Counts, key: string, value: number): number => counts[key]?.[value] ?? 0;

/** The tokens a place draws now (largest first): the last tokens of a value are the ones that arrived. */
export function shownTokens(tokens: readonly number[], key: string, ledger: Ledger): number[] {
  const hide = new Map<number, number>();
  for (const [value, n] of Object.entries(ledger.incoming[key] ?? {})) hide.set(Number(value), n);
  const kept: number[] = [];
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const value = tokens[i] as number;
    const h = hide.get(value) ?? 0;
    if (h > 0) hide.set(value, h - 1);
    else kept.unshift(value);
  }
  const extra: number[] = [];
  for (const [value, n] of Object.entries(ledger.outgoing[key] ?? {}))
    for (let i = 0; i < n; i += 1) extra.push(Number(value));
  return [...kept, ...extra].sort((a, b) => b - a);
}

/** The same for a heap of counts by value (a supply): never below 0. */
export function shownCounts(counts: Readonly<Record<number, number>>, key: string, ledger: Ledger): Record<number, number> {
  const out: Record<number, number> = {};
  const values = new Set([...Object.keys(counts).map(Number), ...Object.keys(ledger.outgoing[key] ?? {}).map(Number)]);
  for (const value of values)
    out[value] = Math.max(0, (counts[value] ?? 0) - countAt(ledger.incoming, key, value) + countAt(ledger.outgoing, key, value));
  return out;
}

/** The same for a count of pieces of value 1 (discs), between 0 and `max`. */
export const shownCount = (n: number, key: string, ledger: Ledger, max = Infinity): number =>
  Math.min(max, Math.max(0, n - countAt(ledger.incoming, key, 1) + countAt(ledger.outgoing, key, 1)));

/** Whether nothing is in the air. */
export const isEmpty = (l: Ledger): boolean => Object.keys(l.incoming).length === 0 && Object.keys(l.outgoing).length === 0;

/** The ledger of one table: a small store outside React (flights start in a layout effect and must change what is drawn before paint). */
export interface FlightLedger {
  get: () => Ledger;
  book: (m: Move) => void;
  takeOff: (m: Move) => void;
  land: (m: Move) => void;
  /** Forget every flight: the final state is drawn at once (undo, speed 0, reduced motion, the table gone). */
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
}

export function createFlightLedger(): FlightLedger {
  let current = EMPTY_LEDGER;
  const listeners = new Set<() => void>();
  const set = (next: Ledger): void => {
    if (next === current) return;
    current = next;
    for (const l of listeners) l();
  };
  return {
    get: () => current,
    book: (m) => { set(book(current, m)); },
    takeOff: (m) => { set(takeOff(current, m)); },
    land: (m) => { set(land(current, m)); },
    clear: () => { if (!isEmpty(current)) set(EMPTY_LEDGER); },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
