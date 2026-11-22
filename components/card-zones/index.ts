// K223 (GAPS D1): card zones as data on engine-core state. Shape lifted from Imperium's and Unstoppable's core/zones.ts
// (lists of card ids, index 0 = top, a card carries no zone field and is found by looking, every move takes it out and
// puts it in one step) and their view selectors (INFO-04: count and top only); Rome keeps the same lists per seat.
// Writes go through engine-core's copy-on-write barrier inside an action; the only randomness is ctx.rng.
import { draftOf, EngineBugError, leaveZone, own, type Ctx, type Draft, type GameTypes, type HandlerTable, type KernelTask, type StateCheck, type Tracked } from '../engine-core/index.ts';

/** Who sees a zone's cards: everyone, its owner, no one (not even the count), the top card only, the count only. */
export type Seen = 'all' | 'owner' | 'none' | 'top' | 'count';
export interface Zone {
  readonly cards: readonly string[];
  readonly seen: Seen;
  readonly owner?: string;
  /** Cards revealed while in this zone: id to seats (`'*'` = all). Cleared when the card leaves or the zone is shuffled. */
  readonly shown?: Readonly<Record<string, readonly string[]>>;
  /** K599: the base capacity; absent = no limit. */
  readonly limit?: number;
  /** K599: raises of the limit by source id (`raiseLimit`, `dropRaise`). */
  readonly raises?: Readonly<Record<string, number>>;
}
export interface Zoned {
  readonly zones: Readonly<Record<string, Zone>>;
}
/** What one seat sees of a zone (the seam for the hand and pile parts): `cards` holds an id where the seat sees the card, `null` for a back; absent when it sees none. */
export interface ZoneView {
  /** Absent for a `none` zone: its revealed cards only, never its size. */
  readonly count?: number;
  readonly owner?: string;
  readonly cards?: readonly (string | null)[];
  /** K599: the zone's limit with its raises (`limitOf`), when it has one. */
  readonly limit?: number;
}
export type At = 'top' | 'bottom' | number;
export interface ZoneDef {
  readonly seen: Seen;
  readonly owner?: string;
  readonly cards?: readonly string[];
  readonly limit?: number;
}

export const newZones = (defs: Readonly<Record<string, ZoneDef>>): Record<string, Zone> =>
  Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, { cards: [...(d.cards ?? [])], seen: d.seen, ...(d.owner === undefined ? {} : { owner: d.owner }), ...(d.limit === undefined ? {} : { limit: d.limit }) }]));

/** `name:seat`, the usual key of a per-seat zone. */
export const seatZone = (name: string, seat: string): string => `${name}:${seat}`;

const zoneOf = (s: Zoned, zone: string): Zone => {
  const z = s.zones[zone];
  if (!z) throw new EngineBugError(`card-zones: no zone ${zone}`);
  return z;
};
const ownZone = (s: Zoned, zone: string): Draft<Zone> => {
  zoneOf(s, zone);
  return own(own(s as Draft<Zoned>, 'zones'), zone);
};

export const cardsIn = (s: Zoned, zone: string): readonly string[] => zoneOf(s, zone).cards;

export function locate(s: Zoned, id: string): { zone: string; index: number } | undefined {
  for (const [zone, z] of Object.entries(s.zones)) {
    const index = z.cards.indexOf(id);
    if (index >= 0) return { zone, index };
  }
  return undefined;
}

function insert(s: Zoned, id: string, to: string, at: At): void {
  const cards = own(ownZone(s, to), 'cards');
  const i = at === 'top' ? 0 : at === 'bottom' ? cards.length : Math.max(0, Math.min(cards.length, at));
  cards.splice(i, 0, id);
}

/** Puts a card that is in no zone (a new token) into `to`. */
export function place(s: Zoned, id: string, to: string, at: At = 'top'): void {
  if (locate(s, id)) throw new EngineBugError(`card-zones: ${id} is already in a zone`);
  insert(s, id, to, at);
}

/** Takes `id` out of its zone and puts it into `to` (index 0 is the top) in one step; returns the zone it left. A state with engine-core's `objRefs` gets `leaveZone(s, id, from, snapshot)` (default snapshot: the id), so old references go stale. */
export function moveCard(s: Zoned, id: string, to: string, at: At = 'top', snapshot: unknown = id): string {
  zoneOf(s, to);
  const from = locate(s, id);
  if (!from) throw new EngineBugError(`card-zones: ${id} is in no zone`);
  const z = ownZone(s, from.zone);
  own(z, 'cards').splice(from.index, 1);
  if (z.shown?.[id]) {
    const shown = own(z, 'shown') as Record<string, string[]>;
    delete shown[id];
    if (Object.keys(shown).length === 0) delete z.shown;
  }
  if ('objRefs' in s) leaveZone(s as unknown as Draft<Tracked<unknown>>, id, from.zone, snapshot);
  insert(s, id, to, at);
  return from.zone;
}

/** Moves up to `n` cards from the top of `from` into `to`, each at `at` (default the bottom, so a hand keeps draw order); returns the ids moved (fewer when `from` runs out). */
export function draw(s: Zoned, from: string, to: string, n = 1, at: At = 'bottom'): string[] {
  const ids = zoneOf(s, from).cards.slice(0, n);
  for (const id of ids) moveCard(s, id, to, at);
  return ids;
}

/** Shuffles a zone with `ctx.rng` (the only randomness) and forgets what was revealed in it. */
export function shuffleZone<G extends GameTypes>(ctx: Ctx<G>, zone: string): void {
  const z = ownZone(draftOf(ctx) as unknown as Zoned, zone);
  z.cards = ctx.rng.shuffle(z.cards);
  delete z.shown;
}

/** Shows cards of `zone` to `seats` (or all) while they stay there. */
export function reveal(s: Zoned, zone: string, ids: readonly string[], seats: readonly string[] | 'all'): void {
  const z = ownZone(s, zone);
  for (const id of ids) {
    if (!z.cards.includes(id)) throw new EngineBugError(`card-zones: ${id} is not in ${zone}`);
    if (z.shown === undefined) z.shown = {};
    const shown = own(z, 'shown') as Record<string, string[]>;
    shown[id] = seats === 'all' ? ['*'] : [...new Set([...(shown[id] ?? []), ...seats])];
  }
}

const sees = (z: Zone, seat: string, i: number): boolean => {
  if (z.seen === 'all' || (z.seen === 'owner' && z.owner === seat) || (z.seen === 'top' && i === 0)) return true;
  const to = z.shown?.[z.cards[i] ?? ''];
  return to !== undefined && (to.includes('*') || to.includes(seat));
};

/** Can `seat` see the card `id` where it is now? */
export function canSee(s: Zoned, seat: string, id: string): boolean {
  const at = locate(s, id);
  return at !== undefined && sees(zoneOf(s, at.zone), seat, at.index);
}

/** The zones as `seat` sees them: hidden cards are `null`, a zone seen by no one is absent. No ids, order or rng of what the seat cannot see. */
export function viewOf(s: Zoned, seat: string): Record<string, ZoneView> {
  const out: Record<string, ZoneView> = {};
  for (const [name, z] of Object.entries(s.zones)) {
    const cards = z.cards.map((id, i) => (sees(z, seat, i) ? id : null));
    const any = cards.some((c) => c !== null);
    if (z.seen === 'none') {
      if (any) out[name] = { cards: cards.filter((c) => c !== null) };
      continue;
    }
    out[name] = { count: z.cards.length, ...(z.owner === undefined ? {} : { owner: z.owner }), ...(any ? { cards } : {}), ...(z.limit === undefined ? {} : { limit: limitOf(s, name) ?? 0 }) };
  }
  return out;
}

/** Ids `seat` cannot see: the secrets for opponent's `viewLeaks`. */
export const hiddenFrom = (s: Zoned, seat: string): string[] =>
  Object.values(s.zones).flatMap((z) => z.cards.filter((_, i) => !sees(z, seat, i)));

/** Cards in more than one place (for `GameRules.invariants`); `expected` also checks the total. */
export function zoneProblems(s: Zoned, expected?: number): string[] {
  const seen = new Map<string, string>();
  const out: string[] = [];
  for (const [zone, z] of Object.entries(s.zones))
    for (const id of z.cards) {
      const was = seen.get(id);
      if (was !== undefined) out.push(`${id} in ${was} and ${zone}`);
      seen.set(id, zone);
    }
  if (expected !== undefined && seen.size !== expected) out.push(`${String(seen.size)} cards, expected ${String(expected)}`);
  return out;
}

// K599: a zone with a capacity (ported from a duty-officer limit: the limit is a base plus raises, a raise can be given up, over the limit the
// chooser picks exactly the excess, which leaves for a discard zone; the next check asks again).

/** The zone's limit: its base plus every raise (a negative raise lowers it), never below 0; undefined when the zone has none. */
export function limitOf(s: Zoned, zone: string): number | undefined {
  const z = zoneOf(s, zone);
  return z.limit === undefined ? undefined : Math.max(0, z.limit + Object.values(z.raises ?? {}).reduce((a, b) => a + b, 0));
}

/** Raises the limit by `by` from `source` (again from the same source replaces it). */
export function raiseLimit(s: Zoned, zone: string, source: string, by = 1): void {
  const z = ownZone(s, zone);
  if (z.limit === undefined) throw new EngineBugError(`card-zones: ${zone} has no limit to raise`);
  if (z.raises === undefined) z.raises = {};
  (own(z, 'raises') as Record<string, number>)[source] = by;
}

/** Gives up the raise from `source`; false when there was none. */
export function dropRaise(s: Zoned, zone: string, source: string): boolean {
  if (zoneOf(s, zone).raises?.[source] === undefined) return false;
  const z = ownZone(s, zone);
  const r = own(z, 'raises') as Record<string, number>;
  delete r[source];
  if (Object.keys(r).length === 0) delete z.raises;
  return true;
}

/** How many cards the zone holds beyond its limit (0 with no limit). */
export const overBy = (s: Zoned, zone: string): number => {
  const l = limitOf(s, zone);
  return l === undefined ? 0 : Math.max(0, cardsIn(s, zone).length - l);
};

export interface OverLimit<G extends GameTypes = GameTypes> {
  /** The zone the excess goes to. */
  readonly to: string | ((zone: string) => string);
  /** Who picks (default the zone's owner). */
  readonly chooser?: string | ((zone: string) => string);
  /** The prompt's kind (default `zones.overLimit`). */
  readonly kind?: string;
  /** K674: called once after the cards have moved, with the ids in moved order; for the game's own events and effect ends. */
  readonly onLeave?: (ctx: Ctx<G>, zone: string, ids: readonly string[], to: string) => void;
}
interface LeaveTask extends KernelTask {
  readonly zone: string;
  readonly to: string;
}
export const OVER_LIMIT = 'zones.overLimit';

const leave = (s: Zoned, zone: string, ids: readonly string[], to: string): void => {
  const cards = cardsIn(s, zone);
  for (const id of [...ids].sort((a, b) => cards.indexOf(a) - cards.indexOf(b))) moveCard(s, id, to);
};

/** For a state check: the first zone over its limit asks its chooser for exactly the excess (by card id), or moves every card when all must go. True when it asked or moved. Needs `capacityHandlers()` in the game's handlers. */
export function overLimit<G extends GameTypes>(ctx: Ctx<G>, zones: readonly string[], o: OverLimit<G>): boolean {
  const s = ctx.s as unknown as Zoned;
  for (const zone of zones) {
    const n = overBy(s, zone);
    if (n === 0) continue;
    const to = typeof o.to === 'string' ? o.to : o.to(zone);
    if (to === zone) throw new EngineBugError(`card-zones: ${zone} over its limit cannot leave to itself`);
    zoneOf(s, to);
    const cards = cardsIn(s, zone);
    const twice = cards.find((c, i) => cards.indexOf(c) !== i);
    if (twice !== undefined) throw new EngineBugError(`card-zones: ${zone} holds ${twice} twice`);
    if (n >= cards.length) {
      leave(draftOf(ctx) as unknown as Zoned, zone, cards, to);
      o.onLeave?.(ctx, zone, cards, to);
      return true;
    }
    const seat = o.chooser === undefined ? zoneOf(s, zone).owner : typeof o.chooser === 'string' ? o.chooser : o.chooser(zone);
    if (seat === undefined) throw new EngineBugError(`card-zones: ${zone} is over its limit and has no owner or chooser`);
    const hidden = cards.filter((c) => !canSee(s, seat, c));
    if (hidden.length > 0) throw new EngineBugError(`card-zones: ${seat} chooses what leaves ${zone} but cannot see ${hidden.join(', ')}; reveal them first`);
    const prompt = { kind: o.kind ?? OVER_LIMIT, seat, zone, to, min: n, max: n, options: cards.map((id) => ({ id, enabled: true })) };
    const task: LeaveTask = { kind: OVER_LIMIT, zone, to };
    ctx.ask(prompt as unknown as Omit<G['prompt'], 'id'>, task);
    return true;
  }
  return false;
}

/** `overLimit` as an engine-core state check, for `checkpoint.checks`. */
export const capacityCheck = <G extends GameTypes>(zones: readonly string[], o: OverLimit<G>, name = OVER_LIMIT): StateCheck<G> => ({ name, run: (ctx) => overLimit(ctx, zones, o) });

/** The resume handler of the over-limit prompt: moves the picked cards to the discard zone. */
export const capacityHandlers = <G extends GameTypes>(o: Pick<OverLimit<G>, 'onLeave'> = {}): HandlerTable<G> => ({
  [OVER_LIMIT]: (ctx, t) => {
    const task = t as LeaveTask;
    const ids = task.answer ?? [];
    leave(draftOf(ctx) as unknown as Zoned, task.zone, ids, task.to);
    o.onLeave?.(ctx, task.zone, ids, task.to);
  },
});
