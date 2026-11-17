# A card table: zones, hand, piles, drag

Component: `card-zones` (README). Cards and their places are data in engine state; the screen draws a view of them.

1. **Engine.** `zones: newZones({...})` in the game's state; per-seat keys by `seatZone('hand', seat)`. Move only inside handlers (`moveCard`, `draw`, `shuffleZone(ctx, zone)`, `reveal`); put `zoneProblems` in `GameRules.invariants`. Never keep a card's place on the card.
2. **View.** The game's player view is built from `viewOf(state, seat)`; a hidden card is `null` (draw a back). The same view feeds the opponent: `hiddenFrom(state, seat)` is the secrets list for its `viewLeaks` test ([ai-opponent.md](ai-opponent.md)).
3. **Faces.** `card-parts` and `card-zoom` ([card-face-zoom.md](card-face-zoom.md)); the game owns the layout.
4. **Choosing a card** is an engine prompt answered by option id ([prompts.md](prompts.md)); `look.label(o, p)` returns the card face for the option's card id.
5. **Hand** is [card-hand](../../components/card-hand/README.md): `<CardHand view={viewOf(...)[zone]} face pick drag speed />` (a `null` card is a back; the same part draws an opponent's hand). Set the size tokens, style the `data-part` hooks (shadow, glow, badges). Drag: [drag-drop](../../components/drag-drop/README.md). Pile (K219) is planned: until it lands show a plain stack and write "Kit gap: pile" in the PR.
6. **Panels around the table** (`table-panels`, unstyled): `LogPanel` over `logLines(events, words)` (the game writes the words), `TurnBanner` over its phase list, `OpponentTurnPanel` over `opponentTurn(steps, ...)` with paced-view `skip`, `GameOver` over `gameResult(scores)`. The game owns layout and look.

Proof: a test that moves every card through every zone with `zoneProblems` clean, and a `viewLeaks` test.

## Piles (K219)
A resource number that counts up, bumps and tags its change, with a `data-res` anchor for flights: `counter` (`Counter`, `bumpCounter`; README).

A row of spaces with a marker that glides, on a drawn row or on a mat image; a hop-and-fill bar with a multiplier badge; a step list with one lit step: `track` (`Track`, `HopTrack`, `StepTrack`; README).

A stack you may look through, with picks from it and a phone grid: `card-pile` (`Pile` over a `ZoneView`, marks from `useBoardPick`; README).

A mat of named zones whose cards fit (two rows, a fan below the readable minimum), zones as motion anchors: `player-board` (`planBoard`, `PlayerBoard`; README).

## Attachments and card tokens (K245)
Cards tucked under or fanned past a host, with a pure `footprint` for the row layout, and tokens on a card (a row, ×N past 5, number boxes): `card-attachments` (`HostStack`, `TokenRow`, `NumberBox`; README). The game passes its own token render.

## Market (K243)
Offer slots refilled from decks, buy and cycle options, slide refill and the deal animation: `market-row` (slots are card-zones zones; payment and rules stay the game's; README).
Cards dealt from a pile to places, refill turn-over, deck cycle and the riffle shuffle: `deck-motions` (piles by `data-pile`; the game says which cards move; README).
