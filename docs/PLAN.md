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
| K11 | Motion frame | M | 1.1 |
| K12 | Effect library | M | 1.1 |
| K13 | Sound player; sound generator | M | 1.2 |
| K14 | Voice-over | M | 1.3 |

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
| K38 | `offline`: network-first navigation (with a timeout) and auto-apply of a new build when no input is half-entered; replaces a game-side patch of the worker file | M | a finished build, 15 Nov 2026 | proposed |
| K39 | `bug-reporter`: an `index`/`ui` entry (games need an eslint-disable per import today) and token storage read lazily, not at import | S | a finished build, 15 Nov 2026 | proposed |
| K40 | `tutorial`: fix the highlight freezing the page | S | a finished build, 15 Nov 2026 | proposed |
| K41 | `sim-pool`: a seed plays differently in a pool worker than alone (find the cause); a per-prompt observation hook; a grid-sweep helper over `runResumable` with a CSV and spread per cell | M | a finished build, 15 Nov 2026 | proposed |
| K42 | `settings` screen: a slot for custom rows (games portal into it by title text today); `saves` screen name fit | S | a finished build, 15 Nov 2026 | proposed |

## Size

5 small lifts, about 18 worker batches of medium size, 2 large ones. Stage 1 is 4 batches. Work asked for by a game (the table above) comes on top.
