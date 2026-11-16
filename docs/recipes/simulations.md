# Run simulations and sanity bands

Component: [`sim-pool`](../../components/sim-pool/README.md) (needs `engine-core`). Pattern: [players-and-bands.md](../patterns/players-and-bands.md).

1. **Export `simGame`** from a module: `rules`, `content()`, `start(spec, content)`, `driver(name, spec, content)`. Optional `summary` (the game's counters per record), `observation` and `onPrompt` (per-game notes; never module variables). Drivers: `randomDriver(weight?)` here; the game's greedy and planner drivers live in the game.
2. **Fuzz and invariants** (run on every PR):
   ```bash
   npx tsx scripts/fuzz.ts --games 500 --prefix pr --driver random --workers 4
   ```
   with `process.exitCode = await fuzzMain(process.argv.slice(2), module)`. Findings are `exception`, `violation`, `runaway`, `endless`, each with a seed, step and replay line. Replay one: `--seed S --until N`.
3. **Many games, any worker count, same records**: `runGames({ module, specs }, workers)`; long runs `runResumable(request, workers, 'run.jsonl', label)` with `codeVersion([...folders], root)` in the label so a changed engine refuses to resume.
4. **Sweeps**: `sweep({ module, cells: grid({...}), games, driver, metrics, workers, file, label })` returns one CSV row per cell with mean, sd, se.
5. **Sanity bands**: write `SanityBands<S>` (records to `Band[]`: id, text, target, actual, pass), print with `formatBands`, exit 1 on `failed > 0`. A band that fails because the **rule** is unclear goes to the arbiter, not into the band.
6. **Speed**: [`perf`](../../components/perf/README.md) `expectBudgets` over `measure` fails when a percentile of `applyAction` passes its budget. `replayStep` finds the slow step of one game.
7. **Undo purity**: `undoCheck: true` flags an action that drew randomness without a `reveal` event.

Run long jobs on the self-hosted runner, not local Windows ([AGENTS.md](../../AGENTS.md)).
