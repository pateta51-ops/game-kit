# halogenandtoast repos: what the game-kit could take

Survey date 15 Nov 2026. Read-only; nothing was built or run. Paths are relative to
`C:/Users/user/AppData/Local/Temp/claude/9919beaa12ed540b/c699a2b7-d212-4f36-8f5e-0e540f485c47/scratchpad/hat/`.

## Licences

| Repo | Commit | Licence |
|---|---|---|
| ArkhamHorror | 3eab026 (14 Nov 2026) | No LICENSE file found; no licence line in README or `backend/arkham-api/package.yaml` (grep). Treat as all rights reserved: take ideas, copy no code. |
| MarvelChampions | 3540be7 (10 Nov 2026) | No LICENSE file; no licence line in README or `package.yaml` (grep). Same: ideas only. |
| LordOfTheRings | 0fec8a0 (11 Nov 2026) | `LICENSE` is BSD-3-Clause, but it is the unedited stack template ("Copyright Author name here (c) 2023"). Code could be copied with the notice; in practice it is Haskell, so only ideas port anyway. |

Everything below is a pattern to re-implement in TypeScript, not code to copy.

## What I read, and what I did not

Read in full or nearly: `LordOfTheRings/CLAUDE.md`, `MarvelChampions/CLAUDE.md`, Arkham
`docs/game-log/README.md`, `ADDING-A-MACHINE.md`, `STATE-OF-PLAY.md` (sections 1-6 partly, 8-10),
`frontend/harness/README.md`, `backend/Checklist.md`, `frontend/translation-reference/README.md` (head),
`frontend/src/arkham/ghostAbility.ts`, `MarvelChampions/test/Marvel/Rules/AbilityWindowSnapshotSpec.hs` (head),
`MarvelChampions/src/Marvel/Message/Lifted/Queue.hs`, `tools/generate-when-revealed.py`.

Read in part (heads, type declarations, signatures only): Arkham `Question.hs`, `Window.hs` (first 120 lines),
`Message.hs` (constructor grep and three ranges), `Game/Runner.hs` (Would/CancelBatch handlers), `Game.hs`
(Simultaneously handler), `Helpers/Window.hs` (wouldDo), `Ability/Limit.hs` (grep), `Classes/HasQueue.hs`
(signatures), `Custom/Steps.hs` and `Custom/Expr.hs` (module headers and key names), `docs/step-storage.md`
(first 7 KB), `docs/homebrew.md` (first 6.5 KB), `docs/game-log/FINDINGS.md` (first 6 KB),
`mcp/arkham-cards/README.md` (first 9 KB), `mcp/references/engine-gotchas/INDEX.md` (first 3.5 KB),
`backend/validate/app/Main.hs` (first 200 lines), `tests/TestImport/New.hs` (signatures),
`tests/Arkham/Asset/Assets/JimsTrumpetSpec.hs`, `Debug/SandboxSpec.hs`, `MissingCustomCardSpec.hs`,
`Log/NarratorSpec.hs`, `frontend/tests/localeKeyReferences.test.mjs`, `localeIconPlaceholders.test.mjs`,
`frontend/src/arkham/debug.ts`, `logTranscript.ts`, `chaosBagOdds.ts` (heads), `.github/workflows/haskell.yml`;
Marvel `test/TestImport.hs` (signatures), `SmokeSpec.hs` (first 120 lines), `CoverageSpec.hs`,
`JsonCompatibilitySpec.hs`, `PublicSpec.hs`, `tools/replay-smoke-answer.hs`, `Message/Lifted.hs` (insteadOf only),
`.agents/skills/implement-hero/SKILL.md` (first 90 lines), `data/cards/README.md`, `docs/rules/README.md`,
`frontend/e2e/smoke.spec.ts`, `card-debug.spec.ts` (heads); LOTR `tools/BuildSmoke.hs` (head),
`PlayerCardTextSpec.hs` (head), `.claude/commands/herd-issues.md` (head).

NOT read: any card implementation module (about 9,500 Arkham library files); `Modifier.hs`; `Matcher` modules;
`Ability/Types.hs`; `Log/Narrator.hs` and `Log/Entry.hs` source (only the docs about them); `Custom/Ability.hs`,
`Custom/Schema.hs`; `app-replay/Main.hs` beyond its flag list; any Vue component (`Question.vue`, `GameLog.vue`,
`LogPart.vue`); `mcp/arkham-cards` Python (`extract_dsl.py`, `tools.py`) and its `guide/*.md` (the output was cut
before them); the 307 engine-gotcha notes themselves; `docs/game-log/JOURNAL.md`, `multi-seat-barrier.md`,
`game-archiving.md`, `campaign-overlays.md`, `card-watermarking.md`; `frontend-3ed`; `backend/ah3e`; LOTR
`src/` entirely; Marvel `Game/Public.hs`, `Log/Narrator.hs`. Claims about those rest on the docs and tests that
describe them, and are marked "per docs" below.

---

## Findings worth taking

### 1. Log derived from the engine event stream (the "narrator")
One function maps each engine message to an optional log entry, called by the runner just before the message
runs; cards and rules write no log lines. Arkham measured the alternative: 39 hand-written log sites across 5,634
card files, 0.7% coverage. Rules kept by the module: silence is the default (about 64% of messages are plumbing,
so there is no catch-all), the match is pure so non-narrating messages cost nothing, a narration may not push,
throw or assume an entity still exists, and wrapper copies (when/after/would) of the same occurrence are not
narrated.
- Verified in: `ArkhamHorror/docs/game-log/README.md`, `STATE-OF-PLAY.md`, `ADDING-A-MACHINE.md`;
  `ArkhamHorror/backend/arkham-api/tests/Arkham/Log/NarratorSpec.hs`; restated as a rule in
  `LordOfTheRings/CLAUDE.md` and `MarvelChampions/CLAUDE.md` (`narrationFor`, "Cards write nothing").
- Why: the kit's effect records already pass through one runner; a single reviewable table from record kind to
  sentence gives every new game a complete log on day one and keeps "screen text matches engine" true by
  construction.
- Size: M. Licence: none (Arkham, Marvel), BSD-3 (LOTR).

### 2. Structured log entry model
An entry is data: `seq` (monotonic id and paging cursor), `step` (the undo point it was written under), `kind`
(Structure, Action, Mechanic, Test, Narrative, Record, Notice, Problem), `body` as typed parts (text, i18n key
with vars that are themselves parts, entity ref chip, number, signed delta, token, icon, locale-joined list),
`source` (the cause, as a ref rather than prose), `tone` (good or bad), `audience`, `tag` (for later retraction,
e.g. commit then uncommit). No names are resolved by the engine; the client resolves refs from card data.
- Verified in: `ArkhamHorror/docs/game-log/README.md` ("The entry model"), `STATE-OF-PLAY.md` section 2.
- Why: one renderer path, localizable sentences that keep clickable card chips, and "why" available as data.
  Complements the kit's cause-on-every-numeric-step.
- Size: M.

### 3. Log grouping by id on flat, append-only rows
Composite events (a skill test, a card play) are shown as one block, but rows are never edited: each row carries
a group id and a role (header, member, summary) and the renderer collects a run sharing an id. The doc records
that the earlier design (mutating a parent row to add children) caused three duplication bugs, a frozen block
and broken undo, all impossible once rows were immutable; undo then needs no special handling.
- Verified in: `ArkhamHorror/docs/game-log/STATE-OF-PLAY.md` sections 2, 5, 8.1, 8.9.
- Why: fits copy-on-write state and undo directly. Related rule (8.4): context that must outlive a player
  question belongs in game state, not in a per-action logger.
- Size: S on top of finding 2.

### 4. "Undo back to this log line"
Every entry is tagged with the step number the game was on before the action; all entries from one action share
it, so rewinding to an entry always rewinds a whole action. The control appears on hover of top-level entries
with a confirmation naming the line, and is off in the replay viewer.
- Verified in: `ArkhamHorror/docs/game-log/README.md` ("Undo back to an entry"), `STATE-OF-PLAY.md` section 5.
- Why: the kit has undo and a step-indexed save; this is a small UI on top that makes long undos precise.
- Size: S.

### 5. Plain-text transcript rendered by the client, and a replay `--log`/`--trace` mode
The export-log feature renders the same entries, groups and resolved names as the panel, in the client, because
that is where the locale strings are; pictures become names. The replay tool can print narration indented beside
the messages that produced it, so a whole game's log is a diffable file a test can assert on.
- Verified in: `ArkhamHorror/frontend/src/arkham/logTranscript.ts` (header comment),
  `docs/game-log/README.md` ("Verification"), `ADDING-A-MACHINE.md` ("Check it"); flags in
  `backend/arkham-api/app-replay/Main.hs`.
- Why: a golden game can also pin its log text; the transcript doubles as bug-report attachment.
- Size: S.

### 6. Log wording rules
Terse, present tense, no filler ("Daisy fails by 2."). All English in one locale file so the corpus is reviewed
in one place. Action keys are transitive phrases built for `{verb} {target}`; a var named `count` drives
pluralization so name it otherwise when there are no plural branches; a var may not share a name with an icon
placeholder (it is silently never substituted, cost them an hour); an extra cost is attributed to its card
("+1 action from Frozen in Fear") or not mentioned at all.
- Verified in: `ArkhamHorror/docs/game-log/ADDING-A-MACHINE.md` ("Rules the module keeps"),
  `STATE-OF-PLAY.md` sections 8.8, 8.11 and "Open work".
- Size: S (a checklist plus one test, see finding 12).

### 7. Cancellable "would" batches for replacement and cancel effects
An effect that can be interrupted is queued as `Would batchId [would-window checks..., DoBatch batchId effect]`.
A cancel is `CancelBatch id`: it removes every queued message of that batch and strips that batch's windows from
pending window checks; `IgnoreBatch` drops the effect but leaves the windows. One effect may open several would
windows sharing one batch ("search a deck" and "dig the encounter deck"), so cancelling from either cancels it.
Marvel's simpler form is `insteadOf matcher body` (replace the first queued message matching with what the body
would do) and `afterMatching`. A recorded bug: after a cancel, the "current batch" marker must also be cleared or
every later window is stamped with a dead id.
- Verified in: `ArkhamHorror/backend/arkham-api/library/Arkham/Helpers/Window.hs` (`wouldDo`, `wouldDoAny`),
  `Arkham/Game/Runner.hs` lines ~2436-2470, `Arkham/Message.hs` (`Would`, `CancelBatch`, `IgnoreBatch`,
  `DoBatch`, `Instead`); `MarvelChampions/src/Marvel/Message/Lifted.hs` (`insteadOf`, `afterMatching`);
  `MarvelChampions/CLAUDE.md` (`damageIdentity`, `placeThreatOn` so interrupts can answer).
- Why: a generic, data-only answer to "instead" and "cancel" in the kit's effect language: tag the effect's
  records with a batch id, let a cancel record remove by id.
- Size: M.

### 8. Naming convention: a helper that skips its window says so
Every effect goes through a helper that opens the proper timing window; the rare variant that must not is named
for it (`revealEncounterCardWithoutWindows`, `placeThreatWithoutWindow`). Pairs with "damage always goes through
`damageIdentity`" so interrupts are never bypassed.
- Verified in: `MarvelChampions/CLAUDE.md` ("The lifted layer", "The engine").
- Why: a lint-checkable rule for the kit's effect builders; missing windows are the commonest silent card bug.
- Size: S.

### 9. Window identity, condition tick and per-ability triggering snapshot
A window is (timing: when/at/after/cancel, type, batch id); equality ignores bookkeeping fields because ability
limits compare recorded windows with open ones and the recordings are saved. A "condition tick" pins when the
triggering condition began, for after-windows built before they are checked. Marvel snapshots the triggering
window into the ability's payment record so two handlers reacting to one occurrence each read their own payload,
with a test that an old save lacking the field still loads.
- Verified in: `ArkhamHorror/backend/arkham-api/library/Arkham/Window.hs` (lines 1-60),
  `Arkham/Ability/Limit.hs` (PerWindow, PerTestOrAbility, PerRound...; group/player/per-investigator limits);
  `MarvelChampions/test/Marvel/Rules/AbilityWindowSnapshotSpec.hs`.
- Why: "once per window" limits and reactions that need the triggering event's data are generic needs.
- Size: M.

### 10. Simultaneous effects: run each, capture its follow-ups, then interleave
`Simultaneously [msgs]` saves the rest of the queue, runs each sub-message through the full pipeline with an empty
queue, captures what each one pushed, then restores the queue with the captured follow-ups in front. Marvel's
`captureQueueT` does the same for simultaneous damage: each instance applies before the next taken-damage window,
but after-windows and defeat wait until the whole group has landed. Note the trap they hit: observers (the log)
must also be called for the sub-messages.
- Verified in: `ArkhamHorror/backend/arkham-api/library/Arkham/Game.hs` lines ~7259-7300;
  `MarvelChampions/src/Marvel/Message/Lifted/Queue.hs`; `ArkhamHorror/docs/game-log/STATE-OF-PLAY.md` 8.2-8.3.
- Why: a precise, portable definition of "simultaneously" for a reducer: apply all, then resolve consequences.
- Size: M.

### 11. Question model: a small set of question kinds, typed choices, composable wrappers
Questions are few kinds (choose one, choose N, up to N, some, one-at-a-time with an auto option, one from each
group, amounts with min/max/total target, payment amounts, read-and-choose, dropdown) over choices that are typed
by what the UI should light up (target, card, ability, token component on an entity, skill, label, invalid label
shown disabled, tooltip label, Done, skip-triggers). Wrappers add context to any question: a label plus the cards
the prompt is about, a "Pay cost" header, and the source to highlight on the board. Empty questions are never
asked; a "choose or run" variant takes a lone choice without asking. Marvel sends the client choices as
`{index, kind, target, label}` and both tests and the client find a choice by its target.
- Verified in: `ArkhamHorror/backend/arkham-api/library/Arkham/Question.hs`; `LordOfTheRings/CLAUDE.md`
  (`chooseOneM`, `questionLabeled`, `causedBy`, `chooseOrRunOneM`); `MarvelChampions/CLAUDE.md`;
  `MarvelChampions/frontend/e2e/card-debug.spec.ts` (choice shape).
- Why: check the kit's prompt kinds against this list (amount distribution with a total, disabled-with-reason
  choices, source highlight and "cards this prompt is about" are the ones most often missing).
- Size: S to compare, M if several kinds are missing.

### 12. Ghost card for an ability whose source has left play
If a choice is an ability whose source entity is no longer on the board, the client opens a modal and shows the
ability on a ghost image of the card, since there is nowhere on the table to hang the button.
- Verified in: `ArkhamHorror/frontend/src/arkham/ghostAbility.ts`.
- Why: every game with "after this is discarded" triggers hits this; pairs with the kit's
  every-legal-action-reachable-in-UI test as the fix when that test fails.
- Size: S.

### 13. Locale tests: every key the engine emits resolves; icon placeholders survive
One test scans engine source for absolute i18n tokens and checks each against the real merged English messages
(not the raw JSON, because aliasing happens at load), since a missing key shows the raw key to the player; seven
cards shipped that way. A second pins that `{icon}` placeholders are not eaten by the i18n library's
interpolation. A third file hash-locks imported translations against the English they were made from, flagging
stale translations (they note the translation-side hash is a nuisance).
- Verified in: `ArkhamHorror/frontend/tests/localeKeyReferences.test.mjs`, `localeIconPlaceholders.test.mjs`,
  `frontend/translation-reference/README.md`. Not read: `localeMarkup.test.mjs`, `scripts/check-locale-markup.cjs`.
- Why: generic for any game whose engine emits label and log keys.
- Size: S.

### 14. Card data validation against the community database
A separate program loads the public card database JSON and compares every implemented card: unknown code,
missing implementation, and mismatches in name, quantity, uniqueness, cost, class, skill icons, traits, victory,
XP, enemy stats and damage, asset health, shroud, clues; with a small table of known database errors
(`normalizeName`). Marvel has the lighter `CoverageSpec` (every code in the implemented packs has an
implementation) and a note that the database itself has errors, so printed card and errata win.
- Verified in: `ArkhamHorror/backend/validate/app/Main.hs` (first 200 lines);
  `MarvelChampions/test/Marvel/CoverageSpec.hs`; `MarvelChampions/.agents/skills/implement-hero/SKILL.md` step 1.3.
- Why: the kit has printed-line ownership; this adds a field-by-field stats diff against an independent source
  with an explicit, reviewed override list.
- Size: S-M per game (generic harness, per-game field map).

### 15. Facts derived from card text by generator, with a printed-override list
A script scans card text for a labelled ability ("When Revealed") and writes the set of card codes the engine
consults, with a regex tolerant of the database's misspellings and a hand list for cards whose printed text is
missing from the dump. Siblings exist for when-defeated, errata and attachment abilities (not read).
- Verified in: `MarvelChampions/tools/generate-when-revealed.py`.
- Why: cheap cross-check for the kit's clause inventory: a generated "cards that have clause X" set compared with
  the cards whose effect data declares X.
- Size: S.

### 16. Imported-scan card records keep raw OCR beside reviewed text
For cards not in the database, each record stores the reviewed rules text with a `textVerified` flag and the
untouched `ocr.rawText`, the source filename, quantity for repeated physical copies and `aliases` so old codes
keep working. Rulebooks are cached locally with URL, byte count and SHA-256 and a `--check` mode.
- Verified in: `MarvelChampions/data/cards/README.md`, `docs/rules/README.md`. Scripts themselves not read.
- Why: mostly dossier territory, but `aliases` (stable ids across re-imports) and the verified flag are useful in
  the kit's content-pack schema.
- Size: S.

### 17. Missing-card stand-in instead of a crash
A card whose definition is gone is replaced by a marked stand-in definition, so it "costs that one card rather
than the game"; a test builds every entity kind from the stand-in after one kind crashed for lack of a default.
- Verified in: `ArkhamHorror/backend/arkham-api/tests/Arkham/MissingCustomCardSpec.hs`.
- Why: saves and replays survive a card being renamed or removed from the pack; gives the bug reporter something
  to name.
- Size: S.

### 18. Validator for a data-driven card language that fails silently
Arkham's custom cards are JSON steps and expressions decoded when run; a wrong shape is never an error, the
ability just vanishes. Their answer: (a) `validate_card` checks a definition against the engine's types before it
is saved (it found 5 real errors in 44 shipped cards, two with abilities that had never worked); (b) the
reference grammar is extracted from the engine source by script and never committed, and the extractor fails
loudly if its anchor is renamed; (c) the reference records where each key is read, which decoders default which
fields, and the bindings each entity gives for free. The step language itself has `bind`/`let`, `if`/`case`,
`forEach`, `repeat`, `choose`, `query` with modes, `onSuccess`/`onFailure`, `optional`, `cancelBatch`, and an
expression language where an operator with `of` maps over a list.
- Verified in: `ArkhamHorror/mcp/arkham-cards/README.md`; module headers and key names of
  `backend/arkham-api/library/Arkham/Custom/Steps.hs` and `Custom/Expr.hs`. Not read: the Python tools, the step
  handlers.
- Why: the kit's effect language has the same failure mode. Take: strict decode with "unknown key" and "key in the
  wrong place" errors, a generated (not hand-written) grammar reference for workers, and a `Deferred steps`
  record for effects that must re-read the board after an earlier choice (Arkham `Message.hs` ~line 1420).
- Size: M.

### 19. Test DSL details
(a) `errata "..."` and `faq "..."` wrap a group of tests so the ruling source is in the test name.
(b) `withRewind` runs a block on a clone of the game and discards it, for "and if instead" branches in one test.
(c) `assertRunsMessage` / `assertDoesNotRunMessage` and `createMessageChecker` watch the stream for an event.
(d) `assertChanges getter before after body`. (e) negative helpers: `assertNotPlayable`, `assertNoReactionOf`,
`assertNotTarget`, `assertCannotStartSkillTest`, `assertMaxAmountChoice`. (f) keyword one-liners that generate a
whole spec: `isHunter def`, `isFastAsset def`, `discardedWhenNoUses def`, `maxCommittedPerSkillTest n def`.
(g) Marvel plays "as a player would": `choose "what" predicate` and `offers predicate` over the open question
with predicates `isPlay`, `isTargetChoice`, `isAbilityOf`, `isLabel`; `showAsked` prints the open question;
`stackDeck`, `setEncounterDeck` fix draws.
- Verified in: `ArkhamHorror/backend/arkham-api/tests/TestImport/New.hs` (signatures, lines 462-625),
  `tests/Arkham/Asset/Assets/JimsTrumpetSpec.hs`; `MarvelChampions/test/TestImport.hs` (signatures).
- Why: (a), (b), (e) and (f) are cheap and generic; the kit's harness may already have (c), (d), (g).
- Size: S each.

### 20. Random-play smoke run extras
Beyond seeded random answers (which the kit has): every question also builds and serializes the client view, so
a view crash is caught; "end turn" is picked rarely so cards get played; a "hasten" mode defeats the boss every
150 answers so late stages are reached; on failure the state before the failing answer is saved (game, queue,
RNG, player, choice) and a small tool replays that single answer and prints the fifteen slowest message
intervals and the view size; env vars focus the run on the decks or sets touched. LOTR has a script that emits a
byte-for-byte trace of fixed seeds to diff two revisions.
- Verified in: `MarvelChampions/test/Marvel/SmokeSpec.hs` (first 120 lines), `tools/replay-smoke-answer.hs`,
  `MarvelChampions/CLAUDE.md`; `LordOfTheRings/tools/BuildSmoke.hs` (head).
- Why: hasten mode and "render the view on every step" are the two the kit's fuzz most likely lacks; the
  one-answer replay with timings is a ready perf-triage tool.
- Size: S each.

### 21. Save-compatibility tests for changed shapes
When an entity's saved shape changes, a test loads the old shape (hand-built legacy JSON, or the new JSON with
the new key deleted) and round-trips the new one; new fields default when absent.
- Verified in: `MarvelChampions/test/Marvel/JsonCompatibilitySpec.hs`, `AbilityWindowSnapshotSpec.hs` (second
  test); `ArkhamHorror/backend/arkham-api/tests/Arkham/Debug/SandboxSpec.hs` (`loadsBagWithoutSandboxField`).
- Why: the owner's rule is no old-save fixing until a game is complete, so this is for after 1.0; noted because
  the pattern (delete the key, assert the default) is one line per field.
- Size: S, later.

### 22. Debug and cheat tools as engine messages
Debug actions are ordinary messages (`DebugAddToHand`, forced token draws, set values on a card), so they are
undoable, replayable and testable. Arkham: a token "sandbox" that draws without triggering anything and feeds an
odds calculator; per-scenario debug counters declared as a small table; drag a card anywhere. Marvel: long-press
a card to edit damage, counters and statuses, with tests that an edit keeps the waiting question, that invalid
edits are rejected atomically, and that debug edits do not write misleading log lines.
- Verified in: `ArkhamHorror/backend/arkham-api/library/Arkham/Message.hs` (Debug* constructors),
  `tests/Arkham/Debug/SandboxSpec.hs`, `frontend/src/arkham/debug.ts`;
  `MarvelChampions/test/Marvel/PublicSpec.hs`, `frontend/e2e/card-debug.spec.ts`.
- Why: a generic "edit this entity" debug dialog and "force next random result" action speed up every card
  check and bug reproduction; the three test properties are the reusable part.
- Size: M.

### 23. Outcome odds shown before a random draw
The client computes the chance the next draw succeeds, mirroring the engine's success rule, recursing over
remaining counts (not sequences) for tokens that chain another draw, with a depth cap.
- Verified in: `ArkhamHorror/frontend/src/arkham/chaosBagOdds.ts` (first 30 lines).
- Why: any solo game with a bag, deck or dice can show odds; it is one of the "better than the table" features.
  The caution is the mirrored rule: in the kit it should call the engine's own function, not copy it.
- Size: S-M per game.

### 24. Engine-gotchas notebook with an index
307 one-fact notes on engine traps, each with the issue number, the mechanism and the tell, plus an index of
one-paragraph summaries that agents grep before engine or timing work. Also a five-line per-card checklist
("does it heal, does it affect others, does it touch the encounter deck").
- Verified in: `ArkhamHorror/mcp/references/engine-gotchas/INDEX.md` (first 3 entries),
  directory listing; `ArkhamHorror/backend/Checklist.md`.
- Why: the generic part is the format (mechanism, why nothing errored, how to see it in an export) and a kit-level
  file of traps that recur across games (unsubstituted "you" resolving to the active player; a cancel that leaves
  a stale marker; a trigger whose source has left play).
- Size: S.

### 25. Measure before optimising saves
Their step-storage study measured what each saved column costs, found one column was written and never read
(38.7% of storage), and that questions with their embedded choice payloads were 30% of each step diff.
- Verified in: `ArkhamHorror/docs/step-storage.md` (first 7 KB).
- Why: only a pointer: if the kit's saves grow, check for stored-but-unread data and for prompts being saved with
  full card records before reaching for compression.
- Size: S (a measurement script).

---

## Differences in the other two repos (beyond the above)

- LordOfTheRings and MarvelChampions give each handler its own queue: pushes are held and put on the front of the
  game queue in written order when the handler returns, so effects read top to bottom like the card text; queue
  edits (cancel, instead) still see the game's queue. (`LordOfTheRings/CLAUDE.md`,
  `MarvelChampions/src/Marvel/Message/Lifted/Queue.hs`.) For a reducer this is "an effect returns an ordered
  list; the runner prepends it".
- Marvel sends the client a purpose-built public view, not engine state (`Marvel.Game.Public`, per CLAUDE.md;
  file not read).
- Marvel stores the RNG in game state so reload and undo roll the same (the kit already does this).
- Marvel keeps the rules reference transcribed as Markdown beside the code with sources and hashes
  (`docs/rules/README.md`); the kit's dossier covers this.
- Both have Playwright e2e folders with an error watcher (`pageerror` and console errors must be empty) and
  viewport loops at 390 and 1600 px (`MarvelChampions/frontend/e2e/smoke.spec.ts`, `card-debug.spec.ts`).

## Not worth taking

- The message-queue engine itself (a 3,230-line message type, monadic handlers, queue surgery by predicate such
  as `popMessagesMatching`, `replaceMessage`, `pushAfter`). It is the source of most of the 307 gotchas; the kit's
  pure reducer with effect records is the safer model. Take the batch-id idea (finding 7), not the queue.
- Pattern-synonym labels, record-field tricks, Template Haskell card discovery, hs-boot workarounds, build-time
  advice (20-minute rebuilds, "do not run stack build"): Haskell only.
- Everything multiplayer: `AskMap`, `Retain`, multi-seat barriers (`docs/multi-seat-barrier.md`, not read),
  log `audience`, chat in the log, per-frame websocket batching.
- Server pieces: Postgres step table, migrations, archiving, OAuth, API keys, the remote MCP server, Terraform,
  Docker, nginx, health-check restart script (`check.sh`).
- The homebrew plug-in system ("open doors" on closed enums, auto-registered folders): solves third-party content
  in a compiled engine; the kit's content packs are already data.
- The frontend harness (`frontend/harness`): a CLI for login and game creation plus screenshots compared by hash;
  its own README lists pixel diff and fixtures as not built. The kit's run-game skill and prompt gallery do more.
- Card watermarking, art variants, image manifests, translation digests: asset logistics specific to hosting
  copyrighted scans publicly.
- The agent orchestration files (`implement-hero` skill, `herd-issues` command): workflow for their setup; the
  owner's architect and worker skills already cover it. One idea inside is sound and already an owner rule: list
  every open ruling for the owner before building, and never ship a known simplification.
- Hash-locking translations on the translation side: their own README says it mainly blocks improving a
  translation.
