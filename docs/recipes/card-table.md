# A card table: zones, hand, piles, drag

Component: `card-zones` (README). Cards and their places are data in engine state; the screen draws a view of them.

1. **Engine.** `zones: newZones({...})` in the game's state; per-seat keys by `seatZone('hand', seat)`. Move only inside handlers (`moveCard`, `draw`, `shuffleZone(ctx, zone)`, `reveal`); put `zoneProblems` in `GameRules.invariants`. Never keep a card's place on the card.
2. **View.** The game's player view is built from `viewOf(state, seat)`; a hidden card is `null` (draw a back). The same view feeds the opponent: `hiddenFrom(state, seat)` is the secrets list for its `viewLeaks` test ([ai-opponent.md](ai-opponent.md)).
3. **Faces.** `card-parts` and `card-zoom` ([card-face-zoom.md](card-face-zoom.md)); the game owns the layout.
4. **Choosing a card** is an engine prompt answered by option id ([prompts.md](prompts.md)); `look.label(o, p)` returns the card face for the option's card id.
5. **Hand, pile and drag parts are planned, not built (K218 hand, K219 pile, K220 drag).** Do not build them in `src/`: five games did and each differs. Until they land, show a plain row of faces, and write "Kit gap: hand/pile/drag" in the PR.
6. **Panels around the table** (`table-panels`, unstyled): `LogPanel` over `logLines(events, words)` (the game writes the words), `TurnBanner` over its phase list, `OpponentTurnPanel` over `opponentTurn(steps, ...)` with paced-view `skip`, `GameOver` over `gameResult(scores)`. The game owns layout and look.

Proof: a test that moves every card through every zone with `zoneProblems` clean, and a `viewLeaks` test.
