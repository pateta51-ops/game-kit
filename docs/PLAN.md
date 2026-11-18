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
| K16 | Generic simulation runner (covered: sim-pool (whole games with any driver, sweeps, K200 tuner)) | L |

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
| K24 | Exact dice odds: enumerate the multisets of k dice (optionally plus one die of another size) with multinomial weights, `chance(k, test)`; cached per thread | S | a finished build, 15 Nov 2026 | done |
| K25 | `engine-core` or `card-harness`: `enumerateAnswers` (every answer set of a kernel prompt) and the test helpers `randomPicks`, `playUntil`, `expectEvents` | S | a finished build, 15 Nov 2026 | done |
| K26 | `card-harness` inventory: clause-id scheme (kind plus the shortest unique word prefix of the printed text) | S | a finished build, 15 Nov 2026 | done |
| K27 | Content build: CSV reader and the schema-to-type equality helpers (`DR`/`Same`/`Is`) | S | a finished build, 15 Nov 2026 | done |
| K28 | Layout: a layout JSON of [x,y,w,h] zones to parent-relative percent positions, a fixed-size `Stage` scaled to the window, `zone`/`slots`/`withZones`; `app-frame` fixed head (`menu` or `flow`) | M | a finished build, 15 Nov 2026 | done |
| K29 | Paced presentation: an event-step queue, `foldView` (the view as of a paced step, folded onto the pre-answer view) and `questionZone` (move a question band to a second rect when its home covers the targets) | M | a finished build, 15 Nov 2026 | done |
| K30 | `engine-core` test: play real games and assert that every auto-answered prompt equals the only legal answer (skip-empty invariant) | S | a finished build, 15 Nov 2026 | done |
| K31 | `theme-check` browser steps: `coverageProblems` (span of content, largest empty block per screen) and a phone font-floor spec | S | a finished build, 15 Nov 2026 | done (`coverage.ts`; the phone font floor was already `fontSizeFindings`, now documented in the README) |
| K32 | `phone-mode`: a `Scaled` box (a fixed-size piece drawn at a box width), a commit-flag plus second-tap wrapper over `useSecondTap` | S | a finished build, 15 Nov 2026 | done |
| K33 | `tutorial`: a docked side with a reserved-space CSS variable so the screen shrinks beside the panel; panel buttons accept the game's own button component | S | a finished build, 15 Nov 2026 | done (#108) |
| K34 | Theme `Button`: `note` (a line under a plate) and `acting` (outline) props; no rivets under a width floor | S | a finished build, 15 Nov 2026 | closed: the kit has no themed Button component |
| K35 | `glossary` printed-words check: every summary and body paragraph must occur in the source documents, icons and punctuation aside | S | a finished build, 15 Nov 2026 | done (#109) |
| K36 | `tutorial` tooling: build a script from a seed's line of play, list each step's answers in on-screen words, seed search, a script-playing e2e helper | M | a finished build, 15 Nov 2026 | done (#128) |
| K37 | Tooling scripts: home-screen PNGs from a logo SVG (Playwright) and a screenshot contact-sheet script | S | a finished build, 15 Nov 2026 | done (built in #163) |
| K38 | `offline`: network-first navigation (with a timeout) and auto-apply of a new build when no input is half-entered; replaces a game-side patch of the worker file | M | a finished build, 15 Nov 2026 | done |
| K39 | `bug-reporter`: an `index`/`ui` entry (games need an eslint-disable per import today) and token storage read lazily, not at import | S | a finished build, 15 Nov 2026 | done |
| K40 | `tutorial`: fix the highlight freezing the page | S | a finished build, 15 Nov 2026 | done |
| K41 | `sim-pool`: a seed plays differently in a pool worker than alone (find the cause); a per-prompt observation hook; a grid-sweep helper over `runResumable` with a CSV and spread per cell | M | a finished build, 15 Nov 2026 | done (the cause was in the game: its sim script builds another seed and settings for a lone run; the kit has a test that pool and alone match) |
| K42 | `settings` screen: a slot for custom rows (games portal into it by title text today); `saves` screen name fit | S | a finished build, 15 Nov 2026 | done |
| K12b | `motion-frame` `play(beat, { parallel: true })` (a beat starts at once beside the playing one); `effect-library`: `move` and `scale` animate `translate` and `scale` so they compose with the transform verbs, and `resolve(id, run)` gets the run | S | 7th Inning Stretch PR 30, 15 Nov 2026 | done |
| K12c | `effect-library`: `layer.start(run)` makes the beat's stand-ins at its start (a live piece hidden at the start left a hole until its actor's first verb); `text` reaches full opacity in the first quarter of the call so the rise is seen | S | 7th Inning Stretch PR 36, 15 Nov 2026 | done |
| K12d | `effect-library`: optional step `scale` on `move` and `fade-in` (a number n = from n to 1, `[a, b]` = from a to b), composed with the move's translate; e2e test for two verbs on one actor no longer reads at a fixed 100 ms | S | 7th Inning Stretch, 15 Nov 2026 | done |
| K12e | `effect-library`: `onActor(source, clone, id, run)` layer option (copy a canvas's pixels into the clone); step `hold: true` keeps a number `scale` for the whole step | S | a game, 15 Nov 2026 | done |
| K269 | New `layout-editor`: one-file wireframe editor in which the owner arranges a screen's zones (drag, resize, snap, nesting by id, card-fit warnings, mirror, undo, backdrop, screens, JSON in and out, host hooks); pure helpers in `index.ts`; `capture.mjs` records a running page's `[data-zone]` rects | M | owner, 16 Nov 2026 (Star Trek: Captain's Chair two-player table first) | done (`layout-editor`) |
| K280 | `layout-editor` round 2: zoom and pan (Ctrl+wheel, pinch, +/-/Fit, Space/middle/two-finger drag, scrollbars), zone `kind` (cards, component dashed, pile, group), screen `pile` size, Consolidate / Split of piles, Snap to grid and Snap to zones toggles with grid lines, `mode/variant` screen tabs, copy zones from another screen | M | owner, 17 Nov 2026 (two-player table) | done (`layout-editor`) |
| K283 | `card-pile` `hitTitle={false}` drops the native title on the stack button (STCC draws its own pile tooltip) | S |  | done |
| K284 | `layout-editor` Reset button (in-page confirmation): restores the starting doc, backdrops (`LAYOUT_EDITOR_BG_INIT`), zoom and screen; `layoutEditor.reset()` | S |  | done |
| K285 | `plan-checker` `--tsc-at DIR` compiles the plan's type blocks inside a game folder, so relative `kit/` imports resolve | S |  | done |
| K286 | `plan-checker` `--tsc` compiles through a tsconfig of its own, so TypeScript 6 runs it beside a game's tsconfig.json | S |  | done |
| K287 | `engine-core` `KernelOption.alone`: an option answered only on its own (Back, Pass) in a pick-N prompt; validation, answers, defaults, ask check and `onlyOne` agree | S |  | done |
| K288 | `sim-pool` `legalAnswers` honours `KernelOption.alone`: alone options leave the combinations and each enabled one is a single-pick answer | S |  | done |
| K289 | `prompt-host` `PickOptions` and `Order`: an enabled `alone` option answers `[id]` on its click and never joins the selection | S |  | done |
| K290 | `plan-checker` `--tsc` type blocks compile with the kit's lib (ES2023, DOM) and JSX, so imported kit files using `findLast` or DOM types pass | S |  | done |
| K291 | `app-icons`: reusable opaque home-screen icon renderer, maskable safe zone, relative manifest and idempotent HTML tags; nine prototype icon proofs | S |  | done |
| K292 | `engine-core` held triggers: `cfg.held(s, t)` keeps a pending trigger waiting (an "after" response until its effect or game action ends) while "when" responses still fire at the checkpoint; the game pushes `timing.triggers` to release them, and simultaneous released ones order through the normal prompt. `card-language` `When.timing` (`when` / `after`) is carried onto the trigger | M |  | done |
| K293 | TurnBanner takes `turnName(turn)` so a game prints its own words; every kit `<button>` in table-panels, card-hand and card-pile carries `data-kit` so a theme can skip it | S |  | done |
| K294 | `useDragDrop` takes optional `sourceLegal(id)`: decides who may start a drag and whether it stays legal, so composite option ids (`slot:card`) work without wrapping `pick` | S |  | done |
| K295 | `validateEffect` / `validateStep` read only objects in a step position as steps, so value objects with an `op` key (`calc`, `cmp`) pass; `cardTriggers` `env` gets the trigger's occurrences | S |  | done |
| K296 | engine-core `TimingConfig.triggersFor`, `invalid` and `held` receive the game's content as an added last parameter, so a trigger table kept in content needs no module variable | S |  | done |
| K297 | game-store `openingSteps` option: `fresh(seed)` and the first game pace setup's events and the opening opponent answers as steps, based on the blank state's view (default off) | S |  | done |
| K298 | `layout-editor` round 4: a plain-words tooltip on every control and kind option; **Take out** (one pile out of a consolidated box, full size, box shrinks, one undo step; `takeOut`); zone `scale` ("Card size here" 20-100%, `cardFit` takes the scale, label shows "cards at N%"); three owner how-tos in the README | S |  | done (`layout-editor`) |
| K299 | engine-core `OccurrenceKeys.other` and `SharedKey` `'other'`: a second object key for two-object occurrences (attach, move, swap), so once-per-pair limits, `sharedKeys` and `batchGroups` key on both | S |  | done |
| K300 | screens: MainMenu entry label accepts a ReactNode; SetupForm controlled mode (value + onChange), renderField seam, optional seats (solo), select-many fields (many: checkbox group with min/max) | M |  | done |
| K301 | table-panels `GameOver`: `title` slot, `reason`, `standings={false}`, optional score, `actions={false}` with exported `GameOverActions`, for a solo game that ends with a printed reason | S |  | done |
| K302 | game-store `debug(action)`: an engine-core `DebugAction` through the store (own undo step, saved, replayed, settled, autosaved), so debug-console mounts on a store-driven game (`send={store.debug}`) | S |  | done |
| K303 | kit.mjs pull: when the folder rename fails (EPERM/EACCES/EBUSY, an open handle on Windows), swap by copying; a failed swap restores kit/ | S |  | done |
| K304 | table-panels `TurnBanner` `phaseName(banner)`: a game replaces the phase words, or returns null to drop the phase span (no CSS hiding) | S |  | done |
| K305 | prompt-host `PickAmount` `readout(option, prompt)`: a preview of the current amount beside the stepper (class part `readout`), so a game need not wrap `look.label` | S |  | done |
| K306 | target-arrow default look: the glowing dashed arrow (Unstoppable D-129) in `target-arrow.css`, part `target-arrow-glow` (was `-edge`), gold glow pulse on a glow-only target, red glow on the aimed place | S |  | done |
| K307 | target-arrow: the dash flow duration has a floor (`max(--motion-scale, 0.05)`), so a scale of 0 never gives a 0 s infinite animation; data-motion="off" is what stops the flow | S |  | done |
| K308 | four opt-in glow looks from Unstoppable (never defaults): card-parts `looks/icon-glow.css`, counter `looks/health-glow.css`, effect-library `looks/rise-pulse.css` (class `fx-rise-pulse`), prompt-host `looks/legal-glow.css` | M |  | done |
| K309 | prompt-host `looks/imperium-legal.css`: Imperium's playable glow (three-layer gold bloom) on `[data-mark="legal"]`, opt-in, beside the Unstoppable `legal-glow.css` | S |  | done |
| K310 | card-hand: while a card is lifted under the pointer, its strip carries a hit area shaped like the grown, straightened face (a `::before` with the face's transform), so the pointer anywhere on the grown card keeps it lifted and a click there picks it; the rest strip still holds it (no flicker); hands with `faceEvents` keep their own face hit area | S |  | done |
| K311 | card-hand: the default arc is the gentle one, `TILT = { step: 1.5, total: 14, radius: 20 }` (was 8, 32, 4); a game's `tilt` prop still overrides it | S |  | done |
| K312 | tuners/: self-contained tuner pages built from `tuners/src/*.html` by `tuners/build.mjs`, which inlines the kit's own CSS and bundles its modules (`--check` in `components:check` keeps them current); the first is the card-hand tuner (the Hand Arc Tuner) | S |  | done |
| K313 | tuners/effect-library.html previews all twelve effect-library verbs, the rise-pulse look and motion-frame sequences with live settings and copyable code. | S |  | done |
| K314 | Target arrow tuner with controls for colours, glow, stroke, dash flow, head size, curve, snap, strike timing and motion scale. | S |  | done |
| K315 | tuners/glows.html: tunes picked marks, legal highlights, inline icon glows and counter motion and warnings on live stand-ins. | S |  | done |
| K316 | Card motion tuner for dealing, refill turn-over, deck cycling and riffles, pile stacks and fans, and the market refill slide. | S |  | done |
| K317 | Token Motion Tuner for token flights, 2D and 3D bag draws, marker glide, hop-and-fill with a multiplier badge, and the lit step list. | S |  | done |
| K318 | tuners/pieces-motion.html: tune WebGL d6 and d10 rolls, ball roll and settle, chip depth and piece shadows, and the drag ghost across two targets | S |  | done |
| K319 | theme-check: `fontFaces` takes several entries per family (one per face file, e.g. normal and italic) and an `@font-face` passes when it loads any of them; `assets.svgs` accepts any drawable shape (circle, rect, ellipse, polygon, polyline, line, use), not only a path | S |  | done |
| K320 | turn-flow: `FlowConfig.roundEnds(s, pos)`, asked after each turn, ends the round when the game says so (a solo game's round ends when its deck runs out); seats keep cycling within the round; default unchanged (one turn per seat) | S |  | done |
| K321 | ci-templates: the Full gate workflow has `run-name: Full gate PR #<pr> <sha>`, so the tested head is in the run's title | S |  | done |
| K322 | ci-templates: the Full gate run-name is quoted, since an unquoted ` #` starts a YAML comment and cut the title to "Full gate PR" | S |  | done |
| K343 | Tests that flake under runner load made robust: check-runner K138 stream order, ci-templates local-ci step lines, app-frame crash screen save-later | S |  | done (coverage crash: cause not found, left open) |
| K344 | token-flights: a flying token keeps its size under a page's `img { max-width: 100% }` reset (the flight layer is 0 px wide, so the reset shrank every token to nothing) | S |  | done |
| K345 | The effect-library tuner covers the K332 flights, multi-stop path and trail. | S |  | done |
| K346 | saves: importAllData reads back an exportAllData file (listed keys and stores with write; refuses unreadable, wrong format, newer version) | S |  | done |
| K347 | `deck-motions` turn-over takes `axis: 'x' | 'y'` (side to side, default; or top to bottom). The effect-library `flip` gets the same option in K334's PR | S |  | done |
| K348 | `deck-motions` turn-over takes `direction: 1 | -1` (front or back flip). The effect-library `flip` gets it in K334's PR | S |  | done |
| K350 | card-parts: StateBanner, a game-free diagonal state word over a card (any card shape, clipped to it, optional grey-out of the face; look by CSS variables, no animation) | S |  | done |
| K351 | docs/motion-retrofit/INVENTORY.md: every animation and effect in 11 games, file:line, in kit / row / missing; the missing list feeds the effect batches | S |  | done |
| K356 | game-store: `simGameOf` takes an optional `start(spec)` so a game with modes or settings starts its sims from the whole spec | S |  | done |
| K357 | docs/INVENTORY.md: every reusable part of 11 games against the kit, a merged work list of 23 items, and the retrofit backlog (555 own copies) | S |  | done |
| K358 | The card-motion tuner shows the turn-over axis and direction. | S |  | done |
| K381 | Effect-library tuner shows every effect: flip axis and direction, spin and tap, beams, combat, signals, refresh, pulse and idle loops | S |  | open |
| K382 | llm-playtester: headless Claude playtests of whole games through a game adapter, with a dollar cap, findings and a replay per run. | M |  | done |
| K383 | screens SetupForm: submit={false} leaves out its Start button; id lets a game's own button elsewhere start the game | S |  | done |
| K385 | phone-mode Sheet: siblings made inert are freed after close under React StrictMode (idempotent record and restore) | S |  | done |

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
| K135 | `theme-check`: a switch per rule (COLOR, RADIUS, SHADOW cannot be turned off; 312 findings in Jarl); the token file not exempt when a game wants it checked | Jarl | S | done |
| K136 | `traceability`: a TypeScript parse of test titles in place of the text scan (ids in a fixture string count today); `idsAtLineStart` takes section 3 table rows as rules; the id pattern given whole as one regexp (STCC's plan regexp verbatim; Imperium's id after a dash or underscore); the dot required in `## 3.`; EBR's scenario report, rejected-title print and counts line | EBR, STCC, Imperium | M | done |
| K137 | `repo-gate`: a PORT rule; CONTENT_NAME and RAW_SCAN switchable; CONTENT_ID not exempting engine test files; a blob missing from a sparse partial clone is skipped with a notice where the game says so; text not checked out, UTF-16, chat URLs, warn-only size | Warp's, STCC | M | done |
| K138 | `check-runner`: streamed `[lane]` output, `npm --silent`, skip `last` once a lane failed | STCC | S | done |
| K139 | `plan-checker`: `--tsc` over several sections in order plus a stub line | Unstoppable | S | done |
| K140 | `bundle-size`: `--follow true` exits 2 on an encoded `url(%23n)` in a stylesheet | STCC | S | done |
| K141 | `ci-templates`: templates for a multi-step gate and a second job (Python), so EBR, Imperium, STCC, Warp's, Rome and Unstoppable can render theirs | six games | M | done |

### Wave 5 - Under Falling Skies (16 Nov 2026)

What the eighth game has that the kit lacks, from its assessment at kit v0.33.0 (`docs/RETROFIT_PLAN.md`, Part D). UFS is a solo game: its two-player-only items do not apply.

| # | Batch | Found in | Size | State |
|---|---|---|---|---|
| K172 | `traceability`: `citeFiles` (folders): every non-test file under them cites at least one rule id in a comment, the finding lists the files (UFS: `src/engine/phases`, `rules`, `abilities`); the only thing keeping UFS on its own check | Under Falling Skies | S | done (v0.42.0; UFS uses it) |
| K168 | New component `transcription-check`: two transcriptions of each printed item made independently (A and B, each with transcriber, source picture and session), a field-by-field diff written to `DIFF.md` that fails while a difference is open, a generated progress table (item, picture, A, B, diff, verified), an owner verification ledger holding the hash of the agreed file (an edit after verification undoes it), and a gate listing the required items not yet verified, for the content check and the real-pack build; the game passes its item list and transcript schema | Under Falling Skies (`scripts/lib/real.ts`, BUILD_PLAN §12) | M | done |
| K169 | `card-harness` content gate: a folder of broken packs, each with the issue code and severity it must report; generated files compared with what the generator writes now ("stale: run ..."); every card-language feature used at least once by the placeholder and test packs (`--require-all` fails on an unused one) | Under Falling Skies (`scripts/validate-content.ts`) | S each | done |
| K170 | `tutorial` coach (compare first with K15): first-time tips as data (id, text, `when(events, state)`, held back during a guided lesson when situational), the first unseen tip the last action made relevant, seen ids kept per browser; a suggested move taken from the game's driver with its plain-word reasons and the places to spotlight, so it works on any pack | Under Falling Skies (decisions 036, 037) | M | done |
| K171 | `sound-player` `play(cue, { pitch })`: optional per-play pitch in semitones (file playback rate, synth frequencies scaled), so a game can step a chime up per point | 7th Inning Stretch (point-chime) | S | done |
| K173 | `sound-player` `playTrack(cue, { fadeInMs, loop, onEnd })`: a whole track on the music bus with fade-in, fade-out by `stopCues(ms, cue)`, `onEnd`; music-bus cues decoded on first play, not after the first tap | 7th Inning Stretch (menu to game crossfade) | S | done |
| K174 | `pieces-3d` resting tilt: class `p3-tilt` (angle `--piece-tilt`) and `<Chip tilt>` for static pieces outside a cast (swatches); README prefix line corrected | 7th Inning Stretch (theme swatches) | S | done |
| K175 | `pieces-3d` ball `stitch: 'chevron'`: seams drawn as rows of V stitches fixed to the sphere (default style kept) | 7th Inning Stretch (XD-63) | S | done |
| K179 | `pieces-3d` ball chevron fix (director, XD-63): `stitchCount` look option (default 56, 14 per visible arc at rest, seam length measured), every V drawn in its own orthonormal stitch frame so both arms are equal and the opening is 75 degrees on every stitch; proof in docs/proof/k176/ | 7th Inning Stretch (XD-63) | S | done |
| K180 | `pieces-3d` ball chevron options (director, XD-63): `stitchFlip` (V direction flips on one seam half, switch points in curve-index space at the far points), `stitchWidth` (V half width, default 0.14), `seamLine` + `seamLineWidth` (thin line under the stitches through every apex); defaults unchanged | 7th Inning Stretch (XD-63) | S | done (#187) |

### Wave 6 - gaps left after the third pass (16 Nov 2026)

Found by the third retrofit pass (`docs/RETROFIT_PLAN.md`, Part E).

| # | Batch | Found in | Size | State |
|---|---|---|---|---|
| K190 | `ci-templates`: what keeps four games on their own workflows: a `workflow_dispatch` trigger and extra dispatch inputs (runner, bands), `branches-ignore`, a draft-aware concurrency group, per-step timeouts and step `env`, the failure artifact upload, the Node version from config, a Python setup before the Node step, `E2E_PORT` on the e2e step with a free-port pick, Rust steps, a conditional npm cache, STCC's media guard, merge-with-main and face-test venv; the header comment must match `runDrafts` | EBR, Imperium, Warp's, STCC | M | done (EBR `verify.yml` stays its own: separate workflow with path filters) |
| K181 | `repo-gate`: size the blobs missing from a sparse partial clone in one pass (`git rev-list --missing=print`), never one `git cat-file -s` per blob (STCC's CI timed out on it; STCC keeps its own gate until then) | STCC | S | done |
| K182 | `theme-check`: the ICON rule can require a path whose `d` starts with `M` (Jarl's own check did) | Jarl | S | done |
| K183 | `traceability`: an option to reject test titles written as template literals with `${}` (EBR's own check did) | EBR | S | done |
| K191 | `pieces-3d` ball chevron option `seamLineDash` (director, XD-63 addition): the seam line becomes dashed, one round-ended dash per stitch centred on its apex, `seamLineDash` x the stitch spacing long (0/undefined = solid, game passes 0.6); colour and width unchanged | 7th Inning Stretch (XD-63) | S | done (#193) |
| K192 | `voice`: never-twice is keyed by the spoken text (line id plus its filled parts/pieces), not the line id alone (director, XD-64): "top of the 3rd" then "top of the 4th" both play, the same words back to back stay suppressed | 7th Inning Stretch (XD-64) | S | done |
| K201 | Agent documentation: AGENTS.md, generated `docs/CATALOG.md`, recipes, `docs/GAPS.md`, `kit.mjs list` and `search`, "Use it in 10 lines" in each README with a type-check of the examples | agent-facing docs (owner, 16 Nov 2026) | M | done |

### Wave 7 - the gap analysis (`docs/GAPS.md`, 16 Nov 2026)

| # | Batch | Found in | Size | State |
|---|---|---|---|---|
| K123 | (reopened, GAPS A2) Prompt host: shows the engine's open question through a typed widget registry (a missing kind fails to compile) with the common widgets: pick cards, pick an amount, order, may / yes-no, pay a cost. Unstyled default; each game styles its own. Folds in ghost-card, prompt-source and paced-view only where that removes duplication | STCC, Imperium, Rome, Jarl, EBR, UFS | M | done (`prompt-host`: Rome host base, STCC order, Jarl autoAnswer; uses prompt-source for the heading; ghost-card and paced-view left apart: no duplication to remove) |
| K202 | (GAPS A1, part 1) Card parts: layout as data, art, text with icons, tokens | STCC, Imperium, EBR, Unstoppable | M | done (`card-parts`: the layout is the game's data, no face fixed (owner, 16 Nov); STCC base) |
| K203 | (GAPS A1, part 2) Card zoom: full transcription (decoded text, icons, tokens, glossary links), text matching what the engine does | STCC, Imperium, EBR, Unstoppable | M | done (`card-zoom`: transcription data and unstyled sections with slots, no layout fixed; STCC CardDetail base, EBR Escape) |
| K204 | (GAPS A3) New-game scaffold: one command makes a working empty game repo (Vite, lint, Vitest, tsconfig, dev and phone scripts, CI from ci-templates, kit pull, engine-core wired, stub GameRules) | 7th Inning Stretch shell | M | done |
| K205 | (GAPS B3) Reference mini-game in the kit's CI: plays through engine-core, app-frame, the prompt host, saves, settings, sim-pool and replay, as a contract test that the components fit | kit | M | done (`reference-game`: generated by `scaffold` with an overlay, its own `npm run check` in the kit's tests; card-language plays the card effects) |
| K206 | (GAPS A4) Card-language starter: verb registry with handler and text-generator slots, a validator, and a test that every verb has a runner. The shell only; each game writes its own verbs | STCC, Imperium, Rome, Unstoppable, Jarl, EBR | M | done (`card-language`) |
| K207 | (GAPS B4) plan-checker warns when a game's kit pin is far behind the latest tag, and when a GK phase targets a row already done | Radiance plan | S | done |
| K208 | (GAPS B5) `kit.mjs next-id`: reads origin/main and open PRs before handing out a row id | kit | S | done |
| K209 | (GAPS B6) worktree-setup and worker-finish scripts: link node_modules, run the check in a WSL clone, refuse to finish with uncommitted changes | 7th Inning Stretch, Radiance | S | done |
| K210 | (GAPS B7) Generated one-page "state of the kit" from PLAN.md | kit | S | done |
| K211 | (GAPS A7) Dice tray and roll window | 7th Inning Stretch | S | done |
| K212 | (GAPS C7) sound-player: `playTrack` always plays a cue's first file (7th Inning Stretch works around it) | 7th Inning Stretch | S | done |
| K216 | (GAPS-2 A1, A2, A5, A7) Agent tooling quick wins: `kit.mjs worktree`, `finish`, `teardown` in plain node (no tsx, links the main checkout's node_modules; a pull also copies `kit/agent.mjs` so games have them), `worktree --here`, `next-id --reserve` (ref `refs/kit-reserved/K<n>` pushed only if absent), `state` shows open PRs and game pins, `finish` prints `PASS <sha>` / `FAIL <sha>` | agent experience | M | done (`scripts/agent.mjs`, `kit.mjs`, `scripts/state.mjs`) |
| K217 | (agent-experience study C1-C8) Docs fixes: `new` as step 1 of new-game, README components list cut to a pointer, GAPS.md moved to `docs/evaluation/`, AGENTS.md reordered, `state` in the usage line, `list` prints name and use-when only | agent-experience study | S | done (C8, worktree place, left: it lives in agent-workflow.md and the game handoffs) |
| K215 | Recipes for the gap-analysis components: prompt host, card face and zoom, dice, work as an agent in this repo; card-effect.md points at card-language; reference-game named as the wired example | kit | S | done (`docs/recipes/prompts.md`, `card-face-zoom.md`, `dice.md`, `agent-workflow.md`) |
| K213 | sound-player: preload a subset (`autoPreload`, `preloadAll(filter)` by bus and/or cue), `release(filter)` frees decoded buffers, `playTrack` `take` index | game performance pass | S | done (`sound-player`) |
| K214 | `kit.mjs new` does the whole start: registers the port block (`server.mjs add`, read-only use), `git init`, first commit, private GitHub repo, delete-branch-on-merge; re-run safe; `--no-remote`, `--no-install` (owner, 16 Nov 2026) | new-game start | S | done (`scaffold`) |
| K222 | (GAPS-3 A1, A2, A7) Engine prompt contract: `ctx.ask(prompt, resume)` binds the resume task to the prompt by id (an answer whose bound task is not on top, asking with no resume task, `then` after `ask` are engine bugs); a prompt nobody can answer is refused; optional `kind` and `seat` on `KernelPrompt`, read by timing (default prompts), prompt-host (`seat`), sim-pool (`bySeat`), opponent (`view(state, seat)`), learned-opponent (`actorOf`) and the reference game; old inputs kept, deprecated (owner decision 1, 16 Nov 2026) | gap analysis 3 | M | done (`engine-core`, `prompt-host`, `sim-pool`, `opponent`, `learned-opponent`, `reference-game`) |
| K218 | `card-hand`: the hand as a ZoneView fan (null = back, no id in the DOM) with the fan geometry CSS shipped (width-fit strips, lift, neighbour slide, picked stands up, hint slot, size tokens), true arc, marks from useBoardPick and picked-state, tap, drag-drop source, speed-scaled lift, draw-in rise and play glide (owner decision 3b, 16 Nov 2026). Imperium FloatingHand and table.css, Unstoppable fanOf and playMotion | STCC, Imperium, Unstoppable | M | done |
| K219 | Pile part (`card-pile`): `Pile` draws a card-zones `ZoneView` (a `null` is a back) as a stack (top face, edges, empty slot); a click fans the cards out with the animated fly-out and gather (speed factor, none at 0 or reduced motion), modal backdrop with a hole for the decision panel, focus in and back, Tab ring, Escape; `useBoardPick` marks name the cards and a click taps, the fan closes when the prompt stops naming them; `phone` opens `PileGrid` in phone-mode's `Sheet`. Faces are render props; structural CSS only. Pure geometry and open/close logic in `fan.ts`, `logic.ts` | STCC, Imperium; Radiance is the first user (GK219) | S | done |
| K220 | `drag-drop`: pointer dragging (mouse and touch, threshold 8 px) of a source (`data-drag` option id) onto a target (`data-drop` option id); legal targets get `data-drop-state` legal/over; a drop answers as tap source then tap target through `useBoardPick.tapMany` (one click, one undo step); `data-drop-block` keeps the hand's fan out of the zone; ghost glides back on cancel and settles on a legal drop (Web Animations, speed factor, none at 0 or reduced motion; answer never delayed). Unstyled | Imperium (`useHandDrag`, `play/drag`), STCC; Radiance is the first user (GK220) | M | done |
| K221 | `kit.mjs new --existing` scaffolds into an existing git repo (refuses, listing them, on any file it would overwrite; no git init, repo create or first commit; still ports and delete-branch-on-merge); `kit.mjs search` also matches exported names and prints which export matched ; scaffold fixes: runner label defaults to the id, `.kit-new-*` and `.cache/` ignored, `--trailer` for the first commit, generated CI never cancels main (as K225) (GK Radiance planner gaps, GAPS-3 item 9) | Radiance | S | done |
| K224 | Picked-state ships no look (owner decision 16 Nov): rule and attribute kept, default values removed; looks/kit-classic.css (former look), imperium.css and stcc.css saved as opt-in files | Imperium, STCC | S | done |
| K226 | (GAPS-3 A1, A2, A5; owner decisions 1a and 2a, 16 Nov 2026) Prompt parts: the prompts recipe wires prompt-source, ghost-card, paced-view, picked-state and bindPromptKeys with prompt-host (option buttons carry `data-picked` and `data-shortcut`); ui-helpers `onlyForcedAnswer` and `createSelection` marked "use prompt-host"; forced answers sent from the store by `answerWithForced` / `sendForced` (one undo step per click, one paced queue, none for another seat), host `auto` kept for games without undo; `useBoardPick` picks min..max | 7th Inning Stretch (store loop) | M | done (`prompt-host`, `ui-helpers` README, `docs/recipes/prompts.md`) |
| K229 | (owner pick 8a, 16 Nov 2026) The kit runs on plain `node` (22.18+): no tsx, ts-node or build step. Relative imports name their `.ts`/`.tsx` file (one script rewrote them), `erasableSyntaxOnly` on (parameter properties removed), sim-pool workers load `worker.ts` directly, CLI docs and CI say `node`, `engines.node >=22.18` | owner pick 8a | M | done (all components, `tsconfig.json`, `package.json`) |
| K230 | (GAPS-4 A3 items 2, 4-8) Docs for agents: recipes card-table, game-store, content-pipeline, upgrade-kit; hand/pile/drag words in the catalogue; card-effect rewrite; prompt-host README; ai-opponent seat; AGENTS.md and README cut; scaffold `--existing` text; skills edited outside the repo. No code | GAPS-4 | S | done |
| K231 | (GAPS-4 B1; owner decision 2a, 16 Nov 2026) `table-panels`: unstyled log panel (event words with slots, grouped by turn, seat filter, scrolls to newest), opponent-turn panel (paced-view steps, what the viewer may read, skip to end), game over (result, breakdown slot, rematch, review, home), turn banner (phase list, fires on change). Logic in node-testable `.ts`, React in `ui.tsx` | Imperium, STCC, Unstoppable; Radiance is the first user | M | done |
| K232 | Card-language standard verb pack `cardPack` on `card-zones`, with ask and resume | owner decision 3a, GAPS-4 B3 | M | done (#238) |
| K233 | `kit.mjs pull` copies `docs/recipes/` to `kit/recipes/` (`check` and stray-file checks know it); scaffold CLAUDE.md and AGENTS.md say search, then recipes, then README; `table-panels` README `logLines` hidden-field note | GAPS-4 A3 item 1 | S | done |
| K234 | (GAPS-4 B2, B4) `game-store`: `defineGame` + `createGameStore` (one click = one undo step and one paced step, autosave, opponent from its own view, `load` migrates and rebuilds undo; `sim.ts` feeds sim-pool, opponent driver, replay-cli); reference game plays card-zones, cardPack, table-panels and the store end to end | Imperium, Unstoppable, EBR stores | L | done |
| K235 | (GAPS-3 A3, A4, A6-A10, B, C) UI leftovers: phone-mode `fit: false` (one scaler with `<Stage>`); README tsx mount blocks checked by `readme-examples`; prompt-host `checkLook` and a dev warning for placeholder words; card-parts `iconRenderer`, `fitSize`/`useFitText`/`fitReport`; card-zoom `untranscribed`; `movement.ts` moves to effect-library and the verbs to new `pieces-3d-verbs` (breaking: board-registry and pieces-3d no longer pull effect code); README fixes C1-C4, A10 docs | GAPS-3 | M | done |
| K236 | (GAPS-3 engine A8-A10, B, C; tooling A2, A9) `order` prompts get every order in `legalAnswers`; restore says older build when the engine changed; `viewLeaks` finds numbers, substrings and rng/stack keys; README fixes and twin lines; CI drops the tsc matcher; `.cache/` ignored | GAPS-3 | S ; left for K238: engine A10 type-level fix and a sim-pool secrets option, B1 worked example, B6 heavy needs, C tests (card-language nesting, opponent, reference game timing), tooling A7-A13 | done |
| K237 | `kit.mjs new` scaffolds from `defineGame`/`createGameStore`: `game-store` in BASE, template with one GameDef, one store, one screen; README and new-game recipe | game-store recipe | S | done |
| K238 | (GAPS-3 engine A10, B1, B6, C; tooling A8-A13; K235 leftovers) sim-pool `secrets` option (a view holding a secret or an `rng`/`stack` key fails the game) and `redact` refuses such a view type; engine-core `worked-example.md` plus test (damage, prevention, trigger); `downloadText` moves to small-helpers (saves no longer needs bug-reporter), opponent drops game-log; component.json `packages` are names, checked against imports, `kit.mjs check` warns of missing ones; vitest `browser` project (retry 2) and skip-reporter; `watch-run.mjs` in plain node; catalogue drops the games snapshot; readme-examples checks sh examples; tests for catalogue and packages; boundary-check `releaseCheck`; tsx mount examples for motion-frame, tutorial, bug-reporter, prompt-gallery, pieces-3d; `useFitText` DOM test. Left: reference-game timing/opponent/golden tests (K237 owns it), ci-templates key table, plan-checker README, glossary needs | GAPS-3 | M | done |
| K239 | Watch (left by K238): reference-game timing, opponent and golden tests; ci-templates key table; plan-checker README | K238 | S | done |
| K246 | `token-bag`: a bag of tokens with its count; the draw shown as a 2D flight (token-flights from the `[data-bag]` dock) or a 3D shake-and-draw that never decides the draw; falls back to 2D (Warp's Edge bag3d, decision 017, generalised: faces, print and speed are the game's) | Warp's Edge, owner 16 Nov 2026 | M | done |
| K241 | `token-flights`: tokens that moved between two views fly from where they were to where they are; a ledger keeps each token in one place at a time (Unstoppable `flights`, `flightLedger`, `TokenFlights`, generalised; card variant left as follow-up) | owner, 16 Nov 2026 | M | done |
| K244 | `player-board`: a mat with named zones from a layout; each zone fits its cards (size, two rows, fan below the readable minimum); zones are motion anchors (Earthborne `geometry.ts` layRow, fitZone, handSink, generalised; attachments under hosts are K245) | owner, 16 Nov 2026 | M | done |
| K247 | `target-arrow`: a curved arrow from the asking card to the pointer, snaps to legal targets, collapses into the chosen one, then a hit; holds token flights until the hit (Unstoppable `arrow`, `strike`, `TargetArrow`, generalised) | owner, 16 Nov 2026 | M | done |
| K251 | `market-row`: the deck's top card as a face-up offer (`topOffer`); take/cycle by offer id incl. the top; Radiance is the first user | Radiance | S | done |
| K253 | `card-hand`: strip passthrough (`stripProps`), tap info (`onTap`), marks with reason (`markOf`), `faceEvents`, phone tap-all (`phoneTap`, `onSheet`) | Imperium | S | done |

### Owner's word (size L or stage 4)

Decided by the owner, 16 Nov 2026:
- **Privacy guards: dropped, and removed from the games.** The repositories are private and that is enforced on GitHub, so no build-time guard is needed.
- **Imported content packs: dropped.** A game carries all its cards, code and images in its own private repository; nothing is loaded at runtime from outside it.
- **Scan ingest: build (K164)**, starting from the `scanning-pipeline` repository, compared with the games' copies.
- **Information-set search driver, LLM opponent plumbing, second-engine (Rust) tooling:** only for a game with a competitive two-player mode, built when such a game needs them.
- **Kit enrichment, middle path:** build now what two or more games already do or what is plainly game-independent (wave 4 K135-K141, K25, K28, K29, K30, K33, K35, K36). Single-game visual and sound rows wait for the experience director's release passes; the rest is pulled in by a game's build plan when it needs it.

| Row | Content | Sources | Effort | State |
|---|---|---|---|---|
| K164 | `scan-ingest`: flatbed scans to card crops and a content pack (Python) | scanning-pipeline, Unstoppable, Imperium | L | done |
| K167 | `voice`: `play(id, { pieces, gapsMs })` plays given files as one line of the id with a gap after each; `voiceCues(table, extraFiles)` | 7th Inning Stretch (ideas only) | S | done |
| - | Information-set search driver; paired branch tester for AI variants | STCC | L | competitive two-player games only |
| - | LLM opponent plumbing | STCC | L | competitive two-player games only |
| - | Second-engine tooling (TypeScript and Rust twins) | Warp's | L | competitive two-player games only |
| K165 | `picked-state` (asked as K78 in a game's plan; K78 was taken): picked frame and tick tokens (`--picked`, `--picked-edge`, `--picked-width`, `--tick`, `--unpicked-dim`; phone width 3, tick 16), `pickedAttrs`; pattern note `docs/patterns/scoreboards-and-totals.md` | a finished build, 16 Nov 2026 | S | done |

## Harvest from outside repositories (owner, 15 Nov 2026)

Sixteen public card- and board-game repositories were surveyed read-only; the findings are in `docs/evaluation/outside/` (evidence is docs, headers and excerpts, so a worker reads the bodies before building). Licences: middle-earth-player, netrunner, boardgame.io and netrunnerdb are MIT (code may be lifted with its notice); marvel-champions-digital-game and arkham.build are AGPL-3.0, chiriboga is GPL-3.0, ArkhamHorror, MarvelChampions and marvel-lcg have none: from those take the idea and write it new, never paste code. Second batch: XMage is MIT and the Rally the Troops server is ISC (liftable with the notice); Forge and Terraforming Mars are GPL-3.0, rftg is GPL-2.0 or later, and the Rally the Troops game modules read have no licence: idea only. Rows are built when the first game needs them. Not taken: save-compatibility work (held until a game is complete), the source engines, multiplayer and server parts.

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
| K77 | `card-harness`: spec rows (printed line, layout by zone, one act, an expectation), each run again with that line's records removed; a row that still passes fails | middle-earth-player | M | done (`card-harness` `cardSpecs`, `specCoverage`) |
| K78 | `card-harness`: render effect records as English under their printed line; a read-only reading-judge step (ok / wrong / ambiguous / render-gap) before tests are written | middle-earth-player | M | done (renderer, `renderRecords`; the judge step is the architect skill's) |
| K79 | `engine-core`: a cause (rule id, or effect record plus printed line) on every step that changes a number; `replay-cli` test refuses a step without one | middle-earth-player | M | done (`inCause`, `causeProblems`; golden module export `causes`) |
| K80 | `e2e-helpers` or `prompt-gallery`: over seeded games, every legal action and target is sent by some labelled control | middle-earth-player | M | done (`prompt-gallery` `checkActionCoverage`) |
| K81 | `replay-cli`: digest of a curated table view after each move, pinned in goldens; report the scenarios whose digests moved | middle-earth-player | S | done |
| K82 | `check-runner`: test-cost budget (the list of test files that play whole games may not grow) | middle-earth-player | S | done |
| K83 | `card-harness` inventory: every printed line owned by a record or listed open; record verbs checked against the engine's route lists | middle-earth-player | S | done |
| K84 | Pattern notes: mechanic-family manifests with a verb-has-runner test; results cached by immutable state | middle-earth-player | S | done (pattern notes in `docs/patterns/card-language.md`) |
| K85 | Small checks and tools: sentence-length check on prompt wording (`plain-text`); private-data check on tracked files; a `move` tool that rewrites every path; docs index with a section reader | middle-earth-player | S | done, private-data check dropped (owner: no privacy guards) (`plain-text` `longSentences`; `tooling-scripts` `move`, `docs-index`; the React Compiler skip test is not kit code) |
| K86 | New `game-log`: log lines derived from engine events by one table (cards write nothing); entries as data (parts, card refs, cause, kind); append-only rows grouped by id; wording rules | ArkhamHorror | M | done |
| K87 | `game-log`: undo back to a log line; hover a line to preview that past state; plain-text export a golden can pin | ArkhamHorror, boardgame.io | S | done |
| K88 | `engine-core`: blocked targets with reason codes on legal actions; barred options with a recorded reason; the only-one-option notice | marvel-champions-digital-game | M | done (`reason`/`missing` on options, `bar`, `blocked`, `onlyOne`, `askOrTake`) |
| K89 | `engine-core`: outcome preview by probe (run, discard, return before/after numbers), stopping at hidden information | marvel-champions-digital-game | M | done (`preview`: stops `complete`, `choice`, `hiddenInformation`, `rejected`) |
| K90 | Prompts: each choice names its source frame (card and clause); decision-authority tag when the player decides for the automated side; read-only stack view | marvel-champions-digital-game | S | done (new `prompt-source`; engine-core unchanged: the game adds the fields to its prompt type) |
| K91 | `engine-core`: does-nothing check, separate from legality | netrunner | S | done (`idle` on options, `doesNothing` probe, `idleProblems`) |
| K92 | Ghost card for an ability whose source has left play | ArkhamHorror | S | done (`ghost-card` `ghostChoices`, snapshots from engine-core K113) |
| K93 | Card language: cancel and instead by batch id; prevention window declared as card data with remaining / prevented counters | ArkhamHorror, netrunner | M | done (`engine-core` `would`, `cancelBatch`, `ignoreBatch`, `insteadOf`, `prevent`, `timingHandlers`) |
| K94 | Card language: simultaneous triggers (apply all, capture follow-ups, resolve); interactive flag and a priority table for automatic order; once-per-instance against once-per-item | ArkhamHorror, netrunner | M | done (`engine-core` `timing.triggers`, `TriggerCandidate` `once` / `order`, `DEFAULT_PRIORITY`, `enteredPlay`, `simultaneously`) |
| K95 | `engine-core`: one checkpoint step after every action in rulebook order, and a recompute-until-stable pass with a cap | netrunner | M | done (`engine-core` `cfg.checkpoint`: `timing.checkpoint` after every `timing.do` and trigger, `derive` / `recompute` with `RECOMPUTE_CAP`, `checks`) |
| K96 | Card language: continuous-effects registry with typed durations | netrunner, marvel-champions-digital-game | M | done (`engine-core` `addEffect`, `Duration`, `boundary`, `effectsOf` / `sumEffects` / `anyEffect`, `endOfBatch` with `ifCancelled`, `expireEffects`) |
| K97 | `card-harness`: strict validator (unknown keys fail, variables bound before read, cited opt-outs stored as data); grammar reference generated from source | marvel-champions-digital-game, ArkhamHorror, netrunner | M | done (`card-harness` `strictProblems`, `grammarReference`, `nodesOf`) |
| K98 | `card-harness`: ability-fired trace (looked up against actually run); `expectResolved` | marvel-champions-digital-game | S | done |
| K99 | `tooling-scripts`: `card <id>`, `dsl <word>` and `refs` lookup commands generated on each run | marvel-champions-digital-game | M | done |
| K100 | Debug edits as engine actions (set a counter, summon a card, force the next random result, close a stuck prompt) and a console for them | ArkhamHorror, netrunner | M | done (engine-core `DebugAction`, `GameRules.debug`, `debugVerbs`; new `debug-console`: `parseDebug`, `DebugConsole`) |
| K101 | `sim-pool`: render the view on every step; hasten mode; one-answer replay of the failing step with timings | halogenandtoast MarvelChampions | S | done |
| K102 | `card-harness` helpers: failures print the open prompt and its choices; no-prompt-left assertion; multi-delta `changed`; live state exported as a scenario literal; `errata` / `faq` test wrappers; `withRewind` | netrunner, chiriboga, ArkhamHorror | S | done |
| K103 | Opponent pattern (when a game has a rule-based opponent): pick an index among legal options; per-card advice data beside the records; redacted view; plan record across prompts; decision record opened from the log | chiriboga, boardgame.io | M | done (new `opponent`: `pick`, advice, `redact`, plan in `Memory`, `DecisionRecord` with `decisionPart`) |
| K104 | Content build: card data patch layer, one file per reason, applied on import | arkham.build | S | done |
| K105 | Zoomed card: errata as printed / as played / word diff; rulings (question, ruling, citation, date) keyed by card | arkham.build, netrunnerdb | M | done |
| K106 | One delegated tooltip for every card link inside log lines, prompts, rulings and tutorial text | arkham.build | S | done |
| K107 | Card query language: typed field table plus a small parser; the game supplies its fields | arkham.build | M to L | done |
| K108 | `engine-core` random: named override in tests; a randomness-used flag that bars undo | boardgame.io | S | done |
| K109 | Small: icon emitted with a hidden word; paired valid / invalid fixtures per setup-legality rule with typed errors; stale flow request dropped and a loop cap; related-cards index; emitted text keys resolve; card stats diff against a community database; missing-card stand-in | netrunnerdb, arkham.build, boardgame.io, ArkhamHorror | S each | done (`small-helpers`) |
| K110 | `card-harness`: unused-answer check and strict-choose mode (an unanswered prompt fails, a scripted answer left over fails); mid-run check commands; tests of the harness's own error messages; no-duplicate-effects check at teardown | XMage | S to M | done |
| K111 | Card language: replacement loop (applied-set on the event, the affected player chooses among several, result codes including changed-but-still-happens) | XMage, Forge | M | done (`engine-core` `timing.instead` loop, `Replacement`, `ReplaceResult`, `changeOccurrence`) |
| K112 | Card language: layered recompute in game-declared layers, timestamp set on activation, optional `after` dependency | XMage | M | done (`engine-core` `layered`, `stampActive`) |
| K113 | `engine-core`: object reference = id plus zone-change counter; last-known snapshots of objects that left a zone | XMage | S to M | done |
| K114 | Small: batch events with declared shared keys; outcome tag (good or bad for the chooser) on every choice for automatic answers; every-card JSON round-trip check; script-format notes for the card-language pattern | XMage, Forge | S each | done: script-format notes in docs/patterns/card-language.md; card-harness `roundTripCards`; engine-core shared keys (K93 `would`/`sharedKeys`), `batchGroups` per key, `KernelOption.outcome` with `outcomePicks` |
| K115 | Opponent pattern, added to K103: a handler per effect verb with one fixed pipeline and a conformance test; reason-coded decisions; profiles as data; a closed hint vocabulary and a cannot-use report; memory sets and a runaway guard; evaluator with explain lines, copy-fidelity check, bounded look-ahead | Forge, XMage | M | done (`opponent`: `judge` pipeline, `handlerProblems`, `REASONS`, `loadProfile`, `adviceProblems`, `cannotUseReport`, memory sets, runaway guard, `evaluate`, `fidelityProblems`, `lookAhead`) |
| K116 | New `board-layout`: a map drawn over the board picture in Inkscape, extracted as space rects and adjacency edges | Rally the Troops | S | done |
| K117 | New board UI: registry of things (space, piece, marker, stack) highlighted from the legal-action list; stack layout for pieces sharing a space; movement animation | Rally the Troops | M to L | done (`board-registry` `movements`: Motions for the effect library) |
| K118 | New `board-model`: spaces as data, adjacency computed once, named placement kinds resolved by the board (cards never filter spaces), empty-board fixture | Terraforming Mars | M | done |
| K119 | `engine-core` (compare first with steps and `state-machines`): legal actions as one table of verb to ids, shown-but-barred included; nested state stack with scopes kept in state; flow as a typed step list with a runaway cap | Rally the Troops | M | done (`legalTable`, `legalIn` in `engine-core/legal.ts`; stack and step list covered: `state.stack`, `ctx.then`, `MAX_TASKS_PER_ACTION` in `runner.ts`, `FlowQueue`) |
| K120 | `sim-pool`: bad-undo invariant (undo left open across a random draw or reveal); dead-end and placeholder-prompt failures; the game's state assertion after every step; a breakpoint that hands back an importable game | Rally the Troops | S each | done (state assertion after every step was already covered: engine-core `invariants`) |
| K121 | `replay-cli`: three verdicts (crashed, diverged, changed) with a path diff of the final state | Rally the Troops | S | done |
| K122 | `game-log`: space and piece references that highlight and scroll the map; group boxes for a battle or an activation | Rally the Troops | S | done |
| K123 | Prompts (compare first with the kit's prompt model): closed set of prompt kinds with and / or composition and a space kind; renderer registry that fails to compile for a missing kind; a warning on a playable card when part of it will do nothing | Terraforming Mars | M | reopened as Wave 7 K123 (the earlier "covered" was a mistake) |
| K124 | Small: type-level module-boundary check; query channel for derived data; rule-violation panel with links; prompt-kind `cast` in card tests; catalogue check of card face against behaviour | Lew Morski module, Rally the Troops, Paths of Glory module, Terraforming Mars | S each | done: boundary-check built; prompt-kind cast built in card-harness (Scenario.cast); engine-core `GameRules.queries` with `query` |
| K126 | `engine-core`: optional `reseed` words on an answer (fresh randomness recorded with the action, replay exact); `freshWords()` app side | 7th Inning Stretch | S | done (asked as K79 in the game plan; K79 was taken) |
| K127 | `sound-player`: the last played file is excluded from the random pick only when a cue has three or more files (XD-54) | 7th Inning Stretch | S | done (asked as K80 in the game plan; K80 was taken) |
| K166 | New `pieces-3d`: pieces built in code (WebGL rounded d6 and ten-sided die with a flat fallback, a seamed ball that rolls by distance, a thick chip, card edge and shadow classes); `shake`, `flip`, `move`, `settle` for them over the effect library's; a demo page | 7th Inning Stretch | M | done (asked as K77 in the game plan; K77 was taken) |
| K125 | Learned opponent (owner's word; STCC D-067 stands until then): value network with one-round look-ahead on the real engine and self-play training; study in `docs/evaluation/outside/rftg-opponent.md` | rftg (Keldon) | L | done |
| K142 | `motion-frame` (1.1): reading time split from motion time (Slow lengthens holds, Quick does not shorten them); reduced motion keeps the information (a beat appears, held still) where it is dropped today; announcement clocks start when the band is visible, not when queued | middle-earth-player, marvel-champions-digital-game | M | done |
| K143 | `motion-frame` (1.1): a gate for a big beat that never blocks input; hurry (one touch finishes card motion, small feedback keeps running); several big beats under one stage (enter once, swap, leave once) | middle-earth-player | M | done |
| K144 | `effect-library` (1.1): hit stop; trauma-model shake with a frequency cap; afterimages; flash limit (under 3 a second, target only) | middle-earth-player | S each | done |
| K145 | `effect-library` (1.1): a slot held empty until its ghost lands, pile rects as anchors, a per-card entry description; number-and-place beats derived from events by one table; deltas by subtracting two states | marvel-champions-digital-game, middle-earth-player | M | done |
| K146 | `effect-library` (1.1, compare first with the canvas particle kit): effects as closed-form functions of time and a seed, with a particle budget, so tests read the functions directly | middle-earth-player | S to M | done |
| K147 | `sound-player` (1.2, compare first): cues only from the action trail (silent on load, undo and resume); one action's cues in sequence with a cap on the gap; cue fallback chain, the card's own sound first; front-silence check and a no-re-encode trim tool | marvel-champions-digital-game, netrunner, Forge | S each | done (`sound-player`: `createTrailSounds`, `resolveCue`, `checkFrontSilence`, `trimMp3`; the sequence with a gap cap was covered by `createEventSounds` `gapMs`) |
| K148 | `sound-player` music (1.2): most-specific-first chain by folder convention; a shelved track resumes where it stopped; gapless ambient loop with a crossfaded seam | marvel-champions-digital-game, Forge, ArkhamHorror | M | done |
| K149 | `phone-mode` haptics: five ticks (armed, sent, refused, land, impact) with caps and a setting; a snapped motion drops its tick | middle-earth-player | S | done |
| K150 | Small (1.1 and 1.2): token face flips at the edge-on midpoint; phase band details; banner lines that ring the cards they name; a sample on the volume slider; card flight by the View Transitions API | ArkhamHorror, middle-earth-player, netrunner | S each | done |
| K151 | New component `story` (fits 1.0, no motion): story as data only (speakers, lines with a fallback, named slots per scenario: intro, stage lines, win, loss, teaser, recap); one scenario story sheet with a "before" and an "after" part, reopenable at any time, later parts hidden until reached; a line for a named character falls back to a narrator line when that character is not in play; a picture slot shows its text note until the file exists | quincarter (ideas only), halogenandtoast MarvelChampions and LordOfTheRings (ideas only) | S | done |
| K152 | `story`: a story page as a small tree of text keys (paragraph with variables, header, list, card picture, icon, footnote) with modifiers (resolution, interlude, boxed); every "if / otherwise" branch shown with the one that applied marked from the campaign log; alternative prose as an overlay on the base text | ArkhamHorror (ideas only) | M | done |
| K153 | `story` with `engine-core`: a story beat is an engine question (read on, choose one, pick a card, pick a character), so it saves, replays and undoes like play; a long beat is split into parts that resume | ArkhamHorror (ideas only) | S | done (`story` `beats.ts`: `storyHandlers`, `storyTask`, `beatQuestion`; the beat is a kernel task and prompt, so saves, replay and step undo needed nothing new in engine-core) |
| K154 | `story` (1.1) panel reader: one picture read as ordered beats, each a rectangle in picture pixels with a caption, speech lines and a sound word; the camera pans and zooms beat to beat; next, back, skip, tap and keys; a plain cut under reduced motion; one panel rectangle gives a wide beat and a phone beat; a short story earned by an achievement opens in the same reader from an Extras screen | quincarter (ideas only) | M | done |
| K155 | `story` (1.1) event splash: a pure function over the engine event list decides whether a story splash opens (once per event, only where the story has a line); picture, one line, optional rule note; closes on a tap, a key or after 4 s, never by itself under reduced motion | quincarter (ideas only) | S | done |
| K156 | New component `campaign`, the log: recorded keys, crossed-out keys, counts, sets with crossed-out entries, order; fields declared as data (kind, label, shared or per player, rulebook citation, hidden); for each count the list of (step, before, after); rewards as ledger entries grouped by step; pure functions | ArkhamHorror (ideas only), LordOfTheRings, quincarter (ideas only) | S to M | done |
| K157 | `campaign`, steps and saves: tagged steps (prologue, scenario, interlude, upgrade, epilogue, side scenario) where a detour carries its return step; a per-game next-step function; a scenario played alone is a campaign that ends after one step; the game gets a frozen copy of the log at setup and hands back its writes at the end; save = log, position, seed, history with a log snapshot per attempt, version stamp; retry restores the snapshot | ArkhamHorror (ideas only), quincarter (ideas only) | M | done |
| K158 | `campaign`, a graph runner (owner's word, size L): nodes with setup, victory and defeat instructions as data, each with its printed text and citation; player-choice nodes with an availability test; steps run between games or inside a game in a named window | quincarter (ideas only) | L | done (`graph.ts`; random draws and card state riding across scenarios not built) |
| K159 | `campaign` screens: the between-scenarios screen as one engine question (next step, continue, upgrade, extra actions the game declares); log screen sections that mirror the paper sheet; per-instruction rows of what changed ("spent 4, earned 3"); a "handled for you" list of the automated setup steps in plain sentences; start at any scenario with a chosen history from a data-driven form | ArkhamHorror (ideas only), quincarter (ideas only) | M | done |
| K160 | New component `achievements` (compare first with `play-stats`): the catalogue as data (id, name, text, family, points, optional checklist); achievements as pure functions over finished-game records, nothing stored, so a new one applies to old games; a small versioned summary written when a game ends (result, loss reason, rounds, counts) | quincarter (ideas only), ArkhamHorror (ideas only) | M | done |
| K161 | `achievements`, feats inside a game: detection over the engine event stream; counters and seen-sets kept where undo rewinds them; an earn is stored outside the game state, once, after the save; checklists that fill across games ("win with every character"); brief centred call-outs for a feat (first defeat, a streak, a record) | ArkhamHorror (ideas only), marvel-lcg (ideas only) | M | done |
| K162 | `achievements` screens: a list by family with progress bars, a locked row says how to earn it; a tab in the campaign log; a toast that stacks several earns into one counted toast, first run silent, hold time and off in settings (static at 1.0; motion with 1.1, sound with 1.2) | quincarter (ideas only), ArkhamHorror (ideas only) | M | done (the tab lands with K159: `CampaignLog` takes the list as a tab) |
| K163 | Small: a challenge is a content item in the card language (a setup restriction plus triggered penalties) picked before a game | marvel-lcg (ideas only) | S | done |
| K200 | Weight tuner + paired validation for tuned greedy opponents (from Warp's Edge minmax.py / validate) | warps-edge | M | done |

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

## Motion retrofit (owner, 18 Nov 2026)

Every game's animations are rebuilt on `motion-frame` and `effect-library`; game effects come into the kit under neutral names with each game's look as settings; each game's own motion code is deleted. Study and sources: `docs/MOTION_RETROFIT_STUDY.md`. Every retrofitted game plays one beat per event (or chunk) in event order and reveals each log line when its beat starts.

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
| K323 | Rule change: presentation is retrofitted now (owner, 18 Nov 2026). `docs/MOTION_RETROFIT_STUDY.md` committed, `docs/RETROFIT_PLAN.md` and README say so, rows K324-K341 added | study | S | done |
| K324 | M1 `motion-frame`: board swap. A beat carries the game's `commit` (show the state after this event) and per-beat `data` (`run.data`, so `onBeatStart` reveals that event's log line); the player measures keyed elements, commits, waits (M2), measures again and flies every moved element, staggered, entering ones hidden until they land, leaving ones as ghosts. The player still never touches state | STCC `viewTransition.ts`, `director.ts`; Warp's `table/motion.ts`; Imperium `FlightLayer.tsx` | M | done |
| K325 | M2 `motion-frame`: wait for render. Spec `whenReady` / `awaitRects(ids)` beside `whenVisible`: the beat waits until its zones resolve after the commit (frame poll with a cap, then `onProblem` and play) | STCC `nextFrame`; 7IS rAF poll; Imperium `useLayoutEffect` | S | done |
| K326 | M3 `motion-frame`: phone pan. The game passes a pan session factory; a beat with `pan` switches tab or scrolls to its actor before, comes back after (once per run) | STCC `pan.ts`; Warp's `gate.ts` tab follow | S | done |
| K327 | M4: deck riffle as a verb (`riffle`), wrapping `deck-motions` `riffleFrames` | STCC `dealing.ts`; Imperium `fx-shuffle` | S | done |
| K328 | M5 `motion-frame`: holds. `gate`/`afterGate` gain `holdUntil: 'press' | beatId` and an auto-continue delay the queue owns | 7IS B-41; Warp's `gate.ts`; Imperium die-wait, Bot auto-Next; Unstoppable `strike.ts` | M | done |
| K329 | M6: per-actor `hideSourceUntil: 'start'` | Unstoppable `flightLedger`; 7IS `leave` | S | open |
| K330 | M7 `effect-library`: shared WebGL canvas with a 2D fallback, like `registerCanvasEffect` | STCC `crumple.ts`; Warp's `power/coin.ts` | M | done |
| K331 | M8 `sound-player`: check against Warp's `mixer.ts`/`engine.ts` (priority stealing, 40 ms dedupe, ducking, seeded playlist) and lift what it lacks | Warp's `fx/cue.ts`, `mixer.ts`, `engine.ts`; Unstoppable `cues.ts` | M | done |
| K332 | Effects, flights and paths: `arc-move`, `multi-stop-path`, `trail`; lab demo, contact sheet, a preset per game look | study §3 | M | done |
| K333 | Effects, beams and transfers: `warp-transfer`, `column-beam`, `rotating-beam`, `radial-streaks`, `collapse-jump` | study §3 | M | done |
| K334 | Effects, combat: `projectile`, `dissolve`, `shatter`, `shimmer`, `shield-bubble`, `ring-pulse` | study §3 | M | done |
| K335 | Effects, signals and staging: `stamp`, `motes`, `flicker`, `bar-fill`, `camera-pull`, `letterbox-banner`, `unroll`, `shake-group`, `plasma-orb`, `drift-cloud`, `tumble-3d`, `pile-lift`, `crumple` (after K330); settings added to `glow`, `flip`, `scale`<br>part 1 (signals) done<br>part 2 (staging) done; tumble-3d goes to pieces-3d separately | study §3 | L | done |
| K336 | Retrofit STCC: one beat per event or chunk in event order, log line on `onBeatStart`, `src/ui/motion` deleted; before/after recording of a full turn at 4K approved by the owner | STCC | L | open |
| K337 | Retrofit Warp's Edge (same terms) | Warp's Edge | L | open |
| K338 | Retrofit Imperium (same terms) | Imperium | M | open |
| K339 | Retrofit Unstoppable (same terms) | Unstoppable | M | open |
| K340 | Retrofit 7th Inning Stretch: swap its own effects for the kit's | 7IS | M | open |
| K341 | Harvest study of EBR, Rome, Radiance, Rise of a Jarl and Under Falling Skies; their rows added here. Done by the kit steward's sweep of all eleven games (docs/motion-retrofit/INVENTORY.md, PR 351); reduced to 12 pieces of work (its work list); mine planned as K349 (tap any angle with overshoot, spin scale-in and endless), K352, K353, K355. Static looks (dims, outlines, bands, backdrops, frames) stay in each game's theme; a generic one shared by several games goes to card-parts looks | study §6.5 | M | done |
| K342 | 7th Inning Stretch's own effects into effect-library: arc-move, glow colour and hold, flip without squash, shake-group, unroll, hideSource; its look as a preset | 7IS b3ef81b src/ui/motion/index.ts | M | done |
| K349 | Spin with direction, scale-in and looping, and tap / untap with configurable angles and overshoot | Rome e76d56f src/ui/motion/live/LiveMotion.tsx, MotionLab.tsx; EBR effects.ts and Board.tsx, Imperium b82d5cf play.css, Warp’s Edge 449af55 endscreen.css | S | done |
| K352 | Work list 2, 5, 6: refresh dissolve, one looping pulse verb, one idle verb (bob, breathe, orbit) | STCC a69c8dac, EBR 59e0ad1d, Under Falling Skies f1042f8, Warp's Edge 449af55 | M | done |
| K353 | Work list 8-11: typewriter as a `text` option (EBR book.ts:106,189), marching dashed line between two elements (STCC ShipLink.tsx:65, table.css:699-710), lock-on reticle (Warp's blocks.ts:11), falling debris particles (Rome catalog.ts collapse, Warp's endscreen.css:897) | docs/motion-retrofit/INVENTORY.md | M | done |
| K354 | Dropped after the inventory's work list merged repeats: the story and scene effects are built from existing verbs, particles and the ambience layer, or are game looks (owner, 18 Nov) | docs/motion-retrofit/INVENTORY.md | S | dropped |
| K355 | Work list 12 with the board swap (K324): view-transition wrapper with speed scaling (STCC viewTransition.ts:13, motion.css:5-8; extend effect-library bands.ts `flight`), plus Warp's data-flip and Imperium FlightLayer | docs/motion-retrofit/INVENTORY.md | M | done |
| K384 | Port the menu sheen sweep, decorative backdrop drift and staggered slash strokes to effect-library. Record the source settings and recipes for forked lightning, the closing net and roulette faces. | docs/motion-retrofit/INVENTORY.md | M | done |

## Parts retrofit (owner, 18 Nov 2026)

The kit holds every game's parts, then every game is retrofitted onto them (owner, 18 Nov 2026). Work list: `docs/INVENTORY.md` section 1, item number in brackets; its paths and commits are the sources. Item 2 (no accessibility, ever), item 5 and pack import (item 4) are dropped.

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
| K359 | [1] Proof sheet: every card face beside its data, printed words and flags, filters kept in the URL hash, plus a CLI that writes it for a pack (new proof-sheet, or prompt-gallery card side) | docs/INVENTORY.md item 1; 7IS, STCC, ER, IH, Jarl, UFS, Unst, Warps | L | open |
| K360 | [3] Screen frame, footer line, fan-project disclaimer and light/dark toggle for non-table screens (extend screens) | docs/INVENTORY.md item 3; STCC, IH, UFS, Unst | M | open |
| K361 | [4] Expansion choice with dependency ticking and base + expansion merge into one index (extend content-pack; no import or stored packs) | docs/INVENTORY.md item 4; ER, Unst, STCC, IH | M | open |
| K362 | [6] Python vector tracing and icon/crop scripts: trace icons, emblems, logos and maps from scans to SVG, retrace, proof, B&W render (extend scan-ingest) | docs/INVENTORY.md item 6; 7IS, ER, Jarl, STCC, Astra | M | open |
| K363 | [7] New-build check: detect a new build and reload once when safe, show the build commit, two-build offline e2e server (extend offline) | docs/INVENTORY.md item 7; 7IS, ER, Jarl | S | open |
| K364 | [8] Coverage report: which card-language constructs the packs use and lack, as a page and a script (new coverage-report) | docs/INVENTORY.md item 8; ER, Jarl, UFS, Radiance | S | open |
| K365 | [9] Modal and confirm dialog over the board: focus, Esc, close (new modal-dialog) | docs/INVENTORY.md item 9; IH, Unst | S | open |
| K366 | [10] Keyboard play: keys 1-9, Enter, Esc, arrow-key option lists and a help overlay (extend ui-helpers) | docs/INVENTORY.md item 10; Unst, UFS | S | open |
| K367 | [11] Board viewport: SVG zoom about the pointer, drag pan, fit, auto-pan camera that follows the action (extend board-layout) | docs/INVENTORY.md item 11; ER, UFS | M | open |
| K368 | [12] Zoom and hover-preview placement: right/left/below/above with margin, kept on screen (extend card-zoom) | docs/INVENTORY.md item 12; Warps, Unst | S | open |
| K369 | [13] Looked-at cards: memory of cards the player peeked at plus the large look-at view (new looked-at) | docs/INVENTORY.md item 13; ER, IH | S | open |
| K370 | [14] Rules screen: rulebook as data, word search, headings, rule diagrams over card faces and icons (new rules-screen) | docs/INVENTORY.md item 14; Jarl, UFS, Unst | M | open |
| K371 | [15] Browser and runtime perf capture: load timing, render counters, exact compare, dispatch cost (extend perf) | docs/INVENTORY.md item 15; 7IS, Rome | M | open |
| K372 | [16] Dev autoplay: ?dev=1 plays the store with a bot up to a chosen prompt kind (new dev-autoplay, uses sim-pool drivers) | docs/INVENTORY.md item 16; 7IS, Unst | S | open |
| K373 | [17] Scan-based board parts: state drawn over a printed scan's boxes, die-cut pieces at true size, playmat box detection, outline tracing, tone profile, finite supply (extend scan-ingest and token-bag) | docs/INVENTORY.md item 17; ER, Unst, Radiance | L | open |
| K374 | [18] Art pipeline: one chosen image per card, fetch, extract, CI cache, faces rendered from PnP PDFs, copy to public with a manifest (new art-pipeline) | docs/INVENTORY.md item 18; 7IS, ER, Astra | L | open |
| K375 | [19] Face fit check and tuning: printed text fits the face at a pixel floor, autotune/fit/measure scripts, crop sheets with grid (extend transcription-check) | docs/INVENTORY.md item 19; STCC, 7IS | M | open |
| K376 | [20] Dev component sheet route: every theme component or board view on one page (extend theme-check) | docs/INVENTORY.md item 20; 7IS, STCC | S | open |
| K377 | [21] Test setup helpers: jsdom scroll stubs, UI fixtures for component tests, real-data suite setup (extend e2e-helpers) | docs/INVENTORY.md item 21; Unst, ER, STCC | S | open |
| K378 | [22] Small UI helpers: base-aware asset path resolver, plural and number format (extend small-helpers) | docs/INVENTORY.md item 22; Rome, Unst | S | open |
| K379 | [23] Launcher that reuses the production build until its inputs change (extend tooling-scripts) | docs/INVENTORY.md item 23; ER, 7IS | S | open |
| K380 | Card-hand hover tilt toward the pointer, speed 0 = still (extend card-hand) | docs/motion-retrofit/INVENTORY.md (hover tilt) | S | open |

## Audit roadmap (owner, 16 Nov 2026)

Tasks T1-T18 of `docs/evaluation/AUDIT-2026-11-16.md` section 13, run in the phase order of its section 12.

| Batch | Content | Sources | Effort | State |
|---|---|---|---|---|
| K255 | (audit T1, G08) card-language `pay` refuses (does nothing) when unaffordable instead of clamping at 0 | audit | S | done (`card-language`) |
| K259 | (audit T17, G20) Owner host and serve root move to untracked `kit.local.json` (example committed); generic defaults without it; plan-checker finds the kit without a fixed path | audit | S | done |
| K258 | (audit T2, G14) Generated `docs/ARCHITECTURE.md`: Mermaid graph from `needs`, parts nothing needs; `catalog.mjs --check` fails when stale | audit | S | done |
| K260 | (audit T18, G15 part) Coverage report in CI: per-component line-% table after the test lane, no threshold | audit | S | done |
| K257 | (audit T4, G13) `kit check --source <game-kit>`: the locked tag still points at the locked commit and each locked component matches that tree; tags annotated from here on | audit | S | done |
| K261 | Lint ignores `.cache/`: the lint lane raced `components:check` writing `.cache/readme-examples` and failed on generated files | CI | S | done |
| K263 | phone-mode takes Imperium's phone screen: frame, tab bar with lit tab, prompt line, top bar, menu, sheet swipe/Escape/arrival guard, sheet action row | imperium ba0eda4 | M | done (`phone-mode`) |
| K264 | (audit T5, G03) `turn-flow`: data table of rounds, seat turns, phases and steps with skips; emits engine-core boundaries (turn begin, phase/turn/round end, also when the game ends); `whoseTurn`, `endTurn` for a pass | audit | M | done (`turn-flow`) |
| K270 | `card-pile` `previewOn` ('hover' default, 'hover-focus'; no preview on focus return); pile and hand fan structural CSS scoped to own roots (`data-part='fan'` clash) | imperium #141 | S | done |
| K275 | T14 screens: data-driven unstyled main menu and set-up form (G11) | audit T14 | S | done |
| K276 | T13 reference card game: turn-flow, declared trigger, replacement, duration, state check, automa via Bot, campaign step, screens menu and set-up, save mid-prompt (G01) | audit T13 | M | done |
| K277 | G19 scaffold generated from the new reference game: menu, set-up, settings, saves, recipe gates wired | audit G19 | S | done |
| K278 | T15 engine-core entry split: kernel, timing, tools entries; index stays the full re-export | audit T15 | S | done |
| K279 | `phone-mode` Sheet `leaving`/`onLeft` (caller-driven slide-down), `closeButton`; PhoneFrame `testId`/`style`, PhoneMenu `id`, SheetAction `testId`; layer behind live during a leave so a re-tap reopens | imperium #142 | S | done |
| K281 | T16 plan rows as files: one file per row, table generated, ids from file names (G16) | audit T16 | M | done |
| K282 | Docs pass for agentic development: AGENTS.md, recipe index and agent path, recipes for the new game systems, stale READMEs | owner, 17 Nov 2026 | M | done |

## Size

5 small lifts, about 18 worker batches of medium size, 2 large ones. Stage 1 is 4 batches. Work asked for by a game (the table above) comes on top.
