# Pattern: greedy players, sanity bands, simulation records

Kit part: GK9 (pool, driver contract, driver random numbers; base warps). Greedy players and band contents are game rules: pattern only (SELECTION.md, "Engine").

## Example (read, never edit)
- warps `warps-edge-fan-prototype` @ `2af6937` (C:\projects\warps-edge-fan-prototype):
  - `src/engine/drivers/{types,rng,random,greedy,heuristics,planner}.ts`.
  - `scripts/sim/core.ts` (`bands`), `scripts/sim/pool.ts`.
  - `tests/unit/drivers/{drivers,bands}.test.ts`.
  - `docs/decisions/015-drivers-goldens-bands.md`.
- stcc `9fc59643`: `src/engine/drivers/greedy.ts` (origin), `scripts/sim/{core,pool,invariantRun}.ts`.
- imp `20a033a`: `scripts/sim/` (resume CSV, `sanity-bands` test). ebr `33b5abd3`: crash-safe records, `scripts/fuzz.ts`.

## Driver contract
`Driver { name; choose(state, content): Action; reasons(): string[] }`. The engine never calls a driver; simulations and autoplay do. `choose` is always legal (check with `validateAction`), deterministic in (seed, state), and throws `RangeError` if no prompt is open. `reasons()` is a hook for a coach, empty before the first choice.

## Driver random numbers
A driver never touches the game's RNG. Its draws are `fnv1a64("<key>#<n>")` for n = 0, 1, 2..., low 32 bits through the murmur3 finalizer (needed: the low word of one FNV step is correlated across successive draws). Key = seed + open prompt id, so an answer is a pure function of (seed, state) and a reload gives the same answers.

## Players, cheapest first
1. **Random**: uniform over legal answers; keeps no state.
2. **Heuristic**: one rule per prompt kind (spend all, take the dearest affordable, remove the cheapest...). Written from the rules, tuned only on measured bands.
3. **Greedy/planner**: beam search over one turn's actions and the answers to the prompts they open. Cap distinct actions per position (sample with the driver rng above it) and answers per prompt; merge positions reached in two orders; score with one evaluation function; play the best few ends on for real; keep the plan keyed by position and replan anywhere else. Plain IEEE arithmetic only (no exp/log/pow) so values match on Windows and Linux. Add a per-turn action guard against endless free actions.
Lesson (warps 015): a one-option lookahead failed the win band; the beam search passed.

## Simulation
- Pool: a worker asks for its next game when it finishes one. Dealing games in turn sent every greedy game of `--driver mix` to a quarter of the workers. Records return in index order, so results do not depend on workers.
- Record per game: index, seed, setup, driver, outcome, reason, turns, actions, error. Crash-safe append plus resume (ebr, imp).
- Fuzz: random driver with invariants on and the replay hash re-checked (jarl `tests/property/fuzz.test.ts`).

## Sanity bands
A list of `{ name, ok, detail }` computed from the records; a failing band is an error (warps: since v1.0; warnings before). Seen in warps: every game ends (no `stalled`); average turns per game unit inside a range; no setup pairing with zero greedy wins in N games against easy opponents, judged only when a pairing has N games. A band that depends on a driver is "not judged" for runs without it (a random-only run measures the driver, not the game). Record the observed values in a decision file the batch writes.

Code: `components/sim-pool/` (pool, driver contract, records, resume), `components/perf/` (speed budget over driver games), `components/replay-cli/` (golden games).
