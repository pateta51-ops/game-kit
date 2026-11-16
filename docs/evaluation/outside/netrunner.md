# Survey: mtgred/netrunner and bobtheuberfish/chiriboga - ideas for game-kit

Read-only survey, shallow clones, nothing built or run. Paths are relative to each repo root.
Clones: `C:/Users/user/AppData/Local/Temp/claude/9919beaa12ed540b/c699a2b7-d212-4f36-8f5e-0e540f485c47/scratchpad/nr/netrunner` and `.../nr/chiriboga`.

## Licences and maturity

| Repo | Licence | Last commit in clone | Maturity |
|---|---|---|---|
| mtgred/netrunner | MIT (`LICENSE.txt`) - ideas and code may be ported with attribution | 5 Nov 2026 | Very mature and active. ~19,600 lines of engine in 71 files, ~3,500 card tests in 11 files plus ~200 engine tests. The engine is a mutable atom with hand-rolled continuation passing (`wait-for` / `effect-completed`); its own docs call that part "really dumb and complicated". Card effects are maps of closures, not pure data. Take the designs, not the code. |
| bobtheuberfish/chiriboga | GPL-3.0 (`LICENSE`) - do NOT copy code into a private kit; ideas only | 6 Jul 2025 | One-author hobby project, 52 files, ~34,700 lines of plain JS on globals. No tests at all, no CI, no build. README admits it grew "with no design or end goal". The AI works in practice (plays two full sets) but is welded to the engine. Useful as a catalogue of what a rule-based card-game AI needs, not as a model of structure. |

## Findings worth taking

### 1. Checkpoint as one fixed, ordered clean-up step - netrunner - M
After every action the engine runs one `checkpoint` function with fixed lettered steps taken from the rulebook: (a) gather triggers whose condition was met and mark them pending, (b) expire durations, (c) win check, (d) uniqueness check, (e) restriction checks (e.g. over memory -> forced trash prompt), (h) empty zones removed, then open the reaction window for the pending triggers. A second, cheap `fake-checkpoint` loops "recompute every derived value until nothing changes, max 10 passes".
- Verified in: `src/clj/game/core/engine.clj` lines 1288-1328 (`checkpoint`, `end-of-phase-checkpoint`), 1265-1286 (`check-restrictions`); `src/clj/game/core/checkpoint.clj` (whole file, 33 lines).
- Why: one named place where illegal states are corrected and derived values settle, instead of clean-up scattered through reducers. The fixed-point loop with a pass cap is also a ready-made invariant ("derived values converge in N passes") for the fuzz pool.

### 2. Queued events with "once per instance" vs "once per item" - netrunner - M
Effects do not fire triggers directly; they `queue-event` with a context map. At the checkpoint the queue is turned into handler instances: a handler flagged `:once-per-instance` gets ONE instance carrying all contexts (e.g. "whenever cards are trashed"), otherwise one instance per context (e.g. "whenever a card is trashed"). Handlers are re-validated (card still there, not disabled, not suppressed) just before each resolves.
- Verified in: `src/clj/game/core/engine.clj` lines 978-1012 (`queue-event`, `create-instances`, `create-handlers`), 1014-1105 (`trigger-queued-event-player`), 1115-1130 (`mark-pending-abilities`).
- Why: the batch-vs-each distinction is a recurring source of card bugs in any game; one flag in the effect language settles it.

### 3. Simultaneous-trigger ordering: silent / interactive / automatic priority - netrunner - M
Each trigger may declare `:silent` (never needs a player choice), `:interactive` (order matters, so ask) and `:automatic <category>`. The order prompt is shown only if at least one pending trigger is interactive and more than one is non-silent; otherwise all resolve automatically, sorted by a small priority table (lose-clicks 1, gain-clicks 2, lose-credits 4, gain-credits 6, draw 8, default 10, `:last` 999) then by printed title for determinism. Active player's triggers go first, then the other side's; a `cancel-fn` can stop the rest.
- Verified in: `src/clj/game/core/engine.clj` doc block lines 147-158, table lines 648-667, `trigger-event-simult` lines 927-974, ordering code lines 880-890 and 1076-1083.
- Why: removes pointless "choose order" prompts while keeping the ones that matter; the default-order table is generic (losses before gains before draws) and gives deterministic replays.

### 4. Prevention window as data on the card - netrunner - M/L
A card lists `:prevention [{:prevents :damage, :type :ability|:event, :max-uses n, :prompt, :label, :ability {...}}]`. The engine opens one prevention window per preventable thing with a context `{count, remaining, prevented, source-player, source-card, unpreventable, unboostable}`, gathers every relevant, affordable, not-used-up prevention (including floating ones from cards no longer in play), and keeps a stack so windows can nest. Preventing outside a window is logged as an error.
- Verified in: `src/clj/game/core/prevention.clj` lines 24-150 (design notes lines 24-83, gathering lines 85-126, `prevent-numeric` 133-144, `fetch-and-clear!` and the `:prevent-stack`).
- Why: the kit's effect language gets one generic "prevent/reduce/replace N of X" shape with a standard context, instead of per-card interrupts. The remaining/prevented counters make "prevent up to 2" and "unpreventable" uniform.

### 5. Continuous effects registry with durations and a disabled-card registry - netrunner - M
All static and lingering modifiers live in one list of `{type, req, value, duration, card, uuid}` records. Queries are `get-effects`, `sum-effects`, `any-effects` by type; static ones register when a card becomes active and are removed with it; lingering ones carry a duration key and are removed in bulk when that duration ends (`:until-next-turn-begins` is renamed to `:until-turn-begins` at turn start). A separately cached "disabled cards" registry is rebuilt after every change so blanked cards' statics are skipped.
- Verified in: `src/clj/game/core/effects.clj` (whole file, 202 lines).
- Why: if the kit's card language has no single continuous-modifier table yet, this is the shape: every "+1 while", "cannot", "costs 1 less this turn" is one record type, summed at read time, never written into the card.

### 6. "Would this change the game state?" separate from "is this legal?" - netrunner - S
An ability has `:req` (may it be used) and, separately, `:change-in-game-state {:req, :silent}`; when the second is false the engine still pays costs and logs "does nothing" loudly instead of resolving. There is also `:skippable` and `do-nothing`.
- Verified in: `src/clj/game/core/engine.clj` lines 352-376; schema key in `src/clj/game/core/schemas.cljc` (`::cigs`).
- Why: a clean generic rule for the UI: grey out or warn on plays that would do nothing, and never silently swallow them.

### 7. Per-card "implementation note" shown to the player, plus card-vs-test coverage report - netrunner - S
A card definition may carry `:implementation "Timing restriction not enforced"` (56 uses); it is copied onto the card instance, sent to the client and posted to the log when the card is played. A separate task diffs the card database against test names and prints "cards without tests" and "tests without cards" (catches renamed or misspelt tests), per type or total, with a `:skip-card-coverage` opt-out.
- Verified in: `src/clj/game/core/initializing.clj` lines 180-199; `src/clj/game/core/actions.clj` line 767; `src/clj/game/core/diffs.clj` line 162; `src/clj/tasks/card_coverage.clj` (whole file).
- Why: honest, in-game reporting of partially automated cards; and the "tests without cards" direction is a cheap orphan check the kit's clause inventory may not do. Related one-liner: `test/clj/game/quotes_test.clj` checks every card name referenced in flavour data exists in the card database.

### 8. Test DSL details - netrunner - S each
The kit has a harness; these specific helpers looked worth copying:
- `changed?` multi-delta assertion: `(is (changed? [(:credit corp) -2 (count hand) 1] action))` reports expression, before, after per pair. `test/clj/game/test_framework/asserts.clj` lines 109-130.
- Failure messages that print the current prompt: clicking a button that is not offered fails with the full prompt and the list of offered choices; `click-card` on a non-select prompt fails with a reason. `test/clj/game/test_framework.clj` lines 150-240. `print-prompts` / `prompt-fmt` render both sides' prompts as text (lines 1171-1193).
- `no-prompt?` / `ensure-no-prompts` assertion at the end of a step: no dangling decision left. Lines 128-132, 325.
- Scenario set-up by zones with noise reduction: `new-game {:corp {:hand [...] :deck [...] :credits 20}}`, default filler deck, `:hand 5` meaning "five filler cards", `stack-deck` that asserts the deck multiset is unchanged after stacking. Lines 373-480, 1203-1221, 413-429.
- Archetype tests in one call: `subroutine-test`, `fire-all-subs-test`, `run-and-encounter-ice-test` build the standard situation for a whole card family. Lines 1223-1331.
- Tests drive the same action entry point the UI uses (`do-action` -> `handle-action`), not internals. Lines 83-85.
- Random test order every run (`tests.edn`, kaocha randomize plugin) and the 3 slowest tests printed (profiling plugin).
- `test/clj/game/core/scenarios_test.clj`: a file of named multi-card interaction regressions, one per reported bug.

### 9. Three undo granularities with a ring of snapshots - netrunner - S
Besides whole-turn undo, the engine keeps the last 4 pre-action snapshots and one pre-paid-ability snapshot; undo restores the snapshot but keeps the current log and history, and logs that undo was used.
- Verified in: `src/clj/game/core/actions.clj` lines 39-59; `src/clj/game/core/commands.clj` lines 204-240.
- Why: the kit has undo; the bits to borrow are "log survives undo and records it" and the mid-action (paid-ability) restore point.

### 10. Debug command table - netrunner - S
One map of ~60 slash commands (set any counter with clamping, draw N, move card to any zone, summon any card by name, peek, roll, close a stuck prompt, replace identity, disable/enable a card, undo-click, save replay, bug report that stores a replay and pre-fills an issue).
- Verified in: `src/clj/game/core/commands.clj` lines 64-80 and 488-659.
- Why: a ready checklist for a generic kit debug console; `/close-prompt`, `/summon` and `/disable-card` are the non-obvious ones. chiriboga has the same idea as playable "cheat cards" (`sets/cheat.js`), which is weaker.

### 11. Cost objects with open dispatch and a payment record - netrunner - M
Costs are small records `{type, amount, additional, maximum, offset, args}`; each cost type implements `value`, `label`, `payable?`, `handler`. Costs of the same type are merged before paying, sorted by a fixed rank for display and for payment order, and each handler returns a payment record `{type, value, targets, msg}` that is stored on the action id (`:cost-paid`) so later effects can ask "what was spent". The log line is built from those records.
- Verified in: `src/clj/game/core/payment.clj` lines 1-80; `src/clj/game/core/costs.clj` lines 194-222; `src/clj/game/core/schemas.cljc` (`Cost`, `Payment`, `Eid`).
- Why: "merge, rank, pay, record" is generic; the record-on-the-action-id answers "if you paid with X" clauses without special cases.

### 12. Closed schemas for ability maps - netrunner - S
Every ability key is listed in one closed schema; unknown keys fail. The authors note it is only switched on in development.
- Verified in: `src/clj/game/core/schemas.cljc` lines 1-150; `src/clj/game/core/engine.clj` lines 284-287.
- Why: only worth noting if the kit's card-language validator is not already closed (typos in keys rejected). Otherwise skip.

### 13. Per-ability auto-answer for optional triggers - netrunner - S
An optional trigger can carry `:autoresolve`; the player sets "always yes / always no / ask" per card through a card ability, stored on the card.
- Verified in: `src/clj/game/core/engine.clj` doc lines 215-224; `src/clj/game/core/optional.clj` lines 72, 85 (names only; bodies not read).
- Why: generic quality-of-life for repeated optional prompts in solo play.

### 14. Codemod scripts for card and test files - netrunner - S (idea only)
Throwaway syntax-tree rewrite scripts are kept in the repo: split nested test blocks into separate tests, convert an old assertion form to a new one, sort card definitions alphabetically.
- Verified in: `test/clj/game/rewrite.clj`, `src/clj/tasks/changed.clj`, `src/clj/tasks/remove_effect.clj`, `src/clj/tasks/sort_card_defs.clj`.
- Why: when the kit's effect language changes shape, a codemod (ts-morph or a JSON transform) over all games' card data beats hand edits. Nothing to port directly.

### 15. AI: per-card advice hooks with engine defaults - chiriboga - M (idea only, GPL)
The AI holds general heuristics; each card adds optional `AI...` functions that answer one narrow question. About 70 hook names; the most used: `AIPreferredInstallChoice` (39), `AIWouldPlay` (30), `AIImplementIce` (26), `AIWouldTrigger` (25), `AIWorthKeeping` (25), `AIImplementBreaker` (24), `AIInstallBeforeRun`, `AIAdvancementLimit`, `AIWastefulToInstall`, `AIEconomyInstall`, `AIOkToTrash`, `AIDefensiveValue`. Missing hook = generic default.
- Verified in: hook census over `sets/*.js`, `ai_runner.js`, `ai_corp.js`, `runcalculator.js`; examples in `sets/systemgateway.js` lines 248-277 and 381-406; callers in `ai_runner.js` lines 107-190.
- Why: for the kit, the same idea as DATA beside the card's effect records ("ai" block: keep-value, play-when, waste-if, target preference), kept in a separate file per game so the engine never imports it. This is the cheapest route to a competent rule-based opponent or automa helper.

### 16. AI: abstract effect vocabulary + path search for the core tactical problem - chiriboga - L (idea only)
For the one hard sub-problem (getting through a row of defenders), cards are translated into a tiny abstract model: each defender = strength + list of sub-effects from a fixed vocabulary (`netDamage`, `tag`, `endTheRun`, `loseCredits`, `payCredits`, `misc_minor/moderate/serious`). A calculator enumerates paths (which tool, pump, break which sub), prunes with limits on damage, clicks, credits, tags, and returns the cheapest valid path. Decision = server "potential" (hand-tuned value of what is behind) versus path cost; results are cached and invalidated when the board changes; mid-run it recalculates and may bail out.
- Verified in: `runcalculator.js` lines 1-110 (model and vocabulary), outline of `ValidPoint`/`ValidPath`/`CalculatePiece*` (lines 727-1250, signatures only), `ai_runner.js` lines 1878-2021 (potential scoring), 966-995 (`RecalculateRunIfNeeded`), 597-720 (cache).
- Why: the pattern "reduce cards to a few severity classes, then search exactly" generalises to any solo game with a lane/gauntlet/combat sub-problem. The `OneLiner`/`Print` path explainer (lines 1258-1400) is also the model for an AI "why" line.

### 17. AI: hidden-information handled as assumptions and a belief list - chiriboga - S/M (idea only)
The AI asks `PlayerCanLook(player, card)` before using any card fact. Unknown cards are replaced by an assumed profile derived from public information only (opponent's money, counters on the card). It also keeps a belief list of the opponent's hand `{title, copies, uncertainty}`, raised when cards are seen and decayed when the hand changes, saved with the state.
- Verified in: `runcalculator.js` lines 46-93; `ai_runner.js` lines 405-470; engine notifications in `mechanics.js` lines 137, 249, 458, 613 and `phase.js` lines 1503-1509.
- Why: a kit AI must be given a "view" of the state with hidden zones masked; this shows the minimum that makes it play sensibly. The kit can enforce it by type (AI receives a redacted state), where chiriboga relies on discipline - it has a debug flag that reveals all cards and the comment notes the AI then plays differently.

### 18. AI: plan carried across prompts as a "preferred" record - chiriboga - S (idea only)
The AI is only ever asked "pick an index from this list of legal options" (`CommandChoice`, `SelectChoice`). When it decides on a multi-step plan it stores `preferred = {command, cardToInstall, serverToInstallTo, nextPrefs...}` and the following prompts are answered by matching that record against the options; if no match, it falls back and logs an error rather than crashing.
- Verified in: `ai_runner.js` lines 579-592, 1271-1330, 2834-2887; `ai_corp.js` lines 3186-3250; engine call sites `init.js` line 1707, `command.js` line 805.
- Why: the "choose index among legal options" seam is exactly right and ports unchanged onto a reducer's legal-action list; the plan record solves multi-prompt intentions without lookahead search.

### 19. State exported as a runnable set-up script; scripted tutorial reuses it - chiriboga - S (idea only)
A function dumps the current table as calls to `RunnerTestField(...)` / `CorpTestField(...)` plus property assignments, including the AI's beliefs; pasted back, it rebuilds the position. The tutorial is a list of `{phase id, action}` steps that calls the same field builders with a fixed seed. The bug log captures all console output and is downloadable.
- Verified in: `utility.js` lines 1-60 and 300-380, `decks.js` lines 230, 401 (signatures); `sets/tutorial.js` lines 1-60.
- Why: the kit already has saves, a tutorial engine and a bug reporter; the one addition is "export any live state as a test-scenario literal" so a bug report becomes a failing test by paste.

## NOT worth taking

- netrunner's async model (`wait-for`, `effect-completed`, eid registry: `src/clj/game/core/eid.clj`, macros). It exists because effects mutate an atom and pause for prompts; a pure reducer with a pending-decision queue already solves this more simply. Its own docs warn about it.
- netrunner card definitions as code (`src/clj/game/cards/*.clj`, 5-argument closures for req/effect/msg). Opposite of a data-driven effect language; no reading judge or clause inventory possible.
- netrunner state diffs per player (`src/clj/game/core/diffs.clj`), wait prompts, toasts, lobby, web, database tasks, i18n message maps, OpenAPI game API (`docs/jinteki-GameAPI-1.0.0.yaml`): netcode and multiplayer concerns.
- netrunner card import (`src/clj/tasks/fetch.clj`, `nrdb.clj`): tied to the NetrunnerDB feed; not read in detail.
- netrunner CI (`.github/workflows/ci.yml`): plain compile + test jobs, nothing the kit's templates lack.
- chiriboga engine (`phase.js`, `mechanics.js`, `command.js`, `checks.js`, `init.js`): global mutable state, callbacks, renderer objects stored inside card objects, AI state poked from rules code (`mechanics.js` calls `runner.AI.*` directly). The AI even mutates live game values to test hypotheticals and restores them afterwards (`_SetTemporaryValueModification`, `ai_runner.js` lines 1247-1266; `AIIceEncounterSaveState`, lines 6-28) - with copy-on-write state the kit never needs this.
- chiriboga AI numbers: every weight is a hand-set constant with comments such as "arbitrary" (`ai_runner.js` lines 1878-1983). No tests, no measured tuning. There is an AI-vs-AI "faceoff" URL switch (`init.js` lines 58, 110, 1695) but no harness that records results. The kit's seeded simulation pool is already better; just point it at an AI.
- chiriboga card names hard-coded in the AI (`ai_runner.js` lines 421-424, 1020; `runcalculator.js` lines 911, 944): the failure mode to avoid - keep all card knowledge in the per-card advice data.
- chiriboga `setgen/main.go`: scrapes card attributes and a community Elo rating per card; the Elo is used as a crude card-strength prior (`ai_corp.js` lines 438-441, `ai_runner.js` line 2146). Only relevant if an external rating exists for a game; otherwise nothing.
- chiriboga code itself under GPL-3.0: copying any of it would put GPL terms on the kit.

## What was actually read

netrunner - read in full or in the stated ranges: `CONTRIBUTING.md` (first part), `tests.edn`, `bin/test`, `bin/test-focus`, `.github/workflows/ci.yml` (first 80 lines), `LICENSE.txt` (head); `src/clj/game/core/engine.clj` lines 1-330, 352-376, 642-668, 880-1130, 1242-1330 plus a function outline of the rest; `checkpoint.clj`, `eid.clj`, `card_defs.clj`, `effects.clj` (full); `prevention.clj` 1-150; `payment.clj` 1-80; `costs.clj` 194-222; `schemas.cljc` 1-150; `diffs.clj` 1-60; `commands.clj` 64-80, 204-240 and the command table 488-659 (grep); `tasks/card_coverage.clj` (full), `tasks/remove_effect.clj`, `tasks/changed.clj` (first 130 lines), `tasks/sort_card_defs.clj`; `test/clj/game/test_framework.clj` outline plus lines 60-260, 373-480, 1147-1240, 1289-1332; `test_framework/asserts.clj` 1-130; `rewrite.clj` 1-130; `quotes_test.clj`; `scenarios_test.clj` 1-60; test counts per file; `docs/jinteki-GameAPI-1.0.0.yaml` first 25 lines.
netrunner - NOT read: the card files and card tests themselves (only grep counts and a few lines), `access.clj`, `runs.clj`, `installing.clj`, `ice.clj`, `moving.clj`, `flags.clj`, `prompts.clj`, `choose_one.clj`, `optional.clj` bodies, `say.clj`, replay storage, all `web/`, all ClojureScript UI, `DEVELOPMENT.md`, the GitHub wiki (not in the clone), most of `src/clj/tasks`.

chiriboga - read: `README.md`, `LICENSE` (head), file list and sizes; `runcalculator.js` 1-110 plus outline; `ai_runner.js` outline plus 405-470, 573-596, 1247-1330, 2824-2890 and grep hits for potential scoring; `ai_corp.js` outline (partly lost to output truncation) plus 3186-3250; `utility.js` 1-70, 300-380; `checks.js` 1-50; `sets/cheat.js` 1-40; `sets/tutorial.js` 1-60; two card definitions in `sets/systemgateway.js`; `setgen/main.go` 1-60; grep for AI call sites across all engine files.
chiriboga - NOT read: most of `ai_corp.js` (3,400 lines) and `ai_runner.js` bodies, `phase.js`, `mechanics.js`, `command.js`, `init.js`, `decks.js` bodies, `cardrenderer/`, the HTML/PHP launchers. Statements about the corp AI are therefore thinner than about the runner AI. "No tests" is based on the file list (52 files, none is a test) and a grep for test/assert terms.
