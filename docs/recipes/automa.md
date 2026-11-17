# Add an official solo automa

Use [`automa`](../../components/automa/README.md) when the rulebook's solo opponent does not play by player rules (a card flip, a priority list, "if you cannot, do the next"). An opponent that plays by player rules is [ai-opponent.md](ai-opponent.md).

1. **Transcribe, never decide.** The deck, every priority row, every tie-break and each difficulty level come from the rulebook with their rule ids beside the code; a gap is a "Rules question" for the arbiter.
2. **Deck in the state.** `newAutomaDeck(cards, ctx.rng, reshuffle)` in setup; `drawAutoma(s.deck, ctx.rng)` in the handler that flips the card, then `s.deck = deck` and the card into state. Emit the flip as a revealing event (undo bar). Never draw in the bot: the bot only reads the revealed card from its view.
3. **Table as data.** One `AutomaRule` per printed row (`id` = the row's rule id, `when` = its condition, `match` = which legal answers do its action); `onMiss: 'fallback'` when the rulebook says "otherwise do X" instead of "go to the next row". The printed tie-breaks become `tieBreak` criteria in order; the kit adds seeded random last (the rulebook's "choose randomly").
4. **Difficulty.** Each level is an `AutomaTier` (cards added or removed, rows changed, numeric knobs); build with `atTier(base, tier)` from the game's settings.
5. **Plug in.** `automaBot(name, automa)` into `defineGame({ opponent: botOpponent(bot) })` and the sim with `botDriverOf(def, bot)` ([game-store.md](game-store.md)).
6. **Prove it.** 100+ seeded games in sim-pool with no dead end; a test per fallback path (`AutomaDecision.missed`, `rule`, `ties`, `random`) and one for the reshuffle (`deck.shuffles`); tests assert `automaLines`, not just the move. Proof: `components/automa/automa.test.ts`.
