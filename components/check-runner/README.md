# check-runner (check lanes, item gates, test-cost limits and optional acceptance receipts)

## Rules for agents

**What it does:** Scripts a game runs with `node` from its root: the check chain in lanes, a per-item gate with a known-failing list, a cap on whole-game tests, and optional acceptance receipts.

**You must:**
1. Run from the game root with `node kit/check-runner/<script>.ts`; `check-runner.ts`, `gate-all.ts` and `test-cost.ts` take `--config <path>` (defaults `check-runner.config.json`, `gate-all.config.json`, `test-cost.config.json`). `receipt.ts` takes `--verify <receipt.json>`.
2. Keep the lanes and the `checkScript` chain in agreement in `check-runner.config.json`: the run fails while they differ. A CI-only step goes in `extra`, a `--pr`-only one in `pr.own`.
3. Set `timeoutMinutes` (and `graceSeconds`): a timeout or cancel kills the check's whole process tree.
4. In `gate-all.config.json` put a failing item in `known` with the reason; remove its line when it passes (the run flags it with `::notice::`). Any unlisted failure fails the run.
5. In `test-cost.config.json` list the player functions in `players`/`playerFiles`; keep `allow` counts exact: a file over its count, unlisted, or now under it (stale) fails.
6. Run through the game's npm scripts or `heavy run`, not bare on a busy machine; never edit `kit/check-runner`.
7. For an acceptance receipt, provide the game-owned specification and acceptance definition, run a clean committed consumer with the full declared check plan, and keep the receipt output ignored by Git. Clear any assume-unchanged or skip-worktree entries first so binding covers all tracked source. Verify the receipt after any source or input change; exit zero alone does not describe which rules the acceptance tests cover.

**Common mistakes:**
- Adding a script to the `package.json` chain but not to a lane (or the reverse): the run fails on the disagreement.
- Expecting a failure to stop the rest: by default every check runs; use `--fail-fast`, or `--keep-going` to override a config that sets `failFast`.
- Leaving a stale `allow` count in test-cost: it fails; lower or remove the line.


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

### Optional acceptance receipt

Add `"receipt": { "output": "evidence/acceptance.json", "spec": "game-spec.json", "acceptance": "acceptance.json" }` to the runner configuration and ignore `evidence/` in the consumer's Git repository. `kitLock` optionally changes the default `kit/kit.lock.json`. All paths are relative files in the consumer. The specification and acceptance definition are authored inputs; the runner hashes them and does not infer rules, test quality or a playable endpoint from their contents.

The existing runner writes schema version 1 evidence before starting and after each result. It binds the clean consumer commit/tree, full kit commit and lock bytes, spec, acceptance definition, runner configuration, package scripts and producer bytes. It checks the tracked checkout against Git's committed tree in a fresh temporary index so cached file timestamps cannot hide edits. Git's checkout conversions, including line endings and LFS filters, still apply to the tree check. A separate `workingSha256` fingerprints the checked-out bytes, executable bits and symlink targets, so a filter cannot hide a change after a run starts. Gitlinks identify the submodule commits. It records every declared command, exit code, duration and output digest. It rechecks the inputs when the run finishes. A changed input produces stale evidence and a nonzero exit even if each command passed. Receipt mode requires the full check plan; `--pr` cannot silently substitute a subset.

Run `node kit/check-runner/receipt.ts --verify evidence/acceptance.json` from the consumer root. Exit 0 means the local bindings still match and every recorded command completed successfully. Missing, invalid, not-run, failed, stopped, truncated and stale evidence exit 1 with a distinct JSON status. In particular, a stream forcibly closed while background processes still hold its pipes is truncated, and an unfinished runner cannot report passed. Keep the receipt and original CI logs together. The digest does not archive log bytes.

This is a local execution record, not a signed attestation or proof that the acceptance definition covers all game rules. It binds tracked source and explicit inputs; ignored files, environment variables, external services and dependency installations are outside that source identity. Run the existing trusted-source kit check in the plan to validate vendored bytes. Keep receipts local unless sharing is authorized: npm command text can contain private values. Existing callers that omit `receipt` retain the previous runner behavior.

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
