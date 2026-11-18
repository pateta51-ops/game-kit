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
node kit/perf/cli.ts --module scripts/sim-game.ts [--games 5] [--driver random] [--seed perf] [--warmup 1] [--repeats 3]
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

## Use it in 10 lines

```ts
import { expectBudgets, measure } from '../kit/perf/index'
import { perfGame } from '../kit/perf/fake/game' // yours: a SimGame plus optional `bucket` and `promptKind`
import { CONTENT } from '../kit/engine-core/fake/counter'

const specs = [0, 1, 2].map((index) => ({ index, seed: `perf-${String(index)}`, driver: 'random' }))
// throws when the 95th percentile of applyAction goes over 5 ms
expectBudgets(() => measure(perfGame, CONTENT, specs), { apply: { p95: 5 } })
```

## Browser and runtime capture

The same component also measures a built app in a browser (Playwright, run in WSL or CI; the unit tests use a fake page) and compares two results. Bundle sizes are not measured here: use `bundle-size`.

`capture-cli.ts` opens the game's URL `runs` times (default 3) and writes one JSON: load timing (time to first byte, DOMContentLoaded, load end, first paint, first contentful paint, long tasks: count, total and longest ms; the median of the runs), `counters` (numbers the game exposes, read after load), and `dispatch`: for each action, the synchronous cost of the dispatch and the time to the paint after it (two frames), as n/p50/p95/max, plus how much each counter grew over all actions.

```
node kit/perf/capture-cli.ts --config perf-capture.json --out perf-after.json
```

```json
{
  "url": "http://localhost:6011/?seed=perf#/game",
  "ready": "window.__game !== undefined",
  "counters": "window.__perfCounters()",
  "dispatch": "window.__game.getState().dispatch",
  "actions": [{ "type": "answer", "choice": 0 }],
  "runs": 3, "viewport": { "width": 1280, "height": 800 }, "cpuThrottle": 4
}
```

`ready`, `counters` and `dispatch` are page expressions (`counters` returns an object of numbers, `dispatch` a function taking one action); `actions` are passed as JSON. A game without a store exposes a hook and names it in `dispatch`. Playwright is the game's own dependency: the CLI resolves `playwright` from the game's node_modules (`kit/` sits inside the game), so run it from the game; `NODE_PATH` does not apply to ESM. Without `--out` the JSON goes to stdout. A number present before and missing after is a regression (a lost measurement); a new one is only listed as changed.

`compare-cli.ts` diffs two results number by number (exit 0 no regression, 1 regression, 2 bad usage):

```
node kit/perf/compare-cli.ts perf-before.json perf-after.json [--threshold 10] [--min-ms 1] [--limit dispatch.paintMs.p95=25]
```

Counters and counts (`counters.*`, `dispatch.counters.*`, `dispatch.actions`, any `.n`) are exact: any increase is a regression, a decrease is listed as changed. Timings regress when they grow by more than `--threshold` percent and at least `--min-ms`; `--limit path=pct` sets one path. Every difference is printed.

```ts
import { compare, formatComparison } from '../kit/perf/index'

const before = { load: { loadEnd: 100 }, counters: { renders: 10 } }
const after = { load: { loadEnd: 150 }, counters: { renders: 10 } }
const result = compare(before, after, { thresholdPct: 10 })
console.log(formatComparison(result)) // REGRESSION load.loadEnd: 100 -> 150 (+50%)
```
