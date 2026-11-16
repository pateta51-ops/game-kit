# Kit build plan

Sources and reasons: `docs/SELECTION.md`. One worker batch per row unless marked. State is updated here as batches land.

## How a batch works

1. Lift the base from the source commit named in `docs/SELECTION.md` into `components/<name>/`.
2. Make it generic: replace every import of game code with a small interface or data the game supplies. Add the grafts.
3. Bring its tests; add a tiny fake game in the tests where the component needs one.
4. Write `component.json`: source game, commit, paths, licence notice, other components it needs. A component a game calls or mounts also gets a `README.md` of 30 lines at most: what the game passes in and, for one that draws, a "Look" section naming the variables a game sets to skin it.
5. Review, CI green on the runner, merge, tag.

Kit code compiles under the strictest TypeScript settings in use (Jarl's), so it compiles in any game.

## Stage 1 - foundation (approved 14 Nov 2026)

| Batch | Content | Effort | State |
|---|---|---|---|
| K0 | Repo scaffold (package, strict TypeScript, lint, tests, CI on a runner), tests for `kit.mjs`; small lifts: plan checker, random numbers / hashing / canonical JSON / copy, state-machine check, bundle-size check | S | done (v0.1.0) |
| K1 | Build gates: traceability, repo gate; check runner; CI and runner scripts as templates | M | done |
| K2 | Engine core: runner, copy-on-write, undo, replay, save format; command-line replay | M | done |
| K3 | Bug reporter | M | done |

Stage 1 is complete in v0.2.0.

Known limit (engine-core): the single-copy guard stops two copies loaded from two different paths. It does not see one file loaded twice under two module systems; that happens only when a game engine module sits outside a package with `"type": "module"`. A game keeps its engine and its `kit/` folder in one such package.

## Stage 2 - when the next new game starts its build

| Batch | Content | Effort |
|---|---|---|
| K4 | Card test harness; card-language checks | M (done) |
| K5 | Saved games; offline install | M (done) |
| K6 | Settings; app frame | M (done) |
| K7 | Glossary | M (done) |
| K8 | Phone mode | M (done) |
| K9 | Simulation pool, driver contract, driver random numbers | S to M (done) |
| K10 | Pattern notes: card-language interpreter, proof sheet, players and sanity bands, themed frames, tutorial freeze, visual replay | S (done) |

## Stage 3 - with the release ladder

| Batch | Content | Effort | Release |
|---|---|---|---|
| K11 | Motion frame (done) | M | 1.1 |
| K12 | Effect library (done) | M | 1.1 |
| K13 | Sound player (done); sound generator (done: `components/audio-gen`, K75) | M | 1.2 |
| K14 | Voice-over (done) | M | 1.3 |

## Stage 4 - only on the owner's word

| Batch | Content | Effort |
|---|---|---|
| K15 | Tutorial engine (owner approved 14 Nov 2026, split in two M parts: K15a core and K15b presentation; done) | L |
| K16 | Generic simulation runner | L |

## Asked for by a game

A game's build plan lists the kit work it needs as phases named `GK<n>` for the batch `K<n>` here, and its architect runs them as the README's "Changing the kit" says. Work that no row above covers gets a row in this table first. State is `proposed` (a candidate left by a finished build: nobody builds it until a plan asks for it, and the owner still decides size L), `planned` or `done`.

| Batch | Content | Effort | Asked by | State |
|---|---|---|---|---|
| K17 | Plan checker brought level with the build-plan skill's (`--batch`, `--section`, the Worker, Touches, Gate and Owner columns, experience feature ids). The two files stay the same: a change to one goes to the other | S | build-plan skill, 14 Nov 2026 | done |
| K18 | Theme check: no colour, font, radius or shadow literal outside a game's token file; no system font; every menu route renders the logo component | M | 7th Inning Stretch plan, 14 Nov 2026 | done |
| K19 | Index entries (`state-machines/index.ts`, `card-harness/literals/index.ts`), `Scenario` starting from a state plus its events, inventory counts an id only in a test title, traceability finds a `## 3 Rules specification` heading | S | 7th Inning Stretch PRs 1, 10, 11, 14 Nov 2026 | done |
| K20 | `engine-core` `appendAction`: incremental history append from the caller's state, returns the events (`recordAction` unchanged) | S | 7th Inning Stretch PR 12, 15 Nov 2026 | done |
| K21 | `saves` screen: `confirmDelete`, `renderImport`, replay once per save; `settings` screen: `look="plates"`; `theme-check/fonts.ts` browser font-size step; `ui/index.ts` entries for both screens | S | 7th Inning Stretch PR 15, 15 Nov 2026 | done |
| K22 | `kit.mjs`: pull brings a component's `needs` (transitively), check fails when one is absent; `glossary` `LookupHost`/`EntryBody` `hideRules`, `LookupHost` `frame` | S | 7th Inning Stretch PR 16, 15 Nov 2026 | done |
| K23 | `glossary` `LookupHost` `prefer`/`avoid` (popover side) and `frame` gets `kind` and `entry`; `settings` plates show the chosen option's `line`; `tutorial` `eventKey` (PlayOptions, DocOptions) | S | 7th Inning Stretch PRs 19, 20, 15 Nov 2026 | done |
| K24 | Exact dice odds: enumerate the multisets of k dice (optionally plus one die of another size) with multinomial weights, `chance(k, test)`; cached per thread | S | a finished build, 15 Nov 2026 | proposed |
| K25 | `engine-core` or `card-harness`: `enumerateAnswers` (every answer set of a kernel prompt) and the test helpers `randomPicks`, `playUntil`, `expectEvents` | S | a finished build, 15 Nov 2026 | proposed |
| K26 | `card-harness` inventory: clause-id scheme (kind plus the shortest unique word prefix of the printed text) | S | a finished build, 15 Nov 2026 | proposed |
| K27 | Content build: CSV reader and the schema-to-type equality helpers (`DR`/`Same`/`Is`) | S | a finished build, 15 Nov 2026 | proposed |
| K28 | Layout: a layout JSON of [x,y,w,h] zones to parent-relative percent positions, a fixed-size `Stage` scaled to the window, `zone`/`slots`/`withZones`; `app-frame` fixed head (`menu` or `flow`) | M | a finished build, 15 Nov 2026 | proposed |
| K29 | Paced presentation: an event-step queue, `foldView` (the view as of a paced step, folded onto the pre-answer view) and `questionZone` (move a question band to a second rect when its home covers the targets) | M | a finished build, 15 Nov 2026 | proposed |
| K30 | `engine-core` test: play real games and assert that every auto-answered prompt equals the only legal answer (skip-empty invariant) | S | a finished build, 15 Nov 2026 | proposed |
| K31 | `theme-check` browser steps: `coverageProblems` (span of content, largest empty block per screen) and a phone font-floor spec | S | a finished build, 15 Nov 2026 | proposed |
| K32 | `phone-mode`: a `Scaled` box (a fixed-size piece drawn at a box width), a commit-flag plus second-tap wrapper over `useSecondTap` | S | a finished build, 15 Nov 2026 | proposed |
| K33 | `tutorial`: a docked side with a reserved-space CSS variable so the screen shrinks beside the panel; panel buttons accept the game's own button component | S | a finished build, 15 Nov 2026 | proposed |
| K34 | Theme `Button`: `note` (a line under a plate) and `acting` (outline) props; no rivets under a width floor | S | a finished build, 15 Nov 2026 | proposed |
| K35 | `glossary` printed-words check: every summary and body paragraph must occur in the source documents, icons and punctuation aside | S | a finished build, 15 Nov 2026 | proposed |
| K36 | `tutorial` tooling: build a script from a seed's line of play, list each step's answers in on-screen words, seed search, a script-playing e2e helper | M | a finished build, 15 Nov 2026 | proposed |
| K37 | Tooling scripts: home-screen PNGs from a logo SVG (Playwright) and a screenshot contact-sheet script | S | a finished build, 15 Nov 2026 | proposed |
| K38 | `offline`: network-first navigation (with a timeout) and auto-apply of a new build when no input is half-entered; replaces a game-side patch of the worker file | M | a finished build, 15 Nov 2026 | done |
| K39 | `bug-reporter`: an `index`/`ui` entry (games need an eslint-disable per import today) and token storage read lazily, not at import | S | a finished build, 15 Nov 2026 | done |
| K40 | `tutorial`: fix the highlight freezing the page | S | a finished build, 15 Nov 2026 | done |
| K41 | `sim-pool`: a seed plays differently in a pool worker than alone (find the cause); a per-prompt observation hook; a grid-sweep helper over `runResumable` with a CSV and spread per cell | M | a finished build, 15 Nov 2026 | done (the cause was in the game: its sim script builds another seed and settings for a lone run; the kit has a test that pool and alone match) |
| K42 | `settings` screen: a slot for custom rows (games portal into it by title text today); `saves` screen name fit | S | a finished build, 15 Nov 2026 | proposed |
| K12b | `motion-frame` `play(beat, { parallel: true })` (a beat starts at once beside the playing one); `effect-library`: `move` and `scale` animate `translate` and `scale` so they compose with the transform verbs, and `resolve(id, run)` gets the run | S | 7th Inning Stretch PR 30, 15 Nov 2026 | done |
| K12c | `effect-library`: `layer.start(run)` makes the beat's stand-ins at its start (a live piece hidden at the start left a hole until its actor's first verb); `text` reaches full opacity in the first quarter of the call so the rise is seen | S | 7th Inning Stretch PR 36, 15 Nov 2026 | done |
| K12d | `effect-library`: optional step `scale` on `move` and `fade-in` (a number n = from n to 1, `[a, b]` = from a to b), composed with the move's translate; e2e test for two verbs on one actor no longer reads at a fixed 100 ms | S | 7th Inning Stretch, 15 Nov 2026 | done |
| K12e | `effect-library`: `onActor(source, clone, id, run)` layer option (copy a canvas's pixels into the clone); step `hold: true` keeps a number `scale` for the whole step | S | a game, 15 Nov 2026 | done |

## Harvest from the existing games (owner, 15 Nov 2026)

"Enrich the kit first, then retrofit the games" (`docs/RETROFIT_PLAN.md`). Seven read-only reviews, one per game, are in `docs/evaluation/harvest/` (109 candidates; their evidence is headers, exports and searches, so a worker reads the bodies before lifting). Merged here by theme. Wave 1 is built first and tagged; the retrofits pull that tag. Wave 2 follows. A worker does not edit this file: the rows are marked by whoever merges.

### Wave 1 - tooling and what every game uses

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
| K43 | New `perf`: engine speed budget. Percentiles, each call timed several times with the fastest kept, warm-up game, the ten slowest actions, a budgets test, a command line with an exit code; the game supplies the driver | STCC (base), Imperium, Unstoppable, EBR, Warp's, Rome | M | done |
| K44 | `ci-templates`: `watch-run.sh` (one background command per run) and `gate-numbers.py`; nightly fuzz workflow with its own concurrency group and checkout folder; skipped-test reporter | Rome, STCC, Warp's, Imperium, EBR | M | done |
| K45 | `check-runner`: stop at the first failure with `--keep-going`; one gate per item side by side with a known-failing list | STCC, EBR | S | done |
| K46 | New `lint-preset`: engine purity (no clock, random, DOM, console, storage, UI imports) and no direct writes to shared state; "the engine names no real card id" pattern | Jarl (base), EBR | S | done |
| K47 | New `plain-text`: strip rule and ruling ids from every shown line; a pattern check for text a player must never see | Rome, Jarl | S | done |
| K48 | New `e2e-helpers`: error watch, no sideways scroll, wait for animations, viewports, screenshot, wait for the autosave before a reload; axe check as an option | Imperium (base), STCC, Jarl, Unstoppable | S | done |
| K49 | `saves`: autosave time that never goes back; rename a save; export all data, reset all data | EBR, STCC, Unstoppable | M | done |
| K50 | `sim-pool`: invariant run that reports a failure as seed plus step and replays to it; fuzz command; sanity-band shape; code-version stamp for resumed sweeps | STCC, EBR, Warp's, Imperium | M | done |

### Wave 2

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
| K51 | `replay-cli`: golden games (record, replay in CI, re-record); checkpoint goldens; record on one checkout and replay on another; worked examples as data | Imperium, EBR, STCC | M | done (checkpoint goldens: K71) |
| K52 | `sound-player`: synthesised cues without files; events of one action merged to a few cues; ducking test in a real browser | Unstoppable, Warp's | M | done |
| K53 | `effect-library`: canvas particle kit; count-up and boxed particle ambience | Warp's, EBR | M | done |
| K54 | `motion-frame`: motion Off in an automated browser, on by request; motion lab route and clip capture | EBR, Rome | M | done |
| K55 | Resolution frame (`fitBox`, `shouldFrame`, the framed page); `offline` refuses inside a frame (with K38) | Rome | M | done |
| K56 | `engine-core`: undo by step with kept snapshots | Imperium | M | done |
| K57 | `engine-core`: fast-check property test of the kernel; copy-on-write helper for a game's own write paths | Warp's | S | done |
| K58 | `state-machines`: `useMachine` hook; transition-graph invariants | Jarl | S | done |
| K59 | `phone-mode`: full-height layer check; decision dock and short prompt | Jarl, Imperium | M | done |
| K60 | `theme-check`: layout bounds in the browser (inside its zone, no overlap, no cut row, which is on top), beside K31 | STCC | M | done |
| K61 | Prompt gallery and fixtures: one real game state per prompt kind and per ending, a dev route that shows each | EBR, Imperium, STCC, Jarl, Warp's | M | done |
| K62 | Play statistics and high scores | Rome, Imperium | M | done |
| K63 | `app-frame`: crash screen with save export | Imperium | M | done |
| K64 | Tooling scripts (with K37): font fetch and WOFF packer, mock capture with a defect report, picture re-encoder, owner PC setup, art manifest check, dossier sync, node bundler for simulations, printed-text leak check, generated list from a plan table | Jarl, Rome, Warp's, Imperium, STCC | M | done (rest in K72) |
| K65 | Small UI helpers: hover held off after an overlay closes, hover-rest inspector, toast store, selection bound to a store version, obvious-answer rule (with K30), rule sheet search, icon words, prompt keys | EBR, Jarl, Imperium, Unstoppable, Warp's | M | done (rest in K73) |
| K66 | `voice`: paid speech client with a spending cap and a cost ledger | EBR | M | done |
| K75 | New `audio-gen`: the free local audio pipeline (installs in WSL under `~/audio-gen`, cue sheet to prompt specs, generation with a manifest per clip, the rings-out tail and loudness as code, music from MIDI stems with exact loops, voice lines with Kokoro, listening-page data, the sound player's format and size limits). No paid service | 7th Inning Stretch, game-sfx-review skill | M | done |

### Wave 3 - gaps found by the retrofits (15 Nov 2026)

What a game's own tool did that the kit's does not; each kept that game on its own tool. Details in the retrofit pull requests (Jarl 25, Rome 55, EBR 249, Imperium 131, STCC 294, Unstoppable 54).

| # | Batch | Found in | Size | State |
|---|---|---|---|---|
| K67 | `traceability` options: `describe` titles count; a test title alone is enough (no code-comment rule); scenario check off or 2-digit ids; ids-per-title cap; id shapes with word suffixes, one digit or a sub-letter; phase and pending modes | Jarl, Rome, EBR, Imperium, STCC, Unstoppable | M | done (left: a text scan, not a TypeScript parse as in EBR) |
| K68 | `plan-checker`: session-plan heading optional; every rule id covered by a scenario; scenario catalogue read in full; skip with a notice when Python is missing | Unstoppable, EBR | S | done (left: `--tsc` over several sections, as in Unstoppable) |
| K69 | `bundle-size`: base path in addresses; follow static imports and stylesheet `url(...)`; an exported budget a test can import; limits that can be left out | STCC, Unstoppable | S | done (left: Unstoppable flag names) |
| K70 | `ci-templates` and `repo-gate`: workflow templates filled from a config, not placeholders; `full-gate.mjs`, `local-ci.sh`, `watch-run.sh` usable as pulled; skip reporter on vitest 2; runners file exempt from its own rule; no blob fetch in a partial clone; install command in READMEs with `RUNNER_REPO` and `RUNNER_LABEL` | Jarl, Rome, EBR, Imperium, STCC, Unstoppable | M | done |
| K71 | `check-runner`: environment per lane; a phase after the lanes; pull-request mode holding a game's own scripts; gate-all error-code column; timeout and tree kill in `gate()`; `replay-cli` checkpoint goldens | EBR, STCC | M | done |
| K72 | `tooling-scripts`, the rest of K64: picture re-encoder, font fetch and WOFF packer, mock capture, owner PC setup, dossier sync, simulation bundler | Jarl, Rome, Warp's, Imperium | M | done (`mock-capture` without the phone callout boards; `setup.ps1` never executed in CI) |
| K73 | `ui-helpers`, the rest of K65: rule sheet search, icon words, prompt keys | Imperium | S | done |
| K74 | `theme-check`: font-face and body-font checks, logo by folder, icon list cross-check, looser `font:` shorthand | Jarl | S | done |
| K76 | `motion-frame`: clip capture from real seeded play at 1920 wide (`record.ts`, node only) and a six-frame stills sheet per clip (`stillTimes` from the spec) | 7th Inning Stretch | S | done |

### Wave 4 - gaps left after the second pass (16 Nov 2026)

What still keeps a game on its own tool at kit v0.25.0. Details in the second-pass pull requests (Jarl 27, Rome 57, EBR 251, Imperium 133, Warp's 142, STCC 296, Unstoppable 56).

| # | Batch | Found in | Size | State |
|---|---|---|---|---|
| K135 | `theme-check`: a switch per rule (COLOR, RADIUS, SHADOW cannot be turned off; 312 findings in Jarl); the token file not exempt when a game wants it checked | Jarl | S | proposed |
| K136 | `traceability`: a TypeScript parse of test titles in place of the text scan (ids in a fixture string count today); `idsAtLineStart` takes section 3 table rows as rules; the id pattern given whole as one regexp (STCC's plan regexp verbatim; Imperium's id after a dash or underscore); the dot required in `## 3.`; EBR's scenario report, rejected-title print and counts line | EBR, STCC, Imperium | M | proposed |
| K137 | `repo-gate`: a PORT rule; CONTENT_NAME and RAW_SCAN switchable; CONTENT_ID not exempting engine test files; a blob missing from a sparse partial clone is skipped with a notice where the game says so; text not checked out, UTF-16, chat URLs, warn-only size | Warp's, STCC | M | proposed |
| K138 | `check-runner`: streamed `[lane]` output, `npm --silent`, skip `last` once a lane failed | STCC | S | proposed |
| K139 | `plan-checker`: `--tsc` over several sections in order plus a stub line | Unstoppable | S | proposed |
| K140 | `bundle-size`: `--follow true` exits 2 on an encoded `url(%23n)` in a stylesheet | STCC | S | proposed |
| K141 | `ci-templates`: templates for a multi-step gate and a second job (Python), so EBR, Imperium, STCC, Warp's, Rome and Unstoppable can render theirs | six games | M | proposed |

### Wave 5 - Under Falling Skies (16 Nov 2026)

What the eighth game has that the kit lacks, from its assessment at kit v0.33.0 (`docs/RETROFIT_PLAN.md`, Part D). UFS is a solo game: its two-player-only items do not apply.

| # | Batch | Found in | Size | State |
|---|---|---|---|---|
| K167 | `traceability`: `citeFiles` (folders): every non-test file under them cites at least one rule id in a comment, the finding lists the files (UFS: `src/engine/phases`, `rules`, `abilities`); the only thing keeping UFS on its own check | Under Falling Skies | S | proposed |
| K168 | New component `transcription-check`: two transcriptions of each printed item made independently (A and B, each with transcriber, source picture and session), a field-by-field diff written to `DIFF.md` that fails while a difference is open, a generated progress table (item, picture, A, B, diff, verified), an owner verification ledger holding the hash of the agreed file (an edit after verification undoes it), and a gate listing the required items not yet verified, for the content check and the real-pack build; the game passes its item list and transcript schema | Under Falling Skies (`scripts/lib/real.ts`, BUILD_PLAN §12) | M | proposed |
| K169 | `card-harness` content gate: a folder of broken packs, each with the issue code and severity it must report; generated files compared with what the generator writes now ("stale: run ..."); every card-language feature used at least once by the placeholder and test packs (`--require-all` fails on an unused one) | Under Falling Skies (`scripts/validate-content.ts`) | S each | proposed |
| K170 | `tutorial` coach (compare first with K15): first-time tips as data (id, text, `when(events, state)`, held back during a guided lesson when situational), the first unseen tip the last action made relevant, seen ids kept per browser; a suggested move taken from the game's driver with its plain-word reasons and the places to spotlight, so it works on any pack | Under Falling Skies (decisions 036, 037) | M | proposed |
| K171 | `sound-player` `play(cue, { pitch })`: optional per-play pitch in semitones (file playback rate, synth frequencies scaled), so a game can step a chime up per point | 7th Inning Stretch (point-chime) | S | done |

### Owner's word (size L or stage 4)

Decided by the owner, 16 Nov 2026:
- **Privacy guards: dropped, and removed from the games.** The repositories are private and that is enforced on GitHub, so no build-time guard is needed.
- **Imported content packs: dropped.** A game carries all its cards, code and images in its own private repository; nothing is loaded at runtime from outside it.
- **Scan ingest: build (K164)**, starting from the `scanning-pipeline` repository, compared with the games' copies.
- **Information-set search driver, LLM opponent plumbing, second-engine (Rust) tooling:** only for a game with a competitive two-player mode, built when such a game needs them.
- **Kit enrichment, middle path:** build now what two or more games already do or what is plainly game-independent (wave 4 K135-K141, K25, K28, K29, K30, K33, K35, K36). Single-game visual and sound rows wait for the experience director's release passes; the rest is pulled in by a game's build plan when it needs it.

| Row | Content | Sources | Effort | State |
|---|---|---|---|---|
| K164 | `scan-ingest`: flatbed scans to card crops and a content pack (Python) | scanning-pipeline, Unstoppable, Imperium | L | approved |
| K167 | `voice`: `play(id, { pieces, gapsMs })` plays given files as one line of the id with a gap after each; `voiceCues(table, extraFiles)` | 7th Inning Stretch (ideas only) | S | done |
| - | Information-set search driver; paired branch tester for AI variants | STCC | L | competitive two-player games only |
| - | LLM opponent plumbing | STCC | L | competitive two-player games only |
| - | Second-engine tooling (TypeScript and Rust twins) | Warp's | L | competitive two-player games only |
| K165 | `picked-state` (asked as K78 in a game's plan; K78 was taken): picked frame and tick tokens (`--picked`, `--picked-edge`, `--picked-width`, `--tick`, `--unpicked-dim`; phone width 3, tick 16), `pickedAttrs`; pattern note `docs/patterns/scoreboards-and-totals.md` | a finished build, 16 Nov 2026 | S | done |

## Harvest from outside repositories (owner, 15 Nov 2026)

Sixteen public card- and board-game repositories were surveyed read-only; the findings are in `docs/evaluation/outside/` (evidence is docs, headers and excerpts, so a worker reads the bodies before building). Licences: middle-earth-player, netrunner, boardgame.io and netrunnerdb are MIT (code may be lifted with its notice); marvel-champions-digital-game and arkham.build are AGPL-3.0, chiriboga is GPL-3.0, ArkhamHorror, MarvelChampions and marvel-lcg have none: from those take the idea and write it new, never paste code. Second batch: XMage is MIT and the Rally the Troops server is ISC (liftable with the notice); Forge and Terraforming Mars are GPL-3.0, rftg is GPL-2.0 or later, and the Rally the Troops game modules read have no licence: idea only. Rows are built when the first game needs them. Not taken: save-compatibility work (held until a game is complete), the source engines, multiplayer and server parts.

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
| K77 | `card-harness`: spec rows (printed line, layout by zone, one act, an expectation), each run again with that line's records removed; a row that still passes fails | middle-earth-player | M | proposed |
| K78 | `card-harness`: render effect records as English under their printed line; a read-only reading-judge step (ok / wrong / ambiguous / render-gap) before tests are written | middle-earth-player | M | proposed |
| K79 | `engine-core`: a cause (rule id, or effect record plus printed line) on every step that changes a number; `replay-cli` test refuses a step without one | middle-earth-player | M | proposed |
| K80 | `e2e-helpers` or `prompt-gallery`: over seeded games, every legal action and target is sent by some labelled control | middle-earth-player | M | done (`prompt-gallery` `checkActionCoverage`) |
| K81 | `replay-cli`: digest of a curated table view after each move, pinned in goldens; report the scenarios whose digests moved | middle-earth-player | S | done |
| K82 | `check-runner`: test-cost budget (the list of test files that play whole games may not grow) | middle-earth-player | S | done |
| K83 | `card-harness` inventory: every printed line owned by a record or listed open; record verbs checked against the engine's route lists | middle-earth-player | S | proposed |
| K84 | Pattern notes: mechanic-family manifests with a verb-has-runner test; results cached by immutable state | middle-earth-player | S | done (pattern notes in `docs/patterns/card-language.md`) |
| K85 | Small checks and tools: sentence-length check on prompt wording (`plain-text`); private-data check on tracked files; a `move` tool that rewrites every path; docs index with a section reader | middle-earth-player | S | done, private-data check dropped (owner: no privacy guards) (`plain-text` `longSentences`; `tooling-scripts` `move`, `docs-index`; the React Compiler skip test is not kit code) |
| K86 | New `game-log`: log lines derived from engine events by one table (cards write nothing); entries as data (parts, card refs, cause, kind); append-only rows grouped by id; wording rules | ArkhamHorror | M | done |
| K87 | `game-log`: undo back to a log line; hover a line to preview that past state; plain-text export a golden can pin | ArkhamHorror, boardgame.io | S | proposed |
| K88 | `engine-core`: blocked targets with reason codes on legal actions; barred options with a recorded reason; the only-one-option notice | marvel-champions-digital-game | M | proposed |
| K89 | `engine-core`: outcome preview by probe (run, discard, return before/after numbers), stopping at hidden information | marvel-champions-digital-game | M | proposed |
| K90 | Prompts: each choice names its source frame (card and clause); decision-authority tag when the player decides for the automated side; read-only stack view | marvel-champions-digital-game | S | done (new `prompt-source`; engine-core unchanged: the game adds the fields to its prompt type) |
| K91 | `engine-core`: does-nothing check, separate from legality | netrunner | S | proposed |
| K92 | Ghost card for an ability whose source has left play | ArkhamHorror | S | proposed |
| K93 | Card language: cancel and instead by batch id; prevention window declared as card data with remaining / prevented counters | ArkhamHorror, netrunner | M | proposed |
| K94 | Card language: simultaneous triggers (apply all, capture follow-ups, resolve); interactive flag and a priority table for automatic order; once-per-instance against once-per-item | ArkhamHorror, netrunner | M | proposed |
| K95 | `engine-core`: one checkpoint step after every action in rulebook order, and a recompute-until-stable pass with a cap | netrunner | M | proposed |
| K96 | Card language: continuous-effects registry with typed durations | netrunner, marvel-champions-digital-game | M | proposed |
| K97 | `card-harness`: strict validator (unknown keys fail, variables bound before read, cited opt-outs stored as data); grammar reference generated from source | marvel-champions-digital-game, ArkhamHorror, netrunner | M | proposed |
| K98 | `card-harness`: ability-fired trace (looked up against actually run); `expectResolved` | marvel-champions-digital-game | S | done |
| K99 | `tooling-scripts`: `card <id>`, `dsl <word>` and `refs` lookup commands generated on each run | marvel-champions-digital-game | M | done |
| K100 | Debug edits as engine actions (set a counter, summon a card, force the next random result, close a stuck prompt) and a console for them | ArkhamHorror, netrunner | M | proposed |
| K101 | `sim-pool`: render the view on every step; hasten mode; one-answer replay of the failing step with timings | halogenandtoast MarvelChampions | S | proposed |
| K102 | `card-harness` helpers: failures print the open prompt and its choices; no-prompt-left assertion; multi-delta `changed`; live state exported as a scenario literal; `errata` / `faq` test wrappers; `withRewind` | netrunner, chiriboga, ArkhamHorror | S | proposed |
| K103 | Opponent pattern (when a game has a rule-based opponent): pick an index among legal options; per-card advice data beside the records; redacted view; plan record across prompts; decision record opened from the log | chiriboga, boardgame.io | M | proposed |
| K104 | Content build: card data patch layer, one file per reason, applied on import | arkham.build | S | done |
| K105 | Zoomed card: errata as printed / as played / word diff; rulings (question, ruling, citation, date) keyed by card | arkham.build, netrunnerdb | M | proposed |
| K106 | One delegated tooltip for every card link inside log lines, prompts, rulings and tutorial text | arkham.build | S | proposed |
| K107 | Card query language: typed field table plus a small parser; the game supplies its fields | arkham.build | M to L | proposed |
| K108 | `engine-core` random: named override in tests; a randomness-used flag that bars undo | boardgame.io | S | done |
| K109 | Small: icon emitted with a hidden word; paired valid / invalid fixtures per setup-legality rule with typed errors; stale flow request dropped and a loop cap; related-cards index; emitted text keys resolve; card stats diff against a community database; missing-card stand-in | netrunnerdb, arkham.build, boardgame.io, ArkhamHorror | S each | done (`small-helpers`) |
| K110 | `card-harness`: unused-answer check and strict-choose mode (an unanswered prompt fails, a scripted answer left over fails); mid-run check commands; tests of the harness's own error messages; no-duplicate-effects check at teardown | XMage | S to M | done |
| K111 | Card language: replacement loop (applied-set on the event, the affected player chooses among several, result codes including changed-but-still-happens) | XMage, Forge | M | proposed |
| K112 | Card language: layered recompute in game-declared layers, timestamp set on activation, optional `after` dependency | XMage | M | proposed |
| K113 | `engine-core`: object reference = id plus zone-change counter; last-known snapshots of objects that left a zone | XMage | S to M | done |
| K114 | Small: batch events with declared shared keys; outcome tag (good or bad for the chooser) on every choice for automatic answers; every-card JSON round-trip check; script-format notes for the card-language pattern | XMage, Forge | S each | proposed |
| K115 | Opponent pattern, added to K103: a handler per effect verb with one fixed pipeline and a conformance test; reason-coded decisions; profiles as data; a closed hint vocabulary and a cannot-use report; memory sets and a runaway guard; evaluator with explain lines, copy-fidelity check, bounded look-ahead | Forge, XMage | M | proposed |
| K116 | New `board-layout`: a map drawn over the board picture in Inkscape, extracted as space rects and adjacency edges | Rally the Troops | S | done |
| K117 | New board UI: registry of things (space, piece, marker, stack) highlighted from the legal-action list; stack layout for pieces sharing a space; movement animation | Rally the Troops | M to L | proposed |
| K118 | New `board-model`: spaces as data, adjacency computed once, named placement kinds resolved by the board (cards never filter spaces), empty-board fixture | Terraforming Mars | M | done |
| K119 | `engine-core` (compare first with steps and `state-machines`): legal actions as one table of verb to ids, shown-but-barred included; nested state stack with scopes kept in state; flow as a typed step list with a runaway cap | Rally the Troops | M | proposed |
| K120 | `sim-pool`: bad-undo invariant (undo left open across a random draw or reveal); dead-end and placeholder-prompt failures; the game's state assertion after every step; a breakpoint that hands back an importable game | Rally the Troops | S each | proposed |
| K121 | `replay-cli`: three verdicts (crashed, diverged, changed) with a path diff of the final state | Rally the Troops | S | done |
| K122 | `game-log`: space and piece references that highlight and scroll the map; group boxes for a battle or an activation | Rally the Troops | S | proposed |
| K123 | Prompts (compare first with the kit's prompt model): closed set of prompt kinds with and / or composition and a space kind; renderer registry that fails to compile for a missing kind; a warning on a playable card when part of it will do nothing | Terraforming Mars | M | proposed |
| K124 | Small: type-level module-boundary check; query channel for derived data; rule-violation panel with links; prompt-kind `cast` in card tests; catalogue check of card face against behaviour | Lew Morski module, Rally the Troops, Paths of Glory module, Terraforming Mars | S each | partly done: boundary-check built; query channel (engine-core) and prompt-kind cast (card-harness) later, open PRs |
| K126 | `engine-core`: optional `reseed` words on an answer (fresh randomness recorded with the action, replay exact); `freshWords()` app side | 7th Inning Stretch | S | done (asked as K79 in the game plan; K79 was taken) |
| K127 | `sound-player`: the last played file is excluded from the random pick only when a cue has three or more files (XD-54) | 7th Inning Stretch | S | done (asked as K80 in the game plan; K80 was taken) |
| K166 | New `pieces-3d`: pieces built in code (WebGL rounded d6 and ten-sided die with a flat fallback, a seamed ball that rolls by distance, a thick chip, card edge and shadow classes); `shake`, `flip`, `move`, `settle` for them over the effect library's; a demo page | 7th Inning Stretch | M | done (asked as K77 in the game plan; K77 was taken) |
| K125 | Learned opponent (owner's word; STCC D-067 stands until then): value network with one-round look-ahead on the real engine and self-play training; study in `docs/evaluation/outside/rftg-opponent.md` | rftg (Keldon) | L | proposed |
| K142 | `motion-frame` (1.1): reading time split from motion time (Slow lengthens holds, Quick does not shorten them); reduced motion keeps the information (a beat appears, held still) where it is dropped today; announcement clocks start when the band is visible, not when queued | middle-earth-player, marvel-champions-digital-game | M | proposed |
| K143 | `motion-frame` (1.1): a gate for a big beat that never blocks input; hurry (one touch finishes card motion, small feedback keeps running); several big beats under one stage (enter once, swap, leave once) | middle-earth-player | M | proposed |
| K144 | `effect-library` (1.1): hit stop; trauma-model shake with a frequency cap; afterimages; flash limit (under 3 a second, target only) | middle-earth-player | S each | proposed |
| K145 | `effect-library` (1.1): a slot held empty until its ghost lands, pile rects as anchors, a per-card entry description; number-and-place beats derived from events by one table; deltas by subtracting two states | marvel-champions-digital-game, middle-earth-player | M | proposed |
| K146 | `effect-library` (1.1, compare first with the canvas particle kit): effects as closed-form functions of time and a seed, with a particle budget, so tests read the functions directly | middle-earth-player | S to M | proposed |
| K147 | `sound-player` (1.2, compare first): cues only from the action trail (silent on load, undo and resume); one action's cues in sequence with a cap on the gap; cue fallback chain, the card's own sound first; front-silence check and a no-re-encode trim tool | marvel-champions-digital-game, netrunner, Forge | S each | proposed |
| K148 | `sound-player` music (1.2): most-specific-first chain by folder convention; a shelved track resumes where it stopped; gapless ambient loop with a crossfaded seam | marvel-champions-digital-game, Forge, ArkhamHorror | M | proposed |
| K149 | `phone-mode` haptics: five ticks (armed, sent, refused, land, impact) with caps and a setting; a snapped motion drops its tick | middle-earth-player | S | proposed |
| K150 | Small (1.1 and 1.2): token face flips at the edge-on midpoint; phase band details; banner lines that ring the cards they name; a sample on the volume slider; card flight by the View Transitions API | ArkhamHorror, middle-earth-player, netrunner | S each | proposed |
| K151 | New component `story` (fits 1.0, no motion): story as data only (speakers, lines with a fallback, named slots per scenario: intro, stage lines, win, loss, teaser, recap); one scenario story sheet with a "before" and an "after" part, reopenable at any time, later parts hidden until reached; a line for a named character falls back to a narrator line when that character is not in play; a picture slot shows its text note until the file exists | quincarter (ideas only), halogenandtoast MarvelChampions and LordOfTheRings (ideas only) | S | done |
| K152 | `story`: a story page as a small tree of text keys (paragraph with variables, header, list, card picture, icon, footnote) with modifiers (resolution, interlude, boxed); every "if / otherwise" branch shown with the one that applied marked from the campaign log; alternative prose as an overlay on the base text | ArkhamHorror (ideas only) | M | proposed |
| K153 | `story` with `engine-core`: a story beat is an engine question (read on, choose one, pick a card, pick a character), so it saves, replays and undoes like play; a long beat is split into parts that resume | ArkhamHorror (ideas only) | S | proposed |
| K154 | `story` (1.1) panel reader: one picture read as ordered beats, each a rectangle in picture pixels with a caption, speech lines and a sound word; the camera pans and zooms beat to beat; next, back, skip, tap and keys; a plain cut under reduced motion; one panel rectangle gives a wide beat and a phone beat; a short story earned by an achievement opens in the same reader from an Extras screen | quincarter (ideas only) | M | proposed |
| K155 | `story` (1.1) event splash: a pure function over the engine event list decides whether a story splash opens (once per event, only where the story has a line); picture, one line, optional rule note; closes on a tap, a key or after 4 s, never by itself under reduced motion | quincarter (ideas only) | S | proposed |
| K156 | New component `campaign`, the log: recorded keys, crossed-out keys, counts, sets with crossed-out entries, order; fields declared as data (kind, label, shared or per player, rulebook citation, hidden); for each count the list of (step, before, after); rewards as ledger entries grouped by step; pure functions | ArkhamHorror (ideas only), LordOfTheRings, quincarter (ideas only) | S to M | done |
| K157 | `campaign`, steps and saves: tagged steps (prologue, scenario, interlude, upgrade, epilogue, side scenario) where a detour carries its return step; a per-game next-step function; a scenario played alone is a campaign that ends after one step; the game gets a frozen copy of the log at setup and hands back its writes at the end; save = log, position, seed, history with a log snapshot per attempt, version stamp; retry restores the snapshot | ArkhamHorror (ideas only), quincarter (ideas only) | M | proposed |
| K158 | `campaign`, a graph runner (owner's word, size L): nodes with setup, victory and defeat instructions as data, each with its printed text and citation; player-choice nodes with an availability test; steps run between games or inside a game in a named window | quincarter (ideas only) | L | proposed |
| K159 | `campaign` screens: the between-scenarios screen as one engine question (next step, continue, upgrade, extra actions the game declares); log screen sections that mirror the paper sheet; per-instruction rows of what changed ("spent 4, earned 3"); a "handled for you" list of the automated setup steps in plain sentences; start at any scenario with a chosen history from a data-driven form | ArkhamHorror (ideas only), quincarter (ideas only) | M | proposed |
| K160 | New component `achievements` (compare first with `play-stats`): the catalogue as data (id, name, text, family, points, optional checklist); achievements as pure functions over finished-game records, nothing stored, so a new one applies to old games; a small versioned summary written when a game ends (result, loss reason, rounds, counts) | quincarter (ideas only), ArkhamHorror (ideas only) | M | done |
| K161 | `achievements`, feats inside a game: detection over the engine event stream; counters and seen-sets kept where undo rewinds them; an earn is stored outside the game state, once, after the save; checklists that fill across games ("win with every character"); brief centred call-outs for a feat (first defeat, a streak, a record) | ArkhamHorror (ideas only), marvel-lcg (ideas only) | M | proposed |
| K162 | `achievements` screens: a list by family with progress bars, a locked row says how to earn it; a tab in the campaign log; a toast that stacks several earns into one counted toast, first run silent, hold time and off in settings (static at 1.0; motion with 1.1, sound with 1.2) | quincarter (ideas only), ArkhamHorror (ideas only) | M | done (no campaign component yet: the list is a panel for any tab) |
| K163 | Small: a challenge is a content item in the card language (a setup restriction plus triggered penalties) picked before a game | marvel-lcg (ideas only) | S | proposed |

### Build order for the outside harvest (owner, 15 Nov 2026)

The owner asked for tiers 1 and 2 to be built now, in this order, without waiting for a game to need them. Tier 3 is built when a game needs the row; tier 4 waits for the owner's word. The order is gain against cost, judged from the survey write-ups, not measured. A row works as "How a batch works" says, with two differences: the base is a design described in `docs/evaluation/outside/`, not a lift from one of the owner's games, and code is copied only from the MIT and ISC sources (middle-earth-player, netrunner, boardgame.io, netrunnerdb, XMage, the Rally the Troops server), with the notice in `component.json`; from every other source the worker reads the write-up, not the repository, and writes new code. The write-ups are excerpts: where a row lifts code, the worker reads the source file in full first. A row marked "compare first" starts by reading the kit component named and is closed as "covered" in this file when the kit already does it.

**Tier 1 - high gain, small cost (one batch per row, in this order)**

| # | Row | Note |
|---|---|---|
| 1 | K110 | |
| 2 | K98 | |
| 3 | K120 | compare first: `sim-pool` fuzz |
| 4 | K83 | compare first: `card-harness` inventory, K26 |
| 5 | K108 | |
| 6 | K121 | |
| 7 | K81 | same pull request as K121 if small |
| 8 | K82 | |
| 9 | K113 | |
| 10 | K91 | |
| 11 | K90 | |
| 12 | K104 | |
| 13 | K102 | |
| 14 | K101 | |
| 15 | K106 | |
| 16 | K116 | lift from the Rally the Troops server tools (ISC) |

**Tier 2 - high gain, medium cost**

| # | Row | Bundle | Note |
|---|---|---|---|
| 17 | K78 | Card testing | the renderer here; the reading-judge step goes to the architect skill master in `C:\projects\_skills` |
| 18 | K77 | Card testing | |
| 19 | K97 | Card testing | |
| 20 | K99 | Card testing | |
| 21 | K86 | What the player sees | new component `game-log` |
| 22 | K79 | What the player sees | |
| 23 | K88 | What the player sees | |
| 24 | K80 | What the player sees | |
| 25 | K93 | Card-language core | rows 25 to 29 share one timing vocabulary: one design note in `docs/patterns/` first (its own pull request), then one batch per row |
| 26 | K111 | Card-language core | |
| 27 | K94 | Card-language core | |
| 28 | K96 | Card-language core | |
| 29 | K95 | Card-language core | |
| 30 | K100 | Tools | |
| 31 | K87 | What the player sees | needs K86 |
| 32 | K89 | What the player sees | |
| 33 | K105 | What the player sees | needs K104 |
| 34 | K118 | Boards | new component `board-model` |

**Story, campaign and achievements (owner, 15 Nov 2026; rows K151 to K163):** from a second pass over the Marvel Champions and Arkham Horror repositories; write-ups `docs/evaluation/outside/story-campaign-marvel.md` and `story-campaign-arkham.md`. Every source here is AGPL or has no licence: ideas only, all code written fresh. The workers read headers, types and samples, not whole files (each write-up lists what was opened). Ranked, not yet agreed by the owner:

| # | Row | Bundle | Note |
|---|---|---|---|
| 35 | K151 | Story | new component `story` |
| 36 | K153 | Story | needs K151 |
| 37 | K156 | Campaign | new component `campaign` |
| 38 | K160 | Achievements | new component `achievements`; compare first with `play-stats` |
| 39 | K162 | Achievements | needs K160; static only; done |

When a game with a campaign or a long story is planned (tier 3): K157, K159, K152, K161, K163. With release 1.1: K154, K155. Owner's word (size L): K158.

**Tier 3 - when a game needs it:** K122, K92, K117, K123 (compare first), K119 (compare first), K112, K84, K114, K109, K124, K85.

**With the release ladder (stage 3; the experience director decides when):** K142 to K146 and K150 with 1.1, K147 and K148 with 1.2, K149 with a game's phone mode (these nine rows were first numbered K126 to K134, which another batch of rows also used; renumbered 15 Nov 2026). K154 and K155 (story panel reader and event splash) with 1.1. Write-up: `docs/evaluation/outside/motion-sound.md`; its "kit lacks" claims were checked against the first part of each README only, so a worker reads the whole README first.

**Tier 4 - owner's word:** K103, K115, K107, K125.

## Size

5 small lifts, about 18 worker batches of medium size, 2 large ones. Stage 1 is 4 batches. Work asked for by a game (the table above) comes on top.
