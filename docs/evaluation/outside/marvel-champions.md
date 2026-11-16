# Marvel Champions repos: what the game-kit could take

Surveyed 15 Nov 2026, read-only, nothing built or run. Paths are relative to each repo root
(local clones: `scratchpad/mc/a/r` and `scratchpad/mc/b/r`).

## The two repos

| | A: sdolle1775/marvel-lcg | B: quincarter/marvel-champions-digital-game |
|---|---|---|
| Stack | Python engine + web front end (TS/JS in `public/js`), PyInstaller build | TypeScript monorepo (pnpm): `content` -> `engine` -> `cards` -> `client` (Phaser 4), plus `mod-sdk` |
| Size | 5,016 .py (4,419 are one-file-per-card scripts), 178 files in `unit_test` | 5,976 .ts; engine 101k lines without tests; 838 engine, 1,287 cards, 827 client test files; 214 e2e files |
| Last commit | 8 Nov 2026 | 15 Nov 2026 (PR #739) |
| Licence | **None.** `ATTRIBUTION.md`: upstream "gave permission for modified builds" while a licence is finalised; no licence asserted. Treat as all rights reserved: ideas only. | **AGPL-3.0** (`LICENSE`). Ideas and patterns are free to re-implement; do not paste code into the kit unless the kit can live with AGPL. |
| Maturity | A working, shipped game (v1.3.4, 7 campaigns), but a community fork of someone else's engine. Cards are imperative Python closures over a mutable world; tests are replay fixtures plus mocks. Little that transfers to a pure-reducer, data-driven kit. | Very mature and the same shape as the kit: pure `applyCommand`, plain-data ability definitions, explicit resolution stack, seeded RNG in state, replayable command log, view models as pure TS. Heavily agent-built (CLAUDE.md, 10 agent definitions) with strict owner rules. Nearly everything of value is here. |

## Findings (all from repo B unless marked A)

Size: S = under a day, M = a few days, L = a week or more, for a re-implementation in the kit.

### Engine queries the UI asks instead of deciding itself

1. **"Why not?" exclusion codes for an open choice** (M)
   `whyNot` returns, for every card a prompt could plausibly have offered, the clause that excluded it, as codes not sentences (`wrongController`, `notEngagedWithYou`, `mustDefendWithAlly`...). It rebuilds the evaluation context from the stack frame the choice names, so `PendingChoice` needs no new field. The query filter itself exposes `explainQuery(state, id, query, context): QueryExclusion | null`, the first failing clause of a target query.
   Files: `packages/engine/src/why-not.ts`, `packages/engine/src/select.ts` (`QueryExclusion`, `explainQuery`, line 1355 and 1460).
   Why: "dim, don't hide" with a reason on every dimmed card, for any game, with one small code-to-words table in the client.

2. **Blocked targets on legal actions** (S)
   `legalActions` returns per action both `targets` and `blockedTargets: {instanceId, reason, message}` ("Why can't I attack Klaw?"), collected from the failed probes it already ran. An illegal action carries the engine's own reason and message.
   Files: `packages/engine/src/legal.ts` (lines 179-190, 280-283, 1085-1101), client reader `packages/client/src/view/highlights.ts`, `packages/client/src/view/inspect-model.ts`.

3. **Unavailable "choose one" options with a recorded reason, and the "only one option" notice** (S)
   Each barred option is recorded with `condition | cannotChoose | cannotPay | noTarget` (and for `noTarget`, what was missing, read at the time so later readers never re-judge it). When one option is left the engine takes it without asking and the client shows a notice listing every printed option, the taken one and each disabled one with why.
   Files: `packages/engine/src/choices.ts` (`OptionUnavailableReason`, `MissingTarget`, `UnavailableOptions`), `packages/client/src/view/option-notice.ts`.

4. **Outcome preview by probe** (M)
   `preview(command)` runs the command through the pure engine and throws the state away. The result is the probe's own event list plus before/after counters for the instances named, and a typed stop: `complete`, `choice`, `hiddenInformation` (stops rather than peeks), `rejected`. Never auto-answers a nested choice; forced triggers resolve, optional windows stop it.
   Files: `packages/engine/src/preview.ts`; client uses: `packages/client/src/view/interrupt-prevention.ts` ("PREVENTS 3 DAMAGE" stamped on an interrupt offer), `packages/client/src/view/payment-verdict.ts` (payment judged by playing the card out in the worker).
   Why: hover/confirm previews that cannot disagree with the engine and cannot leak hidden cards.

5. **Structured stack view** (S)
   A read-only row per resolution-stack frame (kind, subject card, event kind, interrupt/response half, stage, what it is awaiting, `openWindow` = the frame the open choice belongs to, recorded vars). No prose in the engine.
   Files: `packages/engine/src/stack-view.ts`, `packages/engine/src/stack.ts`.
   Why: a "what is resolving / what is queued" panel and a prompt header ("you are answering this one") for any game with nested triggers.

6. **Every choice names its frame, so the prompt can name its source and context** (S)
   `PendingChoice.frameId` lets the client derive which card and ability is asking, and for trigger windows what is about to happen (interrupt) or just happened (response), in the event's own fields and the printed text.
   Files: `packages/client/src/view/choice-source.ts`, `packages/client/src/view/trigger-window-context.ts`, `packages/client/src/view/villain-decision-notice.ts`.

7. **Decision authority tag on choices** (S)
   `DecisionAuthority = "player" | "firstPlayerTargets" | "firstPlayerOrders" | "enemyTeam"` on every pending choice: when the player decides on the automated side's behalf the prompt says which rule put the decision there. Constant instruction text and the quoted rule sit beside the type.
   Files: `packages/engine/src/choices.ts` (line 592 on), `packages/client/src/view/villain-walkthrough.ts`.
   Why: every solo game has "the bot's choice falls to you" moments.

8. **Outside facts as inputs** (S)
   Things no game state holds (did you win your last game, minutes away from the table) reach the engine only as setup input or as the answer to a `reportFact` choice in the command log, with one canonical spelling per number. The engine never reads a clock or profile, so replay holds.
   Files: `packages/engine/src/outside-facts.ts`, `packages/client/src/view/report-fact-entry.ts` (name seen, not read).

### Timing, triggers, modifiers

9. **Resolution stack of plain-data frames with a cursor; trigger windows as frames** (L, reference design)
   `state.stack[0]` is what resolves now; a `window` frame holds `TriggerCandidate`s (forced flag, played-from-hand flag, shared/together events) for the interrupt or response half and steps through order -> select -> pay. Suspends on a choice and resumes exactly.
   Files: `packages/engine/src/stack.ts`, `packages/engine/src/resolve/window.ts` (imports and header only read), `packages/engine/src/resolve/triggers.ts` (not read).
   Why: the cleanest worked model of simultaneous-trigger ordering and interrupts in a reducer I have seen; worth reading before the kit fixes its own timing-window vocabulary.

10. **"Entered play since" list on a pending trigger event** (S)
    A card that entered play after a triggering condition occurred does not answer it. Recorded lazily on the event (ids appended when a card enters while a response window is still to open), travels with the event, and shows in the log so a trace explains why a card got no response. Fails open where not handled.
    File: `packages/engine/src/entered-since.ts`.

11. **Dealt vs taken on damage events** (S)
    One resolved damage event carries `dealt`, `taken`, `amount`; the DSL validator refuses a damage trigger that names neither. Written up as an audit table of every damage trigger.
    Files: `docs/dealt-vs-taken-audit.md`, `packages/engine/src/trigger-events.ts` (not read beyond the doc's citation).

12. **Modifier records with origin, and lasting effects as data with typed durations** (M)
    `ActiveModifier {sourceInstanceId, stat, amount, origin: attachment|constant|lasting|rule, setBase?}`; `LastingDuration` union (`endOfPhase`, `endOfRound`, `endOfTurn`, `endOfEvent{frameId, ifCancelled}`, "until next X begins"...), including "if the event it waited on is cancelled, go back to waiting".
    Files: `packages/engine/src/modifiers.ts`, `packages/engine/src/lasting.ts`.
    Note: overlaps the kit's "cause on every numeric step"; the new part is the duration vocabulary and `ifCancelled`.

13. **"Treated as" kept in sync at the single card-move choke point** (S)
    A status-like type change (ally treated as minion, etc.) is derived from its causes and re-synced inside `relocateCard`/`leavePlay`, so it never lags a frame.
    File: `packages/engine/src/treat-as.ts`.

14. **Independent procedure audit over a recorded game** (M)
    `auditVillainPhases` replays a log and follows the automated side's phase from events with its own shadow state, deliberately not reusing the engine's phase code, and reports violations plus a readable per-phase trace (activations, cards dealt, decisions and who made them).
    File: `packages/engine/src/villain/audit.ts`.
    Why: a second implementation of the bot procedure as an invariant for the kit's fuzz/golden games, and the data behind a "why did the enemy do that?" view.

### Card authoring tooling

15. **Compiled-ability validator with cited opt-outs** (M)
    `validateDefinition` checks what types cannot: plain JSON only, well-formed triggers, labels match effects, every slot/var read was bound earlier. An exception is a named wrapper that requires a citation string and is stored as data (`allowUnlabeledAttack(def, {citation})`).
    File: `packages/cards/src/dsl/validate.ts`.

16. **Ability-fired trace by Proxy** (S)
    `traceAbilities(deps)` wraps the ability registry in a Proxy and records `considered` (looked up) vs `resolved` (its `.effects` were read to run). `expectResolved(trace, id)` kills vacuous card tests (two tests were green for months without the card ever being revealed).
    Files: `packages/cards/src/testing/trace.ts`, story in `docs/card-scripting-process.md` section 3.
    Note: related to the kit's self-proving rows but cheaper and works per assertion.

17. **Three generated lookup commands: `refs`, `card`, `dsl`** (M)
    `pnpm refs`: scripted vs unscripted ability refs per pack, with a paste-ready skip list. `pnpm card <id>`: one card's printed text, errata flagged loudly ("script THIS"), every ability ref with whether it resolves and where. `pnpm dsl <word>`: search all builder names, signatures and doc comments. All generated from source on each run, kept outside the test glob so a report cannot fail the suite.
    Files: `docs/card-scripting-process.md` section 5, `packages/cards/tools/card-brief.test.ts`, `dsl-index.test.ts`, `refs-report.test.ts` (existence checked, bodies not read), `packages/mod-sdk/scripts/dsl-reference.mjs`.
    Why: direct token savings for card workers; deterministic answers.

18. **One ability-ref enumerator plus a registry guard with reasoned skips** (S)
    A single `abilityRefIds` implementation (ten divergent copies had under-counted flip sides), and one test: every ref on every playable card is registered, exemptions only via each module's `_SKIPPED` map with a reason. The doc proposes a staleness check on skip reasons (4 of 15 "blocked" refs were no longer blocked).
    Files: `packages/cards/src/ability-refs-registered.test.ts`, `docs/card-scripting-process.md` sections 3 and 6.

19. **Scenario-reach staging helpers and a real-card bench** (M)
    Named helpers for getting a test to the point a card can act (`stackSetAsideBehindBoost` etc., each a hard-won fact about turn structure), and a bench that conjures any pool card into hand/play by relabelling a deck card and answers choices from a small `Picks` description.
    Files: `packages/cards/src/testing/staging.ts`, `packages/cards/src/testing/qa-bench.ts` (headers read).

20. **"Cards outside their home deck" and real-decklist fixtures** (M, only for deck-building games)
    Each card is also played from another hero's deck; saved public decklists are test fixtures that must import, be legal and play a seeded greedy game that replays deep-equal; the same fixtures are the in-app recommended decks, so a deck cannot be listed untested. Content-derived set x scenario matrix with soak runs.
    Files: `docs/custom-deck-testing.md`, `docs/wave-definition-of-done.md`, `packages/cards/src/testing/modular-matrix.ts`.

21. **Pack validation with issue categories** (S)
    Pack validator splits real defects from `"unscripted-ability"` (well formed, script not written yet), so imported card data can be listed honestly. The client shows "N / M cards live" from the same predicate.
    Files: `packages/mod-sdk/src/validate.ts` (header read), `packages/client/src/view/card-pool-coverage.ts`.

### Client and table UI (pure view models; Phaser-specific drawing not relevant)

22. **Undo gated by an event allowlist typed over the whole event union** (S)
    `UNDO_EVENT_VERDICTS: Record<GameEvent["type"], [allowed|stops|checked, reason]>`: a new event type fails the typecheck until classified. Second gate: RNG draw count before/after each command. Variants built on the same rewind: "Back out" of a half-resolved play, and "Nevermind" after End turn while nothing new has been shown.
    Files: `packages/client/src/view/undo.ts`, `packages/client/src/view/back-out.ts`, `packages/client/src/view/end-turn-takeback.ts`.
    Note: the kit has undo; the allowlist-by-type and the three take-back windows are the new part.

23. **Peek at table from a full-screen decision** (S)
    The decision sheet steps aside to a compact banner (question + way back, movable edge) so the player can look over the whole table mid-choice.
    File: `packages/client/src/view/choice-peek.ts`.

24. **Automated-phase walkthrough and "what changed" recap from one command's events** (M)
    The engine runs the whole enemy phase in one command; the client reconstructs steps from the event stream, pauses where a choice was parked, and ends on recap tiles (before/after per threat, HP, deck, first player) using the log's own wording.
    Files: `packages/client/src/view/villain-walkthrough.ts`, `packages/client/src/view/villain-recap.ts`.

25. **Game log wording rules, per-card history, export** (S each)
    Log lines: null for bookkeeping events, round.beat numbering, status tags inline and struck through when spent. "This card, this game": a second fold over the same events per card instance, one line per command, reusing the log's wording. Full-log text export.
    Files: `packages/client/src/view/log-lines.ts`, `packages/client/src/view/card-history.ts`, `packages/client/src/view/log-export.ts`.

26. **Beats: number + place** (S)
    Per command, plain data "-4 over Rhino", "+2 THREAT over the scheme", "STUNNED over the minion"; the scene only knows where the card is. Piles sit beside the hand so draws and discards have an anchor to fly from/to.
    Files: `packages/client/src/view/beats.ts`, `packages/client/src/view/hand-row.ts`.

27. **Short refusal tags pinned to engine messages** (S)
    Hand-card tag ("no target", "needs X") is read from the engine's message through a table; a test lists every engine message mapped, so an engine wording change fails the test instead of silently changing the tag. Unknown reads as neutral "can't play".
    File: `packages/client/src/view/hand-reason.ts`.

28. **Guide extras beyond a scripted tutorial** (M)
    Replay-safe stacked decks as a setup option (not state surgery); "Hold on!" warnings before a losing End turn / flip / wasted payment, each with its own "don't warn again"; opportunistic tips with pacing (one per turn, opening-turn hold); round debrief; "How this works" one-line notes for easily misread cards; `[[term]]` / `[[term|label]]` glossary markup; hard rule that every guide surface has Skip and Stop.
    Files: `docs/guided-mode.md`, `packages/client/src/view/hold-on-model.ts`, `tip-schedule.ts`, `round-debrief-model.ts`, `how-this-works.ts`, `term-text-model.ts`.
    Note: check against the kit's tutorial engine; the warnings, tip pacing and term markup are the likely gaps.

29. **Crash and freeze nets** (S)
    Frame guard: an exception in one tween/timer removes that tween, not the render loop. Startup watchdog: a DOM panel when the canvas cannot draw. Debug dump shortcut (works in production): JSON of what each screen and the store believe, attached to the issue report with setup + commands.
    Files: `packages/client/src/ui/frame-guard.ts`, `ui/startup-watchdog.ts`, `ui/debug-dump.ts`, `ui/error-log.ts`, `packages/client/src/view/issue-report.ts`.
    Note: the kit has a bug reporter; the per-screen `debugState()` snapshot is the addition.

30. **Dev fixture jumps built by real commands + screenshot script** (S)
    `?screen=board&fixture=<name>` loads a dev game played forward with engine commands (so it replays like a save), about 45 named fixtures; `shoot-app.mjs` screenshots a screen at named sizes after clicks/keys/hover/hold, or as a burst of frames for motion.
    Files: `packages/client/src/store/dev-game-steps.ts`, `packages/client/src/engine/dev-state-host.ts`, `scripts/shoot-app.mjs`.
    Note: overlaps the kit's prompt gallery and run-game skill; the frame-burst option and fixtures-by-commands rule are the takeaways.

31. **Small input rules** (S)
    No tap on finger lift (press and release on the same control within slop, with a tap router that survives a redraw); `summaryWithin` (longest run of whole sentences that fits N lines); Escape/Enter meaning as pure functions so the on-screen hint only promises what will happen; deck-builder hypergeometric odds.
    Files: `packages/client/src/ui/tap.ts`, `view/summary-fit.ts`, `view/escape-meaning.ts`, `view/primary-activation.ts`, `view/deck-odds.ts`.

### Process

32. **Affected-tests plan shared by CI and local** (S)
    One module maps changed paths to the test projects to run, following the one-way import direction (content -> engine -> cards -> client; later card waves only).
    Files: `scripts/lib/test-plan.mjs`, `scripts/test-affected.mjs`, `scripts/ci-test-plan.mjs` (not read).

33. **Card-scripting cost write-up and wave definition of done** (S, reading)
    Measured account of where card scripting time goes (reaching the state in a test, rules research, decaying bookkeeping) and a checklist per content wave.
    Files: `docs/card-scripting-process.md`, `docs/wave-definition-of-done.md`.

### From repo A (ideas only, no licence)

34. **Numbered timing "play labs"** (S)
    Sixteen saved checkpoints, each a real-card situation that stops inside one timing question (forced order, cancel + surge, nested reveal/attack/defence, keyword priority), regenerated and validated by one script and loadable for manual play.
    Files: `v18_timing_harness.py`, `game/test/v18_timing_harness.py`, `replays/v18_timing/` (file names read).
    Why: a named, loadable set of the hard timing cases is a good companion to the kit's prompt gallery.

35. **Headless device that returns the exact prompt the UI would get** (S)
    Tests drive the normal controller with supplied choices or stop on a prompt and inspect the wire descriptor.
    File: `game/test/headless.py`. (The kit's runner likely covers this.)

36. **Debug console and card debug menu** (S)
    `&debug` URL flag: right-click card menu, `~` console with history and commands (`gain <card>`, `discard`, `goto turn_begin|end`, `step`, `skip`, `undo`, `save`/`load`, `comment` to annotate a replay, coverage and profile reports).
    Files: `docs/debug_guide.md`, `game/cheat/cheat.py` (function names only), `game/puzzle/puzzle.py` (first 40 lines).
    Why: replay annotation (`comment`) and a restricted puzzle/setup API are the only parts not obviously in the kit.

## Not worth taking

- **Repo A's engine and card scripts**: imperative Python closures on a mutable world (`cards/pack/**`), messages patched in tests with mocks; opposite of a pure reducer with data effects. No licence.
- **Repo A's UI**: DOM/jQuery-style TS (`public/js/marvel/*`), per-card auto-activate and auto-target toggles are game-specific conveniences.
- **Repo B's Phaser widget layer** (`packages/client/src/ui/*` drawing, rexUI, text painter workers, bitmap caches): the kit is React.
- **Controller/gamepad, couch mode, Discord presence, achievements, comic reader, music jukebox, campaign screens**: product features, not kit.
- **Mod store, pack registry, sync worker, R2 publishing, Tauri/Capacitor packaging**: out of scope (private, single-owner games; netcode excluded).
- **MarvelCDB ingestion and scan pipelines**: specific to that data source.
- **The engine's size itself**: 8,000-line `actions.ts`, 6,600-line `spec.ts` with one field per card quirk. A warning as much as a model: the vocabulary grew a field per card. Take the query surfaces (1-8), not the spec.
- **Repo B's agent setup and git discipline** (shared-index commits, `--no-verify` with several agents in one tree): the kit already uses worktrees per worker, which avoids the problem.

## What I read and did not read

Read in full or at length: A `README.md`, `ATTRIBUTION.md` (first lines), `docs/debug_guide.md`, first 140 lines of `docs/engine_architecture.md`, TOC of `docs/card_scripting_guide.md`, one card script (`cards/pack/aos/baron_zemo/50169a.py`), first 50 lines of `game/test/headless.py`, `unit_test/test_deadly_sai.py`, `game/test/v18_timing_harness.py` (first 60 lines). B `CLAUDE.md` (all), `docs/project/architecture.md`, `docs/card-scripting-process.md` (all), `docs/guided-mode.md` (first 90 lines), `docs/wave-definition-of-done.md` (first 70), `docs/custom-deck-testing.md` and `docs/dealt-vs-taken-audit.md` (first 25 each).

Read as header/doc comment only (first 13-75 lines, plus greps): every B source file cited above. I did not read function bodies beyond those excerpts, so the findings describe the documented design, not verified behaviour.

Not read: B `PLAN.md` (254 KB), `AGENTS.md`, `CONTRIBUTING.md`, `.claude/agents/*` and `.codex/agents/*` bodies, `.github/workflows/*`, `.githooks/*`, the e2e specs, `packages/content` schema and ingest scripts, `packages/engine/src/{actions,spec,select,abilities,events,rules}.ts` bodies, `resolve/*` other than `window.ts` imports, the engine `testing/` folder bodies, all campaign code, the rulings docs. A: `game/ability`, `game/selector`, `game/effect`, `game/buff`, `engine/controller` (undo/replay modules), most of `unit_test`, the CI workflow, `editor/`.
