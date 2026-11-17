# Board pieces: counters, flights, tracks, market, player board

All unstyled apart from structural CSS: the game owns layout and look through `data-part` hooks, and passes its own words. Every motion takes `speed` (the settings' factor: 1 normal, 2 slow, 0 none); 0, `'instant'` or prefers-reduced-motion means still, the final state at once.

| Need | Part |
|---|---|
| A resource number that counts up, bumps, shows "+N", warns when low | `counter` |
| Tokens that moved between two views fly from old place to new | `token-flights` |
| A row of spaces with a gliding marker, a hop-and-fill bar, a step list | `track` |
| Offer slots refilled from decks, buy and cycle, slide refill | `market-row` |
| A mat of named zones whose cards fit | `player-board` |
| Cards tucked under or fanned past a host; tokens on a card | `card-attachments` |
| A bag of tokens with a 2D or 3D draw | `token-bag` |
| An arrow from the asking card to its target, then the hit | `target-arrow` |

Read each README before use: [counter](../../components/counter/README.md), [token-flights](../../components/token-flights/README.md), [track](../../components/track/README.md), [market-row](../../components/market-row/README.md), [player-board](../../components/player-board/README.md), [card-attachments](../../components/card-attachments/README.md), [token-bag](../../components/token-bag/README.md), [target-arrow](../../components/target-arrow/README.md).

## How they combine
- **Counter + token-flights.** A place the game draws carries `data-place="<key>"`; a `Counter`'s anchor is its `data-res`. token-flights finds `[data-place]`, else `[data-res]`, so a flight can end on a counter. Then either bump in `onLand` (`bumpCounter(el, speed)`) with `bumpOnChange={false}`, or do neither and let the counter bump itself; never both.
- **Token-flights + token-bag.** The bag's dock is `[data-bag][data-place="bag"]`; in 2D (or speed 0, reduced motion, a failed 3D scene) the draw ends in `onDrawDone` and the game's flights show it. The 3D scene never decides the draw.
- **Token-flights + target-arrow.** `<TokenFlights hold={strikes.hold} />` keeps tokens until the arrow's hit lands. The game calls `strikes.announce` before it dispatches a target answer. Targets are the prompt's options, so drag-drop and the arrow read the same prompt ([card-table](card-table.md)).
- **Player-board + card-attachments + market-row.** They are laid on card-zones zones: `planBoard` fits cards to a mat, `HostStack` tucks attachments under a host (pure `footprint` for the layout), `market-row` slots are zones too. Payment and rules stay the game's.
- **Market-row + deck-motions.** Refills and deals use `deck-motions` over `card-pile`'s `data-pile` anchors.
- **Track + counter.** A track's marker moves by the game's index; a counter shows a number. Use `Track` for spaces, `Counter` for a count.

Proof: reference-game wires the parts; a game's own tests check its engine, never the part's motion.
