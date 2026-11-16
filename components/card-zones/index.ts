// K223 (GAPS D1): card zones as data on engine-core state. Shape lifted from Imperium's and Unstoppable's core/zones.ts
// (lists of card ids, index 0 = top, a card carries no zone field and is found by looking, every move takes it out and
// puts it in one step) and their view selectors (INFO-04: count and top only); Rome keeps the same lists per seat.
// Writes go through engine-core's copy-on-write barrier inside an action; the only randomness is ctx.rng.
import { draftOf, EngineBugError, leaveZone, own, type Ctx, type Draft, type GameTypes, type Tracked } from '../engine-core/index';

/** Who sees a zone's cards: everyone, its owner, no one (not even the count), the top card only, the count only. */
export type Seen = 'all' | 'owner' | 'none' | 'top' | 'count';
export interface Zone {
  readonly cards: readonly string[];
  readonly seen: Seen;
  readonly owner?: string;
  /** Cards revealed while in this zone: id to seats (`'*'` = all). Cleared when the card leaves or the zone is shuffled. */
  readonly shown?: Readonly<Record<string, readonly string[]>>;
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
}
export type At = 'top' | 'bottom' | number;
export interface ZoneDef {
  readonly seen: Seen;
  readonly owner?: string;
  readonly cards?: readonly string[];
}

export const newZones = (defs: Readonly<Record<string, ZoneDef>>): Record<string, Zone> =>
  Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, { cards: [...(d.cards ?? [])], seen: d.seen, ...(d.owner === undefined ? {} : { owner: d.owner }) }]));

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
    out[name] = { count: z.cards.length, ...(z.owner === undefined ? {} : { owner: z.owner }), ...(any ? { cards } : {}) };
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
