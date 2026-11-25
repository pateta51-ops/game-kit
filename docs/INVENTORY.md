# Parts inventory, all games (18 Nov 2026)

**Historical inventory from 18 November 2026.** For current implementation, see [the component catalogue](CATALOG.md).

Every reusable part of 11 games (animations and effects are in motion-retrofit/INVENTORY.md) at the commit shown, checked against the kit: in kit (and whether the game still keeps its own copy), a planned row, or missing. The work list merges the same part across games. Update a row when it lands or a game is retrofitted.

Steward note: item 4 keeps only expansion choice and base+expansion merge; importing or storing packs at run time, and item 5 (private pack hand-off), are dropped (owner, 16 Nov: no pack import, a game carries its own cards). Item 2 (accessibility) is dropped: no accessibility work ever (owner, 18 Nov).

## Kit work list (from the 11 game inventories, checked against the kit on 18 Nov 2026)

Games: 7IS = 7th Inning Stretch, STCC, Astra, ER = Earthborne Rangers, IH = Imperium Horizon, Radiance, Jarl, Rome, UFS = Under Falling Skies, Unst = Unstoppable, Warps.

## 1. Work list after merging repeats

Ordered by number of games. Each is something a second game would use unchanged (look-only = structure is game-free, look comes from the game's theme tokens).

| # | Kit work (neutral name, what it does) | Games and paths it merges | Suggested kit component | Size |
|---|---|---|---|---|
| 1 | Proof sheet: every card face drawn beside its data, printed words and flags, filters kept in the hash, plus a CLI that writes it for a pack | 7IS src/ui/screens/Proof.tsx; STCC ProofSheet.tsx, proofFilters.ts, proofGroups.ts; ER Proof.tsx; IH ProofSheet.tsx, proofSections.ts; Jarl ProofSheet.tsx; UFS ProofSheet.tsx, scripts/proof-sheet.ts; Unst ProofSheet.tsx, ProofComponents.tsx; Warps ProofSheet.tsx, proofFilters.ts (8 games) | extend prompt-gallery (card side) or new: proof-sheet | L |
| 2 | Accessibility set: polite live-region announcer, one-sentence live summary per action, aria labels built from card data, scroll-focus hook | ER src/ui/a11y/Announcer.tsx; IH src/ui/a11y/*; UFS src/ui/panel/liveSummary.ts, e2e/a11y.spec.ts; Unst src/ui/a11y/labels.ts, hooks/useScrollFocus.ts (4 games; STCC owner rule is no a11y, so not counted) | new: a11y | M |
| 3 | Screen frame, footer line, fan-project disclaimer and light/dark toggle for non-table screens | STCC ScreenFrame.tsx; IH ThemeToggle.tsx, Footer.tsx, disclaimer.ts; UFS Disclaimer.tsx, screens/About.tsx; Unst ScreenFrame.tsx, Footer.tsx, disclaimer.ts, ThemeToggle.tsx, theme/index.css (4 games) | extend screens (app-frame holds routes only) | M |
| 4 | Content-pack management: pick a pack, tick expansions with dependency ticking, import and store packs in IndexedDB, merge base + expansion into one index, pack registry with dependencies | ER pack/merge.ts, buildIndex.ts, packWithDependencies.ts, PackPicker.tsx, Products.tsx, packRegistry.ts; Unst store/packStore.ts, screens/Packs.tsx, NoPacks.tsx; STCC and IH "imports, stores and picks packs" rows (marked "no" in their inventories, same job) (4 games) | extend content-pack | L |
| 5 | Private pack and asset hand-off: link the private pack/pictures next to the app for dev and phone, zip a built pack for another device, dev-server plugin serving packs and private art | STCC scripts/assets-link.ts, pack-bundle.ts; Unst link-real-pack.ts, bundle-real-pack.ts; ER vite-plugin-content.ts (3 games) | new: pack-link (or extend tooling-scripts) | M |
| 6 | Python vector tracing and icon/crop scripts: trace icons, emblems, logos and maps from scans to SVG, retrace, proof, B&W render | 7IS scripts/art/*.py, icons-proof.mjs; ER aspect-emblems/*.py, scripts/maps/*.py; Jarl tools/art/trace-icons.py, render-bw.py; STCC scripts/dossier/repair-rulebook-icons.py; Astra "trace icons from print" (5 games) | extend scan-ingest | M |
| 7 | Version-check and build reload set: detect new build and reload once when safe, show build commit, two-build offline e2e server to test the update line | 7IS src/ui/freshBuild.ts; ER src/ui/build.ts; Jarl e2e/phone/lib/offline-server.ts (3 games) | extend offline | S |
| 8 | Coverage report: which content constructs the packs use and lack, as a page and a script | ER Coverage.tsx, content/coverage.ts; Jarl scripts/coverage.ts; UFS content/coverage.ts; Radiance "lists every effect entry, flags uncovered" (4 games) | new: coverage-report (reads card-language constructs) | S |
| 9 | Modal dialog and confirm dialog over the board (focus, Esc, close) | IH components/Modal.tsx; Unst components/Modal.tsx, play/ConfirmDialog.tsx (2 games; kit has only bug-reporter's own dialog and phone-mode Sheet) | new: modal-dialog | S |
| 10 | Keyboard play: keys 1-9, Enter, Esc, arrow-key option lists and a help overlay | Unst useBoardKeys.ts, ShortcutHelp.tsx; UFS prompts/common.tsx, e2e/a11y.spec.ts (2 games; kit has only bindPromptKeys) | extend ui-helpers | S |
| 11 | Board viewport: SVG zoom about the pointer, drag pan, fit, and auto-pan camera that follows the action | ER map/ZoomView.tsx, drawing.ts; UFS board/pan.ts, useTween.ts (2 games) | extend board-layout or phone-mode | M |
| 12 | Zoom and hover-preview placement: right/left/below/above with margin, kept on screen | Warps table/zoomPlace.ts; Unst scanned/peekPlace.ts (2 games) | extend card-zoom | S |
| 13 | Looked-at cards: memory of cards the player peeked at plus the large look-at modal | ER table/LookedAt.tsx; IH play/lookedAt.ts (2 games) | new: looked-at | S |
| 14 | Rules screen: rulebook as data, search by words, headings, rule diagrams over card faces and icons | Jarl RulesScreen.tsx, rulebook.ts, rulesSearch.ts, diagrams/*; UFS screens/Rules.tsx; Unst "rules text and sheets screens" (3 games) | new: rules-screen (uses glossary links) | M |
| 15 | Browser and runtime perf capture: load timing, render counters, bundle inventory, exact compare, dispatch cost | 7IS scripts/perf-dispatch.mjs, perf-browser.mjs; Rome scripts/perf/browser.mjs, runtime.mjs, compare.mjs (2 games; bundle part is in bundle-size) | extend perf | M |
| 16 | Dev autoplay hook: ?dev=1 plays the store with a bot to a chosen prompt kind | 7IS src/ui/dev.ts; Unst play/useAutoplay.ts, ui/dev.ts (2 games) | new: dev-autoplay (uses sim-pool drivers) | S |
| 17 | Scan-based board parts: draw state over a printed scan's boxes, scans as die-cut pieces at true size, playmat box detection, outline tracing, scan tone profile, finite supply from engine integers | ER scanOverlay.ts, scanGeometry*.ts, ScanBody.tsx; Unst scanned/*, ingest playmats.py, silhouette.py, tone.py; Radiance "measures token spots on a mat image" (marked "no", same job) (3 games) | in kit (K373: scan-ingest TS board, playmats.py, tone fit; token-bag supply.ts); games keep their copies until retrofitted | L |
| 18 | Art pipeline: one chosen image per card, fetch, extract, CI cache, render faces that exist only in PnP PDFs, copy to public with a manifest | 7IS scripts/art-build.ts; ER artIndex.ts, art-fetch.ts, art-extract.ts, art-ci-cache.ts, art-render-pdf.ts; Astra "build faces from PnP PDF" (marked "no", same job) (3 games; art-check and card-parts art are in kit) | new: art-pipeline | L |
| 19 | Face fit check and tuning: printed text fits the face at a pixel floor, autotune/fit/measure scripts, head/side crop sheets with grid | STCC content/faceCheck.ts, scripts/faces/*.py; 7IS runner-faces-sheet.py, team-sides-sheet.py (2 games) | extend transcription-check (contact-sheet.ts already in tooling-scripts) | M |
| 20 | Dev component sheet route: every theme component or board view on one page | 7IS ui/theme/ThemePage.tsx; STCC dev/BoardGallery.tsx (2 games) | extend theme-check or prompt-gallery | S |
| 21 | Test setup helpers: jsdom scroll stubs, UI fixtures (packs, art) for component tests, real-data suite setup | Unst src/test-utils/setup-dom.ts, ui/testing/*; ER tests/helpers/realdataSetup.ts; STCC "real pack built once per test run, jsdom setup" (3 games) | extend e2e-helpers or new: test-setup | S |
| 22 | Small UI helpers: base-aware asset path resolver, plural/format helpers | Rome ui/components/assets.ts; Unst ui/format.ts (2 games) | extend small-helpers | S |
| 23 | Launcher reusing the production build until inputs change | ER scripts/play.mjs; 7IS launch part of setup.ps1 (2 games; setup.ps1 itself is in kit) | extend tooling-scripts | S |

### Single-game candidates (game-free structure, only one game has it so far; build when a second game asks)

| Game | Part | Path | Suggested home | Size |
|---|---|---|---|---|
| 7IS | Box score selector counted from event log | src/ui/boxscore.ts | extend game-log | S |
| 7IS | Cue/voice content build from director sheets | scripts/content/audio.ts, voice.ts | extend audio-gen / voice | M |
| 7IS | Motion clip recorder (real-play clips) | scripts/motion-clips.ts | extend motion-frame | S |
| 7IS | Situation line | ui/xp/Recap.tsx, xp2.ts | extend story | S |
| STCC | Pile peak counter | board/table/usePeak.ts | extend card-pile | S |
| STCC | Ship link hover (token outlines its card) | ShipLink.tsx, shipHover.ts | extend target-arrow | S |
| STCC | Log stack overlay | LogStackOverlay.tsx | extend card-pile | S |
| STCC | Card back/face CSS stand-ins | cards/StandIns.tsx | extend card-parts | S |
| STCC | Asset linker is item 5; phone bundle zip is item 5 | - | - | - |
| ER | Feature gate by content | engine/features.ts | extend card-language | S |
| ER | Content hash ignoring display wording | engine/pack/canonical.ts | extend engine-core | S |
| ER | Sandbox top-up for sims | engine/sandbox.ts | extend sim-pool | S |
| ER | Campaign rebuild check and file migration | campaign/verify.ts, content/campaignSave.ts | extend campaign | M |
| ER | Staged commit tray, auto-order of simultaneous effects, dock homes | prompts/CommitTray.tsx, autoOrder.ts, dockHomes.ts | extend prompt-host | M |
| ER | Saved decks store (IndexedDB, JSON export/import) | ui/decks.ts | new: deck-store | S |
| ER | Dossier extract (split zip) | scripts/dossier-extract.ts | extend tooling-scripts | S |
| Jarl | Game-over by throw | engine/core/gameOver.ts | extend engine-core | S |
| Rome | View transition hook | ui/motion/viewTransition.ts | extend motion-frame | S |
| UFS | Embedded-viewer mode | e2e/embed.spec.ts | extend e2e-helpers | S |
| UFS | Placeholder art generator (SVG from code) | content/render/art.ts | extend card-parts | S |
| Unst | Engine version constant in saves | engine/version.ts | extend saves | S |
| Unst | Synth sound recipes | ui/sound/recipes.ts | extend sound-player | M |
| Unst | Reference card viewer | board/Reference.tsx | extend card-zoom | S |
| Unst | Proto pack build from TS sources | scripts/build-proto-pack.ts | extend content-pack | S |
| Warps | Animation speed scale | game/presentation.ts SPEED_SCALE | extend motion-frame | S |
| Warps | Twin-engine (TS to Rust) trace conformance | scripts/port/*.ts, warps-conformance | new: engine-conformance | L |
| Warps | Determinizing search; vectorised RL env on workers; Rust gate scripts | search/determinize.rs, scripts/rl/vec/*.ts, engine-rs/scripts/*.sh | extend learned-opponent / ci-templates | L |
| Warps | Visual mode switch (Cards/2D/3D) and asset purity classifier | game/visual.ts, assetPurity.ts | extend pieces-3d | M |
| IH | Phone mock with screenshot script; icon and marble generators (python) | docs/ui/mock-phone/, icons/*.py, marble/*.py | look-specific, probably leave | S |
| Astra | Theme kit HTML tokens A/B; owner review page; glyph/token index pages | docs/experience/kit, review/index.html, dossier/vector | covered by mock-review skill; leave | S |

## 2. Game-specific, no kit work

Missing rows with Game-free "no". Rows that were marked "no" but are the same job as items 4, 6, 8, 17 and 18 above are merged there instead.

- 7IS: play table wiring; pick cards with consequence preview; lineup/die/pitcher chooser; bracket and spend buttons; odds under the pool; run-spread plates; public-info advice; picked-name fallback for old saves; dice-set conditions; half-inning value iteration.
- STCC: seat marks on spaces; automa row with flip; rules-only opponent display (x2); card-large option buttons; option colours from dry run; automa log setting; automated command card; traced logo; portraits/multiplier ladder select; action tokens; mission parts; final scoring; seat hook modules; compact keyed state text with leak scan; Claude decide/parse/trace per turn; API client and budget ledger; Claude vs stub runner; two-answer branch play; per-card tentative value tables; sim content selection; source database re-pin; printed words per clause; community guide compile; rulings table to code.
- Astra: HTML rulings list; final score; ci/full gate/gate slot/watch run (already in kit, see 3); index art and checks (kit); one-off face/board build scripts; printed font identification.
- ER: target prediction from card data; effort vs difficulty test; phases; day goal checkmarks; role-swap mode; cards resolved on draw; expansion join; divisible-number pick; result row ticks; written-entries display; target outline; per-player column; deck builder with greyed reasons; day track sheet; aspect card; test result panel; quote speaker tags; community data converter; guide importer; entry rename tools. Also "Continue anyway" replay of old saves (owner: no old-save work, so dropped).
- IH: objective cards; score and collapse; bundled packs hash; card-text reader for bot (x2); ci/full gate/ingest/sandbox sweep.
- Radiance: stat parts by source; combat/travel/growth handlers; optional rule modules; difficulty rating; options to start state; stat total display; loss explanation; browser profile run; Quest area table.
- Jarl: phases and scoring; actions; storehouse limits; armed-citizen breakdown; rank colours; wordmark.
- Rome: resource cap; point pools; track movement; leader hooks; final scoring; game creation from seed; why-games-end report; dossier tables to pack; column and logo ornaments (game look).
- UFS: threat/epicness setup; game builder from options; placement/excavation/robots; ships and landings; animated board with live region; die pick with glow; capital engine ids.
- Unst: core deck/draw order; boss/story panel; single-effect skip; two-way resource conversion; bosses and minions; text to effect data.
- Warps: expansion deck; enemy damage/stun; skill buying; Rust twin of the engine; gym env; search/self-play bins; view to render model; ship pictures with fallback; ship stats; power token chips; pre-game challenge; hand-fed mock table; space background.

## 3. Already in kit (inventory said missing)

| Part (game) | Kit component |
|---|---|
| WSL runner install (7IS), gate slot lock (7IS), ci/full gate/gate slot/watch run (Astra, IH) | ci-templates (install-wsl.sh, gate-slot.sh, full-gate.yml, watch-run.sh, local-ci.sh) |
| Skip reporter for git-ignored data (ER) | ci-templates (skip-reporter.ts) |
| Node bundler for scripts (ER, Warps) | tooling-scripts (bundle-node.ts) |
| Windows setup script / dev machine setup (7IS, ER) | tooling-scripts (setup.ps1) |
| Face crop contact sheets (7IS) | tooling-scripts (contact-sheet.ts) |
| Art build manifest and check (7IS, Astra) | tooling-scripts (art-check.ts), card-parts art, repo-gate art budget |
| Recap after loading a save (7IS) | story (recap) |
| Window width hook (Unst) | phone-mode (layout for a window) |
| Bundle part of Rome perf | bundle-size |

## Retrofit backlog (own copy of a kit part)

Rows "in kit ... game has own copy": 7IS 13, STCC 79, Astra 3, ER 69, IH 53, Radiance 4, Jarl 64, Rome 80, UFS 56, Unst 68, Warps 66 (total 555). Rome, STCC, ER, Unst, Warps and Jarl are the big jobs; Astra, Radiance and 7IS already sit mostly on the kit. Components most often named in own-copy rows (a row naming several counts for each): engine-core 54, sim-pool 17, content-pack 17, prompt-host 16, tutorial 15, card-parts 15, replay-cli 14, settings 12, screens 12, saves 12. By part name the most repeated are: random driver 5, seeded RNG 4, settings screen 3, new game form 3, log panel 3, invariants 3, hash routes 3, game store 3. The five most common: engine-core (RNG, hashing, invariants), sim-pool/random driver, content-pack, prompt-host, and tutorial/card-parts (tied).

## 7th-inning-stretch-fan-prototype @ b3ef81b

Notes: the game imports kit/ for engine-core, sim-pool, app-frame, phone-mode, settings, saves, glossary, tutorial, bug-reporter, offline, sound-player, voice, state-machines, motion-frame, effect-library, pieces-3d, card-harness, traceability, theme-check, repo-gate, check-runner, bundle-size, ci-templates, replay-cli, plan-checker. Its kit/ also has look/ (theme tokens and layouts; not in the kit component list). Skipped: content data, art, dossier. Animations and effects excluded except where they are plumbing.

| Area | Part (neutral name) | What it does (≤12 words) | Path | Game-free? | Kit status |
|---|---|---|---|---|---|
| UI | Stage-scaled screen with zones from layout file | 4K stage scaled to window; zones read from layout JSON | src/ui/screens/Stage.tsx, src/ui/screens/layout.ts | look-only | in kit: app-frame (stage), layout-editor, board-layout; game uses kit |
| UI | Table geometry from layout file | Zone positions as % of table, relative zones, shifts | src/ui/table/geometry.ts | yes | in kit: layout-editor, resolution-frame; game has own copy |
| UI | Table screen composition | The play table: zones, dice, runners, panels wired to store | src/ui/table/Table.tsx | no | missing (game-specific; shells exist as board-registry, player-board) |
| UI | Piece renderers (faces, dice, tokens, runners, field) | Draws card faces by art-manifest id, dice and tokens | src/ui/table/Pieces.tsx, faces.ts | no | in kit: card-parts, pieces-3d, token-flights; game uses pieces-3d |
| UI | 3D dice looks from tokens | Game looks for code-built dice, flat fallback without WebGL | src/ui/table/depth.ts | look-only | in kit: pieces-3d; game uses kit |
| UI | Event log text lines | Every event as one plain-words line with names | src/ui/table/logText.ts | no | in kit: game-log, table-panels; game has own copy |
| UI | Prompt widgets per prompt kind | One answer widget per prompt kind, picks, targets | src/ui/prompts/Prompts.tsx, answers.ts | no | in kit: prompt-host; game has own copy (uses phone-mode ui only) |
| UI | Prompt logic: printed clause, order, band position | Pure prompt helpers: clause, counted order, skip-empty confirmations | src/ui/prompts/logic.ts | look-only | in kit: prompt-host, prompt-source, ui-helpers onlyForcedAnswer; game has own copy |
| UI | Second-tap commit and picked state | Tap to pick, second tap commits | src/ui/prompts/secondtap.test.tsx, picked.test.tsx | look-only | in kit: picked-state, phone-mode, prompt-host; game uses kit partly |
| UI | Phone table layout | Phone arrangement of the table with the bottom sheet | src/ui/phone/PhoneTable.tsx, viewport.ts | no | in kit: phone-mode; game uses kit |
| UI | Phone bug button | Bug report opened from phone layout | src/ui/phone/PhoneBug.tsx | yes | in kit: bug-reporter; game uses kit |
| UI | Main menu and menus screen | Home and menu sets from data | src/ui/screens/Home.tsx, Menus.tsx | look-only | in kit: screens, app-frame, saves ui, settings ui; game uses kit |
| UI | New-game form with "same again" | Setup form: difficulty, variants, seed, last choices return | src/ui/screens/NewSeason.tsx | look-only | in kit: screens (new-game form); game has own copy |
| UI | Pick-from-cards draft screen | Pick cards with consequence preview per pick | src/ui/screens/Draft.tsx | no | missing |
| UI | Lineup / player-selection screen | Choose lineup, die and pitcher with exhaustion hints | src/ui/screens/Select.tsx | no | missing |
| UI | Playoff bracket and spend screen | Bracket, schedules, spend buttons with cost and why | src/ui/screens/Playoffs.tsx | no | missing |
| UI | Season overview, game over, record book | Opening pack, schedule, game over, season over | src/ui/screens/SeasonScreens.tsx | no | in kit: table-panels (game over), play-stats, achievements; game has own copy |
| UI | Box score selector | Box score and season totals counted from the event log | src/ui/boxscore.ts | look-only | missing |
| UI | Bug rows list | Queued/sent bug reports list with send all | src/ui/screens/BugRows.tsx | yes | in kit: bug-reporter (queue, sendAll); game uses kit |
| UI | Bug reporter config | Reporter set up for the game; token typed by owner | src/ui/bug.ts | yes | in kit: bug-reporter; game uses kit |
| UI | Proof sheet (every face beside data) | Dev screen: each face, its data, printed words, hash filters | src/ui/screens/Proof.tsx | look-only | row K10 (pattern note); prompt-gallery covers prompts only; missing as component |
| UI | Theme page / component sheet | #/theme shows every theme-kit component | src/ui/theme/ThemePage.tsx | look-only | in kit: theme-check (token check only); sheet missing |
| UI | Themed frames and logo | Card back, plates, frames drawn from tokens | src/ui/theme/Frames.tsx, Logo.tsx, tokens.css | no | in kit: look/ tokens (game kit copy); game uses kit |
| UI | Theme token compare | Compares tokens.css with the accepted reference | scripts/theme-tokens-compare.ts | look-only | in kit: theme-check; game has own copy |
| UI | Odds-on-tap box | Read-only odds per condition under the pool | src/ui/xp/OddsBox.tsx, xp.ts | no | in kit: dice-odds (maths), engine-core preview probe; UI missing |
| UI | Situation line and recap | One-line situation; recap after loading a save | src/ui/xp/Recap.tsx, xp2.ts | look-only | in kit: story (K151) partly; missing |
| UI | Outcome spread bar | Small bar of plates for the spread of runs | src/ui/xp/ScoutBar.tsx | no | missing |
| UI | Token coach (what to spend) | Read-only advice from public information | src/ui/xp/xp.ts | no | row K170 (tutorial coach, tips only); advice missing |
| UI | Glossary and icon text | Glossary screen, linked terms, icons for words | src/ui/lookups/*, src/ui/text/* | look-only | in kit: glossary, ui-helpers compileIconWords; game uses kit |
| UI | Tutorial layer, session, items | Scripted tutorial on a seed with answer lock | src/ui/tutorial/* | look-only | in kit: tutorial; game uses kit |
| UI | Settings schema and screen | Settings as data with persisted store | src/ui/settings.ts | look-only | in kit: settings; game uses kit |
| UI | Game store wrapper, undo, autosave | Store over API; undo mode; saves | src/ui/store.ts | no | in kit: game-store, saves, engine-core; game uses kit for saves and engine-core, own store |
| UI | Hash routes as a state machine | Routes follow store state; menus free | src/ui/routes.ts | look-only | in kit: app-frame, state-machines; game uses kit |
| UI | App shell, error boundary, lazy screens | Start-up and frame | src/App.tsx, src/main.tsx | look-only | in kit: app-frame; game uses kit |
| UI | Fresh-build reload | Detects new build, reloads once when safe | src/ui/freshBuild.ts | yes | in kit: offline (update line); reload glue missing |
| UI | Dev autoplay and dev switches | ?dev=1 autoplay to a prompt kind | src/ui/dev.ts | look-only | missing |
| UI | Player/club name picker | Picked name with fallback for old saves | src/ui/clubs.ts | no | missing |
| Motion plumbing | Beat derivation from events | Events of one answer become beat ids | src/ui/beats.ts | no | in kit: motion-frame (spec playing); table is game data |
| Motion plumbing | Casts, fill, beat-to-spec table | Real actors fill accepted specs; beat to spec ids | src/ui/motion/casts.ts, fill.ts, specs.ts, stage.tsx | look-only | in kit: motion-frame, effect-library; game uses kit |
| Sound | Cue names and dice-count takes | Cue names from spec notes; take sets by count | src/ui/audio/names.ts | look-only | in kit: sound-player; game has own naming glue |
| Sound | Audio player and music bind | Sound player configured from tables | src/ui/audio/index.ts, music.ts | look-only | in kit: sound-player; game uses kit |
| Sound | Music state from visible state | Which music plays by screen and situation | src/ui/musicState.ts | look-only | in kit: sound-player music chain; selector own |
| Sound | Voice speaker assignment | One voice per speaker per game from seed hash | src/ui/audio/voices.ts, voice.ts | look-only | in kit: voice; game uses kit |
| Sound | Cue/voice content build | Builds cues, manifest, voice lines from director sheets | scripts/content/audio.ts, voice.ts | look-only | in kit: audio-gen, voice (partial); build script missing |
| Engine | Game rules object on engine core | Setup, view, forced answers, opponent | src/engine/rules.ts, api.ts | no | in kit: engine-core, game-store; game uses kit |
| Engine | Dice-condition evaluator | Conditions satisfied by dice sets, smallest set | src/engine/conditions.ts | no | in kit: dice-tray (partial); missing |
| Engine | Exact odds and coach maths | Multiset probabilities of dice, public info only | src/engine/odds.ts | look-only | in kit: dice-odds |
| Engine | Invariants checker | Invariants run after every action | src/engine/invariants.ts | look-only | in kit: engine-core invariants; game uses kit |
| Engine | Half-inning flow, roll window, outcomes | Offense, defense, playoffs flow | src/engine/offense.ts, defense.ts, playoffs.ts | no | in kit: turn-flow, dice-tray (partial); game-specific |
| Engine | Public view builder | The state as the player may see it | src/engine/view.ts | no | in kit: engine-core view, card-zones; game uses kit |
| AI | Greedy driver with reasons | Tries answers on a copy, records reason per choice | src/drivers/greedy.ts | no | in kit: opponent, sim-pool Bot; game uses kit |
| AI | Expected-runs value iteration | Value iteration over bases/outs/dice for a half | src/drivers/half-dp.ts | no | missing |
| AI | Random driver weighted | Uniform with weight on continue options | src/drivers/random.ts | yes | in kit: sim-pool; game uses kit |
| AI | Sim game module | Plugs game into sim-pool workers, counts halves | src/drivers/sim-game.ts | look-only | in kit: sim-pool, game-store sim.ts; game uses kit |
| AI | Sim runner, sweeps, weight tuner | Run N games, bands, threshold sweeps | scripts/sim.ts, sweep.ts, sweep.sh, sweep-weights.ts | look-only | in kit: sim-pool; game uses kit |
| AI | Tutorial seed search | Find seed where greedy line shows scripted events | scripts/seed-search.ts | look-only | in kit: tutorial; game uses kit |
| Tooling | Golden season record | Records whole seasons as golden saves | scripts/golden-record.ts, tests/golden | look-only | in kit: replay-cli, sim-pool; game uses sim-pool |
| Tooling | Engine apply bench | apply p95 under budget over driver games | scripts/bench.ts, perf-engine.ts | look-only | in kit: perf; game has own copy |
| Tooling | Dispatch and browser perf | Cost of one answer plus render; browser timing | scripts/perf-dispatch.mjs, perf-browser.mjs | look-only | missing |
| Tooling | Card inventory and coverage gate | Inventory of card-language pieces with coverage | scripts/card-inventory.ts | look-only | in kit: card-harness; game uses kit |
| Tooling | Glossary check | Every icon and word has an entry | scripts/glossary-check.ts | look-only | in kit: glossary; game uses kit |
| Tooling | Traceability wrapper | Rule-id citation gate | scripts/traceability.ts, trace.config.json | look-only | in kit: traceability; game uses kit |
| Tooling | Motion check and clip recorder | Validates specs; records real-play clips | scripts/motion-check.ts, motion-clips.ts | look-only | in kit: motion-frame validator; clip recorder missing |
| Tooling | Tutorial build, check, doc | Script from seed; headless check; SCRIPT.md | scripts/tutorial-build.ts, tutorial-check.ts, tutorial-doc.ts | look-only | in kit: tutorial; game uses kit |
| Tooling | Screenshot contact sheet | Combine 4K screenshots into one sheet | scripts/contact-sheet.py | yes | in kit: tooling-scripts (shots); game has own copy |
| Tooling | Face crop contact sheets | Sheet of heads / team sides with 5% grid | tools/runner-faces-sheet.py, team-sides-sheet.py | look-only | missing |
| Tooling | Home-screen icons | Icons and manifest from logo | scripts/app-icons.ts | yes | in kit: app-icons; game has own copy |
| Tooling | Art build and manifest | Copies faces, glyphs, fonts to public; manifest; check | scripts/art-build.ts | look-only | in kit: card-parts art, repo-gate art budget; missing as one part |
| Tooling | Icon trace and crop scripts | Python tracing of icons from scans, retrace, proof | scripts/art/*.py, icons-proof.mjs | look-only | in kit: scan-ingest (partial); missing |
| Tooling | Printed-icon box overrides | Icon rectangles on faces with override files | scripts/content/card-icons.ts | look-only | in kit: card-parts, card-patches |
| Data | Content build and check | CSV to JSON deterministic build; schema and counts | scripts/content-build.ts, content-check.ts, src/content/validate.ts | look-only | in kit: content-pack, card-patches; game has own copy |
| Tooling | Bundle size, check lanes, repo gate configs | Limits and lane/gate configuration | scripts/*.config.json, tools/repogate/runners.json | yes | in kit: bundle-size, check-runner, repo-gate; game uses kit |
| Tooling | CI workflows, full gate, local CI | PR CI, full gate, local CI script | .github/workflows/*, .github/scripts/full-gate.mjs, tools/architect/local-ci.sh | yes | in kit: ci-templates; game uses kit |
| Tooling | Gate slot lock | Serialises gate runs on a machine | tools/architect/gate-slot.sh | yes | missing |
| Tooling | WSL runner install | Installs self-hosted runner service | tools/runner/install-wsl.sh | yes | missing |
| Tooling | Test helpers and scenario scene | Fixtures, rigged dice consumed before RNG | tests/helpers/index.ts, tests/scenarios/scene.ts | look-only | in kit: card-harness, engine-core; game has own copy |
| Tooling | E2E specs incl. phone and screenshots | Playwright flows, shots, fonts, layout, phone | e2e/*.ts, e2e/phone/* | look-only | in kit: e2e-helpers; game has own copy |
| Tooling | Property and invariant tests | Invariants under random play | tests/property | look-only | in kit: sim-pool fuzz; game uses kit |
| Tooling | Dev machine setup | One-time Windows setup | setup.ps1 | look-only | in kit: scaffold (partly); missing |

## Star-trek-captains-chair-game @ a69c8dac

Game's kit/ copy is v0.111.0 (17 components). Game imports from it only: card-hand (FloatingHand), card-pile (TablePile), drag-drop (useHandDrag/FloatingHand), prompt-host types (useHandDrag); tooling (check-runner, repo-gate, bundle-size, traceability, plan-checker, ci-templates) via package.json scripts. engine-core, card-zones, state-machines, motion-frame are in kit/ but NOT imported: the game has its own "ported kernel". No sound/voice code exists in the game.

| Area | Part (neutral name) | What it does (≤12 words) | Path | Game-free? | Kit status |
|---|---|---|---|---|---|
| UI | Card hand fan | Fan of hand cards, lift, drag source, glow | src/ui/board/table/FloatingHand.tsx | yes | in kit: card-hand (game uses kit) |
| UI | Pile with fan/grid opener | Stack at rest, opens as fan or grid | src/ui/board/table/TablePile.tsx | yes | in kit: card-pile (game uses kit) |
| UI | Drag card onto target | Hand card dragged to board target answers prompt | src/ui/board/table/useHandDrag.ts | yes | in kit: drag-drop (game uses kit) |
| UI | Pile column / consolidated piles | Column of piles with counts, peaks, icons | src/ui/board/table/PileColumn.tsx, pileModel.ts, stacks.ts | look-only | in kit: card-pile (partial); game has own layout |
| UI | Pile peak counter | Most cards a pile held, colours "X left" | src/ui/board/table/usePeak.ts | yes | missing |
| UI | Table board layout shell | Desktop table regions, fit-to-window, model from view | src/ui/board/table/TableBoard.tsx, tableFit.ts, tableModel.ts, layout.ts | look-only | in kit: app-frame (stage scaling), layout-editor (zones); game has own copy |
| UI | Grid zone card fit | Largest card size that fits N cards in a box | src/ui/board/table/fitCards.ts, parts.tsx | yes | in kit: player-board (zone fit); game has own copy |
| UI | Shared market row | The shared row of offer cards with refill look | src/ui/board/table/SharedRow.tsx | look-only | in kit: market-row (game has own copy) |
| UI | Player board (crew board) | Mat with tracks, markers, multipliers drawn from data | src/ui/board/table/CrewBoard.tsx, CrewPanel.tsx, boardGeometry.ts | no | in kit: player-board + track; game has own copy |
| UI | Track with gliding marker | Row of spaces, marker, per-space marks | src/ui/board/table/CrewBoard.tsx | look-only | in kit: track (game has own copy) |
| UI | Step/phase track | Round and step indicator on rail | src/ui/board/StepTrack.tsx | look-only | in kit: track (step list); game has own copy |
| UI | Trait/marker overlay on board | Seat-coloured marks on board spaces | src/ui/board/TraitMarks.tsx, markColour.ts | no | missing |
| UI | Opponent (automa) area row | Face-up/hidden automa row with flip face | src/ui/board/table/BotRow.tsx, FlipFace.tsx | no | missing |
| UI | Virtual opponent row | Rules-only opponent shown in plain words | src/ui/board/table/VirtualRow.tsx, virtualRules.ts | no | missing |
| UI | Ship link hover | Hover on token outlines its card with a line | src/ui/board/table/ShipLink.tsx, src/ui/cards/shipHover.ts | look-only | missing |
| UI | Large card preview | Pointer-hover big card, store of hovered item | src/ui/board/table/preview.tsx, previewStore.ts | yes | in kit: ui-helpers (hover hold, inspect) / card-zoom; game has own copy |
| UI | Prompt panel | Open decision banner or list in centre, placement rules | src/ui/board/PromptPanel.tsx, table/placement.ts, decisionWords.ts | look-only | in kit: prompt-host (game has own copy) |
| UI | Prompt widgets per kind | One component per prompt kind via registry | src/ui/prompts/registry.ts, simple.tsx, cards.tsx, parts.tsx | look-only | in kit: prompt-host (game has own copy) |
| UI | Card choice / pick zone | Click a table card named by the prompt | src/ui/board/Pickable.tsx, PickZone.tsx, src/ui/play/picks.ts | look-only | in kit: prompt-host board picks, picked-state (game has own copy) |
| UI | Selection of picked options | Picked-not-answered state shared by prompt and table | src/ui/play/selection.ts | yes | in kit: picked-state (game has own copy) |
| UI | Effect chooser | Card large with numbered options as buttons | src/ui/prompts/EffectChoice.tsx, effectModel.ts, effectButtons.ts | no | missing |
| UI | Look fan (scan/look picks) | Looked-at cards fanned and picked | src/ui/prompts/LookFan.tsx, lookFanModel.ts | look-only | in kit: card-pile fan (partial) |
| UI | May-question prompt | Printed clause with yes/no | src/ui/prompts/MayQuestion.tsx | look-only | in kit: prompt-host may widget |
| UI | Order list prompt | Sortable list by drag or buttons | src/ui/prompts/OrderPrompt.tsx | look-only | in kit: prompt-host order widget |
| UI | Prompt glow outlook | Colour of each option from dry-run outcome | src/engine/select/outlook.ts, src/engine/text/outlook.ts | no | missing |
| UI | Prompt source and clause | Names source card and clause per prompt | src/ui/board/decisionWords.ts, src/ui/play/cardViews.ts | look-only | in kit: prompt-source (game has own copy) |
| UI | Last-known card snapshot | Show source card after it left play | src/ui/play/cardViews.ts | yes | in kit: ghost-card |
| UI | Prompt gallery | One state per prompt kind, dev page | src/ui/dev/PromptGallery.tsx, samples.ts | yes | in kit: prompt-gallery (game has own copy) |
| UI | Board gallery | Dev page of board views | src/ui/dev/BoardGallery.tsx | look-only | missing |
| UI | Dev mode switch | `?dev=1` flag for dev tools | src/ui/dev/devMode.ts | yes | in kit: debug-console (partial) |
| UI | Game log panel | Readable log in plain words, by turn | src/ui/board/LogPanel.tsx, story.ts, justNow.ts | look-only | in kit: game-log, table-panels (game has own copy) |
| UI | Opponent log reveal | Setting shows automa hidden cards in log | src/ui/board/botLog.ts, useBotLog.ts | no | missing |
| UI | Log stack overlay | Dimmed overlay of logged items under a pile | src/ui/board/table/LogStackOverlay.tsx | look-only | missing |
| UI | Turn banner | Turn/seat/phase stand-in fired on change | src/ui/board/TurnBanner.tsx | look-only | in kit: table-panels banner (game has own copy) |
| UI | Opponent turn panel | Paced steps of the automa's turn | src/ui/board/BotTurnPanel.tsx, src/ui/play/botTurn.ts | no | in kit: table-panels opponent turn, paced-view (game has own copy) |
| UI | Rail / game menu | Undo, redo, save, menu rail beside table | src/ui/board/Rail.tsx, GameMenu.tsx, src/ui/play/undoActions.ts | look-only | in kit: game-store (undo/redo); UI own copy |
| UI | Game over screen | Result, breakdown, rematch, review board | src/ui/board/GameOver.tsx, src/ui/play/gameOver.ts, useFinalBoard.ts | look-only | in kit: table-panels game over (game has own copy) |
| UI | Phone layout chooser | Which layout a window gets, phone fit | src/ui/board/phone/phone.ts, table/layout.ts | yes | in kit: phone-mode (game has own copy) |
| UI | Phone board and tabs | Per-area tabs, piles, areas for phone | src/ui/board/phone/PhoneBoard.tsx, PhoneAreas.tsx, PhonePiles.tsx | look-only | in kit: phone-mode, card-hand grid, card-pile grid (own copy) |
| UI | Phone decision dock | Rules of the decision dock/second-tap | src/ui/board/phone/dock.ts, shortPrompt.ts | yes | in kit: phone-mode (game has own copy) |
| UI | Phone bottom sheet | One card sheet with actions and store | src/ui/board/phone/sheet/CardSheet.tsx, sheetActions.ts, sheetStore.ts | look-only | in kit: phone-mode sheet (game has own copy) |
| UI | Card face (photo + text layer) | Hybrid face: photo base plus live text | src/ui/cards/HybridFace.tsx, CardFaceView.tsx, faceLayout.ts, faceModel.ts | look-only | in kit: card-parts (game has own copy) |
| UI | Card face text measurement | SVG text measure and line fit | src/ui/cards/cardText.ts, richText.ts, fontTable.ts | yes | in kit: card-parts (game has own copy) |
| UI | Inline icons in text | `[[token]]` icons inline in any shown text | src/ui/cards/IconText.tsx, iconTokens.ts, iconArt.ts | yes | in kit: card-parts (printed text with icons), glossary (game has own copy) |
| UI | Card art provider / image cache | Art per card, decode-ahead, device cache | src/ui/cards/ArtProvider.tsx, artContext.ts, imageCache.ts | yes | in kit: card-parts (art cache; game has own copy) |
| UI | Card back/face stand-ins | CSS stand-ins when no photo | src/ui/cards/StandIns.tsx, CardFace.tsx, ViewCard.tsx | look-only | missing |
| UI | Tokens on cards | Ship tokens and resource tokens at anchors | src/ui/cards/Tokens.tsx | look-only | in kit: card-attachments, card-parts (game has own copy) |
| UI | Zoomed card with printed text | Zoom showing printed words, markup, glossary links | src/ui/cards/PrintedText.tsx, printedMarkup.ts, faceLinks.tsx | look-only | in kit: card-zoom (game has own copy) |
| UI | Automa printed card | Automated command card shown as printed | src/ui/cards/BotPrinted.tsx, automatedCommand.ts, botPrintedMarkup.ts | no | missing |
| UI | Card crumple on junk pile | Card shown crumpled on pile | src/ui/cards/useWad.ts | look-only | row K330 (effects) |
| UI | Starfleet delta glyph | Traced logo as SVG component | src/ui/components/StarfleetDelta.tsx | no | missing |
| UI | Error boundary | Render error must not blank page | src/ui/components/ErrorBoundary.tsx | yes | in kit: app-frame (game has own copy) |
| UI | Hash router / app shell | Hash routes, per-screen boundary, lazy screens | src/ui/App.tsx, routes.ts, main.tsx | yes | in kit: app-frame (game has own copy) |
| UI | Glossary lookup | Terms linked in text, popover, screen, matcher | src/ui/glossary/*, src/ui/screens/Glossary.tsx | yes | in kit: glossary (game has own copy) |
| UI | Glossary coverage check | Checks every generated text term resolves | scripts/glossary-check.ts, glossary-samples.ts | yes | in kit: glossary (coverage check; game has own copy) |
| UI | Main menu / home | Title screen with menu entries | src/ui/screens/Home.tsx, titleIcons.ts, titleFonts.ts | look-only | in kit: screens (game has own copy) |
| UI | New game setup form | Seats, scenario, difficulty from data | src/ui/screens/NewGame.tsx | look-only | in kit: screens (game has own copy) |
| UI | Character/captain select screen | Select with portraits, ladder of multipliers | src/ui/select/*, screens/take-the-chair.css | no | missing |
| UI | Settings screen | Declared settings, persisted store, screen | src/ui/screens/Settings.tsx, src/ui/store/settingsStore.ts | look-only | in kit: settings (game has own copy) |
| UI | Screen frame | Shared frame for settings/saves/glossary screens | src/ui/screens/ScreenFrame.tsx | look-only | missing |
| UI | Saved games screen | List, rename, delete, export, import saves | src/ui/screens/Saves.tsx, store/saves.ts, saveCurrent.ts, openSave.ts | look-only | in kit: saves (game has own copy) |
| UI | Autosave / persistence | Autosave after every answer, load with undo rebuilt | src/ui/store/persistence.ts | yes | in kit: game-store, saves (game has own copy) |
| UI | Game session store | One store holding game, answers, forced answers | src/ui/game/session.ts, play/answers.ts | no | in kit: game-store (game has own copy) |
| UI | IndexedDB key-value backend | Browser IDB wrapper | src/ui/store/idb.ts | yes | in kit: saves (IDB; game has own copy) |
| UI | Pack library (import content bundle) | Imports, stores and picks content packs | src/ui/store/packLibrary.ts, screens/Packs.tsx, src/content/packStore.ts | no | missing |
| UI | Campaign screens and store | Campaign log, select, challenges, export/import | src/ui/screens/Campaign.tsx, store/campaigns.ts, src/campaign/* | no | in kit: campaign, challenges (game has own copy) |
| UI | Rules interpretations screen | Rulings in effect list, generated | src/ui/screens/Rules.tsx, interpretations.ts, scripts/gen-interpretations.ts | no | in kit: ui-helpers rule sheet (partial) |
| UI | Proof sheet | All cards with filters for owner/agent audit | src/ui/screens/ProofSheet.tsx, proofFilters.ts, proofGroups.ts | look-only | missing (kit: card-harness inventory, prompt-gallery partial) |
| UI | Tutorial panel + highlight | Narration panel, step highlight, lock hooks | src/ui/tutorial/*, src/ui/store/tutorial.ts | look-only | in kit: tutorial (game has own copy) |
| UI | Tutorial lock to scripted move | Only scripted answer allowed, asks line | src/tutorial/lock.ts, src/ui/tutorial/lockPicks.ts, askStore.ts | yes | in kit: tutorial (lock; game has own copy) |
| UI | Tutorial move in plain words | Scripted move text from lock asks | src/ui/tutorial/moveWords.ts, useMoveWords.ts | yes | in kit: tutorial (game has own copy) |
| UI | Game-start intro sequence | Opening deal sequence over new table | src/ui/screens/GameStartIntro.tsx, src/ui/motion/gameStart.ts | look-only | row K12x deck-motions (partial) |
| UI | Animation speed setting | Speed multiplier applied to all motion | src/ui/motion/speed.ts | yes | in kit: motion-frame / effect-library (partial) |
| UI | View-diff director | Maps view changes to motion beats | src/ui/motion/director.ts, viewTransition.ts, dealing.ts | no | in kit: deck-motions, motion-frame, token-flights (game has own copy) |
| UI | Bug report dialog | Screenshot, markup, offline queue, GitHub issue | src/ui/bugs/* (BugReportDialog, capture, queue, github, token, issue, report) | yes | in kit: bug-reporter (game has own copy) |
| UI | Screenshot markup editor | Draw over screenshot, fractions model | src/ui/bugs/markup/* | yes | in kit: bug-reporter markup (game has own copy) |
| UI | Bug issue filing script | Files saved report JSON as GitHub issue | scripts/bugs-file.ts | yes | in kit: bug-reporter (game has own copy) |
| UI | Offline/service worker registration | Production build registers worker, update line | src/ui/offline.ts, e2e/offline.spec.ts | yes | in kit: offline (game has own copy) |
| UI | Format helpers | Small text/number helpers and accessible labels | src/ui/format.ts | yes | in kit: ui-helpers / plain-text (partial) |
| UI | Theme token files | Look as CSS tokens and layout CSS | src/ui/theme/*.css | no | in kit: theme-check (checks only) |
| Engine | Seeded RNG | sfc32 seeded from string hash, state in game | src/engine/core/rng.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Canonical JSON and state hash | Sorted-key JSON, FNV-1a 64 state fingerprint | src/engine/core/canonical.ts, hash.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Copy-on-write and freeze | Copy for applyAction, shared log, frozen history | src/engine/core/copy.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Task stack runner | LIFO tasks with runaway guard, prompts pause | src/engine/core/runner.ts, apply.ts, ctx.ts, handlerTypes.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Deterministic ids | Counter ids for cards, prompts, frames | src/engine/core/ids.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Engine error classes | Bug error vs player mistake result | src/engine/core/errors.ts | yes | in kit: engine-core (game has own copy) |
| Engine | State invariants | INV checks after each action in tests and sims | src/engine/core/invariants.ts | look-only | in kit: engine-core invariants (game has own copy) |
| Engine | Game end status | Terminal state detection | src/engine/core/status.ts, end.ts | look-only | in kit: engine-core (partial) |
| Engine | Card zones and ownership | Every card in exactly one place | src/engine/core/zones.ts, state.ts | look-only | in kit: card-zones (game has own copy) |
| Engine | Content index | Precomputed lookups over content pack | src/engine/core/contentIndex.ts | no | in kit: content-pack (partial) |
| Engine | Replay and save format | Rebuild from seed and actions, compare hash | src/engine/replay/replay.ts, saveFormat.ts | yes | in kit: engine-core replay/save, replay-cli (game has own copy) |
| Engine | Undo by action list | Undo is replay of actions minus last | src/engine/replay/replay.ts, src/ui/play/undoActions.ts | yes | in kit: game-store, engine-core (game has own copy) |
| Engine | Deck shuffle script | Every shuffle through one function recorded | src/engine/setup/shuffle.ts | yes | in kit: engine-core / card-zones shuffle (game has own copy) |
| Engine | Setup in rulebook order | createGame, seats, market, campaign setup | src/engine/setup/* | no | in kit: engine-core (start/GameRules); content own |
| Engine | Turn and step flow | Round, turn per seat, steps, final round | src/engine/turn/turn.ts, cleanup.ts, end.ts | no | in kit: turn-flow (game has own copy) |
| Engine | Action token budget | Per-turn action tokens counting | src/engine/turn/actions.ts | no | missing |
| Engine | Resource/stat tracks logic | Resource gain, track steps, stardate clock | src/engine/turn/resources.ts, stardates.ts, glory.ts | no | in kit: engine-core resources/track (partial) |
| Engine | Mission progress | Mission parts, contributors, completion | src/engine/turn/missions.ts, board/*.ts | no | missing |
| Engine | Board state (ships, away teams, control) | Placement, move, control of locations | src/engine/board/* | no | in kit: board-model (partial) |
| Engine | Card-effect language interpreter | Text ops interpreted in frames with continuations | src/engine/text/interpreter.ts, frame.ts, continuations.ts, paths.ts, eval.ts | no | in kit: card-language (game has own copy) |
| Engine | Playability dry run | Can a step/cost resolve, without applying | src/engine/text/resolve.ts, costs.ts | no | in kit: card-language (partial) |
| Engine | Card language as plain English | One line per op for docs and tests | src/engine/text/describe.ts | no | in kit: card-language words slot (partial) |
| Engine | Card-effect ops table | Registry of all verbs with handlers | src/engine/ops/*, src/engine/customs/* | no | in kit: card-language verb pack (game has own copy) |
| Engine | Triggers and listeners | Listener flush, passives, replacement, state checks | src/engine/triggers/* | no | in kit: engine-core timing windows/triggers (game has own copy) |
| Engine | Trigger order choice | One pool, owner orders simultaneous triggers | src/engine/triggers/flush.ts | no | in kit: card-language orderEffects (partial) |
| Engine | Hidden info and player view | What a seat may see per prompt and state | src/engine/select/view.ts, promptCards.ts | no | in kit: card-zones seat view (game has own copy) |
| Engine | Legal answer enumeration | All legal answers for open prompt | src/engine/select/legalAnswers.ts | yes | in kit: engine-core legalAnswers (game has own copy) |
| Engine | Scoring | Final scoring, endgame ops, breakdown | src/engine/scoring/* | no | missing |
| Engine | Hero/captain modules | Per-seat hook modules and values | src/engine/captains/*, core/modules.ts | no | missing |
| Engine | Virtual opponent state | Rules-only opponent without deck | src/engine/core/virtual.ts | no | missing |
| Engine | Typed handler table | Record over all task kinds, null for unused | src/engine/core/handlers.ts | no | in kit: engine-core (game has own copy) |
| AI | Automa language and interpreter | Opponent card rows interpreted by data language | src/engine/bot/*, src/engine/types/botlang.ts | no | in kit: automa (game has own copy) |
| AI | Automa deck handling | Seeded deck, draw, reshuffle for the automa | src/engine/bot/deck.ts | no | in kit: automa (game has own copy) |
| AI | Automa choice table | Priority table with tie-breaks over answers | src/engine/bot/choices.ts, intercept.ts | no | in kit: automa (game has own copy) |
| AI | Automa data per captain | Per-character bot charts as DSL | content/bots/*.ts, _dsl.ts | no | in kit: automa (data shape) |
| AI | Greedy one-ply driver | Human-seat driver with one-ply lookahead | src/engine/drivers/greedy.ts, heuristics.ts | no | in kit: opponent / sim-pool drivers (partial) |
| AI | Random driver | Uniform random legal answers | src/engine/drivers/random.ts, rng.ts | yes | in kit: sim-pool (random driver) |
| AI | Search driver (single-observer look-ahead) | Information-set search with research eval | src/engine/drivers/search.ts, research.ts | no | in kit: learned-opponent / opponent (partial) |
| AI | LLM opponent request builder | State as compact keyed text, scanned for leaks | src/opponent/text/index.ts, request.ts, scan.ts | no | missing |
| AI | LLM opponent conversation | Decide, reply parse, moves, trace, log per turn | src/opponent/decide.ts, reply.ts, moves.ts, trace.ts, log.ts, types.ts | no | missing |
| AI | LLM opponent server relay | Server-side API client, key, budget ledger, stub | server/opponent/* | no | missing |
| AI | Opponent two-player harness | Runs games vs Claude or stub, with budget split | scripts/opponent/harness.ts, twoPlayer.ts | no | missing |
| AI | Branch tester | At decisions with two answers plays both branches | scripts/ai/branch-test.ts | no | missing |
| AI | Paired variant sweep | Variants play same games, same seeds | scripts/ai/sweep.ts | no | in kit: sim-pool paired validation, weight tuner |
| AI | Card value model research | Tentative value per card, generated tables | scripts/ai/card-values*.ts, research-data.ts | no | missing |
| Sim | Simulation runner (pool/worker) | Many games on worker threads, CSV/summary | scripts/sim/pool.ts, worker.ts, core.ts, scripts/simulate.ts | no | in kit: sim-pool (game has own copy) |
| Sim | Random-game invariant harness | Random games asserting invariants each step | scripts/sim/invariantRun.ts | no | in kit: sim-pool invariant run (game has own copy) |
| Sim | Sim content packs | Which content a sim plays on | scripts/sim/packs.ts | no | missing |
| Sim | Engine/search benchmarks | Speed on fixed game set | scripts/bench-engine.ts, bench-search.ts, scripts/perf.ts | no | in kit: perf (game has own copy) |
| Sim | Replay CLI and golden games | Headless replays with hash checks | scripts/replay.ts | no | in kit: replay-cli (game has own copy) |
| Tooling | Test state builders | Put state into exact position, synthetic content | src/test-utils/builders.ts, kernel.ts, syntheticPack.ts, turn.ts, bot.ts | no | in kit: card-harness (partial) |
| Tooling | Card scenario builder + prompt delivery | Scenario on real cards, prompt delivery probe | src/test-utils/scenario.ts, delivery.ts, text.ts | no | in kit: card-harness (game has own copy) |
| Tooling | Whole-game test driver | Plays games through public API | src/test-utils/driver.ts, expect.ts | no | in kit: sim-pool / engine-core test (partial) |
| Tooling | Real pack global test setup | Real pack built once per test run, jsdom setup | src/test-utils/realPack.ts, realPackGlobal.ts, setup-dom.ts | no | missing |
| Tooling | Card-language test inventory | Inventory of verbs per card with stale check | scripts/testing/card-lang-inventory.ts | no | in kit: card-harness inventory (game has own copy) |
| Tooling | Traceability gate | Test titles must cite rule ids | scripts/check-traceability.ts, trace.config.json | yes | in kit: traceability (game uses kit via script `traceability`; also own check-traceability.ts) |
| Tooling | Repo gate | File sizes, secrets, card ids in rules code | scripts/repogate.ts, repo-gate.config.json | yes | in kit: repo-gate (game uses kit) |
| Tooling | Bundle size budget | Vite build under size limit | package.json `size` | yes | in kit: bundle-size (game uses kit) |
| Tooling | Check runner | Parallel check lanes with timeouts | check-runner.config.json, package.json `check` | yes | in kit: check-runner (game uses kit) |
| Tooling | CI workflows | ci.yml and full-gate from config | .github/workflows/*, ci.config.json | yes | in kit: ci-templates (game uses kit) |
| Tooling | Plan checker | Checks build plan, lists batch line ranges | package.json `plancheck` | yes | in kit: plan-checker (game uses kit) |
| Tooling | e2e helpers | Screen sizes, page error collection | e2e/helpers.ts | yes | in kit: e2e-helpers (game has own copy) |
| Tooling | Layout bounds e2e | Checks no element overflows at sizes | e2e/layout-bounds.spec.ts, crew-board-bounds.spec.ts | yes | in kit: theme-check (browser steps; partial) |
| Tooling | Tutorial script e2e / check | Plays script headless, frozen pack check | scripts/tutorial-check.ts, tutorial-freeze.ts, tutorial-doc.ts, src/tutorial/* | no | in kit: tutorial tooling (game has own copy) |
| Tooling | Asset linker | Links pictures next to app for dev/phone | scripts/assets-link.ts | yes | missing |
| Tooling | Phone bundle zip | Zips built pack and assets for phone | scripts/pack-bundle.ts | yes | missing |
| Tooling | Face tuning scripts | Python autotune/fit/measure of card faces | scripts/faces/*.py, evaluate.ts, sheet.ts | look-only | missing |
| Tooling | Face check | Checks printed text fits faces at pixel floor | src/content/faceCheck.ts | look-only | missing |
| Tooling | Portrait build | Builds portrait art set from sources | scripts/portraits/build.py | look-only | in kit: scan-ingest (partial) |
| Tooling | Dossier icon repair | Repairs rulebook icon extraction | scripts/dossier/repair-rulebook-icons.py | look-only | missing |
| Data | Content pack loader and schema | Zod schema, loader, build, bundle, registry | src/content/{schema,loader,build,bundle,registry}.ts | no | in kit: content-pack (game has own copy) |
| Data | Content build/validate/coverage/gate | Build pack, validate, coverage and DoD gate | scripts/content-build.ts, validate-content.ts, content-coverage.ts, content-gate.ts | no | in kit: content-pack (partial) |
| Data | Card DB snapshot pin | Re-pin source database snapshot from a sha | scripts/db-snapshot.ts | no | missing |
| Data | Content overrides/patches | Corrections without editing source data | content/overrides.json, src/content/walk.ts | no | in kit: card-patches |
| Data | Printed-clause text pipeline | Printed words per card clause, overrides | src/content/printedClauses.ts, content/printed-clauses*.json | no | missing |
| Data | Glossary data and match | Glossary entries, coverage | src/content/glossary.ts, content/glossary.json | no | in kit: glossary |
| Data | Frozen tutorial pack | Copy of exactly what a tutorial uses, hashed | src/tutorial/freeze.ts, hash.ts, scenario.ts | no | in kit: tutorial (freeze; game has own copy) |
| Data | Strategy guide scraper | Fetch and compile community guides to docs | scripts/strategy/* | no | missing |
| Data | Scan index import | Scan index and crops of box images | media/scans/*/index.csv | no | in kit: scan-ingest |
| Data | Interpretations generator | Rulings table to code | scripts/gen-interpretations.ts | no | missing |
| Sound | Sound/voice plumbing | none in this game | n/a | n/a | in kit: sound-player, voice (game has none) |

## astra-imperium @ eee2d61

Kit use: src and tests import app-frame, board-layout, campaign, card-harness, card-hand, card-language, card-parts, card-zoom, content-pack, drag-drop, engine-core, game-log, game-store, paced-view, plain-text, prompt-gallery, prompt-host, saves, screens, settings from kit/. The game is young: most logic is in about six engine files and one Table screen.

| Area | Part (neutral name) | What it does (≤12 words) | Path | Game-free? (yes/look-only/no) | Kit status |
|---|---|---|---|---|---|
| UI | App shell and routes | Hash routes, error boundary, start-up | src/main.tsx, src/ui/App.tsx | yes | in kit: app-frame (game uses kit) |
| UI | Table screen | Table zones from layout, hand, panels | src/ui/table/Table.tsx, table.css | look-only | in kit: board-layout, card-hand, table-panels (game uses kit for hand, layout) |
| UI | Hand with drag | Hand fan, drag card to target | src/ui/table/Table.tsx | look-only | in kit: card-hand, drag-drop (game uses kit) |
| UI | Card zoom | Zoomed card with decoded text and icons | src/ui/table/Zoom.tsx, text.tsx | look-only | in kit: card-zoom, card-parts (game uses kit) |
| UI | Prompt widgets | Widgets per prompt kind over prompt host | src/ui/prompts/prompts.ts, widgets.tsx | look-only | in kit: prompt-host (game uses kit) |
| UI | Prompt gallery | One state per prompt kind and ending | src/ui/table/PromptGallery.tsx, gallery.ts | look-only | in kit: prompt-gallery (game uses kit) |
| UI | Words and plain-text table | Screen words for events and rules text | src/ui/table/words.ts | no | in kit: plain-text, game-log (game uses kit) |
| UI | Game store | One store: answers, undo, autosave | src/ui/store.ts, src/game.ts | no | in kit: game-store (game uses kit) |
| UI | Settings and options | Settings declared as data | src/options.ts | no | in kit: settings (game uses kit) |
| UI | Menu, saves and new-game screens | Home, new game, saves from data | src/ui/App.tsx, src/options.ts | look-only | in kit: screens, saves (game uses kit) |
| UI | Art asset resolver | Maps content ids to art files | src/ui/table/assets.ts | no | in kit: card-parts art (game uses kit) |
| UI | Theme kit (aquila, panel, buttons, bars, dividers) | Look components K-1 to K-18 of the theme | src/ui/theme/kit/index.tsx, theme.css, tokens.css | look-only | game look layer (themed; on top of kit); in kit: theme-check |
| UI | Theme gallery | Shows every theme component and state | src/ui/theme/Gallery.tsx | look-only | in kit: prompt-gallery (partial) |
| UI | Wireframe pages and layout JSON | Wireframes per screen, phone and desktop | docs/experience/wireframes/*.html, *.layout.json | look-only | in kit: layout-editor, board-layout zones |
| UI | Layout editor | Hand-arrange zones, export JSON | docs/experience/layout-editor/index.html | yes | in kit: layout-editor (game has own copy) |
| UI | Theme kit HTML and tokens A/B | Prototype of look options A and B | docs/experience/kit/*.html, kit.js, tokens-*.css | look-only | missing |
| UI | Owner review page | Page where owner answers look decisions | docs/experience/review/index.html | look-only | missing |
| UI | Rules arbiter decisions page | HTML list of rulings | docs/rules-arbiter/decisions.html | no | missing |
| UI | Phone layout | Phone wireframes only; no phone code yet | docs/experience/wireframes/*-phone*.html | look-only | in kit: phone-mode (not yet used by game) |
| UI | Tutorial, glossary, campaign screens | Wireframed only; not built | docs/experience/wireframes/tutorial*.html, glossary*.html, campaign*.html | look-only | in kit: tutorial, glossary, campaign (campaign imported; others not) |
| UI | Game over screen | Wireframed only | docs/experience/wireframes/gameover*.html | look-only | in kit: table-panels game over (not yet used) |
| Engine | Game definition (rules object) | One defineGame object with rules, view, forced | src/game.ts, src/engine/rules.ts, api.ts | no | in kit: game-store defineGame (game uses kit) |
| Engine | Engine state and types | State, ids, events types | src/engine/types.ts, index.ts | no | in kit: engine-core (game uses kit) |
| Engine | Card-effect verbs | Verb table over the standard card pack | src/engine/verbs.ts | no | in kit: card-language (game uses kit) |
| Engine | Resources | Resource gain, pay, convert | src/engine/resources.ts | no | in kit: card-language resource verbs (game uses kit) |
| Engine | Scoring | Final score of a game | src/engine/scoring.ts | no | missing (game-specific) |
| Engine | View builder | Per-seat view of state | src/engine/view.ts | no | in kit: card-zones view, game-store (game uses kit) |
| Engine | Modules (optional rule modules) | Opt-in rule modules by id | src/engine/modules.ts | no | in kit: engine-core modules (partial) |
| Engine | Campaign engine | Linked scenarios as plain log and steps | src/engine/campaign.ts, campaign/c3-journey.ts, c4-constantius.ts | no | in kit: campaign (game uses kit) |
| Engine | Invader/gallax enemy logic | Automated enemy turn for scenarios | src/engine/gallax.ts | no | in kit: automa (partial; own code) |
| Engine | Content loading and schema | Zod schema, content build and checks | src/content/schema.ts, src/engine/content.ts, scripts/content/*.ts | no | in kit: content-pack (game uses kit) |
| AI | Opponent / sim | none in game yet beyond golden tests | tests/golden/standard.test.ts | - | missing in game (kit has opponent, sim-pool, automa) |
| Sound | Sound and voice | none present | - | - | missing in game (kit has sound-player, voice) |
| Tooling | Content encodings (maps, boards, tiles, leaders) | Hand-encoded printed data in TS | scripts/content/encodings/*.ts | no | in kit: transcription-check (partial) |
| Tooling | Content parse and check scripts | Parse source data, verify faces and ids | scripts/content/parse.ts, build.ts, check.ts | no | in kit: content-pack, card-harness (game uses kit) |
| Tooling | Map rects tracer | Trace map space rects from drawing | scripts/content/trace-maps.py, map-rects.json | yes | in kit: board-layout (own copy of tracer) |
| Tooling | Art build and check | Art manifest, budget and presence check | scripts/art/build.ts, check.ts, art-manifest.json | no | in kit: repo-gate art budgets, tooling-scripts art check (game has own copy) |
| Tooling | Scenario test helpers | Builder for rules tests on real cards | tests/helpers/astra.ts, tests/scenarios/*.test.ts | no | in kit: card-harness (game uses kit) |
| Tooling | Golden games | Golden replay test | tests/golden/standard.test.ts | no | in kit: replay-cli (partial) |
| Tooling | Broken content fixtures | Fixtures that must fail validation | tests/fixtures/broken/*.json | no | in kit: card-harness contentGate (partial) |
| Tooling | E2E smoke and table specs | Playwright on table | tests/e2e/*.spec.ts, playwright.config.ts | no | in kit: e2e-helpers (not used) |
| Tooling | Traceability gate | Test titles cite rule ids | trace.config.json, scripts/traceability-pending.json | no | in kit: traceability (game uses kit config) |
| Tooling | Repo gate and size config | File sizes, secrets, art budgets | repo-gate.config.json, size.config.json | no | in kit: repo-gate, bundle-size (game uses kit) |
| Tooling | Theme check config | Look lives in tokens and fonts | theme-check.config.json | no | in kit: theme-check (game uses kit) |
| Tooling | Check runner config | Parallel check lanes | scripts/check-runner.config.json | no | in kit: check-runner (game uses kit) |
| Tooling | CI workflows and local CI scripts | ci, full gate, gate slot, watch run | .github/workflows/*.yml, ci.config.json, tools/architect/*.sh | no | in kit: ci-templates (game uses kit); tools/architect scripts missing from kit |
| Tooling | Lint config | ESLint flat config for engine | eslint.config.js | no | in kit: lint-preset (game uses kit) |
| Data | Dossier: PnP face builder | Build card faces from print-and-play PDF | dossier/scripts/build-faces.py, pnp_faces.py, face-rotations.json | no | in kit: scan-ingest (partial; PDF faces missing) |
| Data | Dossier: raster and box extract | Extract images and boxes from PDF | dossier/scripts/extract-rasters.py, extract-box.py, export-art.py | no | in kit: scan-ingest (partial) |
| Data | Dossier: art index and audits | Index art, check art and paths | dossier/scripts/build-art-index.py, dossier/audits/*.json | no | missing |
| Data | Dossier: vector glyph tracing | Trace icons from print to vector glyphs | dossier/vector/src/01..11*.py | no | missing |
| Data | Dossier: font scan and compare | Identify and compare printed fonts | dossier/vector/src/04_fonts_scan.py, 05_font_compare.py, 06_font_specimen.py | no | missing |
| Data | Dossier: token and glyph index pages | HTML index of tokens and glyphs | dossier/vector/glyphs, dossier/vector/tokens | look-only | missing |
| Data | Dossier: scanning docs maker | Make docs for scanning items | dossier/scripts/make-scanning-docs.py | no | in kit: scan-ingest (partial) |
| Data | Dossier work scripts (a1..a5) | One-off build scripts for faces, boards | dossier/_work/scratch/*.py | no | missing (one-off) |

## earthborne-rangers-fan-prototype @ 59e0ad1d

Kit pin in repo: v0.111.0 (AGENTS.md says v0.41.0). Game uses kit for: ci-templates, check-runner, bundle-size, plan-checker, traceability (tooling), card-hand (src/ui/table/Hand.tsx), engine-core only in tests/realdata/ui-b-layout.test.ts. Everything else below is the game's own code.
Game-free?: yes = no game words in it; look-only = reusable idea, code is tied to this game; no = game rule/content.

| Area | Part (neutral name) | What it does (≤12 words) | Path | Game-free? | Kit status |
|---|---|---|---|---|---|
| Engine | Seeded RNG | Seeded random numbers, shuffle, draw | src/engine/rng.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Task stack and runner | Task stack, prompts, resume, apply an action | src/engine/tasks.ts, runner.ts, handlers.ts, api.ts | look-only | in kit: engine-core (game has own copy) |
| Engine | State hash and canonical JSON | Canonical JSON and state hash for replay/saves | src/engine/hash.ts, src/engine/pack/canonical.ts, src/shared/fnv.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Save file and migration | Save format, replay from actions, version checks | src/engine/save.ts, src/ui/persist.ts | look-only | in kit: engine-core + saves (game has own copy) |
| Engine | Copy-on-write mutate | Safe state mutation helpers with undo-friendly changes | src/engine/mutate.ts | look-only | in kit: engine-core (game has own copy) |
| Engine | Invariant checker | Checks state rules (each card once) after every action | src/engine/invariants.ts | look-only | in kit: engine-core invariants (game has own copy) |
| Engine | Trigger and timing engine | Triggers, simultaneous order, replacements, prevention windows | src/engine/triggers.ts | look-only | in kit: engine-core timing (game has own copy) |
| Engine | Derived values / modifiers | Printed value, constant abilities, lasting effects layered | src/engine/derive.ts, modifiers.ts | look-only | in kit: engine-core layered/effects (game has own copy) |
| Engine | Lasting effects expiry | Effects with durations ending at turn edges | src/engine/phases/lasting.ts | look-only | in kit: engine-core Duration/boundary (game has own copy) |
| Engine | Card-effect language | Data DSL of ops, interpreter, validator | src/engine/effects/language.ts, interpreter.ts, eval.ts | look-only | in kit: card-language (game has own copy) |
| Engine | Card zones | Deck, hand, discard, play area as id lists, per-seat view | src/engine/zones.ts, views.ts, src/ui/tableView.ts | look-only | in kit: card-zones (game has own copy) |
| Engine | Legal-answer enumeration | Lists legal answers for the open prompt | src/engine/enumerate.ts | look-only | in kit: engine-core legal (game has own copy) |
| Engine | Dry run / outcome preview | Applies an answer on a scratch copy to show cost | src/engine/dryRun.ts, src/ui/tray/fatiguePreview.ts | look-only | in kit: engine-core preview K89 (game has own copy) |
| Engine | Outlook (what a card can reach) | Reads card data to predict reachable targets | src/engine/outlook.ts, src/ui/cards/outlook.ts | no | missing |
| Engine | Turn order and phases | Day, turn and phase flow | src/engine/turnOrder.ts, phases/turns.ts, phases/play.ts | look-only | in kit: turn-flow (game has own copy) |
| Engine | Custom handler registry | Content names a handler id, engine looks it up | src/engine/customs/registry.ts | yes | in kit: card-language custom verb (game has own copy) |
| Engine | Effect text generator | Generates readable English from effect data | src/engine/describe/*.ts | look-only | in kit: card-language text slots + card-harness renderRecords (game has own copy) |
| Engine | Feature gate by content | Extra rule windows open only when content uses a construct | src/engine/features.ts | yes | missing |
| Engine | Sandbox top-up for sims | Tops up resources before each action so rare paths get played | src/engine/sandbox.ts | look-only | missing |
| Engine | Table tools / manual edits | One primitive state edit while a prompt is open | src/engine/manual.ts, src/ui/table/Tools.tsx | look-only | in kit: engine-core DebugAction + debug-console (game has own copy) |
| Engine | Test procedure (challenge test) | Effort vs difficulty test with challenge deck | src/engine/phases/test.ts, testMatch.ts | no | missing |
| Engine | Weather / day clear / fatigue phases | Game phases of this game | src/engine/phases/{weather,clear,fatigue,refresh,endDay,travel,routes}.ts | no | missing |
| Engine | Aspirations (goal checkmarks) | Card goals earn checkmarks at end of day | src/engine/aspirations.ts, src/ui/aspirations.tsx | no | missing |
| Engine | Spirit-speaking mode | Role swap mode with restricted actions | src/engine/spiritspeak.ts | no | missing |
| Engine | Path moments | Cards resolved on draw, never played | src/engine/phases/moments.ts, pathCards.ts | no | missing |
| Engine | Guide / storybook interpreter | Reads numbered story entries, routes, one node at a time | src/engine/phases/guide.ts, src/ui/guideBook.ts | look-only | in kit: story (beats as tasks) (game has own copy) |
| Engine | Campaign layer | Campaign state across days, between-day actions, deck changes | src/engine/campaign/*.ts | look-only | in kit: campaign (log + graph runner) (game has own copy) |
| Engine | Campaign rebuild check | Rebuilds a campaign from inputs and warns on drift | src/engine/campaign/verify.ts, scripts/campaign-verify.ts | look-only | missing |
| Engine | Campaign file migration | Reads a campaign file, migrates formats | src/content/campaignSave.ts | look-only | missing |
| Engine | Multi-pack merge with dependencies | Merges base + expansion packs into one content index | src/engine/pack/merge.ts, buildIndex.ts, src/ui/packWithDependencies.ts | look-only | missing |
| Engine | Content hash ignoring wording | Hash that ignores display-only text so saves survive edits | src/engine/pack/canonical.ts | yes | missing |
| Engine | Expansions join a campaign | Expansion packs join at creation or between days | src/engine/campaign/expansions.ts, src/ui/campaign/Expansions.tsx | no | missing |
| AI/sim | One-ply greedy driver | Heuristic bot for autoplay and sims | src/drivers/greedy.ts | look-only | in kit: opponent / sim-pool driver (game has own copy) |
| AI/sim | Random driver | Uniform legal answers, rest weighted down | src/drivers/random.ts | yes | in kit: sim-pool (game has own copy) |
| AI/sim | Planner driver | Searches to win a scenario (1600 lines) | src/drivers/planner.ts | look-only | in kit: learned-opponent / opponent lookAhead (game has own copy) |
| AI/sim | Driver numbers helper | Picks divisible number for follow-on steps | src/drivers/numbers.ts | no | missing |
| AI/sim | Sim runner and report | Plays whole games, success rate, end reasons | src/drivers/sim.ts, scripts/sim.ts | look-only | in kit: sim-pool (game has own copy) |
| AI/sim | Worker pool | Spreads games over worker threads | scripts/sim/pool.ts, worker.ts, content.ts | yes | in kit: sim-pool (game has own copy) |
| AI/sim | Resumable sweeps | Resume a sweep from CSV, version stamp rejects code drift | scripts/sim/resume.ts, version.ts | yes | in kit: sim-pool sweeps (game has own copy) |
| AI/sim | Fuzz runner | Random games with invariant checks | scripts/fuzz.ts | yes | in kit: sim-pool fuzz (game has own copy) |
| AI/sim | Checkpoint goldens | Recorded games with hash checkpoints, re-record script | src/drivers/checkpoints.ts, scripts/golden-update.ts | yes | in kit: replay-cli (game has own copy) |
| AI/sim | Determinism check across checkouts | Records on base commit, replays on branch | scripts/replay.ts | yes | in kit: replay-cli (game has own copy) |
| AI/sim | Perf budget | Times applyAction over driver games | scripts/perf.ts, tests/e2e/perf.spec.ts | yes | in kit: perf (game has own copy) |
| AI/sim | Node bundler for scripts | esbuild bundle of headless scripts | scripts/bundle-node.mjs | yes | missing |
| UI | Hand fan | Hand layout, hover lift, drag source | src/ui/table/Hand.tsx, src/ui/reading/fanLayout.ts, useHandDrag.ts | look-only | in kit: card-hand (game uses kit in Hand.tsx; drag has own copy) |
| UI | Pile peek | Fan out a pile to look through it | src/ui/reading/PeekPile.tsx | look-only | in kit: card-pile (game has own copy) |
| UI | Table geometry planner | Pure plan of where every zone, pile and card goes | src/ui/table/geometry.ts | look-only | in kit: player-board plan + board-layout (game has own copy) |
| UI | Table board | Table with zones and piles | src/ui/table/Board.tsx, Table.tsx | no | in kit: player-board (game has own copy) |
| UI | Design-pixel scale | Scales 4K design table to window and user scale | src/ui/table/scale.tsx | yes | in kit: resolution-frame (game has own copy) |
| UI | Card face renderer | Draws card face from data with art and tokens | src/ui/cards/CardFace.tsx, CardText.tsx, Tokens.tsx, KeywordTags.tsx | look-only | in kit: card-parts (game has own copy) |
| UI | Scan overlay geometry | Draws digital state over a printed scan's boxes | src/ui/cards/scanOverlay.ts, scanGeometry*.ts, ScanBody.tsx | look-only | missing |
| UI | Image cache / decode-ahead | Device image cache for art | src/ui/cards/imageCache.ts, art.ts | yes | in kit: card-parts art cache (game has own copy) |
| UI | Card zoom / hover large | Zoomed card with transcription, hover large | src/ui/cards/Zoom.tsx, HoverLarge.tsx | look-only | in kit: card-zoom (game has own copy) |
| UI | Card hover panel store | Hover 0.3 s opens panel, click pins | src/ui/panel/store.ts, CardPanel.tsx, hoverHold.ts | yes | in kit: ui-helpers hover hold + inspect (game has own copy) |
| UI | Challenge bands highlight | Marks matching result row with tick or cross | src/ui/cards/bands.ts, ChallengeTile.tsx | no | missing |
| UI | Token display on cards | One token per count, number boxes | src/ui/cards/Tokens.tsx | look-only | in kit: card-attachments tokens (game has own copy) |
| UI | Checklist objective | Shows which listed entries are written | src/ui/cards/checklist.ts | no | missing |
| UI | Prompt dock | Renders the widget for the open prompt, focus moves to it | src/ui/table/Dock.tsx, src/ui/prompts/index.ts, common.tsx, choices.tsx | look-only | in kit: prompt-host (game has own copy) |
| UI | Click-on-table picks | Cards marked from prompt option refs; click answers | src/ui/table/pick.ts, src/ui/reading/InteractionGlow.tsx | look-only | in kit: board-registry + prompt-host useBoardPick (game has own copy) |
| UI | Reading aid (reach outline) | Speculative outline of what a card can target | src/ui/reading/interactions.ts | no | missing |
| UI | Staged commit tray | Choose cards and effort, preview cost, then commit | src/ui/prompts/CommitTray.tsx, src/ui/tray/staged.ts, place.ts, TestTray.tsx | look-only | missing |
| UI | Group commit screen | One column per player committing in turn | src/ui/prompts/GroupCommit.tsx | no | missing |
| UI | Prompt gallery | One sample state per prompt kind | src/ui/dev/PromptGallery.tsx, promptSample.ts, scripts/prompt-samples.ts | yes | in kit: prompt-gallery (game has own copy) |
| UI | Auto-order simultaneous effects | Auto-answers order prompt only when all orders agree (dry run) | src/ui/autoOrder.ts | yes | missing |
| UI | Dock homes | Which options have a home on the table so dock need not list them | src/ui/prompts/dockHomes.ts | look-only | missing |
| UI | Look-at modal | Large faces of cards revealed to the table | src/ui/table/LookedAt.tsx | look-only | missing |
| UI | Deck builder (prologue) | Pick sets and cards into a deck, greyed with reason | src/ui/prompts/BuildDeck.tsx, src/ui/screens/DeckBuilder.tsx, src/ui/deckbuilder/*.tsx | no | missing |
| UI | Saved decks store | Named decks in IndexedDB, export/import JSON | src/ui/decks.ts | yes | missing |
| UI | Map zoom and pan | SVG viewBox zoom about pointer, drag pan, fit | src/ui/map/ZoomView.tsx, drawing.ts | yes | missing |
| UI | Map travel panel | Destinations as buttons over a map | src/ui/prompts/MapPanel.tsx | no | in kit: board-layout (click rects only; game has own copy) |
| UI | Campaign tracker view | Day track, entries, marks laid out like printed sheet | src/ui/campaign/Tracker.tsx, TrackerOverlay.tsx | no | missing |
| UI | Campaign screens and store | Home, campaigns list, between-day, summary, settings | src/ui/campaign/*.tsx, store.ts, persist.ts | look-only | in kit: campaign (game has own copy) |
| UI | Log panel | Log lines from events, highlights cards on hover | src/ui/log/Log.tsx, describeEvent.ts, src/ui/panel/LineRow.tsx | look-only | in kit: game-log + table-panels (game has own copy) |
| UI | Motion director | Queues moves, plays flights around state commit | src/ui/motion/director.ts, sequence.ts, timeline.ts, layer.ts, MotionLayer.tsx, places.ts | look-only | in kit: motion-frame (game has own copy; motion study covers) |
| UI | Count-up number | Animated resource count | src/ui/motion/Count.tsx | yes | in kit: counter (game has own copy) |
| UI | Motion speed / reduced motion | Speed multiplier and reduced-motion setting | src/ui/motion/speed.ts | yes | in kit: settings + motion-frame (game has own copy) |
| UI | Settings | Declared settings, persisted, screen | src/ui/settings.ts, src/ui/screens/SettingsScreen.tsx | look-only | in kit: settings (game has own copy) |
| UI | Saves screen | List, load, delete, export saves | src/ui/screens/Saves.tsx, src/ui/persist.ts | look-only | in kit: saves (game has own copy) |
| UI | Continue anyway | Replays an old save on new data up to first failure | src/ui/ContinueAnyway.tsx | yes | missing (owner: no old-save work) |
| UI | Error panel and boundary | Shows message and action index, export save | src/ui/ErrorPanel.tsx | yes | in kit: app-frame error boundary (game has own copy) |
| UI | Routes and app shell | Router, settings load, reduced-motion class | src/ui/router.tsx, App.tsx, main.tsx | yes | in kit: app-frame (game has own copy) |
| UI | Title, new game, result screens | Title, new game setup, result | src/ui/screens/Title.tsx, NewGame.tsx, Result.tsx | look-only | in kit: screens + table-panels game over (game has own copy) |
| UI | Pack picker and products list | Pick pack, tick expansions with dependency ticking | src/ui/screens/PackPicker.tsx, Products.tsx, MomentsOptions.tsx | look-only | missing |
| UI | Proof sheet | Every card drawn beside its data and flags | src/ui/screens/Proof.tsx | yes | in kit: prompt-gallery (partial; card proof sheet missing) |
| UI | Coverage page | What the content encoding uses and lacks | src/ui/screens/Coverage.tsx, src/content/coverage.ts | yes | missing |
| UI | Glossary lookup | Match terms in text, popup lookup host | src/ui/glossary/match.ts, GlossaryText.tsx, LookupHost.tsx, load.ts | yes | in kit: glossary (game has own copy) |
| UI | Plain-language text | Strips ids and code words from shown text | src/ui/plain.ts | yes | in kit: plain-text (game has own copy) |
| UI | Guide reader (book) | Reader window for story entries with speakers | src/ui/prompts/GuideReader.tsx, bookText.tsx | look-only | in kit: story (partial) |
| UI | Bug report | Screenshot, markup editor, local queue, filed issue | src/ui/bugReport/*.tsx, markup/*, scripts/lib/bugReports.ts, bugs-send.ts | yes | in kit: bug-reporter (game has own copy) |
| UI | Screen-reader announcer | Polite live region | src/ui/a11y/Announcer.tsx | yes | missing |
| UI | Offline / service worker | Registers offline worker, update line | src/ui/offline.ts | yes | in kit: offline (game has own copy) |
| UI | Fonts loader | Loads game fonts and icon font from dev server | src/ui/fonts.ts, scripts/fonts-fetch.ts | yes | in kit: tooling-scripts font fetch (game has own copy) |
| UI | Icon set | Icons as components | src/ui/icons/Icons.tsx | look-only | in kit: small-helpers icon (game has own copy) |
| UI | Aspect card box | Player aspect card with test list greyed with reasons | src/ui/aspect/*.tsx | no | missing |
| UI | Danger / test panel | Test result panel with banner, ordered effects | src/ui/table/TestPanel.tsx, danger.ts | no | missing |
| UI | Dev panel and dev start URL | Dev panel, dev URL starting a game directly | src/ui/table/DevPanel.tsx, src/ui/devStart.ts | look-only | in kit: debug-console (game has own copy) |
| UI | Build stamp | Shows commit of running build | src/ui/build.ts | yes | missing |
| Voice | Voice-over generator | Per-segment TTS jobs, cached on disk, casting | scripts/voice-over.ts, voice-over.py, voice-casting.ts, lib/elevenlabs.ts, castElevenLabs.ts, voiceEnv.ts | look-only | in kit: audio-gen + voice (game has own copy) |
| Voice | Speaker tagging of quoted speech | Tags who says each quote in story text | scripts/tag-guide-speakers.ts, src/content/speech.ts | no | missing |
| Voice | Voice playback in prompts | Plays voice lines for guide passages | src/ui/prompts/voice.ts | look-only | in kit: voice (game has own copy) |
| Tooling | Scenario test builder (given) | Builds state from compact description, drive, expect | tests/helpers/given.ts, drive.ts, expect.ts, run.ts, fx.ts | look-only | in kit: card-harness scenario builder (game has own copy) |
| Tooling | Card test harness | Every-card tests with citations and inventory | tests/helpers/cards/harness.ts, setups.ts, scripts/testing/card-inventory.ts | look-only | in kit: card-harness (game has own copy) |
| Tooling | E2E helpers | Shared Playwright steps, dev-URL start | tests/e2e/helpers.ts | look-only | in kit: e2e-helpers (game has own copy) |
| Tooling | Skip reporter for git-ignored data | Real-data suite skips itself when input absent | tests/helpers/skipReporter.ts, realdataSetup.ts | yes | missing |
| Tooling | Rule traceability | Test titles cite rule ids | scripts/trace.ts, trace.config.json | yes | in kit: traceability (game uses kit; trace.ts helper kept) |
| Tooling | CI workflows | ci.yml, verify.yml from config | .github/workflows/*, ci.config.json | yes | in kit: ci-templates (game uses kit; verify.yml own per K190) |
| Tooling | Check lanes and bundle size | Parallel check lanes, first-load size limit | check-runner.config.json, bundle-size.config.json | yes | in kit: check-runner, bundle-size (game uses kit) |
| Tooling | Plan checker | Checks plan and lists batch ranges | kit/plan-checker (npm run plancheck) | yes | in kit: plan-checker (game uses kit) |
| Tooling | Windows setup script | One-command setup and health check | scripts/setup.ps1, voice-setup.ps1, play.cmd | yes | missing |
| Tooling | Launcher reusing production build | Reuses a build until inputs change | scripts/play.mjs | yes | missing |
| Tooling | Aspect emblem tracer | Traces emblems from card art to vector | scripts/aspect-emblems.ts + aspect-emblems/*.py, scripts/maps/*.py | look-only | missing |
| Tooling | Map tracing to SVG | Traces map and icons into drawings | scripts/maps/*.py | look-only | in kit: board-layout (Inkscape route; trace tool missing) |
| Tooling | Scan list generator | Lists which scans the owner still has to make | scripts/scan-list.ts | look-only | in kit: scan-ingest (partial) |
| Tooling | Mockup tools | Capture, defect report, mock build tools | mockups/2026-11-ui-ux-polish/tools/, mockups/*/tools/ | yes | in kit: tooling-scripts mock-capture (game has own copy) |
| Data | Content schemas and validation | zod schemas, dangling refs, op checks | src/content/schemas.ts, validate.ts, kinds.ts | look-only | in kit: content-pack (game has own copy) |
| Data | Pack loader | Assembles pack from JSON files, pure | src/content/packLoader.ts, scripts/lib/packs.ts, packCache.ts | yes | in kit: content-pack (game has own copy) |
| Data | Pack registry | Every pack the tools know, with dependencies | scripts/lib/packRegistry.ts | look-only | missing |
| Data | Content gates | MVP gate, product gate, content gate per pack | scripts/content-gate.ts, lib/mvpGate.ts, productGate.ts, content-gate-all.ts | look-only | in kit: content-pack checks (partial; game has own copy) |
| Data | Community data converter | Converts community card data to draft cards with errata | scripts/convert-card-data.ts, lib/cardData.ts, mergeDrafts.ts | no | missing |
| Data | Cross-check of two sources | Compares private pack against two community sources | scripts/cross-check-sources.ts | look-only | in kit: transcription-check (partial) |
| Data | Art index and fetch | One chosen image per card, fetch, extract, CI cache | scripts/lib/artIndex.ts, art-fetch.ts, art-extract.ts, art-ci-cache.ts | look-only | missing |
| Data | PDF page renderer | Renders card faces that exist only in PnP PDFs | scripts/art-render-pdf.ts | yes | missing |
| Data | Web importer | Polite importer of an official online guide | scripts/import-living-valley.ts | no | missing |
| Data | Dossier extract | Reassembles split zip and extracts | scripts/dossier-extract.ts | yes | missing |
| Data | Dev-server content plugin | Serves packs and private art in dev and preview | vite-plugin-content.ts | look-only | missing |
| Data | Content server entry rename/tag scripts | Rename entries, mark guide story, tag youDo | scripts/rename-entries.ts, mark-guide-story.ts, lib/youDoE24.ts | no | missing |

## imperium-horizon-fan-prototype @ b82d5cf

Kit use at origin/main: src imports only card-hand, card-pile, drag-drop, phone-mode, prompt-host from kit/. kit/ also holds engine-core, state-machines, picked-state, prompt-source, motion-frame, traceability, bundle-size, ci-templates, plan-checker, card-zones, but src does not import them (own copies in game).

| Area | Part (neutral name) | What it does (≤12 words) | Path | Game-free? (yes/look-only/no) | Kit status |
|---|---|---|---|---|---|
| UI | Card hand fan, hover lift, drag | Floating fan hand, lifts card, drags to targets | src/ui/board/table/FloatingHand.tsx, useHandDrag.ts, handSpeed.ts | look-only | in kit: card-hand, drag-drop (game uses kit) |
| UI | Pile with fan-out | Stack with count, click fans to browse | src/ui/board/table/GamePile.tsx, Piles.tsx | look-only | in kit: card-pile (game uses kit) |
| UI | Pile sheet grid (phone) | Pile contents as grid in bottom sheet | src/ui/board/phone/sheet/PileSheetGrid.tsx | look-only | in kit: card-pile grid, phone-mode (game uses kit) |
| UI | Market board | Offer slots with buy, cost marks, refill | src/ui/board/MarketBoard.tsx, table/MarketTable.tsx | look-only | in kit: market-row (game has own copy) |
| UI | Player area, play area, dev stack | Zones of one seat's cards in play | src/ui/board/PlayerArea.tsx, PlayArea.tsx, DevArea.tsx, table/PlayerTable.tsx, DevStack.tsx | look-only | in kit: player-board (own copy) |
| UI | Table board layout and geometry | Seat-relative zone layout, placement, sizes | src/ui/board/table/TableBoard.tsx, layout.ts, geometry.ts, placement.ts | look-only | in kit: board-layout, layout-editor (own copy) |
| UI | Bot column, bot turn panel, bot chart | Shows automa seat cards, turn, tracks | src/ui/board/BotArea.tsx, BotTurnPanel.tsx, BotChart.tsx, table/BotColumn.tsx | look-only | in kit: table-panels opponent turn (partial; own copy) |
| UI | Prompt panel and widgets | One widget per prompt kind (pick, pay, order, card) | src/ui/board/PromptPanel.tsx, src/ui/prompts/*.tsx, registry.ts | look-only | in kit: prompt-host (game imports it for some parts; widgets own copy) |
| UI | Pickable marks and pick zone | Marks legal, picked, barred things from prompt | src/ui/board/Pickable.tsx, PickZone.tsx, src/ui/play/marks.ts, picks.ts, selection.ts | yes | in kit: board-registry, picked-state, prompt-host (own copy) |
| UI | Interaction glow | Glow on legal targets from legal list | src/ui/board/table/InteractionGlow.tsx, glowStore.ts | look-only | in kit: prompt-host looks/imperium-legal.css (lifted) |
| UI | Click-to-act interactions | Turns taps on cards into engine answers | src/ui/play/interaction.tsx, interactions.ts, answers.ts | no | in kit: prompt-host board picks, drag-drop (own copy) |
| UI | Card preview / zoom store | Hover or click enlarges card with details | src/ui/board/table/preview.tsx, previewStore.ts | look-only | in kit: card-zoom, ui-helpers hover hold (own copy) |
| UI | Phone card sheet with transcript | Bottom sheet: card, actions, printed text | src/ui/board/phone/sheet/CardSheet.tsx, transcript.tsx, printed.ts, cardInfo.ts, sheetStore.ts, ActionRow.tsx | look-only | in kit: phone-mode (game uses kit), card-zoom |
| UI | Phone board and dock | Phone layout, hand dock, areas, short prompt | src/ui/board/phone/PhoneBoard.tsx, PhoneHand.tsx, PhoneAreas.tsx, dock.ts, shortPrompt.ts, phone.ts | look-only | in kit: phone-mode (game uses kit) |
| UI | Card face rendering | Draws card from layout data, icons, tokens | src/ui/cards/CardFace.tsx, faceModel.ts, Icons.tsx, Tokens.tsx, iconArt.ts, DoubleSidedCard.tsx, CardBack.tsx | look-only | in kit: card-parts (own copy) |
| UI | Art provider and cache | Card art loading via context | src/ui/cards/ArtProvider.tsx, artContext.ts, src/content/assets.ts | yes | in kit: card-parts art cache (own copy) |
| UI | Phase bar / turn banner | Shows round, phase, active seat | src/ui/board/PhaseBar.tsx | look-only | in kit: table-panels banner (own copy) |
| UI | Game log, grouped events | Events formatted and grouped per turn | src/ui/board/LogPanel.tsx, formatEvent.ts, groupedLog.ts | yes | in kit: game-log, table-panels log (own copy) |
| UI | Just-now recap strip | Last events shown briefly after answer | src/ui/board/JustNow.tsx, src/ui/play/justNow.ts | yes | in kit: paced-view (partial; own copy) |
| UI | Looked-at cards memory | Remembers cards the player peeked at | src/ui/play/lookedAt.ts | yes | missing |
| UI | Toasts | Transient messages from events | src/ui/board/Toasts.tsx, src/ui/play/toasts.ts | look-only | in kit: ui-helpers toasts (own copy) |
| UI | Score preview and breakdown | Live score estimate, per-source breakdown | src/ui/board/ScorePreview.tsx, ScoreBreakdown.tsx, src/ui/play/scores.ts | look-only | in kit: table-panels game over breakdown slot (own copy) |
| UI | Game over, record score, high scores | Result, standings, best scores screen | src/ui/board/GameOver.tsx, src/ui/play/gameOver.ts, recordScore.ts, src/ui/store/highScores.ts, screens/HighScores.tsx | look-only | in kit: table-panels game over, play-stats (own copy) |
| UI | Quest list | Objective cards with progress | src/ui/board/table/QuestList.tsx | no | missing |
| UI | Game menu | In-game menu: undo, save, quit | src/ui/board/GameMenu.tsx | look-only | in kit: screens (partial; own copy) |
| UI | Main menu / home screen | Start, continue, links, art | src/ui/screens/Home.tsx, HomeArt.tsx, ScreenFrame.tsx | look-only | in kit: screens (own copy) |
| UI | New game form | Seats, nations, variants, packs, random picks | src/ui/screens/NewGame.tsx, newGameModel.ts, randomNations.ts | no | in kit: screens (own copy) |
| UI | Settings screen and store | Settings declared and persisted | src/ui/screens/Settings.tsx, settingsWords.ts, src/ui/store/settingsStore.ts | look-only | in kit: settings (own copy) |
| UI | Saved games list and persistence | Saves in storage, list screen | src/ui/components/SavedGames.tsx, src/ui/store/saves.ts, persistence.ts | look-only | in kit: saves (own copy) |
| UI | Rules / help screen | In-app rules view with interpretations | src/ui/screens/Rules.tsx, interpretations.ts | no | in kit: glossary (partial) |
| UI | Pack manager and import | Import and list content packs | src/ui/screens/Packs.tsx, src/ui/store/packLibrary.ts, src/content/packStore.ts, hooks/usePacks.ts, useScan.ts | no | missing (content-pack is loader only) |
| UI | Modal dialog | Generic modal | src/ui/components/Modal.tsx | look-only | missing |
| UI | Error boundary and crash screen | Catches render errors, shows crash details | src/ui/components/ErrorBoundary.tsx, Crash.tsx, src/ui/play/crash.ts | look-only | in kit: app-frame (own copy) |
| UI | Theme toggle, footer, disclaimer | Light/dark toggle, footer line | src/ui/components/ThemeToggle.tsx, Footer.tsx, disclaimer.ts | look-only | missing |
| UI | Hash router | Routes between screens | src/ui/routes.ts, App.tsx | yes | in kit: app-frame routes (own copy) |
| UI | Accessibility: live region, labels, shortcuts | Announces events, aria labels, key shortcuts | src/ui/a11y/*.ts(x) | yes | missing |
| UI | Proof sheet | One screen showing every face and icon | src/ui/screens/ProofSheet.tsx, proofSections.ts | look-only | in kit: prompt-gallery (card side missing) |
| UI | Prompt gallery, dev panel, samples | Shows each prompt kind; dev edits | src/ui/dev/PromptGallery.tsx, DevPanel.tsx, samples.ts, driver.ts, devMode.ts | look-only | in kit: prompt-gallery, debug-console (own copy) |
| UI | Die 3D | 3D die with face mapping | src/ui/board/table/Die3D.tsx, dieFaces.ts | look-only | in kit: pieces-3d, dice-tray (own copy) |
| UI | Story text beats | Flavour text shown on events | src/ui/board/story.ts | no | in kit: story (own copy) |
| UI | Theme layer (tokens, fonts, css by area) | Look files: table, cards, phone, scores | src/ui/theme/*.css, look.ts | look-only | in kit: theme-check (check only) |
| UI | Game store (undo, autosave, paced bot turn) | One store: answer, undo steps, autosave, bot steps | src/ui/store/gameStore.ts, history.ts, src/ui/play/botTurn.ts, undoActions.ts, useGameEffects.ts | no | in kit: game-store, paced-view (own copy) |
| UI | Offline / service worker | Installs and runs offline | src/ui/offline.ts | yes | in kit: offline (own copy) |
| UI | Seed handling | Seed in URL and new game | src/ui/seed.ts | yes | in kit: engine-core seeds (own copy) |
| Engine | Core runner and state | Apply action, tasks, prompts, state types | src/engine/core/apply.ts, runner.ts, state.ts, ctx.ts, handlers.ts | no | in kit: engine-core (own copy; kit/engine-core present, not imported) |
| Engine | Seeded RNG, canonical JSON, hash | Reproducible random, stable state hash | src/engine/core/rng.ts, canonical.ts, hash.ts | yes | in kit: engine-core (own copy) |
| Engine | Replay and save format | Action log replay, save file version | src/engine/replay/*.ts, src/content/save.ts | yes | in kit: engine-core replay, replay-cli (own copy) |
| Engine | State invariants | Asserts after steps | src/engine/core/invariants.ts | yes | in kit: engine-core invariants (own copy) |
| Engine | Sandbox mode | Free play and debug edits without rules | src/engine/core/sandbox.ts | no | in kit: debug-console (partial; own copy) |
| Engine | Zones (deck, hand, discard, play) | Card moves between zones with visibility | src/engine/core/zones.ts, ops/deckMoves.ts, cards/draw.ts | yes | in kit: card-zones (own copy) |
| Engine | Round and phase flow | Round, activation, cleanup, endgame | src/engine/round/*.ts | no | in kit: turn-flow (own copy) |
| Engine | Card-effect interpreter | Data effect language with eval and resolve | src/engine/text/*.ts, ops/*.ts, types/text.ts | no | in kit: card-language (own copy) |
| Engine | Triggers and listeners | Event listeners, defence, flush | src/engine/triggers/*.ts | no | in kit: engine-core timing windows (own copy) |
| Engine | Resources, costs, payment | Resources, effective cost, passives, pay | src/engine/ops/resources.ts, select/costs.ts, cardCosts.ts, effectiveCost.ts, passives.ts, text/payment.ts | no | in kit: card-language gain/pay verbs (own copy) |
| Engine | Legal answers and per-seat view | Lists legal answers, view of state | src/engine/select/legalAnswers.ts, view.ts | no | in kit: engine-core prompts, card-zones view (own copy) |
| Engine | Market refill and acquire | Market slots, refill, acquire, exile | src/engine/market/*.ts | no | in kit: market-row (own copy) |
| Engine | Scoring | Score and collapse | src/engine/scoring/*.ts | no | missing (game-specific) |
| Engine | Faction modules registry | Per-faction rule hooks and flags | src/engine/nations/{registry,hooks,flags}.ts, modules/ | no | in kit: engine-core modules (partial) |
| Engine | Setup and variants | Create game, seats, variants, commons | src/engine/setup/*.ts | no | in kit: game-store start (partial) |
| Engine | Custom card handler registry | Hand-coded card handlers by id | src/engine/customs/*.ts | no | in kit: card-language custom verb (own copy) |
| Engine | Content schema and loader | Schema per record, loader, walk, coverage | src/content/schema.ts, loader.ts, walk.ts, coverage.ts, issues.ts, registry.ts | no | in kit: content-pack (own copy) |
| Engine | Pack bundle and legacy hash | Bundled packs, hash compatibility | src/content/bundle.ts, legacyHash.ts, codes.ts | no | missing |
| AI | Rule-based bot | Turn choice, eval, difficulty, match memory | src/engine/bot/*.ts | no | in kit: opponent, automa (own copy) |
| AI | Bot card-text interpreter | Reads card text for bot evaluation | src/engine/bot/interpret.ts, lang.ts | no | missing |
| AI | Drivers (random, greedy, heuristics) | Sim players | src/engine/drivers/*.ts | no | in kit: sim-pool drivers (own copy) |
| AI | Simulation pool and runner | Many games on workers, resume, golden, pairings | scripts/sim/*.ts, scripts/simulate.ts | no | in kit: sim-pool (own copy) |
| AI | Baseline and balance compare | Baseline file and compare | scripts/mvp-baseline.ts | no | in kit: sim-pool sanity bands (own copy) |
| Sound | Sound and voice | none present in game | - | - | missing in game (kit has sound-player, voice) |
| Tooling | Test utils (builders, blank game, packs) | Builders and driver for tests | src/test-utils/*.ts | no | in kit: card-harness (own copy) |
| Tooling | E2E helpers and specs | Playwright helpers and flows | e2e/helpers.ts, e2e/*.spec.ts | no | in kit: e2e-helpers (own copy) |
| Tooling | Replay CLI | Headless replay | scripts/replay.ts | no | in kit: replay-cli (own copy) |
| Tooling | Perf budget | applyAction speed over games | scripts/perf.ts, perf.test.ts | no | in kit: perf (own copy) |
| Tooling | Traceability check | Test titles cite rule ids | scripts/check-traceability.ts | no | in kit: traceability (own copy; kit/traceability present) |
| Tooling | Content gate, coverage, validate | Check content and coverage | scripts/content-gate.ts, content-coverage.ts, validate-content.ts | no | in kit: card-harness contentGate (own copy) |
| Tooling | Bundle-size check | Build size limit | bundle-size.config.json | yes | in kit: bundle-size (game uses kit) |
| Tooling | CI workflows | ci, full gate, ingest, sandbox sweep | .github/workflows/*.yml, ci.config.json | no | in kit: ci-templates (game uses kit for ci, full-gate); ingest and sandbox-sweep missing |
| Tooling | Plan checker | Checks build plan | kit/plan-checker | yes | in kit: plan-checker (game uses kit) |
| Tooling | Static mock pages | HTML boards for look decisions | docs/ui/mock*/ | look-only | in kit: layout-editor (partial) |
| Tooling | Phone mock with screenshot script | Phone mock with shoot script | docs/ui/mock-phone/ | look-only | missing |
| Data | Pack build, bundle, link scripts | Build proto pack, bundle real pack, link | scripts/build-proto-pack.ts, bundle-real-pack.ts, link-real-pack.ts | no | in kit: content-pack (partial), scan-ingest |
| Data | Interpretation generator | Generates bot reading of card text | scripts/gen-interpretations.ts | no | missing |
| Data | Icon and marble generators (python) | Generate icons and marble textures | docs/ui/icons/*.py, docs/ui/marble/*.py | look-only | missing |
| Data | Cover crop script | Crop scanned covers | docs/ui/home/crop_box_covers.py | no | in kit: scan-ingest (partial) |

## radiance-fan-prototype @ 86af403

Game has a full kit/ copy and imports from it throughout (78 engine-core, 50 card-zones, 17 card-language, tutorial, prompt-host, table-panels, glossary, phone-mode, app-frame, sim-pool, screens, market-row, game-store, bug-reporter, saves, settings ...). Rows marked "game uses kit" are glue over kit parts, not copies.

| Area | Part (neutral name) | What it does (≤12 words) | Path | Game-free? | Kit status |
|---|---|---|---|---|---|
| Engine | Game object / rules wiring | defineGame with config, handlers, view, opponent | src/engine/rules.ts, api.ts, core.ts | no | in kit: game-store, engine-core; game uses kit |
| Engine | Zones and seat visibility | Zone defs, per-seat seen rules, market zones | src/engine/zones.ts | no | in kit: card-zones, market-row; game uses kit |
| Engine | Timing / triggers glue | Card triggers and would-windows on kit timing | src/engine/timing.ts | no | in kit: card-language, engine-core timing; game uses kit |
| Engine | Effect language evaluator | Selectors, conditions, amounts, frames over state | src/engine/lang/eval.ts | no | in kit: card-language (verb table); game uses kit |
| Engine | Custom verbs / verb table | Game verbs, custom handlers, registered check | src/engine/lang/verbs.ts, custom.ts | no | in kit: card-language; game uses kit |
| Engine | Round flow | Round phases as flow table with windows and steps | src/engine/handlers/round.ts | no | in kit: turn-flow; game uses kit |
| Engine | Decision window with forward gates | Free actions, barred options with reasons, proceed gates | src/engine/window.ts | no | in kit: engine-core (bar, legalTable); game uses kit; gate registry part is game's |
| Engine | Stat with sources breakdown | Stat value carrying parts by source, floors, cheats | src/engine/stat.ts, stats.ts | no | missing (kit has sumEffects only; no "parts" breakdown) |
| Engine | Combat / travel / growth handlers | Rule handlers for combat, travel, growth | src/engine/handlers/combat.ts, travel.ts, growth.ts | no | missing (game rules) |
| Engine | Module handlers (quests, companions, barons) | Optional rule modules as handler files | src/engine/handlers/modules/*.ts | no | missing (game rules) |
| Engine | Difficulty presets and rating | Difficulty as setup options and a computed rating | src/engine/difficulty.ts | no | in kit: automa (difficulty tiers as data, solo); rating part missing |
| Engine | Setup / options | Options to starting state, seeds | src/engine/setup.ts | no | missing |
| Engine | Invariants | State checks run in tests and sims | src/engine/invariants.ts | no | in kit: engine-core (invariants); game uses kit |
| Engine | Typed prompts / events / kernel types | Prompt, event, task types for the game | src/engine/types/*.ts | no | in kit: engine-core types; game uses kit |
| Engine | Player view | Per-seat view with face-down hiding and preview | src/engine/view.ts | no | in kit: card-zones, engine-core (preview); game uses kit |
| AI | Greedy driver | Scored choice per prompt for sims | src/drivers/greedy.ts | no | in kit: sim-pool (Driver), opponent; game uses kit |
| AI | Random driver | Random legal answers | src/drivers/random.ts | yes | in kit: sim-pool; game uses kit |
| AI | Sim game module | Makes the game object a sim-pool game | src/drivers/sim-game.ts | no | in kit: game-store (simGameOf); game uses kit |
| AI | Golden game recorder / replay | Records full games, replays in CI | src/drivers/golden-game.ts, replay-engine.ts | no | in kit: replay-cli; game uses kit |
| Sim | Sim runner with bands | Runs games, reports sanity bands | scripts/sim.ts | no | in kit: sim-pool; game uses kit |
| Sim | Seed search for tutorial | Finds a seed and builds script from line of play | scripts/seed-search.ts | no | in kit: tutorial (K36 tooling); game uses kit |
| Sim | Bench | Times many games, AP/PV stats | scripts/bench.ts | no | in kit: perf; game uses kit (partly, own loop) |
| UI | Store | One game store, saves, settings, autosave | src/ui/store.ts | no | in kit: game-store, saves, settings; game uses kit |
| UI | Table layout from zones | Table zones from layout-editor JSON | src/ui/table/layout.ts | no | in kit: board-layout, layout-editor; game uses kit |
| UI | Table screen | Desktop table composing hand, market, mat | src/ui/table/Table.tsx | look-only | in kit: card-hand, player-board, market-row; game uses kit |
| UI | Card faces | Card faces drawn from layout data | src/ui/table/faces.tsx, src/ui/theme/cards.tsx | look-only | in kit: card-parts; game uses kit |
| UI | Quest area | Quest board with tokens | src/ui/table/Quests.tsx | look-only | missing (game-specific) |
| UI | Game log | Events narrated through one table | src/ui/table/log.ts | no | in kit: game-log, table-panels; game uses kit |
| UI | Steps panel / opponent turn | Paced steps with pace setting | src/ui/table/steps/*.ts(x) | no | in kit: paced-view, table-panels; game uses kit |
| UI | Prompt registry | Widgets per prompt kind with panels | src/ui/prompts/registry.tsx, panels.tsx, cards.tsx, window.tsx | look-only | in kit: prompt-host; game uses kit |
| UI | Order-discard prompt | Ordering cards to discard with drag | src/ui/prompts/orderDiscard.tsx | look-only | in kit: prompt-host (order widget); game uses kit |
| UI | Gallery of prompts | One state per prompt kind | src/ui/prompts/gallery.tsx | no | in kit: prompt-gallery; game uses kit |
| UI | Prompt wording | Words for prompts | src/ui/prompts/words.ts | no | in kit: prompt-host (words); game uses kit |
| UI | Zoom context | Peek/zoom contexts around cards | src/ui/prompts/zoom.ts | yes | in kit: card-zoom / ui-helpers (inspect); game has own copy |
| UI | Phone table | Phone layout: grid hand, sheet, second-tap commit | src/ui/phone/PhoneTable.tsx, phone.css | look-only | in kit: phone-mode, card-hand grid; game uses kit |
| UI | Stat breakdown tooltip (xp) | Shows each stat as total with source parts | src/ui/xp/xp.ts, Xp.tsx | no | missing (UI over stat parts) |
| UI | Tap guard for tutorial/xp | Guards taps when tutorial or xp is on | src/ui/xp/guard.tsx | no | in kit: tutorial (TUTORIAL_OFF); game uses kit |
| UI | Setup choices screen | New-game form with difficulty and extras | src/ui/screens/SetupChoices.tsx, setup.ts | look-only | in kit: screens (SetupForm); game uses kit |
| UI | Screens (home, saves, settings, over) | Menus and end screen | src/ui/screens/Screens.tsx, shared.tsx | look-only | in kit: screens, saves, settings, table-panels; game uses kit |
| UI | Loss reason text | Explains each loss cause in plain words | src/ui/screens/shared.tsx | no | missing |
| UI | Routes | Hash routes lazily loaded | src/ui/screens/routes.ts, App.tsx | yes | in kit: app-frame; game uses kit |
| UI | Phone screen | Phone entry screen | src/ui/screens/Phone.tsx | look-only | in kit: phone-mode; game uses kit |
| UI | Dev console screen | Slash console over debug edits | src/ui/screens/Dev.tsx | yes | in kit: debug-console; game uses kit |
| UI | Bug reporter glue | Config, queue screen, token | src/ui/bug.ts, screens/BugZone.tsx | yes | in kit: bug-reporter; game uses kit |
| UI | Tutorial glue | Script session, panel and highlight | src/ui/tutorial/*.ts(x) | look-only | in kit: tutorial; game uses kit |
| UI | Lookups / glossary / traits | Glossary and trait lookups with extras | src/ui/lookups/*.tsx, traits.ts | look-only | in kit: glossary; game uses kit (trait lookup is the game's) |
| UI | Icon text | Printed text with icons and glossary hold | src/ui/text/icons.tsx, iconSet.ts | yes | in kit: card-parts (IconText), glossary; game uses kit |
| UI | Proof sheet of effect families | Lists every effect entry, flags uncovered or custom | src/ui/proof/Proof.tsx, screens/families.ts | no | in kit: pattern note K10 (proof sheet); not a component; missing |
| UI | Theme page / frames / sun | Look page, frames, logo, sun icon | src/ui/theme/*.tsx, theme.css, tokens.css | look-only | in kit: theme-check (check only); look is the game's |
| UI | Event beats table | Maps events to motion beats by margin | src/ui/beats.ts | no | in kit: effect-library (beatsFromEvents), story (beats); game has own copy |
| Sound | Music state | Maps view to music state | src/ui/musicState.ts | no | in kit: sound-player; game uses kit (state map is the game's) |
| Tooling | Content build | Builds pack from sources, families, patches | scripts/content-build.ts, scripts/content/ | no | in kit: content-pack, card-patches; game uses kit |
| Tooling | Content check | Validates content, ignored columns | scripts/content-check.ts | no | in kit: content-pack; game uses kit |
| Tooling | Describe check | Rendered text vs printed with accepted list | scripts/describe-check.ts | no | in kit: card-harness (describeCheck); game uses kit |
| Tooling | Render effects as English | Dumps records or families as text for audit | scripts/render-effects.ts, render-family.ts | no | in kit: card-harness (renderRecords); game uses kit |
| Tooling | Testing inventory | Which cards have tests, round-trip, stale check | scripts/testing-inventory.ts | no | in kit: card-harness (runInventory); game uses kit |
| Tooling | Glossary check | Coverage of glossary terms | scripts/glossary-check.ts | no | in kit: glossary; game uses kit |
| Tooling | Tutorial check | Replays tutorial script | scripts/tutorial-check.ts | no | in kit: tutorial; game uses kit |
| Tooling | Art build | Art to optimized images | scripts/art-build.ts | no | in kit: tooling-scripts; game has own copy |
| Tooling | Mat-spot measure/overlay | Measures token spots on a mat image, overlay | scripts/measure-mat-spots.py, mat-spots-overlay.py, content/mats.source.json | no | missing (track has spots on mat image; measuring tool missing) |
| Tooling | Check runner config | Parallel lanes for npm run check | scripts/check-runner.config.json | yes | in kit: check-runner; game uses kit |
| Tooling | Traceability config | Rule ids cited in test titles | scripts/traceability.config.json | yes | in kit: traceability; game uses kit |
| Tooling | Bundle size limit | First-load budget | size.config.json | yes | in kit: bundle-size; game uses kit |
| Tooling | Theme-check config | Look lives in tokens | theme-check.config.json | yes | in kit: theme-check; game uses kit |
| Tooling | CI + local CI | Workflows from config, local CI script | .github/workflows/, ci.config.json, tools/architect/local-ci.sh | yes | in kit: ci-templates; game uses kit |
| Tooling | Playtest probe | Plays the built game in a browser across profiles and difficulties | tools/playtest/playtest.mjs, probe.mjs, sheet.py | no | in kit: e2e-helpers (watchErrors only); script missing |
| Tooling | Card test scenarios | Per-family tests on real cards with scripted turns | tests/cards/, tests/cards/scripted.ts | no | in kit: card-harness; game uses kit |
| Tooling | Test board helpers | Scenario builders over real content | tests/util/board.ts, index.ts | no | in kit: card-harness (scenario builder); game uses kit |
| Tooling | Broken-pack fixtures | One bad file per validator rule | tests/fixtures/broken/*.json | no | in kit: content-pack (checks); fixtures are the game's |
| Tooling | Rulebook audit test | Test that every rulebook clause maps to code/tests | tests/audit/rulebook-audit.test.ts | no | in kit: traceability (partly); game has own copy |
| Tooling | Property tests | Fuzz whole games and setups | tests/property/*.ts | no | in kit: sim-pool (fuzzing); game uses kit |
| Tooling | Golden games | Recorded games with final states | tests/golden/ | no | in kit: replay-cli; game uses kit |
| Tooling | E2E flows and answer helper | Playwright flows, phone, offline, bugs | e2e/*.ts | no | in kit: e2e-helpers; game uses kit (flows are the game's) |

## rise-of-a-jarl-fan-prototype @ 82bb1d5

Game uses kit for: ci-templates, theme-check, repo-gate, traceability, plan-checker (kit/ pins v0.41-0.47 era). All other parts are the game's own code (its engine core, state machines and phone mode were lifted into the kit, so the copies below are the originals).
Game-free?: yes = no game words in it; look-only = reusable idea, code tied to this game; no = game rule/content.

| Area | Part (neutral name) | What it does (≤12 words) | Path | Game-free? | Kit status |
|---|---|---|---|---|---|
| Engine | Seeded RNG | Seeded random, shuffle | src/engine/core/rng.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Apply loop and handlers | applyAction, task handler table, ctx, errors | src/engine/core/apply.ts, handlers.ts, ctx.ts, runner.ts, errors.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Copy-on-write draft | Shallow copy-on-write state barrier | src/engine/core/cow.ts, draft.ts, copy.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Canonical JSON and hash | Canonical JSON, FNV state hash | src/engine/core/canonical.ts, hash.ts, ids.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Invariants | State invariants checked after every action | src/engine/core/invariants.ts | look-only | in kit: engine-core invariants (game has own copy) |
| Engine | Game-over by throw | Procedure throws GameOver, caught by apply | src/engine/core/gameOver.ts | yes | missing |
| Engine | Engine transition graph as data | Engine state machine table with generated map doc | src/engine/core/machines.ts | look-only | in kit: state-machines (game has own copy) |
| Engine | State machine registry | Explicit machines, illegal-event errors, doc generator | src/lib/machine.ts, scripts/machines-doc.ts, machines.ts, lib/machine-modules.ts | yes | in kit: state-machines (game has own copy) |
| Engine | Replay, undo, save | Replay from actions, undo target, save file | src/engine/replay/replay.ts, undo.ts, save.ts | yes | in kit: engine-core + saves (game has own copy) |
| Engine | Effect op registry | Op kinds with rules module, describe, validator rows | src/engine/effects/ops.ts, query.ts, describe.ts | look-only | in kit: card-language (game has own copy) |
| Engine | Content schema | zod schema for content and ids | src/content/schema/*.ts | look-only | in kit: content-pack (game has own copy) |
| Engine | Round and phase rules | Plan, Growth, Invasion, Cleanup, scoring | src/engine/rules/*.ts | no | missing |
| Engine | Action modules | Attract, develop, raid, settle, trade, tribute, innovate | src/engine/rules/actions/*.ts | no | missing |
| Engine | Limits enforcement | Storehouse and kingdom limits with discard prompts | src/engine/rules/limits.ts | no | missing |
| Engine | Rule switches / config | Game options as typed config | src/engine/types/config.ts | no | in kit: screens (setup form data) |
| AI/sim | Random driver | Uniform legal answers | src/engine/drivers/random.ts | yes | in kit: sim-pool (game has own copy) |
| AI/sim | Greedy driver | Heuristic sanity player | src/engine/drivers/greedy.ts | look-only | in kit: sim-pool / opponent (game has own copy) |
| AI/sim | Lookahead driver | Plays each answer then finishes game a few times | src/engine/drivers/lookahead.ts | look-only | in kit: opponent lookAhead (game has own copy) |
| AI/sim | Simulation CLI with sanity bands | N games per driver, loss reasons, band checks | scripts/simulate.ts | look-only | in kit: sim-pool (game has own copy) |
| AI/sim | Property tests (fuzz, history) | Random games with invariants, undo/redo history | tests/property/fuzz.test.ts, history.test.ts | yes | in kit: sim-pool fuzz + engine-core (game has own copy) |
| AI/sim | Prompt-fixture finder | One seeded history per prompt purpose, found by play | scripts/prompt-fixtures.ts | look-only | in kit: prompt-gallery (game has own copy) |
| AI/sim | Menu and flow fixtures | Seeded histories for screenshots and e2e flows | scripts/menu-fixtures.ts, flow-fixtures.ts | look-only | in kit: e2e-helpers / prompt-gallery (partial) |
| UI | Game store | Store over engine, undo, autosave, machine | src/ui/store/game.ts, game.machine.ts | look-only | in kit: game-store (game has own copy) |
| UI | KV store with memory fallback | IndexedDB key-value, falls back to memory if refused | src/ui/store/kv.ts | yes | in kit: saves (game has own copy) |
| UI | Saves store and screen | Save list, load, delete | src/ui/store/saves.ts, src/ui/screens/Saves.tsx | look-only | in kit: saves (game has own copy) |
| UI | Settings store and screen | Settings persisted, screen | src/ui/store/settings.ts, src/ui/screens/Settings.tsx | look-only | in kit: settings (game has own copy) |
| UI | Finished-game log and stats | Log of finished games, best per starting kingdom | src/ui/store/log.ts | look-only | in kit: play-stats (game has own copy) |
| UI | Routes and route machine | Hash routes with a machine | src/ui/routes.ts, routes.machine.ts, App.tsx | yes | in kit: app-frame (game has own copy) |
| UI | Component machine hook | A component's own machine via hook | src/ui/useMachine.ts | yes | in kit: state-machines (game has own copy) |
| UI | Local state ledger | Lists UI state deliberately not a machine | src/ui/localState.ts | yes | in kit: state-machines (doc idea; game has own copy) |
| UI | Fit zoom for 4K design | Zooms 4K screen down to window, letterboxed | src/ui/fit.ts | yes | in kit: resolution-frame (game has own copy) |
| UI | Table layout (4K) | Pure layout of table zones, stacks, rotations | src/ui/table/layout.ts | look-only | in kit: player-board plan + board-layout (game has own copy) |
| UI | Table and side strip | Table view, round/phase strip, track, log | src/ui/table/Table.tsx, SideStrip.tsx | no | in kit: track + table-panels (game has own copy) |
| UI | Pickable-card options | Which table cards answer the open prompt | src/ui/table/options.ts, src/ui/prompts/pick.ts, pick.machine.ts | look-only | in kit: board-registry + prompt-host useBoardPick (game has own copy) |
| UI | Prompt bar model | Which buttons the bar shows for the open prompt | src/ui/prompts/barModel.ts, PromptBar.tsx | look-only | in kit: prompt-host (game has own copy) |
| UI | Prompt purposes table | Question line, clause and answer style per prompt kind | src/ui/prompts/purposes.ts, text.ts | look-only | in kit: prompt-host + prompt-source (game has own copy) |
| UI | Auto-answer obvious | Answers a prompt when exactly one forced option | src/ui/prompts/autoAnswer.ts | yes | in kit: prompt-host autoAnswer (game has own copy) |
| UI | Invasion result panel | Breakdown of armed citizens vs strength | src/ui/prompts/InvasionResult.tsx, invasion.ts | no | missing |
| UI | Card face | Card composite, B&W cell, rotation | src/ui/components/CardFace.tsx, cardSize.ts | look-only | in kit: card-parts (game has own copy) |
| UI | Inspector | Hover or right-click opens large face with text beside it | src/ui/components/Inspector.tsx, inspect.ts | look-only | in kit: card-zoom + ui-helpers inspect (game has own copy) |
| UI | Rich text with icons | Printed text with inline icons and glossary terms | src/ui/components/RichText.tsx | yes | in kit: card-parts / glossary (game has own copy) |
| UI | Glossary popover | One popover; click opens, outside click or Esc closes | src/ui/components/GlossaryPopover.tsx, popover.ts, glossary.ts, glossaryGroups.ts | yes | in kit: glossary (game has own copy) |
| UI | Glossary screen | Searchable glossary list | src/ui/screens/GlossaryScreen.tsx | look-only | in kit: glossary (game has own copy) |
| UI | Rank badge | Rank coloured like the paper log | src/ui/components/RankBadge.tsx | no | missing |
| UI | Menu frame | Frame of every menu screen: logo, name, back to Home | src/ui/screens/MenuFrame.tsx | look-only | in kit: screens (unstyled; game has own copy) |
| UI | Home, new game, placeholder | Main menu, new game form | src/ui/screens/Home.tsx, NewGame.tsx, Placeholder.tsx | look-only | in kit: screens (game has own copy) |
| UI | Game over and score sheet | Result, score sheet rows in printed order | src/ui/screens/GameOver.tsx, sheetRows.ts | look-only | in kit: table-panels game over (game has own copy) |
| UI | History log screen | Log of the game's events | src/ui/screens/HistoryLog.tsx, src/ui/table/logText.ts | look-only | in kit: game-log + table-panels (game has own copy) |
| UI | Rules screen with search | Rulebook as data, phone search by words, headings | src/ui/screens/RulesScreen.tsx, rulebook.ts, rulesSearch.ts | look-only | missing |
| UI | Rule diagrams from game assets | Scenes as pure data over card faces, icons, fonts | src/ui/screens/diagrams/*.ts(x) | look-only | missing |
| UI | Proof sheet | Each card face beside its data | src/ui/screens/ProofSheet.tsx | yes | in kit: prompt-gallery (partial; card proof sheet missing) |
| UI | Table restore | What the table does on reload with no game in memory | src/ui/table/restore.ts, restore.machine.ts | look-only | in kit: game-store load (game has own copy) |
| UI | Phone layout | Phone table: regions, hand dock, bar, sheets | src/ui/phone/table/*.tsx, layoutPhone.ts, handSize.ts, src/ui/theme/phone*.css | look-only | in kit: phone-mode (game has own copy; kit lifted from Imperium) |
| UI | Bottom sheet machine | Which one bottom sheet is open | src/ui/phone/Sheet.tsx, sheet.machine.ts, sheetStore.ts | yes | in kit: phone-mode one bottom sheet (game has own copy) |
| UI | Disclosure machines | Open/folded parts of phone screens | src/ui/phone/disclosure.machine.ts | yes | in kit: state-machines (game has own copy) |
| UI | Tap rule on phone | Tap toggles pick in multi-pick, else opens sheet | src/ui/phone/table/tap.ts | yes | in kit: prompt-host second-tap commit (partial; game has own copy) |
| UI | Rotate-to-portrait panel | Shows logo and "turn upright" when sideways | src/ui/phone/table/RotatePanel.tsx | yes | in kit: phone-mode (partial; game has own copy) |
| UI | Viewport and safe-area tokens | Viewport store, safe-area CSS vars | src/ui/viewport/*.ts | yes | in kit: phone-mode safe areas (game has own copy) |
| UI | Tutorial | Scripted tutorial with lock, narration tokens, placement | src/ui/tutorial/*.ts(x) | look-only | in kit: tutorial (game has own copy) |
| UI | Tutorial box placement | Box beside the click target, never over it | src/ui/tutorial/place.ts | yes | in kit: tutorial docked side (partial; game has own copy) |
| UI | Tutorial authoring tools | Find a seed, write the script doc for owner approval | scripts/tutorial-seed.ts, tutorial-script.ts | look-only | in kit: tutorial tooling K36 (game has own copy) |
| UI | Bug report | Dialog, markup editor, screenshot, IndexedDB queue, GitHub filing, token | src/ui/bugs/*.ts(x), markup/* | yes | in kit: bug-reporter (game has own copy) |
| UI | Offline service worker and update line | Registers worker, update machine, precache plugin | src/ui/sw.ts, update.machine.ts, scripts/lib/sw-precache.ts, public/sw.js | yes | in kit: offline (game has own copy) |
| UI | Plain-text guard | Forbids code identifiers and plan refs in shown text | src/ui/identPattern.ts, plainText.ts | yes | in kit: plain-text (game has own copy) |
| UI | Logo with sky backdrop | Traced wordmark component | src/ui/theme/Logo.tsx | no | missing |
| UI | Theme tokens and CSS | Token file, per-screen CSS | src/ui/theme/tokens.css, index.css | no | in kit: theme-check (game uses kit) |
| Tooling | Theme check | Look lives in the token file | scripts/theme-check.ts | yes | in kit: theme-check (game uses kit) |
| Tooling | Repo gate, traceability, plan checker, CI | Size, secrets, rule-id citation, workflows | kit/, .github/workflows/*, ci.config.json | yes | in kit: repo-gate, traceability, plan-checker, ci-templates (game uses kit) |
| Tooling | Local CI fallback | Runs ci.yml and full gate in Linux | tools/architect/local-ci.sh | yes | in kit: ci-templates local CI script (game has own copy) |
| Tooling | Mock capture | Screenshots static HTML mocks with Playwright | tools/capture.mjs, docs/mocks/src/*, phone/review_manifest.py | yes | in kit: tooling-scripts mock-capture (game has own copy) |
| Tooling | Screenshot shrinker | Re-encodes PNGs over 2 MB as indexed PNG | tools/shrink-shots.mjs, tools/art/shrink-mocks.py | yes | in kit: tooling-scripts picture re-encoder (game has own copy) |
| Tooling | App icon generator | Home-screen icons and manifest from art | tools/art/app-icons.mjs | yes | in kit: app-icons (game has own copy) |
| Tooling | Vector tracing scripts | Trace icons and logos into SVG, B&W render | tools/art/trace-icons.py, render-bw.py, sky-panel.py | look-only | missing |
| Tooling | Art build and check | Builds art set, checks files and budgets | scripts/art-build.ts, art-check.ts, lib/art.ts | look-only | in kit: repo-gate art budgets (partial) |
| Tooling | Glossary and describe checks | Every token has a glossary entry; generated reading matches | scripts/glossary-check.ts, describe-check.ts | look-only | in kit: glossary check + card-harness renderRecords (game has own copy) |
| Tooling | Fonts fetch | Fetches fonts to the repo | scripts/fonts-fetch.ts | yes | in kit: tooling-scripts font fetch (game has own copy) |
| Tooling | Coverage report | Content coverage | scripts/coverage.ts | look-only | missing |
| Tooling | Test utils | Test state helpers, DOM setup, machine assertions | src/test-utils/*.ts | look-only | in kit: card-harness / state-machines (game has own copy) |
| Tooling | E2E helpers (desktop and phone) | Phone emulation, play steps, autosave wait | e2e/lib/autosave.ts, e2e/phone/lib/phone.ts, play.ts | look-only | in kit: e2e-helpers (partial; game has own copy) |
| Tooling | Offline e2e server | Serves build A and B to test the update line | e2e/phone/lib/offline-server.ts | yes | missing |
| Tooling | Fill-the-screen e2e check | Asserts phone table fills window to safe area | e2e/phone/fill.spec.ts | look-only | in kit: theme-check coverage (partial) |
| Tooling | Golden games | Recorded games with hash | tests/golden/, tests/cards/ | look-only | in kit: replay-cli (game has own copy) |
| Data | Content pack build from dossier | Builds content JSON from dossier, check rebuilds and diffs | scripts/lib/pack.ts, content-build.ts, content-check.ts, src/content/load.ts | look-only | in kit: content-pack (partial; game has own copy) |
| Data | Content index loader | Loads pack in UI | src/ui/content.ts, src/content/index.ts | look-only | in kit: content-pack (game has own copy) |

## rome-fate-of-an-empire-fan-prototype @ 399ab2d

Game uses kit only for ci-templates, repo-gate, traceability, plan-checker (kit/ has just these). Everything else is the game's own copy (many ported from Warp's Edge, STCC, Rise of a Jarl).

| Area | Part (neutral name) | What it does (≤12 words) | Path | Game-free? | Kit status |
|---|---|---|---|---|---|
| Engine | Seeded RNG (sfc32/cyrb128) | Seeded random numbers with saved state | src/engine/core/rng.ts | yes | in kit: engine-core; game has own copy |
| Engine | Canonical JSON + state hash | Sorted-key JSON, FNV hash, stable fingerprint | src/engine/core/canonical.ts, hash.ts | yes | in kit: engine-core; game has own copy |
| Engine | Copy-on-write state helpers | Draft/own helpers so actions never mutate shared state | src/engine/core/cow.ts, copy.ts, draft.ts | yes | in kit: engine-core; game has own copy |
| Engine | Task runner / applyAction | Guarded task loop, validate and apply one answer | src/engine/core/runner.ts, apply.ts, handlers.ts | yes | in kit: engine-core; game has own copy |
| Engine | Invariant checker | Checks state invariants after every action in tests/sims | src/engine/core/invariants.ts | no | in kit: engine-core (invariants); game has own copy |
| Engine | Game-over / errors / ids | Typed errors, id helpers, end-of-game detection | src/engine/core/errors.ts, ids.ts, gameOver.ts | no | in kit: engine-core; game has own copy |
| Engine | Replay from action log | Rebuild a state by replaying answers, verify hashes | src/engine/replay/replay.ts | yes | in kit: engine-core (replay); game has own copy |
| Engine | Portable save file (v1) | Save restores only through verified replay | src/engine/replay/save.ts | yes | in kit: engine-core (createSave); game has own copy |
| Engine | Step undo (action prefix) | History as action prefix; reveals are undo boundaries | src/engine/replay/undo.ts | yes | in kit: engine-core (steps/undo); game has own copy |
| Engine | Legal-answer enumerator | Lists every legal answer for the open prompt | src/engine/select/enumerate.ts | yes | in kit: engine-core (legal); game has own copy |
| Engine | Per-seat player view | Hides deck order and hidden piles from the view | src/engine/select/views.ts | no | in kit: card-zones (per-seat view); game has own copy |
| Engine | Prompt (ask/resume) model | Interpreter pushes resume task and asks the player | src/engine/ops/prompt.ts, src/engine/types/tasks.ts | yes | in kit: engine-core (ctx.ask); game has own copy |
| Engine | Card-effect language interpreter | Effect-tree ops run by a large interpreter | src/engine/ops/run.ts, resolve.ts, src/engine/types/ops.ts | no | in kit: card-language (verb table); game has own copy |
| Engine | Effect schema validator | Zod schemas equal to the effect op types | src/content/schema/ops.ts | no | in kit: card-language / content-pack; game has own copy |
| Engine | Effect-to-English describer | Turns an effect tree into one English sentence | src/engine/text/describe.ts | no | in kit: card-language (describeEffect); game has own copy |
| Engine | Read-only effect queries | Count/sum/condition queries over state for effects | src/engine/ops/query.ts | no | in kit: engine-core (queries); game has own copy |
| Engine | Trigger raising | Triggers queued while an effect resolves | src/engine/ops/triggers.ts | no | in kit: engine-core (timing.triggers); game has own copy |
| Engine | Modifiers / turn flags | Temporary modifiers and per-turn flags with expiry | src/engine/ops/modifiers.ts | no | in kit: engine-core (addEffect, Duration); game has own copy |
| Engine | Turn / phase / round flow | Turn loop as task kinds: phases, cleanup, rounds, end | src/engine/turn/phases.ts, state.ts, actions.ts | no | in kit: turn-flow; game has own copy |
| Engine | Deck draw and reshuffle | Draw from top, reshuffle discard, deck-out rules | src/engine/cards/draw.ts | no | in kit: card-zones; game has own copy |
| Engine | Card instances / ids | Card copy ids and instance lookup | src/engine/cards/cards.ts, play.ts | no | in kit: engine-core (cardInstanceId); game has own copy |
| Engine | Market rows | Two-row market, prices, cycling, level locks, refill | src/engine/market/market.ts | no | in kit: market-row; game has own copy |
| Engine | Resource caps / gold | Resources capped at 10, excess lost | src/engine/economy/resources.ts, general.ts | no | missing |
| Engine | Attribute-points buckets | Typed point pools spent on actions | src/engine/ops/ap.ts, ops/customs/*.ts | no | missing |
| Engine | Tracks (leader tracks, reduce) | Track movement, reduction, thresholds | src/engine/ops/tracks.ts | no | missing (track is UI only) |
| Engine | Grid empire board | 5x5 grid: build, move, conquer, influence, trade | src/engine/empire/*.ts | no | in kit: board-model (spaces, adjacency); game has own copy |
| Engine | Leader module registry | Named hooks per leader, registered modules | src/engine/leaders/registry.ts, abilities.ts | no | missing |
| Engine | Score sheet | Final scoring rows and win/lose/collapse | src/engine/scoring/score.ts | no | missing |
| Engine | House-rule toggles | Designer-permitted rule variants as settings | src/engine/ops/houseRules.ts, types/config.ts | no | in kit: settings (partly); game has own copy |
| Engine | Setup / scenario creation | Create game from seed, leader, enemies, edicts | src/engine/setup/*.ts | no | missing (screens is setup-form UI only) |
| AI | Greedy one-ply driver | Deterministic evaluation of legal answers | src/engine/drivers/greedy.ts | no | in kit: sim-pool (Driver contract); game has own copy |
| AI | Random driver | Random legal answers for fuzzing | src/engine/drivers/random.ts | yes | in kit: sim-pool; game has own copy |
| AI | Bounded turn planner | Searches whole-turn plans using public API | src/engine/drivers/planner.ts | no | in kit: opponent (lookAhead); game has own copy |
| Sim | Simulation runner | Plays many games, checks invariants, prints bands | scripts/simulate.ts | no | in kit: sim-pool; game has own copy |
| Sim | Win diagnosis report | Observation-only report on why games end | scripts/diagnose-wins.ts | no | missing |
| Sim | Perf engine bench | Repeatable applyAction timing diagnostics | scripts/perf/engine.ts | no | in kit: perf; game has own copy |
| UI | Store (state, view, answer) | UI store holding game, view, content index | src/ui/store/game.ts | no | in kit: game-store; game has own copy |
| UI | Transient UI state / inspect | Chosen build, inspected object, not game state | src/ui/store/ui.ts, inspect.ts | no | in kit: ui-helpers (inspect); game has own copy |
| UI | Table-as-menu interaction | Prompt options shown as clicks on table objects | src/ui/game/interaction.ts | no | in kit: board-registry / prompt-host (useBoardPick); game has own copy |
| UI | Prompt host (kind to widget) | One component per prompt kind by open prompt | src/ui/prompts/PromptHost.tsx | no | in kit: prompt-host; game has own copy |
| UI | Prompt widgets | About 25 choose-* components for cards, cells, amounts, options | src/ui/prompts/Choose*.tsx, May.tsx, DiscardAnyFromHand.tsx | no | in kit: prompt-host (common widgets); game has own copy |
| UI | Blocking prompt strip | Strip naming source card and clause above the board | src/ui/prompts/parts.tsx, text.ts | look-only | in kit: prompt-source; game has own copy |
| UI | Market view | Two market rows, prices, cycle button, level lock | src/ui/table/Market.tsx | look-only | in kit: market-row (ui); game has own copy |
| UI | Grid board view | 5x5 grid with centre capital, lens, picks | src/ui/table/Empire.tsx, cells.ts | look-only | in kit: board-model / board-layout; game has own copy |
| UI | Counters / edict panels | Score, counts, edict ledger side panels | src/ui/table/Panels.tsx | look-only | in kit: counter (numbers only); game has own copy |
| UI | Leader mat | Leader board with tracks and abilities | src/ui/table/Leader.tsx | look-only | in kit: player-board; game has own copy |
| UI | Round tracker header | Logo, round as track, settings button | src/ui/table/Header.tsx | look-only | in kit: track / table-panels (banner); game has own copy |
| UI | Zoom inspector | Large face plus full transcription and glossary links | src/ui/components/Inspector.tsx | look-only | in kit: card-zoom; game has own copy |
| UI | Rich text with inline icons | Printed text with [Icon] codes as SVG and terms | src/ui/components/RichText.tsx, terms.ts | yes | in kit: card-parts (IconText) + glossary; game has own copy |
| UI | Rule-id scrubber | Strips TURN-07-style ids from every shown line | src/ui/components/ruleIds.ts | yes | in kit: plain-text; game has own copy |
| UI | Glossary screen / data | Codex of terms with icons | src/ui/screens/GlossaryScreen.tsx, components/glossaryData.ts | look-only | in kit: glossary (ui); game has own copy |
| UI | Asset path resolver | Where faces, icons, boards live, base-aware | src/ui/components/assets.ts | yes | missing |
| UI | Saves screen + store | Autosave, named saves, IndexedDB, load/export | src/ui/game/saves.ts, screens/Saves.tsx | no | in kit: saves; game has own copy |
| UI | Settings store + screen | Persisted look and rules settings | src/ui/store/settings.ts, screens/Settings.tsx | no | in kit: settings; game has own copy |
| UI | Rules settings panel | Rules options shown as dossier wording with defaults | src/ui/screens/RulesPanel.tsx | no | in kit: settings (partly); game has own copy |
| UI | Statistics store + screen | Records of finished games, totals, personal best | src/ui/game/stats.ts, screens/Statistics.tsx | no | in kit: play-stats; game has own copy |
| UI | Game-over / score screen | Victory/defeat/collapse with score rows | src/ui/screens/GameOver.tsx, scoreRows.ts | look-only | in kit: table-panels (game over); game has own copy |
| UI | Menu frame / home / new game | Shared menu frame, home, leader-choice form | src/ui/screens/MenuFrame.tsx, Home.tsx, NewGame.tsx | look-only | in kit: screens; game has own copy |
| UI | Hash router | Hash routes so the app runs from preview | src/ui/routes.ts | yes | in kit: app-frame; game has own copy |
| UI | Offline / service worker register | Production SW registration and update line | src/ui/offline.ts | yes | in kit: offline; game has own copy |
| UI | Resolution frame | Lay out for a chosen screen size in an iframe, scaled | src/ui/frame/ResolutionFrame.tsx, resolution.ts | yes | in kit: resolution-frame; game has own copy |
| UI | Phone layout | Phone composition at 390x844 | src/ui/phone/phone.css | look-only | in kit: phone-mode; game has own copy |
| UI | Proof sheet | Every face rendered on one page for checking | src/ui/screens/ProofSheet.tsx, proofRows.ts | no | in kit: prompt-gallery / card-harness (pattern note K10); game has own copy |
| UI | Tutorial coach panel | Docked coach text with next/back | src/ui/tutorial/TutorialPanel.tsx | look-only | in kit: tutorial (ui); game has own copy |
| UI | Tutorial highlight | Measures next control, keeps coach clear of it | src/ui/tutorial/Highlight.tsx | yes | in kit: tutorial (TutorialHighlight); game has own copy |
| UI | Tutorial lock + scripted play | Only the scripted answer is allowed | src/tutorial/lock.ts, play.ts, data.ts, scenario.ts | no | in kit: tutorial; game has own copy |
| UI | Bug reporter | Screenshot, markup, offline queue, GitHub issue filing | src/ui/bugs/*.ts(x) | yes | in kit: bug-reporter; game has own copy |
| UI | Screenshot markup editor | Draw on a screenshot, portable React editor | src/ui/bugs/markup/ | yes | in kit: bug-reporter (markup); game has own copy |
| UI | Fake GitHub for tests | In-memory GitHub API for bug tests | src/ui/bugs/fakeGitHub.ts | yes | in kit: bug-reporter; game has own copy |
| UI | Column / logo ornaments | Ionic column and traced logo | src/ui/components/Column.tsx, Logo.tsx | look-only | missing (game-specific look) |
| UI | Theme tokens and fonts | Marble look tokens and font faces | src/ui/theme/*.css | look-only | in kit: theme-check (check only); look is the game's |
| Motion plumbing | Update/apply queue director | Queues view updates with injected time and rendering | src/ui/motion/director.ts | yes | in kit: paced-view / motion-frame; game has own copy |
| Motion plumbing | Speed setting | Animation speed multiplier | src/ui/motion/speed.ts | yes | in kit: settings (pace); game has own copy |
| Motion plumbing | View transition hook | Wraps updates in the View Transitions API | src/ui/motion/viewTransition.ts | yes | missing |
| Tooling | Content build pipeline | Dossier markdown tables to content JSON pack | scripts/content-build.ts, lib/pack.ts, lib/parse.ts | no | in kit: content-pack (loader/schema), card-patches; table parsers missing |
| Tooling | Content gate | Semantic validator and counts of the pack | scripts/content-check.ts, lib/check.ts | no | in kit: content-pack; game has own copy |
| Tooling | Icon code map | [Name] codes to SVG files | scripts/lib/icons.ts | no | in kit: card-parts (icons); game has own copy |
| Tooling | Glossary check | Glossary covers shown terms; fixes layer | scripts/glossary-check.ts, lib/glossary-fixes.ts | no | in kit: glossary (coverage check); game has own copy |
| Tooling | Art build / check | Dossier art to WebP and manifest check | scripts/art-build.ts, art-check.ts | no | in kit: tooling-scripts (art-check, shrink-png); game has own copy |
| Tooling | Font fetch + WOFF packer | Fetch fonts, losslessly package as WOFF | scripts/fonts-fetch.ts, lib/woff.ts | yes | in kit: tooling-scripts (fonts-fetch, woff); game has own copy |
| Tooling | Dossier sync | Copy dossier repo into the game | scripts/dossier-sync.ts | yes | in kit: tooling-scripts (dossier-sync); game has own copy |
| Tooling | Theme check | Typography and logo rules over files | scripts/theme-check.ts | no | in kit: theme-check; game has own copy |
| Tooling | Tutorial check / freeze / doc | Replay script, freeze answers, derive documentation | scripts/tutorial-check.ts, tutorial-freeze.ts, tutorial-doc.ts, tutorial-files.ts | no | in kit: tutorial (tooling K36); game has own copy |
| Tooling | Describe fixtures | Adds a row per effect to describe fixtures | scripts/describe-fixture.ts | no | in kit: card-harness (renderRecords, describeCheck); game has own copy |
| Tooling | Op coverage report | Which effect ops have fixtures and scenarios | scripts/coverage.ts | no | in kit: card-harness (specCoverage); game has own copy |
| Tooling | Golden recordings | Record/replay full games, re-record on decision | scripts/golden-update.ts, tests/golden/recordings.ts | no | in kit: replay-cli; game has own copy |
| Tooling | Perf: browser/bundle/runtime | Load, bundle inventory, render counters, exact compare | scripts/perf/browser.mjs, bundle.mjs, runtime.mjs, compare.mjs | yes | in kit: bundle-size (bundle); browser/runtime capture missing |
| Tooling | App icons | Home-screen icons from logo | tools/app-icons.mjs | yes | in kit: app-icons; game has own copy |
| Tooling | Mock capture scripts | Screenshots of built screens against mocks | tools/b13-capture.mjs, v12-capture.mjs | yes | in kit: tooling-scripts (mock-capture, shots); game has own copy |
| Tooling | Local CI / run watcher | Local CI script and run watcher | tools/architect/local-ci.sh, watch-run.sh | yes | in kit: ci-templates (local CI); game has own copy |
| Tooling | CI workflows | ci.yml and full-gate from config | .github/workflows/, ci.config.json | yes | in kit: ci-templates; game uses kit |
| Tooling | Repo gate, traceability, plancheck | File size, secrets, rule-id citations, plan check | repo-gate.config.json, trace.config.json | yes | in kit: repo-gate, traceability, plan-checker; game uses kit |
| Tooling | Test utils / jsdom setup | Bare-state test bed and DOM cleanup | src/test-utils/index.ts, setup-dom.ts | no | in kit: card-harness (scenario builder); game has own copy |
| Tooling | Property tests of answers | Random answers never break invariants | tests/property/*.ts | no | in kit: sim-pool (fuzzing); game has own copy |
| Tooling | E2E specs | Playwright smoke, phone, saves, offline, theme, tutorial | e2e/*.spec.ts | no | in kit: e2e-helpers (helpers); specs are the game's |

## under-falling-skies-fan-prototype @ f1042f8

Game uses kit for: ci-templates, check-runner, bundle-size, repo-gate, traceability, plan-checker. All other parts are the game's own code.
Game-free?: yes = no game words in it; look-only = reusable idea, code tied to this game; no = game rule/content.

| Area | Part (neutral name) | What it does (≤12 words) | Path | Game-free? | Kit status |
|---|---|---|---|---|---|
| Engine | Seeded RNG (sfc32) | Seeded random from a string seed | src/engine/core/rng.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Apply loop, ctx, errors | applyAction, validateAction, enumerateAnswers, task context | src/engine/core/apply.ts, ctx.ts, errors.ts, runner.ts, phases/handlers.ts | yes | in kit: engine-core (game has own copy) |
| Engine | State hash | FNV-1a 64 over canonical JSON | src/engine/core/hash.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Replay and undo target | Rebuild from options and actions; undo to action count | src/engine/core/replay.ts, undo.ts | yes | in kit: engine-core + game-store (game has own copy) |
| Engine | Invariants | INV-01..12 after every action | src/engine/core/invariants.ts | look-only | in kit: engine-core invariants (game has own copy) |
| Engine | Typed contract (types folder) | Task, prompt, save, event, ability types | src/engine/types/*.ts | look-only | in kit: engine-core (game has own copy) |
| Engine | Public engine API barrel | UI imports engine only from one file | src/engine/index.ts | yes | in kit: boundary-check (layering; game has own copy) |
| Engine | Layering lint | Engine must be pure, no UI import | tests/unit/lint-purity.test.ts, eslint.config.js | yes | in kit: lint-preset + boundary-check (game has own copy) |
| Engine | Ability triggers | Triggered abilities with steps and custom handler registry | src/engine/abilities/triggers.ts, customRegistry.ts | look-only | in kit: card-language / engine-core timing (game has own copy) |
| Engine | Board geometry from pack | Spaces, tunnels, adjacency built from content at setup | src/engine/geometry/build.ts | look-only | in kit: board-model (game has own copy) |
| Engine | Placement preview | Runs placement on a scratch copy, never draws | src/engine/select/preview.ts | look-only | in kit: engine-core preview K89 (game has own copy) |
| Engine | UI read model (view) | Everything except hidden generator words | src/engine/select/view.ts | yes | in kit: engine-core view / card-zones seat view (game has own copy) |
| Engine | Difficulty and threat | Threat level and epicness from setup | src/engine/select/difficulty.ts | no | missing |
| Engine | Text generation | Short English from content for tooltips, log, proof | src/engine/describe/index.ts | look-only | in kit: card-language text slots (game has own copy) |
| Engine | Content index and hash | Content index, content hash, pure | src/engine/pack/index.ts | yes | in kit: content-pack (game has own copy) |
| Engine | Setup (createGame) | Builds a game from options | src/engine/setup/createGame.ts | no | missing |
| Engine | Round and phase tasks | Round start/roll, dice, rooms, mothership, spawn | src/engine/phases/*.ts | no | in kit: turn-flow (phase table idea; game has own copy) |
| Engine | Dice placement rules | Placement legality, excavation, robots, room value | src/engine/rules/excavator.ts, robots.ts, roomValue.ts, effects.ts | no | missing |
| Engine | Ship movement and damage | Ships, landings, city hits, mothership descent | src/engine/rules/ships.ts, damage.ts | no | missing |
| Engine | Derived selectors | Pure derived values of state and content | src/engine/rules/selectors.ts | yes | in kit: engine-core queries (game has own copy) |
| AI/sim | Random driver | Uniform legal answers with end-phase chance | src/engine/drivers/random.ts | yes | in kit: sim-pool (game has own copy) |
| AI/sim | Greedy driver | Fair heuristic player reading only the view | src/engine/drivers/greedy.ts | look-only | in kit: opponent / sim-pool (game has own copy) |
| AI/sim | Sim CLI and helpers | Sim, smoke, bands, fuzz, golden record | scripts/simulate.ts, scripts/lib/sim.ts | look-only | in kit: sim-pool (game has own copy) |
| AI/sim | Property tests | Engine, fresh games, placement, simulation bands | tests/property/*.test.ts | look-only | in kit: sim-pool (game has own copy) |
| AI/sim | Golden replays | Fixture build, apply, match events, hash | src/test-utils/golden.ts, scripts/golden.ts, tests/golden/ | yes | in kit: replay-cli (game has own copy) |
| AI/sim | Replay script | Replays a saved game, checks hash | scripts/replay.ts | yes | in kit: replay-cli (game has own copy) |
| UI | Game store | Content, state, save, undo, redo | src/ui/store/gameStore.ts | look-only | in kit: game-store (game has own copy) |
| UI | Persistence (localStorage, export, import) | Autosave, JSON export and import | src/ui/store/persistence.ts | look-only | in kit: saves (game has own copy) |
| UI | Settings store and screen | Settings validated, defaults on error | src/ui/store/settingsStore.ts, src/ui/screens/Settings.tsx | look-only | in kit: settings (game has own copy) |
| UI | Packs store and screen | Bundled and linked packs, validation result, hash | src/ui/store/packs.ts, src/ui/screens/Packs.tsx | look-only | in kit: content-pack (partial; game has own copy) |
| UI | Hash routes | Hash route parsing | src/ui/routes.ts, hooks/useHashRoute.ts | yes | in kit: app-frame (game has own copy) |
| UI | Screens shell | Layout, Home, About, NewGame, GameOver | src/ui/screens/{Layout,Home,About,NewGame,GameOver}.tsx | look-only | in kit: screens + table-panels (game has own copy) |
| UI | Game screen | Animated board, open prompt, live region, game over | src/ui/screens/Game.tsx | no | missing |
| UI | SVG board drawn from view | One SVG board from view and content geometry | src/ui/board/Board.tsx, layout.ts, Base.tsx, Sky.tsx, CityStrip.tsx | no | in kit: board-layout / board-model (game has own copy) |
| UI | Tracks | Research, energy, damage tracks | src/ui/board/Tracks.tsx | look-only | in kit: track (game has own copy) |
| UI | Prompt overlay on board | Highlighted targets, handlers, placement preview | src/ui/board/overlay.ts | look-only | in kit: board-registry (game has own copy) |
| UI | Auto pan camera (phone) | Board scrolls in its area so camera follows action | src/ui/board/pan.ts, useTween.ts | yes | missing (motion row K326 phone pan covers) |
| UI | Event-driven frame animation | Replays an action's events as frames, skip to end | src/ui/anim/frames.ts, useAnimatedView.ts | look-only | in kit: paced-view (game has own copy) |
| UI | Fly element to target | Flat copy of an element flies tray to space | src/ui/anim/fly.ts | yes | in kit: token-flights (game has own copy) |
| UI | Board effects | Bursts, explosions, dust, glows per frame | src/ui/board/Fx.tsx, anim/anim.css | look-only | in kit: effect-library (animations excluded from study) |
| UI | Number tween | Number glides to target | src/ui/board/useTween.ts | yes | in kit: counter (game has own copy) |
| UI | 3D dice (CSS cube) | Worker die cube with pips, tumble on roll | src/ui/panel/Die3D.tsx | look-only | in kit: pieces-3d (game has own copy) |
| UI | Dice tray | Five dice, rolled, placed positions | src/ui/panel/DiceTray.tsx | look-only | in kit: dice-tray (game has own copy) |
| UI | Prompt table typed by kind | Record<PromptKind, widget>, new kind fails build | src/ui/prompts/index.ts | yes | in kit: prompt-host (game has own copy) |
| UI | Prompt common widgets | Buttons and arrow-key option lists | src/ui/prompts/common.tsx | yes | in kit: prompt-host + ui-helpers prompt keys (game has own copy) |
| UI | Tap-to-confirm | First tap previews a target, second tap commits | src/ui/prompts/confirm.tsx | yes | in kit: prompt-host second-tap (game has own copy) |
| UI | Place die prompt | Pick die by click or key, legal spaces glow, hover preview | src/ui/prompts/placeDie.tsx, rooms.tsx, simple.tsx | no | missing |
| UI | Coach (guided first round, tips) | Lesson steps, suggested move, first-time tips | src/ui/coach/coach.ts, CoachCard.tsx | look-only | in kit: tutorial (game has own copy) |
| UI | Coach memory | Which tips seen, which game is a lesson, per browser | src/ui/coach/coachStore.ts | yes | in kit: tutorial (game has own copy) |
| UI | Spotlights | Pulsing outlines on board areas a card explains | src/ui/board/Spotlights.tsx | look-only | in kit: tutorial (partial; game has own copy) |
| UI | Log panel | Log grouped by round and phase | src/ui/panel/LogPanel.tsx, src/ui/format/formatEvent.ts | look-only | in kit: game-log + table-panels (game has own copy) |
| UI | Screen-reader live summary | One polite sentence per action | src/ui/panel/liveSummary.ts | yes | missing |
| UI | Keyboard play and a11y spec | Arrow-key option lists, 1-5 keys, a11y e2e | e2e/a11y.spec.ts, src/ui/prompts/common.tsx | look-only | missing |
| UI | Game controls | Undo, redo, export, sound toggle | src/ui/panel/GameControls.tsx | yes | in kit: table-panels / game-store (game has own copy) |
| UI | Dev panel | Dev panel | src/ui/panel/DevPanel.tsx | look-only | in kit: debug-console (game has own copy) |
| UI | Rules guide screen | Rules text with board icons | src/ui/screens/Rules.tsx | look-only | missing |
| UI | Proof sheet | Generated face beside its data as a grid | src/ui/screens/ProofSheet.tsx | yes | in kit: prompt-gallery (partial; card proof sheet missing) |
| UI | Board coordinate format | Engine ids shown in capitals | src/ui/format/coords.ts | no | missing |
| UI | Disclaimer line | Fan-project disclaimer | src/ui/Disclaimer.tsx, src/ui/screens/About.tsx | yes | missing |
| UI | Embedded-viewer mode | Game runs in sandboxed frame, touch, audio check | e2e/embed.spec.ts | look-only | missing |
| Sound | Synthesised sound effects | Web Audio synth, no audio files | src/ui/sound/synth.ts | look-only | in kit: sound-player (game has own copy) |
| Sound | Effect-to-sound table | Which sound each animation effect makes | src/ui/sound/fxSounds.ts | look-only | in kit: sound-player cue table (game has own copy) |
| Sound | Sound hook | Keeps synth in step with settings, plays frames' sounds | src/ui/sound/useSound.ts | yes | in kit: sound-player (game has own copy) |
| Tooling | Test state builder | Direct state builder without vitest; scripted players | src/test-utils/state.ts, build.ts, play.ts | look-only | in kit: card-harness scenario builder (game has own copy) |
| Tooling | E2E helpers | New game with fixed seed | e2e/helpers.ts | look-only | in kit: e2e-helpers (game has own copy) |
| Tooling | CI and checks | ci.yml, full-gate, check lanes, bundle size, repo gate, trace | .github/workflows/*, kit/ | yes | in kit: ci-templates, check-runner, bundle-size, repo-gate, traceability (game uses kit) |
| Tooling | Persist e2e (reload resumes) | Reload and resume by replay | e2e/persist.spec.ts | look-only | in kit: e2e-helpers autosave wait (game has own copy) |
| Data | Content schemas | zod schemas for packs, transcripts, verification, saves | src/content/schema.ts | look-only | in kit: content-pack (game has own copy) |
| Data | Semantic validation | Stable codes and JSON paths per rule | src/content/semantics.ts | look-only | in kit: content-pack (game has own copy) |
| Data | Feature coverage | Which language features packs use | src/content/coverage.ts | look-only | missing |
| Data | Placeholder art generator | Original SVG symbols and favicon from code | src/content/render/art.ts, scripts/build-art.ts, lib/art.ts | look-only | missing |
| Data | Face SVG generator | Data to SVG faces for sky, base, city | src/content/render/faceSvg.ts | look-only | in kit: card-parts (partial; game has own copy) |
| Data | Pack build and staleness check | Writes generated packs, validate checks committed files current | scripts/build-packs.ts, validate-content.ts, lib/packs.ts | look-only | in kit: content-pack (game has own copy) |
| Data | Real-pack transcription pipeline | Transcripts, A-vs-B diff, verification gate, real build | scripts/lib/real.ts, real-build.ts, real-diff.ts, link-real-pack.ts | look-only | in kit: transcription-check (game has own copy) |
| Data | Proof sheet CLI | Writes proof sheet for a pack | scripts/proof-sheet.ts | yes | missing |

## unstoppable-fan-prototype @ 9825676

Notes: the game pulled kit v0.111.0 and imports only card-hand (Hand.tsx, motion3d test), bundle-size, check-runner, ci-templates, repo-gate, traceability, plan-checker. Its kit/ also holds card-zones, drag-drop and engine-core but nothing imports them: the game wrote its own engine core, store, sound, settings, saves and flights. Skipped: kit/, content packs, scans, test data, game-specific card rules text.

| Area | Part (neutral name) | What it does (≤12 words) | Path | Game-free? | Kit status |
|---|---|---|---|---|---|
| UI | Card hand | Hand fan with glide-in | src/ui/board/Hand.tsx | look-only | in kit: card-hand; game uses kit |
| UI | Deck pile with back and volume | Stack of cards with depth, counts, top face | src/ui/board/DeckPile.tsx, backs.ts, src/ui/scanned/stack.ts | look-only | in kit: card-pile; game has own copy |
| UI | Scanned pile | Pile drawn from scans with stack volume | src/ui/board/ScanPile.tsx | look-only | in kit: card-pile; game has own copy |
| UI | Discard viewer | Dialog listing a discard pile | src/ui/board/DiscardViewer.tsx | look-only | in kit: card-pile (fan to look through); game has own copy |
| UI | Market row (battlefield) | Offer slots refilled from decks, buy/engage | src/ui/board/Market.tsx, Battlefield.tsx | no | in kit: market-row; game has own copy |
| UI | Core decks and draft area | Choose a core deck, draw order, backs | src/ui/board/CoreDecks.tsx | no | missing |
| UI | Danger / threat track | Marker moving along a row with marks | src/ui/board/DangerTrack.tsx | no | in kit: track; game has own copy |
| UI | Phase bar | Current phase, step, shortcut button, undo | src/ui/board/PhaseBar.tsx | look-only | in kit: table-panels (banner); game has own copy |
| UI | Player mat | Player zones, AP, resources, hand, mat | src/ui/board/PlayerMat.tsx | no | in kit: player-board; game has own copy |
| UI | Scanned player mat | Mat as scanned image with zones | src/ui/board/ScannedMat.tsx | look-only | in kit: player-board, board-layout; game has own copy |
| UI | Table view on playmats | Shared and player playmats laid out from normalised boxes | src/ui/board/TableView.tsx, table/*, src/ui/scanned/table.ts | look-only | in kit: board-layout, layout-editor, player-board; game has own copy |
| UI | Boss / opponent panel | Boss and story state panel | src/ui/board/BossPanel.tsx, StoryRow.tsx, Locations.tsx | no | missing (game-specific) |
| UI | Threat buffs overlays | Badges on threat cards from modifiers | src/ui/board/threatBuffs.tsx | no | in kit: card-attachments (tokens on card); game has own copy |
| UI | Prompt strip | One-line open prompt at the board | src/ui/board/PromptStrip.tsx | look-only | in kit: prompt-host, prompt-source; game has own copy |
| UI | Prompt panel and bodies | Panel with options, numeric, pick bodies | src/ui/play/PromptPanel.tsx, prompt/* | no | in kit: prompt-host; game has own copy |
| UI | Prompt model and answer check | How an open prompt is shown and checked before sending | src/ui/play/promptModel.ts | look-only | in kit: prompt-host; game has own copy |
| UI | Board pick (tap card to answer) | Card on board acts as an option, tap/confirm | src/ui/play/Pick.tsx, useBoardPlay.ts, which.ts | look-only | in kit: prompt-host useBoardPick, board-registry; game has own copy |
| UI | Obvious-choice auto-answer | Answers by itself only when free and nothing hidden | src/ui/play/obvious.ts, playSettingsStore.ts | look-only | in kit: engine-core/prompt-host autoAnswer, ui-helpers onlyForcedAnswer; game has own copy |
| UI | Effect line start / skip | Single effect played at once offers skip | src/ui/play/lineStart.ts | no | missing |
| UI | Confirm dialog | Yes/no over the board for regrettable actions | src/ui/play/ConfirmDialog.tsx | yes | missing (saves has confirmDelete only) |
| UI | Modal dialog | Dialog over board with focus and close | src/ui/components/Modal.tsx | yes | missing |
| UI | Number stepper | Stepper bounded by allowed numbers | src/ui/play/NumberStepper.tsx | yes | in kit: prompt-host (amount widget); game has own copy |
| UI | Convert controls | Two-way resource conversion with allowed amounts | src/ui/play/ConvertControls.tsx, convert.ts | no | in kit: card-language convert verb (engine side); UI missing |
| UI | Toasts | Short notices in a corner, auto-dismiss | src/ui/play/Toasts.tsx, useToasts.ts, feedback.ts | look-only | in kit: ui-helpers createToasts; game has own copy |
| UI | Keyboard shortcuts and help | Keys 1-9, Enter, Esc, help overlay | src/ui/play/useBoardKeys.ts, ShortcutHelp.tsx | look-only | in kit: ui-helpers bindPromptKeys (part); help overlay missing |
| UI | Auto-play dev hook | Bot plays the game in the store in dev | src/ui/play/useAutoplay.ts, src/ui/dev.ts | look-only | missing |
| UI | Event log panel with filters | Log in words with category filter, grouped by turn/phase | src/ui/board/LogPanel.tsx, formatEvent.ts, logGroups.ts, store/names.ts | look-only | in kit: game-log, table-panels (log); game has own copy |
| UI | Targeting arrow | Curved arrow from asking card to pointer, snaps, hit | src/ui/board/TargetArrow.tsx, play/arrow.ts, play/strike.ts | look-only | in kit: target-arrow; game has own copy |
| UI | Token flights with ledger | Tokens fly between views; ledger keeps one place each | src/ui/board/TokenFlights.tsx, flights.ts, flightLedger.ts | look-only | in kit: token-flights; game has own copy |
| UI | Finite token supply | Supply counts derived from engine integers | src/ui/scanned/supply.ts, supplyContext.ts | look-only | in kit: token-bag, counter (partial); missing |
| UI | Card tilt toward mouse | Card leans toward pointer, one page listener | src/ui/board/useCardTilt.ts, cards/tilt.ts, play/lean.ts | yes | in kit: card-hand (lift/tilt), pieces-3d tilt; game has own copy |
| UI | Card face drawing | Faces for core, threat, upgrade with layers | src/ui/cards/CoreFace.tsx, ThreatFace.tsx, UpgradeFace.tsx, UpgradeLayers.tsx | no | in kit: card-parts; game has own copy |
| UI | Art provider with cache | Art by id with preload and fallback | src/ui/cards/ArtProvider.tsx, artContext.ts, ScanArt.tsx, hooks/useScan.ts | look-only | in kit: card-parts (art cache); game has own copy |
| UI | Icons and keyword chips | Printed icons and keyword chips on faces | src/ui/cards/Icons.tsx, KeywordChip.tsx, keywords.ts | look-only | in kit: card-parts (icons inline), glossary; game has own copy |
| UI | Faction colours | Faction to colour map | src/ui/cards/factions.ts | no | skip (game content) |
| UI | Scanned piece renderer | Scans as die-cut pieces at true size | src/ui/scanned/Piece.tsx, Tokens.tsx, outlines.ts, size.ts, geometry.ts, kit.ts | look-only | missing |
| UI | Zoom dialog | Zoom with steps, card words beside, both sides | src/ui/scanned/Zoom.tsx, ZoomDialog.tsx, zoomScale.ts, zoomText.ts | look-only | in kit: card-zoom; game has own copy |
| UI | Hover preview placement | Where preview words go beside card, kept on screen | src/ui/scanned/peekPlace.ts, peek tests | yes | in kit: ui-helpers createInspect (timing only); placement missing |
| UI | Reference card viewer | Reference card opened in zoom, sides to switch | src/ui/board/Reference.tsx, useReference.ts | look-only | missing |
| UI | Screen frame and footer | Common frame for non-table screens, disclaimer footer | src/ui/screens/ScreenFrame.tsx, components/Footer.tsx, disclaimer.ts | look-only | in kit: app-frame (partial); footer/disclaimer missing |
| UI | Home screen | Continue, new game, packs, rules | src/ui/screens/Home.tsx | look-only | in kit: screens; game has own copy |
| UI | New game form | Seats, boss, rules options, seed | src/ui/screens/NewGame.tsx, store/rulesStore.ts | look-only | in kit: screens; game has own copy |
| UI | Settings screen | Theme, motion speed, auto-answer, look, sound | src/ui/screens/Settings.tsx, store/settingsStore.ts, playSettingsStore.ts, lookStore.ts, tableStore.ts | look-only | in kit: settings; game has own copy |
| UI | Light/dark theme toggle | Switch dark default and light via data-theme | src/ui/components/ThemeToggle.tsx, theme/index.css | yes | missing |
| UI | Saved games list, import/export | Continue, export replay, import file | src/ui/components/SavedGames.tsx, store/resume.ts | look-only | in kit: saves; game has own copy |
| UI | Autosave persistence | Autosave of action log and options | src/ui/store/persistence.ts | yes | in kit: saves, engine-core; game has own copy |
| UI | Export all / reset local data | Everything the app keeps in the browser | src/ui/store/localData.ts, ui/reset.ts | yes | row K49 (saves: export all, reset) |
| UI | Undo (unlimited) | Undo by replaying recorded actions | src/ui/store/undo.ts | look-only | in kit: engine-core undo, game-store; game has own copy |
| UI | Game store over engine API | Store with pack, state, actions, events | src/ui/store/gameStore.ts | no | in kit: game-store; game has own copy |
| UI | Content pack import and storage | Imported packs kept in IndexedDB, picked per game | src/ui/store/packStore.ts, screens/Packs.tsx, components/NoPacks.tsx | look-only | in kit: content-pack (load/validate only); import UI/store missing |
| UI | Game over overlay with score table | Result, reason, score breakdown | src/ui/play/GameOver.tsx | look-only | in kit: table-panels (game over); game has own copy |
| UI | Rules and reference screens | Rules text and sheets screens | src/ui/screens/Rules.tsx, RulesSheets.tsx | no | in kit: ui-helpers sheetMatching (search); screen missing |
| UI | Proof sheet | Every card/component beside its data | src/ui/screens/ProofSheet.tsx, ProofComponents.tsx, engine/select/defViews.ts | look-only | row K10 (pattern note); missing as component |
| UI | Hash routes | Hash router for static hosting | src/ui/routes.ts | look-only | in kit: app-frame; game has own copy |
| UI | App shell | App root, start-up | src/ui/App.tsx, main.tsx, seed.ts | look-only | in kit: app-frame; game has own copy |
| UI | Seed generation | Random seed string for a new game | src/ui/seed.ts | yes | in kit: engine-core (seed); game has own copy |
| UI | Accessible labels from data | Card described for screen readers from data | src/ui/a11y/labels.ts, hooks/useScrollFocus.ts | look-only | missing (kit has aria in parts only) |
| UI | Window width hook | Whether window is at least min wide | src/ui/hooks/useWindowWidth.ts | yes | in kit: phone-mode (partial); missing |
| UI | Format helpers | Plural counts, small text helpers | src/ui/format.ts | yes | missing |
| UI | Motion settings plumbing | Board motions: flights, 3D, arrow under speed setting | src/ui/play/motion.ts, theme/motion.css | look-only | in kit: motion-frame; game has own copy |
| Sound | Sound player (Web Audio) | Cues from events with spacing, repeat guard, lag cap | src/ui/sound/player.ts, cues.ts, webAudio.ts, bindSound.ts | look-only | in kit: sound-player; game has own copy |
| Sound | Sound recipes (synth) | Code-built sounds | src/ui/sound/recipes.ts | look-only | in kit: audio-gen (offline models); missing synth recipes |
| Sound | Sound settings | Volume, on/off store and screen | src/ui/sound/SoundSettings.tsx, soundSettingsStore.ts | look-only | in kit: settings, sound-player; game has own copy |
| Engine | Seeded RNG | sfc32 seeded by cyrb128 in state | src/engine/core/rng.ts | yes | in kit: engine-core; game has own copy |
| Engine | Canonical JSON and state hash | Sorted JSON, FNV-1a 64 over state | src/engine/core/canonical.ts, hash.ts | yes | in kit: engine-core; game has own copy |
| Engine | Task stack runner and apply | LIFO task loop, applyAction, prompt open or over | src/engine/core/runner.ts, apply.ts, ctx.ts, handlers.ts, handlerTypes.ts | yes | in kit: engine-core; game has own copy |
| Engine | Invariants | INV checks after every action | src/engine/core/invariants.ts | look-only | in kit: engine-core; game has own copy |
| Engine | Zones: card in exactly one zone | Move helper keeps one-zone invariant | src/engine/core/zones.ts | yes | in kit: card-zones; game has own copy |
| Engine | Ids and errors | Deterministic id counter; engine error types | src/engine/core/ids.ts, errors.ts, state.ts | yes | in kit: engine-core; game has own copy |
| Engine | Content index and hash | Id to def maps with stable content hash | src/engine/core/contentIndex.ts | yes | in kit: content-pack, engine-core; game has own copy |
| Engine | Game status (over/won) | Leaf module for end of game | src/engine/core/status.ts | look-only | in kit: engine-core; game has own copy |
| Engine | Effect interpreter (card language) | Effect lines as data, ops, amounts, X binding | src/engine/effects/interpreter.ts, opKit.ts, amounts.ts, lines.ts | look-only | in kit: card-language; game has own copy |
| Engine | canResolve / eligible choices | Can a line start; what it may choose among | src/engine/effects/canResolve.ts, eligible.ts | look-only | in kit: card-language (validator/verbs); game has own copy |
| Engine | Effect text describer | Short English text from effect data | src/engine/effects/describe.ts, select/text.ts | look-only | in kit: card-zoom (decoded text); game has own copy |
| Engine | Custom bespoke handlers | Registered bespoke abilities | src/engine/effects/customHandlers.ts | no | in kit: card-language `custom` verb; game has own copy |
| Engine | Boss registry and behaviours | Bosses with story cards, minions, locations | src/engine/bosses/* | no | missing (game-specific; automa row differs) |
| Engine | Turn driver: phases | Upkeep, draft, main, threat, cleanup | src/engine/turn/turn.ts, upkeep.ts, draft.ts, main.ts, threatPhase.ts, cleanup.ts | no | in kit: turn-flow; game has own copy |
| Engine | Refill of battlefield | Setup deal and cleanup refill rules | src/engine/turn/refill.ts | no | in kit: market-row (refill); game has own copy |
| Engine | Game creation from pool and seed | createGame, card pool by sets, seeded order | src/engine/setup/createGame.ts, pool.ts | no | in kit: card-zones, engine-core; game has own copy |
| Engine | Hidden-information view | State as the player may see it | src/engine/select/view.ts | no | in kit: engine-core view, card-zones; game has own copy |
| Engine | Legal-action enumeration | Flat list of main actions and answers | src/engine/select/legalActions.ts, enumerateAnswers.ts | look-only | in kit: engine-core, board-registry; game has own copy |
| Engine | Save format and replay | Save = options + actions; headless replay | src/engine/replay/replay.ts, saveFormat.ts | look-only | in kit: engine-core saves, replay-cli; game has own copy |
| Engine | Engine version | Version constant in saves | src/engine/version.ts | yes | missing |
| AI | Random bot | Uniform over legal actions with end-main probability | src/engine/bots/randomBot.ts | look-only | in kit: sim-pool driver; game has own copy |
| AI | Greedy one-ply bot | Tries each action, heuristic prompt answers | src/engine/bots/greedyBot.ts, greedyAnswers.ts, value.ts | no | in kit: opponent; game has own copy |
| AI | Simulation runner | Play whole games with a bot, report outcomes | scripts/simulate.ts | look-only | in kit: sim-pool; game has own copy |
| AI | Replay CLI and goldens | Replay saved game headless; regenerate goldens | scripts/replay.ts, tests/golden | look-only | in kit: replay-cli; game has own copy |
| Tooling | Apply and dispatch bench | applyAction p95 under 5 ms; dispatch cost | scripts/bench-apply.ts, bench-dispatch.ts | look-only | in kit: perf; game has own copy |
| Tooling | Bundle size gate | Initial load under 2 MB gzipped | scripts/check-bundle-size.ts | yes | in kit: bundle-size; game uses kit |
| Tooling | Check lanes, repo gate, trace, CI | Configs and workflows | scripts/check-runner.config.json, repo-gate.config.json, trace.config.json, ci.config.json, .github/workflows/* | yes | in kit: check-runner, repo-gate, traceability, ci-templates; game uses kit |
| Tooling | Test utilities: builders, actions, positions | Build exact test positions, play helpers, expectations | src/test-utils/* | look-only | in kit: card-harness; game has own copy |
| Tooling | Test driver playing whole games | Plays games through public API in tests | src/test-utils/driver.ts, tests/scenarios/*-sim.test.ts | look-only | in kit: sim-pool; game has own copy |
| Tooling | jsdom setup | Scroll stubs for jsdom | src/test-utils/setup-dom.ts | yes | missing |
| Tooling | UI test fixtures | Packs and art fixtures for component tests | src/ui/testing/* | look-only | missing |
| Tooling | E2E specs and helpers | Playwright: a11y, full game, mobile, persistence, sound, scanned | e2e/* | look-only | in kit: e2e-helpers; game has own copy |
| Tooling | Accessibility e2e (axe) | Axe scan of screens | e2e/a11y.spec.ts | yes | in kit: e2e-helpers (axe mention); game has own copy |
| Data | Content pack validation | Validate packs with schemas, report all problems | scripts/validate-content.ts, tests/content | look-only | in kit: content-pack; game has own copy |
| Data | Proto pack build from TS sources | Expand placeholder pack sources to JSON | scripts/build-proto-pack.ts | look-only | in kit: content-pack (partial); missing |
| Data | Real pack link and bundle | Link private pack next to app; zip for another device | scripts/link-real-pack.ts, bundle-real-pack.ts | look-only | missing |
| Data | Scan ingest pipeline (Python) | Detect, orient, crop, silhouette, key, build packs from scans | tools/ingest/ufp_ingest/* | look-only | in kit: scan-ingest (crop/orient only); transcription steps partly in transcription-check; rest missing |
| Data | Ingest schemas and audit | JSON schemas, audit, rescan, review, share | tools/ingest/schema/*, ufp_ingest/audit.py, review.py, rescan.py, share.py | look-only | in kit: scan-ingest (review), transcription-check; game has own copy |
| Data | Playmat box detection | Printed spaces as normalised boxes on a mat | tools/ingest/ufp_ingest/playmats.py | look-only | missing |
| Data | Die-cut outline tracing | Trace outline per card shape from scan | tools/ingest/ufp_ingest/silhouette.py, src/ui/scanned/outlines.ts | look-only | missing |
| Data | Scan tone profile | Scanner tone curve to normalise images | tools/ingest/ufp_ingest/tone.py, tones/* | look-only | missing |
| Data | Card DSL parser | Text to effect data | tools/ingest/ufp_ingest/dsl.py | no | missing (game-specific) |
| Tooling | Ingest tests | Python tests for pipeline | tools/ingest/tests/* | look-only | in kit: scan-ingest tests (own) |

## warps-edge-fan-prototype @ 449af55

Game kit/ folder holds only ci-templates, plan-checker, repo-gate, traceability (+kit.mjs); every other part below is the game's own code. "own copy" = kit has the component, the game does not import it.

| Area | Part (neutral name) | What it does (≤12 words) | Path | Game-free? | Kit status |
|---|---|---|---|---|---|
| Engine | Kernel utilities: canonical JSON, hash, seeded RNG, ids | Canonical JSON, FNV hash, seeded draws, id sequences | src/engine/core/{canonical,hash,rng,ids,copy}.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Copy-on-write state helper | Structural sharing for state updates | src/engine/core/cow.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Task runner with prompts and handler table | Pending-task stack, prompts, resume handlers | src/engine/core/{runner,handlers,ctx,errors}.ts | no | in kit: engine-core (game has own copy) |
| Engine | applyAction reducer + invariants | Validates answer, advances state, checks invariants | src/engine/core/{apply,invariants}.ts | no | in kit: engine-core (game has own copy) |
| Engine | Replay and save file | Save = options + actions; restore by replay, hash check | src/engine/replay/replay.ts | yes | in kit: engine-core (game has own copy) |
| Engine | Undo/redo session, safe and free modes | Undo refused past a reveal; free mode marks undoUsed | src/engine/replay/undo.ts | look-only | in kit: game-store / engine-core (game has own copy) |
| Engine | Legal-answers enumerator | Lists every legal answer of the open prompt | src/engine/select/legalAnswers.ts | no | in kit: engine-core legalAnswers (game has own copy) |
| Engine | Hidden-information view | Per-viewer state view hiding bag and deck order | src/engine/select/view.ts | look-only | in kit: card-zones per-seat view (game has own copy) |
| Engine | Turn/step flow | Setup, draw, steps 2-3, warp phases in code | src/engine/turn/*.ts | no | in kit: turn-flow (not used; own flow) |
| Engine | Op/reward/modifier effect language | Data effect ops with handlers, customs registry | src/engine/ops/*.ts, src/engine/modifiers/collect.ts | no | in kit: card-language (game has own copy, different verbs) |
| Engine | Power-token handler registry | Token powers as registered handlers and tasks | src/engine/power/*.ts | no | in kit: card-language (game has own copy) |
| Engine | Modifier text generation | Turns ops/modifiers back into plain sentences | src/engine/text/describe.ts | look-only | in kit: plain-text / game-log (partial; game has own copy) |
| Engine | Token supply/bag state and targets | Bag, pool, hold, targets, boxes of expansions | src/engine/state/*.ts | no | in kit: token-bag / card-zones (partial; game has own copy) |
| Engine | Module registry (expansions) | Motherships, starfighters, challenges as pluggable modules | src/engine/modules/*.ts | no | in kit: challenges (game has own copy) |
| Engine | Anomaly deck/rules | Extra expansion deck logic | src/engine/anomaly/anomaly.ts | no | missing (game-specific) |
| Engine | Combat: counting, damage, defeat, stun, rewards | Enemy needs, damage, stun, destroy rewards | src/engine/combat/*.ts | no | missing (game-specific) |
| Engine | Economy: buy | Buying skills with currency | src/engine/economy/buy.ts | no | missing |
| Engine | Game object glue | Binds engine pieces into one game API | src/engine/game.ts, src/engine/index.ts | no | in kit: game-store defineGame (not used) |
| Engine | Rust engine port | Rust twin of engine with kernel, KAT, fuzz, py bindings | engine-rs/crates/warps-core | no | missing (no kit row) |
| Engine | Twin-engine conformance and trace capture | Traces TS runs, replays in Rust, compares | scripts/port/*.ts, engine-rs/crates/warps-conformance | look-only | missing (replay-cli covers TS determinism only) |
| Data | Content schema (zod) and loader | Schema per record kind, id and dangling checks | src/content/schema/*, loader.ts, issues.ts, semantics.ts | look-only | in kit: content-pack (game has own copy) |
| Data | Content build from CSV + check | CSV to JSON content with --check | scripts/build-content.ts, scripts/lib/csv.ts | look-only | in kit: content-pack (partial) |
| Data | Counts/sources check | Component counts against rulebook | src/content/counts.ts, sources.ts | no | in kit: transcription-check (partial) |
| Data | Dashboard overlay layout data | Overlay positions as shares on a dashboard scan | src/ui/game/layout.ts, content/dashboards.json | look-only | in kit: player-board / board-layout (different) |
| Data | Card inventory/stale check | Inventory of every card with test coverage check | scripts/testing/card-inventory.ts | look-only | in kit: card-harness inventory (game has own copy) |
| Data | Art build and check | Builds art manifest, checks every face exists | scripts/build-art.ts, check-art.ts, art-lib.ts | look-only | in kit: tooling-scripts art check, card-parts (game has own copy) |
| Data | Scan extraction | Cuts enemy/mothership scans into cut-outs | scripts/art/extract-enemies.py, scripts/art/ms-cutouts/ | look-only | in kit: scan-ingest (game has own copy) |
| Data | App icons build | Home-screen icons and manifest | scripts/build-app-icons.ts | look-only | in kit: app-icons (game has own copy) |
| Data | Glossary data + coverage check | Glossary json, icon words, check script | scripts/glossary-check.ts, src/content/glossary.ts | look-only | in kit: glossary (game has own copy) |
| Data | Card text encodings | Text encodings per card kind | content/encodings/*.json | no | in kit: card-patches (partial) |
| AI | Random driver | Plays random legal answers for sims | src/engine/drivers/random.ts | yes | in kit: sim-pool drivers (game has own copy) |
| AI | Greedy driver with heuristics and weights | Scored one-step choice using weights | src/engine/drivers/{greedy,heuristics}.ts | no | in kit: opponent / sim-pool (game has own copy) |
| AI | Planner driver | Looks ahead over legal answers | src/engine/drivers/planner.ts | no | in kit: learned-opponent look-ahead (game has own copy) |
| AI | Determinizing search | Samples hidden info for search | engine-rs/crates/warps-core/src/search/determinize.rs | look-only | missing |
| AI | RL env, encoding, observation | Gym-like env with vector observation | src/engine/rl/*.ts, engine-rs/crates/warps-rl | no | in kit: learned-opponent (partial; env missing) |
| AI | Vectorised RL env on workers | Many envs stepped in worker threads | scripts/rl/vec/*.ts | look-only | missing |
| AI | MCTS / minmax / self-play (Rust) | Search and self-play bins | engine-rs/crates/warps-rl/src | no | missing |
| AI | Sim runner on worker pool | Whole games on workers, bands, smoke | scripts/sim/{core,pool,worker}.ts, scripts/simulate.ts | look-only | in kit: sim-pool (game has own copy) |
| AI | Fuzz / property games | Property fuzz games and nightly fuzz | tests/property, .github/workflows/nightly-fuzz.yml | look-only | in kit: sim-pool fuzz (game has own copy) |
| AI | Balance bands check | Win-rate sanity bands per pairing | scripts/simulate.ts (--bands) | look-only | in kit: sim-pool sanity bands (game has own copy) |
| UI | Hash routes | Hash route parse/format, screens by address | src/ui/routes.ts, App.tsx, main.tsx | look-only | in kit: app-frame (game has own copy) |
| UI | Game store | Store: answer, auto-answer, undo, autosave | src/ui/game/store.ts | no | in kit: game-store (game has own copy) |
| UI | Forced (single legal) answer | Auto-answers a prompt with one legal option | src/ui/game/forced.ts | yes | in kit: prompt-host answerWithForced (game has own copy) |
| UI | Tap-then-tap interaction model | Pure picked-refs filter for prompt options | src/ui/game/interaction.ts | look-only | in kit: prompt-host useBoardPick / board-registry (game has own copy) |
| UI | Drag token onto lit target | Desktop drag of pool token to target | src/ui/table/pieces.tsx | no | in kit: drag-drop (game has own copy) |
| UI | Table model (view to tiles) | Engine view mapped to a render model | src/ui/game/model.ts | no | missing |
| UI | Paced presentation of step events | Replays Step 3 as beats; skip on tap | src/ui/game/presentation.ts | look-only | in kit: paced-view (game has own copy) |
| UI | Animation speed scale | Speed setting scaling every duration | src/ui/game/presentation.ts SPEED_SCALE | yes | missing |
| UI | Log builder | Plain sentences from events, grouped, with refs and card links | src/ui/game/log.ts, table/logCards.ts | look-only | in kit: game-log (game has own copy) |
| UI | Log panel | Log list, turn grouping, tap highlights refs | src/ui/table/Table.tsx (log section) | no | in kit: table-panels (game has own copy) |
| UI | Saves store: autosave, named, file export/import | localStorage autosave, IndexedDB saves, .json file | src/ui/game/saves.ts, screens/Saves.tsx | look-only | in kit: saves (game has own copy) |
| UI | Settings screen | Settings screen with persisted options | src/ui/screens/Settings.tsx | no | in kit: settings (game has own copy) |
| UI | New game form | Set-up form from data | src/ui/screens/NewGame.tsx, newGameData.ts | no | in kit: screens (game has own copy) |
| UI | Rules and glossary screens | Static reading screens | src/ui/screens/{RulesScreen,GlossaryScreen}.tsx | no | in kit: screens / ui-helpers rule sheet (partial) |
| UI | Proof sheet (art review page) | Every face by type/box with filters in hash | src/ui/screens/ProofSheet.tsx, proofFilters.ts | look-only | missing |
| UI | Phone/table/landscape layout switch | Picks layout by size/orientation, ?layout= override | src/ui/game/viewport.ts | yes | in kit: phone-mode (game has own copy) |
| UI | Phone layout with tabs and bottom decision | Phone UI: tabs, docked pool, decision sheet | src/ui/phone/*.tsx | no | in kit: phone-mode sheet (game has own copy) |
| UI | Card reader/zoom beside anchor | Hover-hold zoom placed beside source | src/ui/table/zoom.tsx, zoomContext.ts, readerTiming.ts | look-only | in kit: ui-helpers hover hold, card-zoom (game has own copy) |
| UI | Zoom placement geometry | Right, left, below, above, with margin | src/ui/table/zoomPlace.ts | yes | missing |
| UI | Reader-wrapped choice | Prompt option that opens the reader on first tap | src/ui/table/ReaderChoice.tsx, ReaderText.tsx | look-only | in kit: prompt-host + card-zoom (game has own copy) |
| UI | Prompt panel | Shows open prompt with options/buttons | src/ui/table/PromptPanel.tsx | no | in kit: prompt-host (game has own copy) |
| UI | Undo/redo controls with reason | Disabled undo says why; replay bar | src/ui/table/Controls.tsx | look-only | in kit: game-store undoCheck (game has own copy) |
| UI | End screens and after-action report | Win/loss screens with numbers from events | src/ui/table/GameOver.tsx, endReport.ts | look-only | in kit: table-panels GameOver (game has own copy) |
| UI | Glossary lookup host and linked text | Matches terms and icons in text, opens lookup | src/ui/glossary/*.tsx, lookupStore.ts | look-only | in kit: glossary (game has own copy) |
| UI | Glossary matcher | Longest-match terms, endings, icon codes | src/ui/glossary/match.ts | yes | in kit: glossary (game has own copy) |
| UI | Tutorial lock | Allows only scripted answer, dims others with reason | src/tutorial/lock.ts, play.ts, scenario.ts | look-only | in kit: tutorial (game has own copy) |
| UI | Tutorial panel, highlight, store | Pulse targets by data-ref; step panel | src/ui/tutorial/* | look-only | in kit: tutorial (game has own copy) |
| Tooling | Tutorial freeze/check/doc/seed | Frozen script check against engine | scripts/tutorial-*.ts | look-only | in kit: tutorial (game has own copy) |
| UI | Offline/service worker and update banner | Registers sw, update line | src/ui/offline.ts, UpdateBanner.tsx | look-only | in kit: offline (game has own copy) |
| UI | Bug reporter: dialog, markup, queue, GitHub issue | Report with screenshot, markup, offline queue | src/ui/bugs/* | look-only | in kit: bug-reporter (game has own copy) |
| Tooling | Bug file script | Files queued report as issue | scripts/bugs-file.ts | look-only | in kit: bug-reporter (partial) |
| UI | Skill stack and fan | Card stack that fans out to pick | src/ui/table/SkillStack.tsx | look-only | in kit: card-pile (game has own copy) |
| UI | Fan grid geometry | Columns and width to fit n cards whole | src/ui/table/skillFan.ts | yes | in kit: card-hand grid / card-pile (game has own copy) |
| UI | Token bag dock and bag view | Bag with count, draw flight | src/ui/table/BagDock.tsx, BagView.tsx, bagDraw.ts, drawShown.ts | look-only | in kit: token-bag (game has own copy) |
| UI | 3D bag shake-and-draw | three.js bag with fallback to 2D | src/ui/bag3d/* | look-only | in kit: token-bag 3D / pieces-3d (game has own copy) |
| UI | 3D tokens layer | Tokens as 3D pieces tracking DOM slots | src/ui/tokens3d/* | look-only | in kit: pieces-3d (game has own copy) |
| UI | 3D ship renderer and picture boundary | Ship models as pictures with fallback | src/ui/ship3d/* | no | missing (model work excluded) |
| UI | Visual mode (Cards/2D/3D) and asset purity | Mode switch; classifies every image source | src/ui/game/visual.ts, assetPurity.ts, useVisual.ts | look-only | missing |
| UI | Mothership/dashboard board | Dashboard scan with overlaid sections and meters | src/ui/table/MothershipBoard.tsx | no | in kit: player-board (partial) |
| UI | Enemy HUD (health/damage/evade numbers) | Numbers counting down as tokens land | src/ui/table/hud.ts, hudParts.tsx, enemyVisual.tsx | look-only | in kit: counter (partial) |
| UI | Ship HUD / board | Ship stats display | src/ui/table/shipHud.tsx, shipBoard.ts | no | missing |
| UI | Tokens and icons drawing | Vector tokens, icons with tone | src/ui/table/pieces.tsx, GameIcon.tsx, iconTone.ts, tokenText.ts | look-only | in kit: card-attachments tokens, small-helpers Icon (partial) |
| UI | Power-token display | Power token text and chips | src/ui/table/powerTokens.tsx, powerText.ts | no | missing |
| UI | Challenge card panel | Pre-game challenge shown on table | src/ui/table/ChallengeCard.tsx, panels.ts, digitalPanel.tsx | no | in kit: challenges (rules only; UI missing) |
| UI | Space background | Starfield backdrop | src/ui/space/SpaceBackground.tsx | look-only | missing |
| UI | Table composition | Main table screen assembling parts | src/ui/table/Table.tsx, screens/GameScreen.tsx | no | in kit: board-registry / layout-editor (partial) |
| UI | Approved-mock screens | Mock table and phones fed by hand-written view | src/ui/mock/* | no | missing |
| UI | Dev mode flag | ?dev=1 flag; start bonus | src/ui/game/dev.ts | yes | in kit: debug-console (partial) |
| UI | Reward flight spots | Where rewards fly to | src/ui/game/rewardSpots.ts | no | in kit: token-flights (partial) |
| Sound | Sound catalog (cue to sound, bus, priority) | Data table of cue sounds, ducking | src/ui/audio/catalog.ts | look-only | in kit: sound-player (game has own copy) |
| Sound | Voice-limited mixer | Variation no-repeat, 40ms dedupe, 12 voices | src/ui/audio/mixer.ts | yes | in kit: sound-player (game has own copy) |
| Sound | Audio engine, playlist, fake context | Web Audio play, music playlist, test double | src/ui/audio/{engine,playlist,fakeContext}.ts | look-only | in kit: sound-player (game has own copy) |
| Sound | Audio generation pipeline | Local models make sfx/music from manifest | scripts/audio/** | look-only | in kit: audio-gen (game has own copy) |
| Tooling | Test builders and scenario | Scenario builder, game helpers, DOM setup | src/test-utils/*, tests/cards/p2*-helpers.ts | look-only | in kit: card-harness (game has own copy) |
| Tooling | Golden games | Recorded golden games with update script | tests/golden/, scripts/golden-update.ts | look-only | in kit: replay-cli (game has own copy) |
| Tooling | Replay CLI | Headless replay of a save | scripts/replay.ts | yes | in kit: replay-cli (game has own copy) |
| Tooling | e2e helpers and fixtures | Playwright helpers, state fixtures | e2e/helpers.ts, e2e/fixtures/ | look-only | in kit: e2e-helpers (game has own copy) |
| Tooling | Perf profiling scripts | Engine step, autosave cost, UI measure, alloc | scripts/perf/*.ts | look-only | in kit: perf (engine step only; game has own copy) |
| Tooling | Node bundle for scripts | esbuild bundle for sims | scripts/bundle-node.mjs | yes | missing |
| Tooling | Repo gate | File sizes, secrets, card ids | scripts/repo-gate.ts, repo-gate.config.json | yes | in kit: repo-gate (game uses kit) |
| Tooling | Traceability | Test titles cite rule ids | trace.config.json | yes | in kit: traceability (game uses kit) |
| Tooling | Plan checker | Batch line ranges | kit/plan-checker | yes | in kit: plan-checker (game uses kit) |
| Tooling | CI templates and full gate | Workflows from ci.config.json | .github/, ci.config.json | yes | in kit: ci-templates (game uses kit) |
| Tooling | Local CI / watch run scripts | Local CI and watch scripts | tools/architect/*.sh, tools/setup-runner.ps1 | yes | in kit: ci-templates local CI (partial) |
| Tooling | Rust gate scripts | gate, corpus gate, nightly fuzz, train | engine-rs/scripts/*.sh | look-only | missing |
| Tooling | End-state fixtures | Builds end-screen fixtures from engine | scripts/end-fixtures.ts, pre-flip-fixture.ts | look-only | in kit: prompt-gallery one state per ending (partial) |
| Tooling | Check lanes | Parallel check with timeouts | package.json check chain | yes | in kit: check-runner (not used) |
| Tooling | Lint config | eslint engine-layer rules | eslint.config.js | yes | in kit: lint-preset (game has own copy) |
| Tooling | Screenshot/capture scripts | Playwright captures for review | docs/ui/*/capture.mjs | look-only | in kit: tooling-scripts shots (partial) |
