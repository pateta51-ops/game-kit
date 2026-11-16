# check-runner (two scripts a game runs with `node` from its root)
## check-runner.ts: the checks of `npm run check`, in lanes
`node kit/check-runner/check-runner.ts [--config path] [--pr] [--fail-fast] [--keep-going]`
The game passes `check-runner.config.json` (see `check-runner.config.example.json`):
- `checkScript`: the package.json script that chains the checks (`npm run a && npm run b`).
- `first`: scripts run alone before the lanes. `lanes`: each lane runs in order, the lanes side by side.
- `extra`: CI-only steps that are in a lane but not in the chain. `pr`: the `first`/`lanes` subset of `--pr`.
- `timeoutMinutes`, `graceSeconds`: per check; a timeout or a cancel kills the check's whole process tree.
- `failFast` (default false): same as `--fail-fast`. `last`: scripts run alone after every lane ended (wall-clock budgets), also in `pr`. `pr.own`: scripts of `--pr` that need not be in the chain or `extra`. `env`: `{ "<script>": { "VAR": "value" } }`, `*` for every script; a value starting with `~/` is under the home folder. Opt-in (from STCC, K138): `stream` prints each output line as it arrives, prefixed `[lane]` (`laneNames`, also in `pr`; default the lane's first script), instead of each log whole at the end, and repeats a failing check's output after the summary. `npmSilent` runs `npm run --silent`. `skipLastAfterFailure` does not start `last` once a check failed (`--keep-going` still runs it).
The run fails while the lanes and the chain disagree. By default every check runs even after a failure.
With `--fail-fast` the first failing check stops the ones still running (shown as `stopped`, not failed),
no further check starts, and the failing check's output is printed again after the summary.
`--keep-going` runs everything, whatever the config says.

## gate-all.ts: one gate process per item, with a known-failing list
`node kit/check-runner/gate-all.ts [--config path] [--jobs N]`
The game passes `gate-all.config.json`:
- `command`: the gate's command line as an array; `{id}` is replaced by the item.
- `items`: the ids (packs, scenarios); one process each, up to one per core (`--jobs`), rows printed in this order.
- `known`: `{ "id": "why it fails today" }`. A listed failure is reported, never red. A listed item that
  now passes is flagged (`::notice::`) so its line can be removed. Any other failure fails the run, with its output.
- `title`: the heading of the last line and of the job summary table. `codes`: a regular expression whose first group is an error code (`^\\s*error (E_[A-Z_]+)`); adds a column counting them per item. `timeoutMinutes`, `graceSeconds` (20): a gate past the limit is stopped with its whole process tree and fails.
A game whose items come from code imports `gateAll`, `gate(command, id, options)` and `report` instead of using the config.

## test-cost.ts: the test files that play whole games may not grow (from middle-earth-player, MIT)
`node kit/check-runner/test-cost.ts [--config path]`
A whole game is played once, in its golden test; every other test reads that golden's state or builds its table. The game passes `test-cost.config.json`:
- `players`: names of whole-game player functions; `playerFiles` (a `*` is one folder) and `playerPattern` add the names found in files such as `test/scenarios/*/game.ts`. A player imported under another name (`a as b`) counts too.
- `roots` (`src`, `test`), `testSuffix` (`.test.ts`), `skip` (file endings left out, e.g. `golden.test.ts`).
- `allow`: `{ "file": count }`, the calls of players each other test file makes today. A file over its count, or not listed, fails; a file now under its count fails as stale (lower or remove the line). Run it as a check script, or import `testCost(config, root)` (the list of problems) into a test.

## Use it in 10 lines

```sh
node kit/check-runner/check-runner.ts --config check-runner.config.json --pr   # the check chain in lanes
```
