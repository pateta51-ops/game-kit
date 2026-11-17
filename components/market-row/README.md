# market-row

A market of offer slots refilled from decks: prices, buy and cycle options, refill at once or by slide, clear, a view of face-up slots and deck counts, and an unstyled row that deals new cards from the deck with a stagger. Needs `engine-core`, `card-zones`, `prompt-host`, `picked-state`, `motion-frame`; package `react`.

- Slots are card-zones zones (`marketZones(rows)` spread into `newZones`, key `slotZone(row, i)`, face up), so every move goes through the copy-on-write barrier, replay, undo and saves. Call the moves inside a handler on the draft.
- `MarketCfg`: `rows` (`slots`, `decks`, `prices`, `cycle` per slot), `when` (`now`: a taken or cycled slot refills at once from its source, no slide; `later`: it stays empty until `refill`). Hooks: `source(s, row, i)` decks tried in order (fallback), `ask(s, row, i)` the player picks the deck, `price(s, row, i, card, base)` the game's modifiers, `home(s, row, card)` where a card goes back (default the row's first deck).
- `marketOptions(s, cfg, afford)`: `buy:row:i` and `cycle:row:i` (when the row has `cycle`) with `card`, `cost`; `afford(verb, cost, at)` returns the reason it cannot be paid (a disabled option with `why`). Payment is the game's. `parseOption(id)`.
- `takeSlot(s, cfg, row, i, to, at?)`, `cycleSlot` (to the bottom of `home`), `refill(s, cfg, slide = true)` (slide right, order kept, then fill from the left), `fillEmpty`, `slideRight`, `clearMarket` (bottoms, rows in order, slots left to right). Each returns `MarketEvent`s (`filled`, `slid`, `taken`, `returned`) for the game's events and log; both decks empty leaves a slot empty.
- `pending` (`{ row, slot, decks: [{ zone, empty }] }`): the fill stopped at a slot whose deck the player picks. The game asks its prompt (an `empty` deck disabled), then `fillSlot(s, cfg, row, i, deck)` (a deck that is not one of the slot's sources is an `EngineBugError`) and `fillEmpty` (no second slide).
- `marketView(viewOf(s, seat), rows)`: per row `slots` (ids or `null`) and `decks` (counts only).
- Not here: who may buy, discounts, unlocks, where a bought card goes, payment, what a reveal triggers.
- UI (`ui.ts`): `MarketRow` with `name`, `label`, `row` (a `RowView`), `face(id, slot)`, `deck(zone, count)`, `empty(slot)`, `events`, `labels(slot, id)` (price and cost as the game writes them), `pick` from `useBoardPick` (`data-mark`, `data-picked`, `data-dim`; a click taps `optionFor(slot, id)`, default `buy:<name>:<slot>`), `speed`. When `row.slots` changes, survivors slide (520 ms), then new cards fly from the deck element (`dealFrom(slot, id)`, else the `from` of the card's `filled` event in `events` (the market events of the last step), else the first deck) 520 ms each, 90 ms apart, scaled by `speed`; none at 0 or reduced motion. `rowMotions`, `flyFrames` are the pure part. Parts: `market-row decks deck slots slot card` (`data-empty`). Timing ported from Rome via STCC from LordOfTheRings (BSD-3, `LICENSE-LordOfTheRings.txt`).

Note (K250): the deal here animates the real card element from the deck's box; `deck-motions` `dealFrom` flies stand-ins between `data-pile` piles with the same timings, so it was not swapped in; use it for a turn-over refill.

## Use it in 10 lines

```ts
import { newZones, viewOf, type Zoned } from '../kit/card-zones/index'
import { marketOptions, marketView, marketZones, refill, takeSlot, type MarketCfg } from '../kit/market-row/index'

const rows = { a: { slots: 3, decks: ['A'], prices: [3, 2, 1], cycle: [2, 1, 0] } }
const cfg: MarketCfg = { rows, when: 'later' }
const s: Zoned = { zones: newZones({ ...marketZones(rows), A: { seen: 'count', cards: ['x', 'y', 'z', 'w'] }, hand: { seen: 'all' } }) }
refill(s, cfg) // inside a handler: the draft
takeSlot(s, cfg, 'a', 1, 'hand') // the slot stays empty until the next refill, which slides right first
console.log(marketOptions(s, cfg, (_verb, cost) => (cost > 2 ? 'needs Gold' : undefined)), marketView(viewOf(s, 'p1'), rows))
```
