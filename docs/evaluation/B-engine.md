# B-engine: engine basics, state-machine check, drivers and simulation
Read from the main exports. Nothing was run. Scores 0-3.

## 1. Engine basics

Facts: core files are near-identical across the newer line (warps, rome, jarl). The same random generator (cyrb128 seed hash + sfc32) is in stcc, imp, unst, warps, rome, jarl. ebr has its own, different one.

### 1a. Random numbers (determinism-critical)
| Candidate | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| jarl/rome core/rng.ts (identical files) | 3: only imports errors.ts; state is a plain 4-number array | 3: tests/unit/core/rng.test.ts 17 cases: known-answer sequences, bias-rejection, 6000-draw uniformity, 52-card known shuffle | 3: same file in 3 games | 3: rejection sampling (no modulo bias), drawRandom helpers | 3 | 3 pure |
| warps rng.ts | 3 | 3: same 17-case suite | 3 | 3: same code, only comments differ | 3 | 3 |
| stcc/imp/unst rng.ts (71 lines) | 3 | 2: 13 cases (stcc) | 3 | 2: same code minus drawRandom/drawRandomIndex | 2 | 3 |
| ebr src/engine/rng.ts | 2: seeded from an fnv hash, 15-draw warm-up, own types | 1: no direct rng test file found | 2 | 1: int = floor(next*n) (slight bias); shuffle returns a copy (different calling style) | 2 | 2 |

Safest: the jarl/rome copy. It gives the same numbers as the other five games generator, plus unbiased integer draws and a known-answer test pinning it to an independent implementation. Do not mix in the ebr version: different seeding, different results.

### 1b. Hashing and canonical JSON
- hash.ts: jarl/rome/warps/imp/unst are 9 lines (hashValue of any value), generic. stcc hashState (18 lines) strips two game fields (incidentStart, fizzle in the log) so old saves still match: game-specific, cut. ebr hashState imports GameState and a pack canonical file.
- canonical.ts: jarl/warps/rome (identical, 73 lines) carry a speed change the stcc/imp/unst copies lack: string building with += instead of arrays, and FNV-1a 64 done in four 16-bit limbs with a shared encoder. Its own comment says same text as before. I did not run a cross-check that both forms give the same hash; confirm with one golden before lifting.
- Tests: canonical.test.ts exists in all six games of that line.
- Base: jarl core/canonical.ts + core/hash.ts. Scores 3/3/3/3/3/3.

### 1c. Copy, copy-on-write, freeze
| Candidate | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| warps copy.ts (271) + cow.ts (289) | 1: copyState walks Warp state shapes, own* helpers per zone | 3: cow.test, cow.property, cow.paths, copy.test (property test compares against the full-copy engine with freezing on/off) | 3 | 3: origin of the others | 3 | 1 edit code |
| jarl copy.ts (71) + cow.ts (140) | 2: generic copyJson + freeze; cow still imports GameState and has a state-field table | 2: kernel/cow.test 7 cases; no property test | 3 | 2: game helpers stripped; keeps the full/cow switch for tests | 2 | 2 |
| stcc copy.ts (88) | 1 | 2 | 2 | 1 | 1 (no cow) | 1 |
Base: jarl. Graft warps tests/property/cow.property.test.ts and cow.paths.test.ts (the safety net). Cut: the field table in cow.ts; own* helpers per state shape become parameters.

### 1d. Runner, apply, task stack
- jarl runner.ts is 35 lines, pure: LIFO stack, 50,000-task runaway guard, handler table passed in, no game import. rome/warps identical except comments (generic 3).
- stcc runner.ts (78) imports theBurn from turn/end and frame logic (Star Trek specific): cut.
- ebr runner.ts + tasks.ts: richer task context (ask re-pushes the same task, then, emit), tied to its own types, derived data and sandbox. Good as a pattern.
- jarl apply.ts (128): validateAction/applyAction with a prompt/answer model, invariant switch, freezing. The "every action answers the open prompt" shape is a design choice; keep as the default contract and parameterise Action/Prompt types.
- Tests: stcc, imp, unst each have tests/engine/core/runner.test.ts; jarl/warps/rome have none named runner.
- Base: jarl runner + apply; graft stcc runner.test.ts.

### 1e. Undo and replay
| Candidate | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| jarl replay/undo.ts (112) | 2: imports createGame and own types | 2: property/history.test.ts | 3 | 3: immutable History, rebuild by replay, safe/free modes, cursor check | 3: redo, undoUsed, none after game over | 2 |
| warps undo.ts (137) | 1: imports HANDLERS, createGameWith | 2: unit/kernel/replay.test | 3 | 2: per-action reason why undo is refused | 3 | 1 |
| rome undo.ts (63) | 2 | 2: golden history-save | 2 | 1 | 2 | 2 |
| imp/unst (in src/ui/store) | 1 | 1: undo.test.ts | 2 | 1 | 1 | 1 |
Base: jarl. Graft: the warps reveal reasons text.

### 1f. Save format
- jarl replay/save.ts (89): version, older-build and damaged messages, finalHash binds the state AND the undo flag (editing undoUsed in an exported file is caught). Best.
- ebr save.ts (90): migration chain of pure steps by version, appCommit, content selection check (names a missing pack). jarl has none of this: graft.
- rome save.ts: SaveV1 with pack hash and settings; stcc/imp/unst saveFormat.ts.
- Tests: ebr 4 save tests (b7-saves, k1e-campaign-save, u30-autosave-slots, content-hash); imp 2; jarl none by name.
- Base: jarl save.ts + ebr migrateSave.

### 1g. Invariant-checker frame
- jarl invariants.ts (442): checks are (state, content, step) => string[], run after every action; INV-10..14 check the machine graph. 30 invariant ids, all tied to Jarl zones and limits. stcc 663 lines, warps/rome about 265, ebr 235, all game-bound. The frame is a pattern: take the ~40-line shell (Step and Check types, runner of checks), drop the checks.
- Tests: invariants.test in stcc, imp, unst, jarl, warps, rome; ebr b8-invariants.

### 1h. Errors, ids, sandbox
- errors.ts: jarl 37 lines (EngineBugError vs IllegalActionError), unst 17. Tiny, generic. ids.ts differ per game (26-47 lines): parameterise.
- sandbox (ebr, imp): test-only top-up of resources before each action so rare paths get played. Idea worth keeping; code is game-bound.

### Feature checklist (engine basics)
Unbiased seeded rng: jarl, rome, warps (stcc/imp/unst without helpers; ebr different). Canonical JSON + FNV-1a: all. Fast canonical build: jarl, rome, warps. Task runner with runaway guard: all. Copy on write with safety nets: warps (full), jarl/rome (basic). Freeze after apply: warps, jarl, rome, stcc. Undo safe/free/redo: jarl, warps, rome. Reveal reasons: warps. Sealed undo flag in save: jarl. Save migration chain: ebr. Pack check on load: ebr, rome. Sandbox: ebr, imp. Machine-graph invariants: jarl.

### Verdict 1 (engine basics)
- **Base:** jarl src/engine/core + replay: newest of the warps line, cleanest (35-line runner, generic hash, sealed saves).
- **Graft:** warps cow/copy property tests; ebr save migration; warps undo reveal reasons; stcc runner test.
- **Cut or parameterise:** imports of rules/ in core (apply, handlers, invariants, machines); state field table in cow.ts; Action and Prompt types; ids; game checks in invariants; stcc hash stripping.
- **Lift effort:** M. Core pieces are generic; GameState, Prompt and Action have to become type parameters.
- **Risks:** rng and hash are determinism-critical: copy the jarl/rome rng.ts byte for byte with its known-answer test; do not take the ebr rng; verify the canonical.ts string-building copy gives the same hash as the stcc copy on one real state before declaring it shared.

## 2. State-machine check (jarl)
| Criterion | Score | Evidence |
|---|---|---|
| Generic | 3 for the library | src/lib/machine.ts (331 lines) has no imports: defineMachine, transition, expectEdge, declareLocalState; throws in dev, logs in production. scripts/machines-doc.ts and scripts/machines.ts import only lib/machine, a path helper and a registry file |
| Tested | 3 | tests/unit/machine.test.ts 8 cases, machines.test.ts 11, tests/scripts/machines-doc.test.ts 3 |
| Proven | 3 | docs/decisions/SM-explicit-state-machines.md; commits of 9 Nov 2026 (SM-E, two fix rounds); CI runs machines:check (ci.yml and the check script) |
| Carries fixes | 3 | fix rounds: table line in error messages, no duplicate INV ids, doc without line numbers, per-action limit successors |
| Complete | 3 | registry, generated STATE_MACHINES.md, CLI by id, check that fails when a src file defines a machine not loaded, local-state list, engine invariants INV-10..14 against the graph, UI machines |
| Clean seams | 2 | one hand-edited file scripts/lib/machine-modules.ts lists every machine module (Jarl UI paths); core/machines.ts (481 lines) and test-utils/machines.ts hold the game tables |

stcc has only the audit (docs/audit/STATE_MACHINES.md: 11 ranked findings, no code): useful as a method.

- **Base:** jarl lib/machine.ts + scripts/machines.ts + scripts/machines-doc.ts + the machines:check script + test-utils/machines.ts.
- **Graft:** stcc audit findings as a starting checklist for new games (frames scheduled vs running, phase union).
- **Cut or parameterise:** machine-modules.ts (module list), MACHINES_DOC path, core/machines.ts (all Jarl tables), Jarl text in the doc template.
- **Lift effort:** S for library and scripts (copy, move the registry list to a config file); the tables are not lifted.
- **Risks:** none known, no third-party code. INV-10..14 graph checks in invariants.ts need a small interface to be reused.

## 3. Drivers and simulation

### Drivers (automatic players)
| Candidate | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| warps src/engine/drivers (961 lines: random, greedy, heuristics, planner beam search, types, rng) | 2: imports only its own engine index, but uses END_STEP and Step-2 logic | 2: unit/drivers/drivers.test 10 cases, bands.test 3 | 3 | 3: stateless driver rng (answer = function of seed and state), reasons() hook, ANSWER_CAP sampling of huge prompts | 3 | 3: Driver interface in types.ts |
| stcc drivers (2248; search 707, research 204 + 839 data) | 1: research is Star Trek data | 3: greedy tests, greedy-guard, legal-answers, sc-152, sim-invariants 19 | 3 | 3: origin of the stateless rng; search | 3 | 2 |
| imp (671) | 2 | 2: drivers.test, properties.test | 3 | 2 | 2 | 3 |
| ebr src/drivers (2492; planner 1624) | 1: planner knows Ranger rules | 3: gd-planner, 3 property files, b4-sim-faults, sim-pool | 3 | 3: checkpoint goldens, crash records | 3 | 2 |
| rome (507) / jarl (447) | 1-2: jarl driver file imports 5 rule modules; playGame lives with the driver | 2: jarl drivers.test 2 + fuzz.test 1; rome planner golden + 3 property | 2 | 1 | 2 | 2: jarl uses the game rng class, not stateless |
Common interface: Driver { name, choose(state, content) -> Action } (+ reasons in warps/stcc). Random, greedy and planner/search exist in warps, stcc, ebr, rome, jarl (lookahead).
Base: warps driver shell (types.ts, rng.ts, random.ts); planner.ts as the model of a beam-search driver. Greedy and heuristics: pattern only (rules logic).

### Simulation runner, worker pool, sanity bands, fuzzing
| Candidate | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| ebr scripts/sim (pool 184, resume 163, version, content) + src/drivers/sim.ts | 2: sim.ts holds Ranger setup | 3: sim-pool.test 5, b4-sim-faults 4 | 3 | 3: crashRecord (a thrown game or dead worker becomes a failed record, not a hang), log dropped unless failed, bundle-or-tsx worker, resume refuses changed settings | 3: pool, resume CSV, version stamp, fuzz.ts | 2 |
| stcc scripts/sim (pool 83, core 606, invariantRun 789) | 1 | 3: simulate.test 19, sim-invariants 19 | 3 | 2: deals games to workers in turn (the later warps fix: workers ask for the next game, because dealing in turn gave one quarter of the workers all greedy games) | 3: invariantRun | 1 |
| warps scripts/sim (pool 88, core 492) | 2 | 2: bands.test 3 | 3 | 3: ask-for-next-game pool; bands are errors since v1.0 | 3: bands | 2 |
| imp scripts/sim (core 608, golden, pairings, resume 146) | 1 | 3: sanity-bands 4, simulate.test | 3 | 2: resume CSV (the source ebr ported from) | 3 | 1 |
| jarl/rome scripts/simulate.ts (145/306) | 2 | 1: fuzz.test | 2 | 1 | 1 | 2 |
Fuzzing: ebr scripts/fuzz.ts (55 lines, flags for pack/driver/start), jarl tests/property/fuzz.test.ts (fast-check, rule switches sampled, invariants on, replay hash re-checked), warps tests/property (5 files), stcc scripts/sim/invariantRun.
Sanity bands: warps (BandResult list, pairing-wins band), imp (sanity-bands test). Band contents are game rules: pattern only; the shape (list of named bands, a failing band is an error) is liftable.

### Feature checklist (drivers and sim)
Random driver: all. Greedy: all. Beam/planner: warps, rome, ebr, stcc search, jarl lookahead. Stateless seeded driver: stcc, imp, warps. reasons() hook: stcc, warps. Large-prompt sampling cap: warps, stcc. Worker pool: stcc, imp, warps, ebr. Ask-for-next-game scheduling: warps. Crash-safe records: ebr. Resume CSV with settings check: ebr, imp. Results independent of worker count: stcc, warps, ebr. Sanity bands: warps, imp, stcc. Pairings matrix: imp. Version stamp: ebr. Fuzz with invariants and replay: jarl, ebr, stcc. Sandbox mode: ebr, imp. Checkpoint goldens: ebr.

### Verdict 3
- **Base:** warps for driver contract, stateless driver rng and the pool (scripts/sim/pool.ts, worker.ts); ebr for runner robustness.
- **Graft:** ebr pool crashRecord and resume.ts; ebr scripts/fuzz.ts; jarl fuzz.test.ts (fast-check with replay hash check); warps bands shape; imp and ebr sandbox idea.
- **Cut or parameterise:** greedy, heuristics, planner (rules logic), END_STEP, star bands, each sim core.ts (game records, columns): replace with a record-type parameter.
- **Lift effort:** L for a generic sim runner (each game core.ts is game-bound and needs a game-plugin interface: createGame, driver factory, record columns). S-M for pool + resume + stateless driver rng alone.
- **Risks:** driver rng must stay separate from the game rng; planners are big and slow (ebr 1624 lines): pattern only. No third-party code or notices seen.

## Not checked
No test run. The two FNV-1a forms (stcc two-lane vs jarl four-limb) were compared by reading only. apply.ts of stcc/imp/unst and stcc saveFormat not read. Commit history sampled only for the jarl machine files.
