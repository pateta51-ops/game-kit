# Component selection (14 Nov 2026)

Which game's version each kit component starts from. Judged on the code of each game's main branch on 14 Nov 2026 by seven read-only reviews; the evidence is in `docs/evaluation/`.

Source commits: stcc `9fc59643`, warps `2af6937`, ebr `33b5abd3`, rome `1d0fd2e`, jarl `6f006a2`, imp `20a033a`, unst `9e666b4`. Under Falling Skies (ufs `07238a4`) was assessed on 16 Nov 2026 (`docs/RETROFIT_PLAN.md`, Part D); it is the source of the rows below marked K172 and K168 to K170.

## Criteria

"Best" is not the most lines of code. Each candidate was scored on:

1. **Generic** - how little of it is tied to its game.
2. **Tested** - tests that exercise it directly.
3. **Proven in use** - owner decisions, review notes, end-to-end tests, fix commits.
4. **Carries the fixes** - among drifted copies, the copy that has the fixes the others lack.
5. **Complete by feature** - a feature checklist, not a line count.
6. **Clean seams** - the game plugs in through data or an interface, not by editing the code.

## Effort

- **S** - copy with tiny edits.
- **M** - one worker batch of generalising.
- **L** - several batches or a redesign.
- **Pattern only** - not shareable as code; described in `docs/patterns/` with a pointer to the best example.

## Build tooling

| Component | Base | Graft from others | Effort |
|---|---|---|---|
| Plan checker | Jarl (same file in Warp's, Rome, Imperium, EBR; Jarl's wrapper finds Python) | - | S |
| Traceability check | Jarl | EBR's stricter title rules; UFS's rule that every engine handler file cites a rule id (K172) | M |
| Repo gate | Jarl | STCC's runner names kept as data | M |
| Bundle-size check | EBR | - | S |
| Privacy guard | EBR | - | M (dropped by the owner, 16 Nov 2026) |
| Theme check | Jarl (its file mode only) | - | M |
| Check runner | EBR (kills the whole process tree; fails when its lanes drift from the check chain) | STCC's pull-request mode and timing summary | M |
| CI and runner scripts | Jarl (full gate, workflows, local CI, runner install) | - | M |
| Glossary check, describe check | Pattern only | | |

## Engine

| Component | Base | Graft from others | Effort |
|---|---|---|---|
| Random numbers, hashing, canonical JSON, copy | Jarl, byte for byte (same as Rome; known-answer tests, no modulo bias). Never EBR's random numbers: they seed differently | - | S |
| Runner, copy-on-write, undo, replay, save format | Jarl | Warp's copy-on-write property tests and undo refusal reasons; EBR's save migration; 7th Inning Stretch's `enumerateAnswers`, test helpers and skip-empty check (K25, K30) | M |
| State-machine check | Jarl (the only one; its library has no imports) | - | S |
| Simulation pool, driver contract, driver random numbers | Warp's | EBR's crash-safe records, resume file and fuzz script | S to M |
| Generic simulation runner | Warp's contract | | L |
| Command-line replay | Imperium (most tests, golden updates) | EBR's per-action hash comparison; STCC's injected input and output | M |
| Greedy and planner players, sanity bands | Pattern only | | |
| Rule-based opponent (`opponent`, K103, K115: pick an index among legal options through one fixed pipeline, advice per card, handler per verb, reason codes, profiles and memory as data, decision records) | New code from ideas: chiriboga, Forge (GPL), boardgame.io, XMage (MIT) | - | M |
| Solo automa (`automa`, K272: seeded automa deck as state data, priority table with fallbacks and ordered tie-breaks, difficulty tiers, a sim-pool `Bot`) | STCC `src/engine/bot/choices.ts` `pickBy` (ordered tie-breaks), `src/engine/bot/deck.ts` `botRefillDeck` (empty-deck reshuffle); the rest new | - | S |
| Learned opponent (`learned-opponent`, K125: value net, one-horizon look-ahead on the pure reducer, determinization from the redacted view, TD(lambda) self-play on sim-pool) | New code from the design in `docs/evaluation/outside/rftg-opponent.md` (rftg is GPL: no code copied) | - | L |

Open check before the lift: the canonical JSON of the Jarl line and of STCC build their text and hash differently. A new game takes Jarl's as is, so nothing depends on them matching.

## Cards

| Component | Base | Graft from others | Effort |
|---|---|---|---|
| Card-language interpreter | Pattern only: every interpreter is welded to its game's state, zones and phases. Reference: EBR for the dry run and the handler table, Jarl for the small validator and registry | | L if ever shared |
| Card-language checks | Jarl's describe-check gate; the Rome and Jarl schema conformance test; the STCC and Imperium content validator | UFS's broken-pack expectations, stale generated files and feature coverage (K169) | S |
| Card-language shell (`card-language`, K206) | Jarl at 6f006a2 (OPS registry, validator, typed DESCRIBE table), STCC's op table (`null` = not built yet) and middle-earth-player's "every verb has a runner" test; Imperium, Rome, Unstoppable and EBR compared. The shell only: verbs stay in each game | - | M |
| Content pack (`content-pack`, K265, audit G07/T10) | 7th Inning Stretch `src/content/validate.ts` (duplicate-id and schema checks); Under Falling Skies and STCC content validators compared. Schema, id and reference checks, CSV/JSON import via card-harness `parseCsv`; record shapes stay in each game | - | S |
| Card test harness | STCC (scenario builder, prompt-delivery harness, choice probe, synthetic pack, inventory with stale check, written programme) | EBR's clause-level inventory and before/after helper; Warp's compiler-based reading of operation types | M |
| Small checks (module-boundary file, rule-violation list, catalogue face check) | New; ideas only from Lew Morski, Paths of Glory, Terraforming Mars | | S |

## In-game helpers

| Component | Base | Graft from others | Effort |
|---|---|---|---|
| Bug reporter | Rome (has Jarl's fixes plus the memory-only notice, scrolled capture, floating button, fake GitHub for tests) | Jarl's dialog state machine; STCC's font embedding in captures | M |
| Glossary | Warp's (pure matcher, newest, most tests, broadest check) | STCC's linking index; EBR's data-in interface | M |
| Card patches | New (arkham.build design: one patch file per reason, applied on import) | | S |
| Transcription check (K168) | UFS (the only one: two independent transcriptions, diff, owner verification by file hash, gate; generic once the item list and schema are passed in) | - | M |
| Tutorial engine | STCC (most complete and tested, owner decision notes) | Jarl's pure state machine and placement; Rome's highlight; Warp's deck-order seed script; UFS's coach, first-time tips and driver suggestions with reasons (K170) | L |
| Tutorial freeze | Pattern only | | |
| Story | Pattern only: Marvel and Arkham story code is AGPL or unlicensed, so written fresh (data shape, narrator fallback, sheet parts, picture note; page tree with valid/invalid branches and overlay; panel reader K154 and event splash K155 from quincarter, ideas only) | | S |
| Achievements (K160), K161, K162 | New; ideas only from marvel-lcg (nothing stored, versioned summary) and ArkhamHorror (catalogue, checklists); builds on play-stats, which holds no summary | | M |
| Prompt source (K90) | New; idea only from marvel-champions-digital-game (choice frame, decision authority, stack view) | | S |
| Campaign log (K156) | No game: a new design from ideas in ArkhamHorror, LordOfTheRings and Marvel Champions (see `docs/evaluation/outside/story-campaign-*.md`) | | S |
| Game log | New (K86): the design of ArkhamHorror's narrator (no licence, so no code copied): one table from engine event to row, rows as data, append-only, grouped by id | Undo to a line, hover preview (K87); space and piece refs (K122) | M |
| Ghost card (K92) | No game: a new design from ArkhamHorror `ghostAbility.ts` (no licence, so no code copied): a choice whose source left play grouped under its last-known snapshot (engine-core K113) | | S |
| Challenges (K163) | New; idea only from marvel-lcg (a challenge as a content item: setup restriction plus triggered penalties) | | S |
| Dice odds (`dice-odds`, K24) | New code from the K24 row (a finished build, 15 Nov 2026): multiset enumeration with multinomial weights, `chance(k, test)`, cached per thread | - | S |
| Dice tray and roll window (`dice-tray`, K211) | 7th Inning Stretch (roll-window machine, `src/ui/prompts/logic.ts`): new code for the tray, holds, adjusts, meanings and the optional roll hook; rolls only through `ctx.rng` | - | S |

## Menus shell and phone

| Component | Base | Graft from others | Effort |
|---|---|---|---|
| Settings | Imperium | Jarl's Layout setting; Rome's Resolution setting | M |
| Saved games | Jarl | Warp's tests; Rome's golden test; EBR's autosave slot pruning | M |
| Offline install | Jarl (precache plugin, pure register rule, offline end-to-end test) | - | S to M |
| App frame (routes, start-up, error boundary) | Imperium | Jarl's routes state machine | M |
| Phone mode | Jarl (confirmed on the owner's iPhone). About a third is reusable mechanism: viewport, safe area, sheet, disclosure | Middle-earth-player's haptic ticks (K149); a Scaled box and commit-flag tap (K32) | M |
| Proof sheet | Pattern only; take STCC's filters and groups | | |
| Themed screen frames, dev and phone scripts | Pattern only | | |

## Presentation

| Component | Base | Graft from others | Effort |
|---|---|---|---|
| Motion frame | Warp's (pure tested plan, director, sound-cue hook, skip all) | EBR's registry with one entry per event kind and its speed setting with reduced motion; Rome's injected-speed queue (STCC's view transitions not taken: the frame plays stand-ins over a stage and commits no state) | M |
| Effect library | STCC's generic set (kit, layer, dealing, beam, crumple, target highlight) plus Warp's particle kit | EBR's overlay layer, count-up and ambience | M |
| Sound player | Warp's (cue table as data, music, priorities, ducking, most fixes) | Unstoppable's event-to-cue merge layer | M |
| Sound generator | Warp's (the only one) | - | S to M |
| Voice-over | EBR (the only one). The player is generic; the scripts are tied to EBR's guide text and cast | - | M |
| Paced view (step queue, view as of a step, question band zone) | 7th Inning Stretch at 6c82d43 (the only game that paces an answer's events and folds the view per step) | - | M |
| Board layout (K116: map drawn in Inkscape, extracted as space rects and adjacency edges) | Rally the Troops `parse-layout.js`, `new-layout.js` (ISC; ported to TypeScript) | - | S |
| Board registry (K117: things highlighted from the legal-action list, stack layout; movement animation opt-in via effect-library) | Rally the Troops `world.js` (ISC; idea, written new) | - | S |
| Visual replay | Pattern only: Rome's is welded to its screens and art | | L if ever shared |
| Small helpers (K109) | New code from the outside write-ups: icon with hidden word, text-key check, paired legality fixtures, relation index here; FlowQueue in state-machines, diffCards and cardLookup in card-patches | - | S |
| Debug console (`debug-console`, K100) | New code from the netrunner (MIT, verb list only) and ArkhamHorror / MarvelChampions (ideas only) write-ups: slash-line parser and a console over engine-core debug edits | - | M |
| Card query (K107) | New code from the arkham.build BuildQL write-up (ideas only, AGPL): field table, lexer, parser, evaluator | - | M |
| Dice and ball verbs for `pieces-3d` (`pieces-3d-verbs`, K235; split out so release 1.0 does not pull the effects code) | 7th Inning Stretch, commit 4dcb9be: the verbs of `pieces-3d` | - | S |
| Code-built 3D pieces (`pieces-3d`, K166) | 7th Inning Stretch, commit 4dcb9be: the only game with WebGL dice and a rolling ball, already free of its game's names | - | M |

Generic effects: deal, move, flip, shake, highlight, beam, sparks, count-up, banner, crumple. One game's look, not shared: phaser, warp tunnel, coins, book, triumph.

## Boards

`board-model` (K118): spaces as data, adjacency computed once, named placement kinds resolved by the board, empty-board fixture. Idea from Terraforming Mars (GPL, written new); takes `board-layout` output through `fromLayout`.

## Risks to carry into the lifts

- The STCC, EBR and Rome motion code descends from an open-source LOTR LCG project (BSD-3). Its notice file travels with every file taken from it.
- `audio-gen` (K75): Stable Audio Open 1.0 (Stability AI Community License, gated weights), ACE-Step 1.5 (MIT), Kokoro-82M (Apache-2.0), a General MIDI soundfont the game supplies (GeneralUser GS: its own licence file). Checked from each project's page at lift time, 16 Nov 2026; a game re-checks before shipping anything made with them. No weights or generated audio are in the kit.
- No secrets were found in the voice-over files that were scanned; `castElevenLabs.ts` and the Warp's audio key script were not scanned. Scan them at lift time.
- Random numbers and hashing are determinism-critical: lift byte for byte, with their known-answer tests.

## Not checked by the reviews

Nothing was run; tests were counted, not executed. Per-review gaps are listed at the end of each file in `docs/evaluation/`.

## Other components (added to complete the index, 16 Nov 2026)

Components with no row above. Each starts from the game and commit in its `component.json`; `README.md` lists every component with its `needs`.

| Component | Base | Effort |
|---|---|---|
| `e2e-helpers` | Imperium `20a033a` (K48) | S |
| `tooling-scripts` | Imperium `20a033a` | S |
| `lint-preset` | Jarl `6f006a2` (K46) | S |
| `ui-helpers` | Jarl `6f006a2` (K65, K73) | S |
| `perf` | STCC `9fc59643` (K43) | M |
| `plain-text` | Rome `1d0fd2e` (K47) | S |
| `transcription-check` | Under Falling Skies `07238a4` (K168) | M |
| `resolution-frame` | Rome `1d0fd2e` (K55) | M |
| `prompt-gallery` | EBR `33b5abd3` | M |
| `prompt-host` | Rome `e76d56f` (PromptHost and parts: the cleanest host, already a Record per kind with rule ids stripped); STCC `8e6f55b` order by clicks; Jarl `cf3ecfe` autoAnswer (K123); Astra Imperium `0f98c72` scrolling overflow (K388) | M |
| `card-hand` | Imperium `22736b2` (`FloatingHand.tsx`, `table.css` hand rules); Unstoppable `fanOf` and `playMotion.ts` (K218) | M |
| `drag-drop` | Imperium `22736b2` (`play/drag.ts`, `useHandDrag.ts`); STCC `8e6f55b` the fixed drop zone (K220) | M |
| `counter` | EBR `Count.tsx` (count-up of the shown number); STCC `resourceWarp.ts` bump and totalTag, `resources.ts` counterOf, rowRightOf, CrewPanel `data-res`; Imperium `MarketBoard.tsx` Unrest levels (K240; no colours or words) | S |
| `table-panels` | Imperium `formatEvent.ts`, `LogPanel`, `botTurn.ts`; STCC `BotTurnPanel`; Unstoppable log and game over (K231; shape only, no game text, no look) | M |
| `card-parts` | STCC `8e6f55b` (face geometry as data, image cache, art provider, `[[token]]` icon text; the layout became named zones the game owns, as every game's faces differ; K202) | M |
| `card-zoom` | STCC `8e6f55b` (CardDetail: printed text with icons and glossary links beside the card; preview facts for tokens); EBR `33b5abd3` Escape; legend, engine notes and rule-id strip new (K203) | M |
| `looked-at` | Earthborne Rangers `b9b06107` (reopening the large view); Imperium Horizon `22736b2` (zone context); serialisable peek memory new (K369) | S |
| `modal-dialog` | Unstoppable modal and confirmation; Imperium modal focus and Escape handling (K365) | M |
| `rules-screen` | Rise of a Jarl `82bb1d5` (rulebook, search, diagrams); Under Falling Skies `f1042f8` (disclosures and illustrated items); Unstoppable `e314b5f` (reference sheets) (K370) | M |
| `board-viewport` | Earthborne Rangers `b9b06107` (pointer zoom and sheet bounds); Under Falling Skies `07238a4` (camera targets and tween scheduling) (K367) | M |
| `card-pile` | Imperium fan prototype `Stack.tsx`, `PeekPile.tsx`, `fanLayout.ts`, `PileGrid.tsx`; STCC `usePileFan.tsx` (K219) | S |
| `player-board` | Earthborne fan prototype `table/geometry.ts` (layRow, fitZone, MIN_CARD_WIDTH, handSink) and `Board.tsx` (rem units, mat, zone anchors); no mats, layouts or tags (K244) | M |
| `market-row` | Rome `src/engine/market/market.ts` (slots, prices, cycle, slide refill, source choice, clear) and `ui/motion/dealing.ts`, `frames.ts` (timing); Imperium `market/refill.ts` (source fallback, refill at once); Unstoppable `board/Market.tsx` (view) (K243) | M |
| `card-zones` | none taken whole: Imperium and Unstoppable `core/zones.ts` (id lists, index 0 top, one-step move), Unstoppable `select/view.ts` (count and top only), Rome and STCC deck, hand, discard per seat; written new on engine-core with per-seat visibility and `viewOf` (K223) | M |
| `game-store` | none taken whole: Imperium `gameStore.ts` + `history.ts` (rebuild with answeredBySettings), Unstoppable store + `undo.ts`, EBR `store.ts` (autosave, opponent in the store); written new over engine-core steps, prompt-host forced answers, paced-view and sim-pool, with one `defineGame` object (K234) | M |
| `picked-state` | 7th Inning Stretch `6c82d43` (K165) | S |
| `scan-ingest` | scanning-pipeline `9ec2378` (K164) | L |
| `scaffold` | 7th Inning Stretch `bb71c3fa` (K204; config files and scripts only) | M |
| `reference-game` | none: written new for the kit (K205; a made-up game generated through `scaffold` as a contract test) | M |
| `token-bag` | Warp's Edge `6790200` (K246: bag3d timeline, mode, scene, exterior, Rest, Draw; BagDock, BagView, bagDraw; faces, print, speed became the game's) | M |
| `card-attachments` | Earthborne `b9b06107` (K245: table/geometry.ts tuck, Tokens.tsx rows and boxes) and Imperium `22736b2f` (Garrison stack; the token shapes and fonts became the game's render) | M |
| `token-flights` | Unstoppable `e395a7c4` (K241: flights.ts, flightLedger.ts, TokenFlights.tsx; places, art, lookup and hold became the game's) | M |
| `deck-motions` | STCC `8e6f55b` (`ui/motion/dealing.ts`: dealFrom, refill turn-over, riffle, shuffleDecks, deck cycle; from LordOfTheRings `a3f3c01`) (K250) | M |
| `track` | Unstoppable `e395a7c4` (K242: DangerTrack spaces, states, labels, drawn and mat rendering; threatBuffs useMarkerGlide); STCC `8e6f55bd` crewTrack.ts (hop, fill, badge pop) and StepTrack.tsx (LotR PhaseTracker, BSD-3); danger rules, skull and colours left out | M |
| `target-arrow` | Unstoppable `e395a7c4` (K247: arrow.ts, strike.ts, TargetArrow.tsx; prompt kinds, source, lookup and damage predicate became the game's) | M |
| `turn-flow` | 7th Inning Stretch `src/engine/rules.ts` `season.phase` chain (each phase task queues its work, then the next phase); Radiance has no engine yet; written new on engine-core with the phase table, seat order, skips and boundary calls (K264) | S |
| `app-icons` (K291) | New; starting points: 7th Inning Stretch `scripts/app-icons.ts` (Chromium rendering) and Warp’s Edge `scripts/build-app-icons.ts` (opaque tile and safe sizing); game art remains game-owned | S |
| `art-pipeline` (K374) | Earthborne Rangers `b9b06107` (art index, fetch, extract, CI cache, PDF render; URLs, pack registry and dossier parsing became config) and 7th Inning Stretch `5e0ad51` (art-build: copy to public with manifest) | L |
