# perf

The engine speed budget: plays whole driver games, times every `applyAction`, and fails when a percentile reaches its limit. Needs `engine-core` and `sim-pool` (the game and driver contract is sim-pool's `SimGame<G>`).

A game writes one module (its sim-pool module will do) that exports:

- `perfGame: PerfGame<G>` (or `simGame`): a `SimGame<G>`, plus two optional functions:
  - `bucket?(before, result)` → the bucket the call counts in (default `apply`), or null to leave it out. A game with an opponent turn inside one call returns `opponentTurn` for it; one that budgets mid-game only returns null in the early rounds.
  - `promptKind?(state)` → the kind of the open prompt for the slowest list (default: the prompt's `kind` field, else `prompt`).
- `budgets?: Budgets`: limits in ms, e.g. `{ apply: { p95: 5 }, opponentTurn: { max: 50 } }`. A value at or over its limit fails; so does a budgeted bucket with no timed call.
- `specs?({ games, seed, driver })` → `GameSpec[]`, when the games need settings; default `games` specs with seeds `<seed>-<i>`.

Command line (exit 0 within budget, 1 over budget, 2 bad usage, a module that cannot be loaded or a game that failed):

```
tsx kit/perf/cli.ts --module scripts/sim-game.ts [--games 5] [--driver random] [--seed perf] [--warmup 1] [--repeats 3]
  [--attempts 1] [--budget apply.p95=5]... [--json perf.json]
```

It prints p50, p95, p99 and max per bucket, then the ten slowest calls with game seed, action index and prompt kind. `--budget` adds to the module's limits or replaces one, stat by stat; `--attempts` measures again while over budget.

In a test, `expectBudgets(run, budgets, attempts = 3)` returns the first report within budget and throws after the last attempt, so a busy machine does not fail the gate. Run it alone, not beside other test files:

```ts
const report = expectBudgets(() => measure(perfGame, content, specs), { apply: { p95: 5 } });
```

- Each call is timed `repeats` times on the same state and the fastest is kept (`applyAction` is pure); `warmup` games are played first and not counted. The driver's thinking is not timed.
- A thrown error or an invariant violation stops the measurement. State freezing and invariant checking stay as the game set them (`setStateFreezing`, `setInvariantChecking`): set them as the shipped game runs.
- Also exported: `timeGame`, `reportOf`, `overBudget`, `formatReport`, `percentile`, `distribution`, `run`.
