// K243: a market row of offer slots refilled from decks. Engine base: Rome market.ts (slots with null = empty, price
// table plus a game hook, cycle cost per slot, buy/cycle options disabled with a reason, a take leaves the slot empty,
// a cycled card to the bottom of its pile, slide right then fill from the left, a per-slot source choice, clear to the
// bottoms in slot order); Imperium refill.ts (per-slot source deck with a fallback, both empty leaves the slot empty,
// refill at once after a take). Each slot is a card-zones zone, so every move goes through the copy-on-write barrier.
// No payment, discount, unlock or destination rule here: the game passes them.
import { EngineBugError, type KernelOption } from '../engine-core/index.ts';
import { cardsIn, moveCard, type At, type ZoneDef, type ZoneView, type Zoned } from '../card-zones/index.ts';

export interface MarketRowDef {
  readonly slots: number;
  /** The decks the slots draw from; the first is where a card goes back by default. */
  readonly decks: readonly string[];
  /** Price of each slot (left to right). */
  readonly prices?: readonly number[];
  /** Cycle cost of each slot; no cycle option without it. */
  readonly cycle?: readonly number[];
  /** K251: the top card of the first deck is a face-up offer (offer id `'top'`); make that deck `seen: 'top'`. */
  readonly topOffer?: boolean;
}
export interface MarketCfg<S extends Zoned = Zoned> {
  readonly rows: Readonly<Record<string, MarketRowDef>>;
  /** `now`: a taken or cycled slot is filled at once from its source (Imperium); `later`: it stays empty until `refill` (Rome). */
  readonly when: 'now' | 'later';
  /** Decks tried in order for slot `i` (a fallback after an empty one); default the row's decks. */
  readonly source?: (s: S, row: string, i: number) => readonly string[];
  /** True: the player picks the deck for this slot (the fill returns a `Pending`). */
  readonly ask?: (s: S, row: string, i: number) => boolean;
  /** The game's price modifiers on the table price. */
  readonly price?: (s: S, row: string, i: number, card: string, base: number) => number;
  /** The pile a card goes back to (cycle, clear); default the row's first deck. */
  readonly home?: (s: S, row: string, card: string) => string;
}
export interface Slot {
  readonly row: string;
  readonly slot: number;
}
export type MarketEvent =
  | { readonly kind: 'filled'; readonly row: string; readonly slot: number; readonly card: string; readonly from: string }
  | { readonly kind: 'slid'; readonly row: string; readonly from: number; readonly to: number; readonly card: string }
  | { readonly kind: 'taken'; readonly row: string; readonly slot: number; readonly card: string; readonly to: string; readonly offer?: Offer }
  | { readonly kind: 'returned'; readonly row: string; readonly slot: number; readonly card: string; readonly to: string; readonly offer?: Offer };
/** K251: an offer of a row: a slot index, or `'top'` (the deck's top card; its events say `slot: -1`, `offer: 'top'`). */
export type Offer = number | 'top';
/** A slot whose deck the player picks: `decks` in source order, `empty` ones to disable. */
export interface Pending extends Slot {
  readonly decks: readonly { readonly zone: string; readonly empty: boolean }[];
}
export interface Result {
  readonly events: MarketEvent[];
  readonly pending?: Pending;
}
export interface MarketOption extends KernelOption, Slot {
  readonly verb: 'buy' | 'cycle';
  readonly card: string;
  readonly cost: number;
}

export const slotZone = (row: string, i: number): string => `${row}:${String(i)}`;

/** Zone defs of the slots (face up), to spread into `newZones` beside the game's decks. */
export const marketZones = (rows: Readonly<Record<string, MarketRowDef>>): Record<string, ZoneDef> =>
  Object.fromEntries(Object.entries(rows).flatMap(([row, d]) => Array.from({ length: d.slots }, (_, i) => [slotZone(row, i), { seen: 'all' as const }])));

const rowOf = (cfg: MarketCfg<never>, row: string): MarketRowDef => {
  const d = cfg.rows[row];
  if (!d) throw new EngineBugError(`market-row: no row ${row}`);
  return d;
};

/** The row's cards left to right, `null` for an empty slot. */
export const slotsOf = <S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string): (string | null)[] =>
  Array.from({ length: rowOf(cfg, row).slots }, (_, i) => cardsIn(s, slotZone(row, i))[0] ?? null);

export const priceOf = <S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string, i: number, card: string): number => {
  const base = rowOf(cfg, row).prices?.[i] ?? 0;
  return cfg.price ? cfg.price(s, row, i, card, base) : base;
};

/** Buy and cycle options of every filled slot (`buy:row:i`, `cycle:row:i`); `afford` gives the reason one cannot be paid. */
export function marketOptions<S extends Zoned>(s: S, cfg: MarketCfg<S>, afford: (verb: 'buy' | 'cycle', cost: number, at: Slot & { card: string }) => string | undefined): MarketOption[] {
  const out: MarketOption[] = [];
  for (const [row, d] of Object.entries(cfg.rows))
    slotsOf(s, cfg, row).forEach((card, slot) => {
      if (card === null) return;
      const add = (verb: 'buy' | 'cycle', cost: number) => {
        const why = afford(verb, cost, { row, slot, card });
        out.push({ id: `${verb}:${row}:${String(slot)}`, enabled: why === undefined, ...(why === undefined ? {} : { why }), verb, row, slot, card, cost });
      };
      add('buy', priceOf(s, cfg, row, slot, card));
      const c = d.cycle?.[slot];
      if (c !== undefined) add('cycle', c);
    });
  return out;
}

/** `buy:row:i` back to its parts. */
export function parseOption(id: string): (Slot & { verb: 'buy' | 'cycle' }) | undefined {
  const m = /^(buy|cycle):(.+):(\d+)$/.exec(id);
  return m ? { verb: m[1] as 'buy' | 'cycle', row: m[2]!, slot: Number(m[3]) } : undefined;
}

const cardAt = (s: Zoned, row: string, i: number): string => {
  const card = cardsIn(s, slotZone(row, i))[0];
  if (card === undefined) throw new EngineBugError(`market-row: ${row} slot ${String(i)} is empty`);
  return card;
};

/** Fills the empty slot from `deck`'s top (the answer to a `Pending`); an unknown deck is an EngineBugError; nothing when the deck is empty or the slot full. */
export function fillSlot<S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string, i: number, deck: string): MarketEvent[] {
  if (!sourcesOf(s, cfg, row, i).includes(deck)) throw new EngineBugError(`market-row: ${deck} is not a source of ${row} slot ${String(i)}`);
  const card = cardsIn(s, deck)[0];
  if (card === undefined || cardsIn(s, slotZone(row, i)).length > 0) return [];
  moveCard(s, card, slotZone(row, i));
  return [{ kind: 'filled', row, slot: i, card, from: deck }];
}

const sourcesOf = <S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string, i: number): readonly string[] => cfg.source?.(s, row, i) ?? rowOf(cfg, row).decks;

function fillOne<S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string, i: number): MarketEvent[] | Pending {
  const decks = sourcesOf(s, cfg, row, i);
  const full = decks.filter((d) => cardsIn(s, d).length > 0);
  if (full.length === 0) return [];
  if (cfg.ask?.(s, row, i)) return { row, slot: i, decks: decks.map((zone) => ({ zone, empty: !full.includes(zone) })) };
  return fillSlot(s, cfg, row, i, full[0]!);
}

function after<S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string, i: number, e: MarketEvent): Result {
  if (cfg.when !== 'now') return { events: [e] };
  const r = fillOne(s, cfg, row, i);
  return Array.isArray(r) ? { events: [e, ...r] } : { events: [e], pending: r };
}

const homeOf = <S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string, card: string): string => cfg.home?.(s, row, card) ?? rowOf(cfg, row).decks[0]!;

/** Takes the slot's card to `to` (`at` there); with `when: 'now'` the slot is filled at once. */
export function takeSlot<S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string, i: number, to: string, at: At = 'top'): Result {
  const card = cardAt(s, row, i);
  moveCard(s, card, to, at);
  return after(s, cfg, row, i, { kind: 'taken', row, slot: i, card, to });
}

/** The slot's card to the bottom of its home pile; with `when: 'now'` the slot is filled at once. */
export function cycleSlot<S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string, i: number): Result {
  const card = cardAt(s, row, i);
  const to = homeOf(s, cfg, row, card);
  moveCard(s, card, to, 'bottom');
  return after(s, cfg, row, i, { kind: 'returned', row, slot: i, card, to });
}

/** Slides the row's cards right into the empty slots, order kept (the empty slots end on the left). */
export function slideRight<S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string): MarketEvent[] {
  const slots = slotsOf(s, cfg, row);
  const out: MarketEvent[] = [];
  let to = slots.length - 1;
  for (let from = slots.length - 1; from >= 0; from -= 1) {
    const card = slots[from];
    if (card == null) continue;
    if (from !== to) {
      moveCard(s, card, slotZone(row, to));
      out.push({ kind: 'slid', row, from, to, card });
    }
    to -= 1;
  }
  return out;
}

/** Fills the empty slots from the left (rows in order, default all); stops at the first slot whose deck the player picks. */
export function fillEmpty<S extends Zoned>(s: S, cfg: MarketCfg<S>, rows: readonly string[] = Object.keys(cfg.rows)): Result {
  const events: MarketEvent[] = [];
  for (const row of rows)
    for (let i = 0; i < rowOf(cfg, row).slots; i += 1) {
      if (cardsIn(s, slotZone(row, i)).length > 0) continue;
      const r = fillOne(s, cfg, row, i);
      if (!Array.isArray(r)) return { events, pending: r };
      events.push(...r);
    }
  return { events };
}

/** The refill: slide each row right (`slide`, default true), then fill the empty slots from the left. After a `Pending`: `fillSlot` with the answer, then `fillEmpty` (no second slide). */
export function refill<S extends Zoned>(s: S, cfg: MarketCfg<S>, slide = true): Result {
  const slid = slide ? Object.keys(cfg.rows).flatMap((row) => slideRight(s, cfg, row)) : [];
  const r = fillEmpty(s, cfg);
  return { ...r, events: [...slid, ...r.events] };
}

/** Every market card to the bottom of its home pile, rows in order, slots left to right. */
export function clearMarket<S extends Zoned>(s: S, cfg: MarketCfg<S>): MarketEvent[] {
  const out: MarketEvent[] = [];
  for (const row of Object.keys(cfg.rows))
    slotsOf(s, cfg, row).forEach((card, slot) => {
      if (card === null) return;
      const to = homeOf(s, cfg, row, card);
      moveCard(s, card, to, 'bottom');
      out.push({ kind: 'returned', row, slot, card, to });
    });
  return out;
}

export interface RowView {
  readonly slots: readonly (string | null)[];
  /** K251: the top offer of a `topOffer` row (`null` when its deck is empty); absent on other rows. Never the cards below it. */
  readonly top?: string | null;
  /** Size of each deck of the row (counts only). */
  readonly decks: Readonly<Record<string, number>>;
}
/** The market as a seat sees it, from card-zones `viewOf`: the face-up slots and the deck counts. */
export const marketView = (view: Readonly<Record<string, ZoneView>>, rows: Readonly<Record<string, MarketRowDef>>): Record<string, RowView> =>
  Object.fromEntries(Object.entries(rows).map(([row, d]) => [row, {
    slots: Array.from({ length: d.slots }, (_, i) => view[slotZone(row, i)]?.cards?.[0] ?? null),
    ...(d.topOffer ? { top: view[d.decks[0]!]?.cards?.[0] ?? null } : {}),
    decks: Object.fromEntries(d.decks.map((k) => [k, view[k]?.count ?? 0])),
  }]));

const topCard = <S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string): string | undefined => (rowOf(cfg, row).topOffer ? cardsIn(s, rowOf(cfg, row).decks[0]!)[0] : undefined);

/** K251: the offers of a row now, from the state or from a seat's `RowView`: the filled slots, then `'top'` when the row has a `topOffer` and its deck shows a card. */
export function offersOf<S extends Zoned>(src: S | RowView, cfg: MarketCfg<S>, row: string): Offer[] {
  const v = 'slots' in src;
  const slots = v ? src.slots : slotsOf(src, cfg, row);
  const top = v ? src.top : topCard(src, cfg, row);
  const out: Offer[] = [];
  slots.forEach((c, i) => { if (c !== null) out.push(i); });
  if (top != null) out.push('top');
  return out;
}

/** K251: takes the offer (a slot index or `'top'`) to `to`. A slot behaves as `takeSlot`; the top leaves the next card as the new top, nothing is filled. The refill is the game's (`fillEmpty`). */
export function takeOffer<S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string, offer: Offer, to: string, at: At = 'top'): Result {
  if (offer !== 'top') return takeSlot(s, cfg, row, offer, to, at);
  const card = topCard(s, cfg, row);
  if (card === undefined) throw new EngineBugError(`market-row: ${row} has no top offer`);
  moveCard(s, card, to, at);
  return { events: [{ kind: 'taken', row, slot: -1, card, to, offer: 'top' }] };
}

/** K251: the offer to the bottom of its home pile (the row's deck by default). A card cycled to the bottom of an empty deck is the new top offer. */
export function cycleOffer<S extends Zoned>(s: S, cfg: MarketCfg<S>, row: string, offer: Offer): Result {
  if (offer !== 'top') return cycleSlot(s, cfg, row, offer);
  const card = topCard(s, cfg, row);
  if (card === undefined) throw new EngineBugError(`market-row: ${row} has no top offer`);
  const to = homeOf(s, cfg, row, card);
  moveCard(s, card, to, 'bottom');
  return { events: [{ kind: 'returned', row, slot: -1, card, to, offer: 'top' }] };
}
