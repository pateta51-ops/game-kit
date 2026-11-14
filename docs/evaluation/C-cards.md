# C - Card language and card tests (read-only findings)

## 1. Card-language frame

Honest answer: PATTERN ONLY for the code. Every real interpreter (stcc text/, ebr effects/, imp text/, unst effects/) imports the game state, zones, phases and errors. ebr effects imports about 15 game modules (zones, tasks, phases/*, campaign/day, modifiers). stcc text imports types, core/state, core/ctx, turn/*, bot/*, customs. Nothing is a pluggable engine core plus op registry that could be copied. Small pieces can be lifted as templates (schema-vs-type conformance test, describe-versus-printed check, validate-content script).

### Score table (0-3; evidence)
| Game | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| stcc | 1 - text/ imports game state, turn, bot (frame.ts imports bot/lang); cardlang.ts is 480 lines of type declarations, 73 kind/op discriminators, all Star Trek | 3 - 26 test files on text/ops/select/customs; 586 card-lang cases | 3 - validate-content, inventory gate, many fix commits | 2 - parent of imp; has Eval.dryRun flag, pick probe | 3 - declare, validate, interpret, describe, dry-run (glow), customs registry | 2 - customs registry (handlers/*), ops registered in ops/index.ts; text edited in place |
| ebr | 1 - effects/ imports about 15 game modules; language.ts 2462 lines of game ops | 3 - 12 lang/describe tests, 347 test files overall | 3 - IR-47 dry-run fix, D-X139 rulings #188-191 | 3 - dry-run hardening: 32 branches, 2000 tasks each, whole mode (D-X136), choice-is-not-an-effect fix | 3 - language, interpreter, eval, dryRun, describe (nouns, effects), custom-step registry | 2 - OpHandler per op table and customs registry are the cleanest op-registry shape |
| imp | 1 - fork of stcc text/ (diff vs stcc: eval 1338 lines, describe 2189) | 2 - 13 files | 2 | 1 - diverged copy, no unique hardening seen | 2 - no dry-run beyond stcc | 2 |
| rome | 2 - zod schemas (content/schema/ops.ts) mirror engine types, checked by conformance.test.ts; imports only engine/types | 1 - 5 files | 2 | 1 | 1 - schema and describe; ops/run.ts 1201 lines | 3 - schema as data with conformance test |
| warps | 2 - small 19-op language (schema 441 lines, ops/run 608) | 1 - 5 files | 2 | 1 | 1 | 2 - customs.ts registry |
| jarl | 3 - smallest and cleanest: effects/ops.ts has validateOp and validateEffect, describe.ts 92 lines, scripts/describe-check.ts (generated text must equal printed text word for word) | 2 - 3 files incl. conformance | 2 | 2 - newest line, adds describe-check gate | 1 - small language, no dry-run | 3 - registry, validator, describe all data-driven |
| unst | 1 - effects/ imports bosses, rules/factions, targeting | 2 - 9 files | 1 | 1 | 2 - canResolve (static dry run), eligible, describe, opKit | 2 - opKit.ts small registration kit |

### Feature checklist (union)
- Typed declaration of effects as data: all games (types or zod)
- Zod schema checked against engine types (conformance test): rome, jarl (warps has schema only)
- Op validator over every encoding: jarl (validateEffect); stcc and imp (validate-content script plus loader); rome and warps (schema)
- Interpreter with frames and bindings: stcc, imp, ebr, unst
- Readable text generation: all; word-for-word check against printed text: jarl
- Dry run "would this do anything": ebr (clone state, fork per prompt option, bounded), stcc (Eval.dryRun flag, no cloning), unst (canResolve, static). Not in rome, warps, jarl.
- Custom-step escape hatch registry: stcc, ebr, rome, warps, unst
- Content validation CLI with exit codes and injected IO: stcc, imp

### Verdict
- Base: pattern only. As a single reference: ebr for the dry run and op-handler table; jarl for the smallest clean registry, validator and describe-check.
- Graft (templates): jarl describe-check gate and validateOp shape; rome/jarl zod conformance test; ebr dryRun.ts algorithm rewritten against a kit interface; stcc/imp validate-content.ts (injected Io, exit codes) as near-copy.
- Cut or parameterise: op vocabulary, state types, zone names, phase imports.
- Lift effort: L for a shared interpreter (redesign around a state/ctx interface); S for the validate script and the conformance and describe-check tests.
- Risks: interpreter and dry run are determinism-critical (ebr caps are part of behaviour). No licence issue seen here.

## 2. Card test harness

### Score table
| Game | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| stcc | 2 - test-utils 1705 lines; imports engine/core (apply, handlers, ctx, zones), text/frame; delivery.ts imports the UI session store | 3 - tests/card-lang 34 files, 586 cases; ui delivery.test | 3 - CARD_LANGUAGE_TESTS.md, inventory in npm run check, review commits 2026-11-11 | 3 - pick probe, it.fails EXPECTED FAILURE convention, truth-based seen-set | 3 - scenario builder (real and synthetic pack), prompt-delivery harness, bot, driver, inventory with --check | 2 - probe is an observation-only hook in engine ops/pick.ts |
| ebr | 2 - helpers import engine api/tasks/runner/mutate; inventory per printed clause | 3 - 347 test files, 127 use helpers | 3 - CT-A, D-X139 pinning tests; inventory 2050 clauses, 0 untested, in CI and check | 2 | 2 - given.table, position/clauseAt/observe, answer/perform; no delivery harness, no synthetic pack | 3 - uses public api; no silent answers |
| warps | 2 - 1013 lines; imports only ../engine | 3 - tests/cards 40 files, 1905 cases | 2 - CARD_TESTS.md adapted from stcc | 1 - copy of stcc approach | 2 - scenario plus inventory (op types read with the TypeScript compiler, registries, module hooks); no delivery harness | 3 |
| imp | 2 - 1301 lines, syntheticPack, packs | 2 | 1 - no inventory, no programme doc | 1 | 1 | 2 |
| unst | 2 - 877 lines | 2 | 1 - no inventory | 1 | 1 | 2 |
| rome, jarl | - | - | - | - | test-utils is only setup-dom (jarl also machines.ts); no card harness | - |

### Feature checklist
- Scenario builder on exact position: stcc, warps, ebr (given.table/position), imp, unst
- Synthetic mini-pack: stcc, imp
- Prompt-delivery harness (what reached the player vs decided silently): stcc only
- Engine choice probe: stcc only
- Expected-failure convention (it.fails): stcc, warps
- Generated inventory with stale check in check/CI: stcc (language pieces), warps (pieces and components), ebr (printed clauses)
- Written test programme with phases: stcc, warps (copy)
- Before/after delta helper (observe): ebr

### Verdict
- Base: stcc, the only one with the full set (scenario builder, delivery harness, probe, synthetic pack, inventory gate, programme doc).
- Graft: ebr clause-level inventory (coverage by printed clause with test titles and a baseline file) and observe(before, after); warps compiler-based reading of op types.
- Cut or parameterise: card ids and Star Trek content; imports of engine/core/apply, ctx, text/frame and the session store; builders need a game adapter (create game, find zone, run action).
- Lift effort: M - one worker batch to put an adapter in front of the engine calls.
- Risks: inventory is a regex name match, not executed coverage. Delivery harness depends on the UI session store (jsdom only). Inventories must hold ids and names only, no card text (private content).

Not checked: per-game case counts for text/describe tests (file counts only), whether imp and unst gate anything in CI, diffs of stcc/imp ops beyond line counts.
