# Survey: boardgame.io, netrunnerdb, arkham.build - ideas for game-kit

Date: 15 Nov 2026. Read-only survey of shallow clones under `scratchpad/fw/` (`bgio`, `nrdb`, `ahb`). No code from the repos was run or built. Paths below are relative to each clone.

## Licences and maturity

| Repo | Licence | Last commit seen | Honest maturity |
|---|---|---|---|
| boardgame.io | MIT (2017, The boardgame.io Authors) | 26 Oct 2026, a server fix | Mature and stable, slow-moving. Core is ~3,000 lines, well tested, good docs. Design centre is multiplayer turn order and secret state; the AI is a plain textbook MCTS, the debug panel is Svelte. Little in it is new to a kit that already has runner, undo, replay, fuzz. |
| netrunnerdb | MIT (2012-2016, Cedric Bertolini) | 18 Sep 2026, a merge | Legacy. Symfony/PHP + jQuery with string-built HTML. One controller test in `tests/`. Deck rules are hard-coded PHP. Useful only for two or three small ideas. |
| arkham.build | AGPL-3.0 | 15 Nov 2026 (same day) | Very active, modern TS/React/Vite, strong unit tests on the pure `store/lib` layer and Playwright e2e with screenshots. Best source of the three. **AGPL: take ideas and re-implement; do not copy code into the kit.** |

## Findings worth taking (ranked)

### 1. Card query language (BuildQL) - arkham.build - size M/L
A small typed query language over card data: lexer, parser, interpreter, and a field table where each field has a name, aliases, a type (boolean/number/string/text) and a lookup function. Supports `=` fuzzy vs `==` exact, list contains `?`, regex literals, `& | ()`, null, field-to-field references and arithmetic (`health + sanity < 14`), and a `back:` prefix for the other face. Parser errors carry line and column. The field list in the doc mirrors the field table.
- Verified in: `frontend/src/store/lib/buildql/buildql.md` (read first ~150 lines), `fields.ts` (first ~60 lines), `parser.ts` (grep for error class only); `lexer.ts`, `interpreter.ts` and their tests seen by name and size only (lexer test 1,180 lines, parser spec 657, interpreter spec 617).
- Why: one generic selector for the kit's card lookup commands, card gallery filter, card test harness ("every card whose text contains X must have clause Y") and mechanic-family manifests. A new game only supplies its field table.

### 2. Card data patch layer, grouped by reason - arkham.build - size S
Source card data is never edited. Corrections live in small JSON files, one per reason (`hidden-fixes`, `reprints`, `abbreviations`, `missing-tags`, `card-back-types`, `additional-cards`...), each row `{ code, patch: true, ...fields }`, concatenated in one index and applied on import.
- Verified in: `backend/src/data/card-patches/index.ts` (whole), heads of `hidden-fixes.json` and `abbreviations.json`, directory listing.
- Why: keeps the dossier transcription word-for-word while errata, digital-only fixes and search abbreviations sit in separate, reviewable, reason-named files. Same shape every game.

### 3. Errata shown as previous / new / diff - netrunnerdb and arkham.build - size S/M
netrunnerdb publishes each text update as three columns: previous text, new text, and a word diff with insert/delete marks. arkham.build marks changed (taboo) text on the card with a coloured border and shows the original on hover, and shows an errata notice with date that expands to the rulings.
- Verified in: `nrdb app/Resources/views/RulesTextUpdates/2025_03_24_elevation_release.html.twig` (first 25 lines); `ahb frontend/src/components/card/card-taboo-text.tsx` (first 30 lines), `card-errata.tsx` (first 40 lines).
- Why: the zoomed card can show "printed" against "as played" with a word diff whenever a patch (finding 2) or a designer ruling changed the text; generic component fed by the patch layer.

### 4. Rulings and FAQ attached to cards, with citation and date - arkham.build - size M
Each FAQ item is `{question, ruling, citation, date}` keyed by card code, rendered under the card with citation and date tags. Card names inside rulings are links, so the card tooltip works inside them. The rules reference is data (sections, entries, errata, faq) with citations carrying a version, and a per-entry search-text map.
- Verified in: `frontend/src/components/card-faq/card-faq.tsx` (first 60 lines), `frontend/src/pages/rules-reference/rules-chapter-two.helpers.ts` (first 50 lines). netrunnerdb's equivalent is only a `ruling` table with card id and text (`src/AppBundle/Resources/config/doctrine/Ruling.orm.yml`).
- Why: a standard data shape and panel for showing the arbiter's rulings and harvested BGG rulings on the zoomed card, next to the glossary. (Rule ids stay hidden; citation is the printed source.)

### 5. One delegated tooltip for every card link - arkham.build - size S
One hook put on any container: on pointer move it finds the closest anchor whose href is `/card/<code>` and floats a card tooltip there. Details: short rest delay only for the first open, suppressed after pointer-down until the pointer leaves, ignored for touch, positioned with shift/auto-placement.
- Verified in: `frontend/src/components/card-tooltip/use-card-link-tooltip.tsx` (first 90 of 115 lines).
- Why: card names inside log lines, prompts, rulings, glossary text and tutorial text all get a card popover with no per-site wiring. Complements the existing glossary term popover.

### 6. Fixture-per-rule validation table - arkham.build - size S/M
Validation tests are one table of `[label, fixture name]`; each rule has a "valid" and an "invalid" JSON fixture (112 files), and the validator returns a typed error list (`TOO_MANY_CARDS`, `FORBIDDEN`, `DECK_REQUIREMENTS_NOT_MET`..., each with details) that is snapshotted.
- Verified in: `frontend/src/store/lib/deck-validation.spec.ts` (first 45 lines), `test/fixtures/decks/validation/` listing, error types by grep in `deck-validation.ts` (1,113 lines, not read in full).
- Why: pattern for a kit "setup legality" check (deck, scenario, variant, loaded save): errors as data plus paired fixtures. Note the rules themselves are code here, not data.

### 7. Control-flow requests guarded by caller context - boardgame.io - size S
Flow events (end turn, set phase...) called inside a move or hook are queued, each stamped with the hook it was called from, the turn/phase at call time and a captured stack. On flush: a request from an illegal place returns a named error with the original stack; a request whose turn or phase has already moved on is dropped; a counter stops runaway turn-ending loops ("maximum number of turn endings exceeded").
- Verified in: `src/plugins/events/events.ts` (whole, 221 lines).
- Why: a generic guard for the kit's step runner: stale-request dropping and a loop cap with the call site in the message. Check first whether the checkpoint step already covers it.

### 8. Search bot explains itself in the log - boardgame.io - size M
The bot returns `{action, metadata}`; metadata (the search root) is attached to the action, so clicking that log line later opens a table of candidate actions with value and visits, and hovering a candidate previews the state it leads to. Objectives are named `{checker, weight}` pairs that score a playout early; iterations and playout depth can be functions of state.
- Verified in: `src/ai/mcts-bot.ts` (first ~230 of 331 lines), `src/ai/ai.ts` (whole), `src/ai/bot.ts` (whole), `src/client/debug/mcts/Table.svelte`, `src/client/debug/ai/AI.svelte` (first ~130 lines), `src/client/debug/log/Log.svelte`.
- Why: for solo games, a "why did the automa / hint pick this" table and a hint or difficulty probe driven by weighted named objectives. Take the idea (decision record per AI action, shown from the log), not the MCTS.

### 9. Hover-to-preview a past state - boardgame.io - size S
Hovering a log line replays to that point and shows it as a preview without changing the game; click pins it, Escape clears. Turn and phase markers span their rows in the log.
- Verified in: `src/client/debug/log/Log.svelte` (script part, whole).
- Why: non-destructive "look back" beside the existing undo-to-log-line.

### 10. Partial random override and "randomness was used" flag - boardgame.io - size S
`MockRandom({ D6: () => 6 })` overrides named random calls only; the rest stay seeded. The random object records whether it was used during an action. Separately, a move's `undoable` may be a function of state.
- Verified in: `src/testing/mock-random.ts` (whole), `src/plugins/random/random.ts` (whole), `src/core/reducer.ts` lines 48-67 by grep, `docs/documentation/testing.md`, `undo.md`.
- Why: card tests can force "this roll is a 6" by name instead of hunting a seed; "used randomness or revealed hidden information" becomes an automatic no-undo marker instead of a per-action flag.

### 11. Smaller items (S each)
- **Icon with text fallback** (netrunnerdb `web/js/nrdb.format.js`): every icon is emitted with a hidden word next to it, so copy, search and text assertions see "credit", not a blank.
- **Draw odds** (netrunnerdb `web/js/nrdb.draw_simulator.js`, first 60 lines): cumulative hypergeometric odds of seeing a card in the next N draws; a generic deck-odds helper for play stats or a hint.
- **Ordered-token fuzzy search** (arkham.build `frontend/src/utils/fuzzy.ts`, whole): strip diacritics, tokens must appear in order within 20 characters, prepared-text cache.
- **Hotkey strings** (arkham.build `frontend/src/utils/use-hotkey.ts`, first 70 lines; boardgame.io `src/client/debug/main/Hotkey.svelte`): `"cmd+k"` style bindings, off while an input has focus, and a shortcuts list built from the same table (`keyboard-shortcuts-modal.tsx` not read).
- **Precomputed card relation index** (arkham.build `frontend/src/store/lib/lookup-tables.types.ts`, by grep): tables such as bonded, reprints, other versions, required cards, built once at load; feeds "related cards" on the zoomed card.
- **JSON-serialisable state check in dev** (boardgame.io `src/plugins/plugin-serializable.ts`, whole): a wrapper that throws when a move returns non-plain data. Likely covered by the purity lint and save tests.
- **Screenshot tests by section with masks** (arkham.build `test/e2e/tests/card-view.spec.ts`, `mocks.ts`, first 40 lines each): wait for no spinners, screenshot one test-id section, mask volatile parts, inject a synthetic card through a mocked route.

## Not worth taking

- **boardgame.io phases / turn order / stages** (`src/core/flow.ts` 921 lines, `turn-order.ts` 598): built for several players acting in turn or at once. Solo games need a step machine, which the kit has. The many "not allowed in onEnd/onBegin" rules are a cost of that hook model.
- **boardgame.io plugin model** (`docs/documentation/plugins.md`): setup/api/flush/fnWrap/isInvalid/playerView. Clean, but it exists to inject APIs into move functions and hide state per player; a pure reducer with a card language does not need it.
- **boardgame.io MCTS as code**: no handling of hidden information or chance nodes, reward is "winner equals this player"; unsuitable for solo score games as is. Random bot is 20 lines.
- **boardgame.io log `redact`, error enum, save/restore, seeded PRNG in state, client test patterns**: kit already has equivalents.
- **netrunnerdb search syntax** (`web/js/nrdb.smart_filter.js`): one-letter field codes, superseded by BuildQL. **Deck judge** (`src/AppBundle/Service/Judge.php`): rules hard-coded with card-specific branches, one problem string at a time. **Import** (`ImportStdCommand.php`, grep only): mandatory-key lists per card type and foreign-code checks; weaker than the kit's strict validator. **Tooltips/zoom**: jQuery qTip string HTML.
- **arkham.build list virtualisation** (react-virtuoso in `components/card-list/`): only pays above several hundred rows. **Localisation** (`docs/translations.md`): i18next plus sync scripts; not needed for a personal English build. **Card text markup** (`parseCardTextHtml`, `frontend/src/utils/card-utils.ts` lines 98-125): three regex replaces and a sanitiser; the kit's card language is richer. Deck sync, upgrades, accounts, backend: out of scope.

## What was actually read

All reads were excerpts printed by script with comments and blank lines stripped and a line cap; nothing was read twice.

- **boardgame.io**: docs `testing.md`, `undo.md`, `debugging.md`, `plugins.md` (first ~170 lines each, so most of each), `random.md` (most). Source: `ai/mcts-bot.ts` (first ~230 lines), `ai/ai.ts`, `ai/bot.ts`, `testing/mock-random.ts`, `plugins/plugin-serializable.ts`, `core/errors.ts`, `plugins/events/events.ts`, `plugins/random/random.ts`, debug `Controls.svelte`, `Log.svelte`, `Table.svelte`, `Hotkey.svelte`, `AI.svelte` (first ~130 lines). Grep only: `core/reducer.ts`, `core/flow.ts`.
  **Not read**: `plugins/main.ts`, `core/turn-order.ts`, `core/player-view.ts`, `plugin-log`, `plugin-immer`, `plugin-player`, `random.alea.ts`, docs `events.md`, `phases.md`, `stages.md`, `turn-order.md`, `secret-state.md`, `concepts.md`, the client, any test file, `examples/`, `benchmark/`, server/lobby/master (skipped as asked).
- **netrunnerdb**: `web/js/nrdb.smart_filter.js` (first 150 lines), `nrdb.format.js`, `nrdb.fuzzy_search.js`, `nrdb.tip.js`, `nrdb.draw_simulator.js` (first 60), `Service/TextProcessor.php`, `Ruling.orm.yml`, one rules-text-update template (first 25 lines). Grep only: `Service/Judge.php`, `Command/ImportStdCommand.php`.
  **Not read**: `Service/CardsData.php` (the server-side search, 1,335 lines), `syntax_new.html.twig`, `zoom.js`, `nrdb.card_modal.js`, `nrdb.diff.js`, `Card.orm.yml`, all controllers, entities, the one test.
- **arkham.build**: `buildql/buildql.md` (first ~150 lines), `buildql/fields.ts` (first 60), `docs/metadata.md`, `docs/translations.md`, `card-patches/index.ts` and two patch file heads, `utils/card-utils.ts` (first 60 lines and lines 98-143), `card/card-text.tsx`, `card-errata.tsx` (first 40), `card-taboo-text.tsx` (first 30), `card-faq.tsx` (first 60), `use-card-link-tooltip.tsx` (first 90), `deck-validation.spec.ts` (first 45), `utils/fuzzy.ts`, `utils/use-hotkey.ts` (first 70), `test/e2e/tests/mocks.ts` and `card-view.spec.ts` (first 40 each), `rules-chapter-two.helpers.ts` (first 50). Grep only: `deck-validation.ts`, `buildql/parser.ts`, `lookup-tables.types.ts`, card-list files, package scripts.
  **Not read**: `buildql/lexer.ts`, `interpreter.ts`, `filtering.ts`, `grouping.ts`, `resolve-deck.ts`, `lookup-tables.ts`, `card-modal/`, `card-list/` bodies, `keyboard-shortcuts-modal.tsx`, i18n scripts, the whole backend apart from the patch folder, `shared/`, fullstack tests.
