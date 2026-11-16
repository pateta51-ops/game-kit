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
| K13 | Sound player (done); sound generator (not built) | M | 1.2 |
| K14 | Voice-over (done) | M | 1.3 |

## Stage 4 - only on the owner's word

| Batch | Content | Effort |
|---|---|---|
| K15 | Tutorial engine (owner approved 14 Nov 2026, split in two M parts: K15a core and K15b presentation; done) | L |
| K16 | Generic simulation runner | L |
| - | Privacy guard | M |

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
| K64 | Tooling scripts (with K37): font fetch and WOFF packer, mock capture with a defect report, picture re-encoder, owner PC setup, art manifest check, dossier sync, node bundler for simulations, printed-text leak check, generated list from a plan table | Jarl, Rome, Warp's, Imperium, STCC | M | done in part: art manifest check, text leak check, generated list (rest: K72) |
| K65 | Small UI helpers: hover held off after an overlay closes, hover-rest inspector, toast store, selection bound to a store version, obvious-answer rule (with K30), rule sheet search, icon words, prompt keys | EBR, Jarl, Imperium, Unstoppable, Warp's | M | done in part (rest: K73) |
| K66 | `voice`: paid speech client with a spending cap and a cost ledger | EBR | M | done |

### Wave 3 - gaps found by the retrofits (15 Nov 2026)

What a game's own tool did that the kit's does not; each kept that game on its own tool. Details in the retrofit pull requests (Jarl 25, Rome 55, EBR 249, Imperium 131, STCC 294, Unstoppable 54).

| # | Batch | Found in | Size | State |
|---|---|---|---|---|
| K67 | `traceability` options: `describe` titles count; a test title alone is enough (no code-comment rule); scenario check off or 2-digit ids; ids-per-title cap; id shapes with word suffixes, one digit or a sub-letter; phase and pending modes | Jarl, Rome, EBR, Imperium, STCC, Unstoppable | M | done (left: a text scan, not a TypeScript parse as in EBR) |
| K68 | `plan-checker`: session-plan heading optional; every rule id covered by a scenario; scenario catalogue read in full; skip with a notice when Python is missing | Unstoppable, EBR | S | done (left: `--tsc` over several sections, as in Unstoppable) |
| K69 | `bundle-size`: base path in addresses; follow static imports and stylesheet `url(...)`; an exported budget a test can import; limits that can be left out | STCC, Unstoppable | S | done (left: Unstoppable flag names) |
| K70 | `ci-templates` and `repo-gate`: workflow templates filled from a config, not placeholders; `full-gate.mjs`, `local-ci.sh`, `watch-run.sh` usable as pulled; skip reporter on vitest 2; runners file exempt from its own rule; no blob fetch in a partial clone; install command in READMEs with `RUNNER_REPO` and `RUNNER_LABEL` | Jarl, Rome, EBR, Imperium, STCC, Unstoppable | M | done |
| K71 | `check-runner`: environment per lane; a phase after the lanes; pull-request mode holding a game's own scripts; gate-all error-code column; timeout and tree kill in `gate()`; `replay-cli` checkpoint goldens | EBR, STCC | M | done |
| K72 | `tooling-scripts`, the rest of K64: picture re-encoder, font fetch and WOFF packer, mock capture, owner PC setup, dossier sync, simulation bundler | Jarl, Rome, Warp's, Imperium | M | proposed |
| K73 | `ui-helpers`, the rest of K65: rule sheet search, icon words, prompt keys | Imperium | S | proposed |
| K74 | `theme-check`: font-face and body-font checks, logo by folder, icon list cross-check, looser `font:` shorthand | Jarl | S | done |
| K76 | `motion-frame`: clip capture from real seeded play at 1920 wide (`record.ts`, node only) and a six-frame stills sheet per clip (`stillTimes` from the spec) | 7th Inning Stretch | S | done |

### Owner's word (size L or stage 4)

| Content | Sources | Effort |
|---|---|---|
| Privacy guard and private asset link (stage 4 row): the build refuses a public build while private content is linked | STCC, Imperium, Unstoppable, EBR | S to M |
| Scan ingest core (Python: flatbed scans to card crops and a pack) | Unstoppable, Imperium | L |
| Imported content packs (JSON or zip, in IndexedDB) | Imperium, Unstoppable | L |
| Information-set search driver; paired branch tester for AI variants | STCC | L |
| LLM opponent plumbing | STCC | L |
| Second-engine tooling (TypeScript and Rust twins) | Warp's | L |

## Size

5 small lifts, about 18 worker batches of medium size, 2 large ones. Stage 1 is 4 batches. Work asked for by a game (the table above) comes on top.
