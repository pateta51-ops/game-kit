# Replay and debug tools

Components: [`replay-cli`](../../components/replay-cli/README.md), [`engine-core`](../../components/engine-core/README.md) (replay, undo, debug edits), [`debug-console`](../../components/debug-console/README.md), [`sim-pool`](../../components/sim-pool/README.md), [`bug-reporter`](../../components/bug-reporter/README.md). Pattern: [visual-replay.md](../patterns/visual-replay.md).

| I have | Do |
|---|---|
| Watch a recording on the game table | Use [visual-replay](../CATALOG.md#visual-replay). Read `kit/visual-replay/README.md` in a game or `components/visual-replay/README.md` in the kit checkout. The game supplies the engine, adapter, boundaries and table. |
| A bug report or save file | `node kit/replay-cli/replay.ts log.json --engine <module>`: replays headless; the module exports `engine: { game, content(), ... }`. |
| A failing fuzz finding | Replay line printed by `fuzzMain`: `--seed S --until N`. `breakAt(game, content, spec, n)` gives the game stopped there as a `History` to import into a test. |
| A suspicion that a change altered play | Golden games: `golden.ts record` on the base, `golden.ts replay` on the head: names the first action where state or events differ. `golden.ts check <dir>` replays stored games. |
| A slow game | `replayStep(...)` lists the slowest steps; `perf` for budgets. |
| A need to set up a state by hand | Debug edits are engine actions (`DebugAction`: `set`, `force`, `close`, the game's verbs); `parseDebug(line, verbs)` turns a console line into one; `<DebugConsole>` is the UI. Dev builds only. |
| Why did the AI do that | `decisionLines(record)` from `opponent`; `prompt-source` names the card and clause behind any prompt. |

Rules: a replay is a function of seed, options and actions only. Do not read time or `Math.random` in the engine; use `ctx.rng`. Determinism across two checkouts is checked by `replay-cli` golden compare.
