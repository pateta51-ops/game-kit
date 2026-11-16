# card-zones

Card zones as data on engine-core state (K223): decks, hands, discards and play areas, per seat or shared, each an ordered list of card ids (index 0 is the top) with who sees it, and `viewOf(state, seat)` that hides what a seat may not see. Needs `engine-core`.

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
