# j-jmnz/middle-earth-player: what the game-kit could take

Surveyed 15 Nov 2026, read-only. MIT licence (code may be lifted with its notice). Expo / React Native on SQLite: the test and tooling ideas port, the UI and storage code do not.

Read: `docs/architecture.md` (Play loop, Engine, Mechanic families, Effects, Persistence, Catalog build, Tests, Performance), `.claude/agents/reading-judge.md`, and the header comments of `scripts/checks/{test-cost,private-data,spec-coverage,record-routes}.test.ts`, `scripts/release/reach.ts`, `src/rules/core/cause.ts`, `test/harness/card-spec.ts`, `scripts/tools/move.ts`, `scripts/docs/index.ts`, `src/play/compiler.test.ts`, `src/campaign/digest.ts`, `src/play/words/sentence-length.test.ts`. Not read: engine source, design-system docs, `docs/brief.md`.

| What | Files there | Kit home | Size |
|---|---|---|---|
| Card spec rows (printed line, layout by zone, one act, an expectation), each run again with that line's records removed; a row that still passes fails | `test/harness/card-spec.ts`, `scripts/checks/spec-coverage.test.ts` | `card-harness` | M |
| Reading judge: records rendered as English under their printed line; a fresh read-only agent marks each line ok / wrong / ambiguous / render-gap before tests are written | `.claude/agents/reading-judge.md`, `docs/agents/effect-authoring.md` | `card-harness` renderer, architect skill | M |
| A cause (rule id, or effect record plus printed line) on every step that changes a number; a test plays the goldens and refuses a step without one | `src/rules/core/cause.ts`, `src/campaign/causes.test.ts` | `engine-core`, `replay-cli` | M |
| Every legal intent and target is sent by some labelled control, checked over seeded games through the same pure functions the screen uses | `src/play/reader-play.test.ts`, `src/play/reader-play/` | `e2e-helpers` or `prompt-gallery` | M |
| 32-bit digest of a curated table view after each move, pinned in goldens; release notes name the scenarios whose digests moved | `src/campaign/digest.ts`, `scripts/release/reach.ts` | `replay-cli` | S |
| Test-cost budget: a whole game is played once (its golden test); a list of files that still play whole games may not grow | `scripts/checks/test-cost.test.ts` | `check-runner` | S |
| Every printed line owned by a record or listed open; a check that a record's verbs are in the lists the engine routes by | `scripts/checks/effect-coverage.test.ts`, `record-routes.test.ts` | `card-harness` inventory | S |
| Mechanic-family manifests (vocabulary, runner, records) with a test that each declared verb has a runner | `src/rules/interpret/family-manifest.ts` | `docs/patterns/card-language.md` | S |
| Results cached in a `WeakMap` keyed by the immutable state | `src/rules/interpret/constant-records.ts` | pattern note beside `perf` | S |
| Small: sentence-length check on prompt wording; private-data check on tracked files; `move` tool that rewrites every path; docs index with a section reader; React Compiler skip test | `src/play/words/sentence-length.test.ts`, `scripts/checks/private-data.test.ts`, `scripts/tools/move.ts`, `scripts/docs/index.ts`, `src/play/compiler.test.ts` | `plain-text`, `tooling-scripts` | S each |

Not taken: saves across an engine update (old-save work), Maestro flows, native modules, SQLite migrations, release scripts, file-size and layout checks.
