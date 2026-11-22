# card-zones

Card zones as data on engine-core state (K223): decks, hands, discards and play areas, per seat or shared, each an ordered list of card ids (index 0 is the top) with who sees it, and `viewOf(state, seat)` that hides what a seat may not see. Needs `engine-core`.

## Rules for agents

**What it does:** Card zones as data on engine-core state, each an ordered list of ids (index 0 is the top) with who sees it, and `viewOf` that hides what a seat may not see.

**You must:**
1. Keep `zones: newZones({ name: { seen, owner?, cards? } })` in the game state, with per-seat keys from `seatZone('hand', seat)`; a card carries no zone field.
2. Move cards only with `moveCard`, `draw`, `place`, `shuffleZone`, `reveal` inside a handler on the draft, so replay, undo and saves work.
3. Shuffle only through `shuffleZone(ctx, zone)` (it uses `ctx.rng`).
4. Build every player view from `viewOf(s, seat)`; a hidden card is `null`, and the game adds no hidden state of its own.
5. Give opponents' `viewLeaks` the list from `hiddenFrom(s, seat)`.
6. Add `zoneProblems(s, expected?)` to `GameRules.invariants`.
7. Keep end-of-deck rules (reshuffle the discard, game end) and card meaning in the game.
8. A zone with a capacity (K599): set `limit` in its `ZoneDef`; change it only with `raiseLimit(s, zone, source, by)` and `dropRaise(s, zone, source)`; read it with `limitOf` and `overBy`. Put `capacityCheck(zones, { to, chooser?, kind? })` in engine-core `checkpoint.checks` (or call `overLimit(ctx, zones, opts)` from your own state check) and spread `capacityHandlers()` into the game's handlers. It asks the chooser (default the zone's owner) for exactly the excess, by card id, and moves them to `to`; when every card must go it asks nothing and moves them all. Which zone is checked, when a raise may be given up, and what a bot picks stay in the game.

**Common mistakes:**
- Moving a card to or from an unknown zone, or a card already in a zone (`place`) or in none (`moveCard`): each throws `EngineBugError`.
- Reading `s.zones` directly in a view: hidden ids and order leak.
- Using `capacityCheck` without `capacityHandlers()`: the answer has no handler. A zone over its limit with no owner and no `chooser`: `EngineBugError`. `raiseLimit` on a zone with no `limit`: `EngineBugError`.

- State: the game keeps `zones: newZones({ name: { seen, owner?, cards? } })` (`Zoned`); per-seat keys by `seatZone('hand', seat)`. A card carries no zone field; `locate`, `cardsIn` find it.
- Seen: `all`, `owner` (others see the count), `top` (top card and count), `count`, `none` (not even the count: absent from the view, or only its revealed cards).
- Moves (inside a handler on the draft, through the copy-on-write barrier, so replay, undo and saves work): `moveCard(s, id, to, at)` (`'top'` default, `'bottom'`, an index), `draw(s, from, to, n, at)` (bottom by default, so a hand keeps draw order), `place` (a card in no zone), `shuffleZone(ctx, zone)` (only `ctx.rng`), `reveal(s, zone, ids, seats | 'all')` (lasts until the card leaves or the zone is shuffled). A state with engine-core's `objRefs` gets `leaveZone` on every move (snapshot: `moveCard`'s fifth argument, default the id). An unknown zone or card is an `EngineBugError`.
- View-only rule: `viewOf(s, seat)` gives `ZoneView { count, owner?, cards? }` per zone, a hidden card is `null` (a back), so no hidden id, order or rng word is in it; `hiddenFrom(s, seat)` is the secrets list for opponent's `viewLeaks`; `canSee`. The game builds its own view from it and adds no state of its own that is hidden.
- `zoneProblems(s, expected?)`: a card in two places or a wrong total, for `GameRules.invariants`.
- Seam for the UI parts (K218 hand, K219 pile, K220 drag): they render a `ZoneView`; a `null` is a card back.
- Not here: rules about running out (reshuffle the discard, game end), card faces, what a reveal means in the game.

## Use it in 10 lines

```ts
import { draw, hiddenFrom, moveCard, newZones, reveal, viewOf, type Zoned } from '../kit/card-zones/index'

const s: Zoned = { zones: newZones({ deck: { seen: 'count', cards: ['c1', 'c2', 'c3'] }, 'hand:a': { seen: 'owner', owner: 'a' }, discard: { seen: 'all' } }) }
draw(s, 'deck', 'hand:a', 2) // inside a handler: the draft from draftOf(ctx); shuffle with shuffleZone(ctx, 'deck')
moveCard(s, 'c1', 'discard')
reveal(s, 'hand:a', ['c2'], ['b'])
console.log(viewOf(s, 'b'), hiddenFrom(s, 'b')) // hand:a { count: 1, owner: 'a', cards: ['c2'] }; deck { count: 1 }; ['c3']
```

## Capacity

A hand limit, a slot limit: `limit` on the zone, raised and given up by source, checked by an engine-core state check that asks for exactly the excess (prompt kind `zones.overLimit`, options are the card ids). Run by `capacity.test.ts` ("README recipe"); there `s` is the state and `Play` the game's types.

```ts
const checks = [capacityCheck<Play>(['hand:a'], { to: 'discard' })]; // engine-core checkpoint.checks; asks the zone's owner
const handlers = { ...capacityHandlers<Play>() }; // the prompt's resume task, added to the game's handlers
raiseLimit(s, 'hand:a', 'annex'); // a rule raises the limit: 3 to 4
dropRaise(s, 'hand:a', 'annex'); // the raise is given up: back to 3
```
