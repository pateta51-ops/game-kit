# Kit build plan

Sources and reasons: `docs/SELECTION.md`. One worker batch per row unless marked. State is updated here as batches land.

## How a batch works

1. Lift the base from the source commit named in `docs/SELECTION.md` into `components/<name>/`.
2. Make it generic: replace every import of game code with a small interface or data the game supplies. Add the grafts.
3. Bring its tests; add a tiny fake game in the tests where the component needs one.
4. Write `component.json`: source game, commit, paths, licence notice, other components it needs.
5. Review, CI green on the runner, merge, tag.

Kit code compiles under the strictest TypeScript settings in use (Jarl's), so it compiles in any game.

## Stage 1 - foundation (approved 14 Nov 2026)

| Batch | Content | Effort | State |
|---|---|---|---|
| K0 | Repo scaffold (package, strict TypeScript, lint, tests, CI on a runner), tests for `kit.mjs`; small lifts: plan checker, random numbers / hashing / canonical JSON / copy, state-machine check, bundle-size check | S | not started |
| K1 | Build gates: traceability, repo gate; check runner; CI and runner scripts as templates | M | not started |
| K2 | Engine core: runner, copy-on-write, undo, replay, save format; command-line replay | M | not started |
| K3 | Bug reporter | M | not started |

## Stage 2 - when the next new game starts its build

| Batch | Content | Effort |
|---|---|---|
| K4 | Card test harness; card-language checks | M |
| K5 | Saved games; offline install | M |
| K6 | Settings; app frame | M |
| K7 | Glossary | M |
| K8 | Phone mode | M |
| K9 | Simulation pool, driver contract, driver random numbers | S to M |
| K10 | Pattern notes: card-language interpreter, proof sheet, players and sanity bands, themed frames, tutorial freeze, visual replay | S |

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
| K15 | Tutorial engine | L |
| K16 | Generic simulation runner | L |
| - | Privacy guard, theme check | M |

## Size

5 small lifts, about 18 worker batches of medium size, 2 large ones. Stage 1 is 4 batches.
