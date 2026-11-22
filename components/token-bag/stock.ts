// K593: finite stocks and a bag, engine side (pure, no DOM). Every piece has an id and sits in exactly one place the game
// names (bag, a hand, set aside, discard, removed, a supply); places hold piece ids, so the state is plain data.
// Source: component.json (K593).

/** Where every piece is: `places[place]` its piece ids, `kinds[id]` its kind. Plain data: save it as it is. */
export interface Stocks {
  readonly places: Readonly<Record<string, readonly string[]>>;
  readonly kinds: Readonly<Record<string, string>>;
}

/** The engine's seeded random: pass `ctx.rng` (`int(max)` gives 0 to max - 1). */
export interface StockRng {
  int(max: number): number;
}

/** What a short bag means for one kind of draw: draw what is left, move a place into the bag first, or draw nothing. */
export type ShortBag = { do: 'drawLeft' } | { do: 'refill'; from: string } | { do: 'fail' };

/** The game's table: each kind of draw it makes (setup, a turn's draw, an effect) and what a short bag means for it. */
export type ShortBagRules = Readonly<Record<string, ShortBag>>;

/** `empty`: the place held none; `short`: it held fewer than asked. */
export type StockReason = 'empty' | 'short';

export interface Taken {
  state: Stocks;
  /** the pieces moved, in order */
  ids: string[];
  /** how many were asked and not given */
  short: number;
  reason?: StockReason;
  /** the reason in words a prompt can show */
  why?: string;
}

export interface Drawn extends Taken {
  /** pieces moved into the bag by a `refill` */
  refilled: number;
  /** true when the rule was `fail` and the bag was short: nothing was drawn */
  failed: boolean;
}

/** Stocks from counts per place and kind; piece ids are `kind#n`. Places with no pieces are named with `{}`. */
export function makeStocks(counts: Readonly<Record<string, Readonly<Record<string, number>>>>): Stocks {
  const places: Record<string, string[]> = {};
  const kinds: Record<string, string> = {};
  const next: Record<string, number> = {};
  for (const [place, byKind] of Object.entries(counts)) {
    places[place] = [];
    for (const [kind, n] of Object.entries(byKind))
      for (let i = 0; i < n; i++) {
        const id = `${kind}#${String((next[kind] = (next[kind] ?? 0) + 1))}`;
        places[place].push(id);
        kinds[id] = kind;
      }
  }
  return { places, kinds };
}

const at = (s: Stocks, place: string): readonly string[] => {
  const p = s.places[place];
  if (p === undefined) throw new Error(`token-bag: no place "${place}"`);
  return p;
};

/** How many pieces are in `place`, of `kind` or of every kind. */
export const piecesIn = (s: Stocks, place: string, kind?: string): number =>
  kind === undefined ? at(s, place).length : at(s, place).filter((id) => s.kinds[id] === kind).length;

/** The place a piece is in, or undefined. */
export const whereIs = (s: Stocks, id: string): string | undefined => Object.keys(s.places).find((p) => s.places[p]?.includes(id));

/** Move these pieces (wherever they are) to the end of `to`. */
export function moveIds(s: Stocks, ids: readonly string[], to: string): Stocks {
  at(s, to);
  const set = new Set(ids);
  if (set.size !== ids.length) throw new Error('token-bag: a piece is named twice');
  for (const id of ids) if (whereIs(s, id) === undefined) throw new Error(`token-bag: no piece "${id}"`);
  const places = Object.fromEntries(Object.entries(s.places).map(([p, xs]) => [p, xs.filter((id) => !set.has(id))]));
  places[to] = [...(places[to] ?? []), ...ids];
  return { places, kinds: s.kinds };
}

/**
 * Take `n` pieces (of `kind`, or any) from `from` to `to`, the first ones in it. A short or empty place gives what it has
 * and says so (`short`, `reason`, `why`): no substitute. A gain from a supply, a return, a discard are all this.
 */
export function gainPieces(s: Stocks, from: string, to: string, n = 1, kind?: string): Taken {
  const ids = at(s, from)
    .filter((id) => kind === undefined || s.kinds[id] === kind)
    .slice(0, Math.max(0, n));
  const short = Math.max(0, n) - ids.length;
  const what = kind ?? 'piece';
  const state = moveIds(s, ids, to);
  if (short === 0) return { state, ids, short };
  return ids.length === 0
    ? { state, ids, short, reason: 'empty', why: `No ${what} left in ${from}: nothing gained.` }
    : { state, ids, short, reason: 'short', why: `Only ${String(ids.length)} ${what} left in ${from}: ${String(short)} not gained.` };
}

/** Return pieces to a place: the same as `moveIds` (a return, a discard). */
export const returnPieces = moveIds;

/**
 * Draw `n` pieces from the bag `from` into `to`, one at a time, each uniform over what the bag holds (`rng.int`). When
 * the bag runs out, `short` says what happens: `drawLeft` keeps what was drawn; `refill` moves every piece of its place
 * into the bag (once) and goes on; `fail` checks first and draws nothing when the bag holds fewer than `n`.
 */
export function drawPieces(s: Stocks, rng: StockRng, from: string, to: string, n: number, short: ShortBag): Drawn {
  const want = Math.max(0, n);
  if (to === from) throw new Error('token-bag: a draw goes from the bag to another place');
  if (short.do === 'refill' && short.from === to) throw new Error('token-bag: a refill comes from a place other than where the draw goes');
  if (short.do === 'fail' && at(s, from).length < want) {
    const have = at(s, from).length;
    return { state: s, ids: [], short: want, refilled: 0, failed: true, reason: have === 0 ? 'empty' : 'short', why: have === 0 ? `Nothing left in ${from}: nothing drawn.` : `Only ${String(have)} left in ${from}, ${String(want)} needed: nothing drawn.` };
  }
  let state = s;
  const ids: string[] = [];
  let refilled = 0;
  let refill = short.do === 'refill';
  while (ids.length < want) {
    const bag = at(state, from);
    if (bag.length === 0) {
      if (!refill || short.do !== 'refill') break;
      refill = false;
      const back = [...at(state, short.from)];
      refilled = back.length;
      state = moveIds(state, back, from);
      continue;
    }
    const id = bag[rng.int(bag.length)] as string;
    ids.push(id);
    state = moveIds(state, [id], to);
  }
  const left = want - ids.length;
  const base = { state, ids, short: left, refilled, failed: false };
  if (left === 0) return base;
  return ids.length === 0
    ? { ...base, reason: 'empty', why: `Nothing left in ${from}: nothing drawn.` }
    : { ...base, reason: 'short', why: `Only ${String(ids.length)} left in ${from}: ${String(left)} not drawn.` };
}
