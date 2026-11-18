# heavy-queue

One machine-wide queue for heavy runs (`kit.mjs finish`, e2e suites, full gates, self-hosted CI jobs) on the WSL PC, so they run one (or `HEAVY_SLOTS`) at a time instead of timing out together. Plain Node, no dependencies. Not a kit component: it runs on the owner's PC and is never pulled into a game.

## Install (WSL)
`bash tools/heavy-queue/install-wsl.sh` (from a WSL path of a game-kit checkout; `HEAVY_SLOTS=2 bash ...` for two slots). It writes the always-on systemd unit `heavy-queue.service` (runs as you, restarts on failure) and links `heavy` into `~/.local/bin`. Run it again after moving the checkout or to change the slots; it is idempotent.

Status page: `http://127.0.0.1:<port>/` (port: `tools.heavy-queue` in `ports.json`, 6005), from WSL or Windows: running, waiting, recent runs with waits, durations and exit codes. `heavy status` prints the same as JSON.

## heavy run
```
heavy run [--priority high|normal] [--label <text>] -- <cmd...>
```
Waits for a slot (`high` - CI jobs, full gates, landings - goes before `normal` - worker runs; first come first served within one), runs the command with the terminal's stdio, heartbeats while it runs, releases, and exits with the command's exit code (Ctrl-C and SIGTERM reach the command; a wait is cancelled). The command gets `HEAVY_HELD=1`, so a `heavy run` inside it runs at once. A lease whose heartbeats stop for 30 s (`HEAVY_TTL` ms on the server) or whose process dies is freed, so a crashed holder never jams the queue.

No server answering: it holds `/tmp/heavy-queue.lock` with `flock` (through `wsl -e flock` on Windows) while the command runs; with neither it runs at once with a warning. `HEAVY_URL` points the client at another server.

Already wired in: `node kit.mjs finish` runs its check through `heavy` (normal) and `ci-templates/gate-slot.sh` (the heavy steps of `local-ci.sh`) through `heavy` (`HEAVY_PRIORITY`, default high) when `heavy` is on PATH or in `~/.local/bin`; without it both work as before.

## Runner hooks (self-hosted GitHub runners)
`runner-job-started.sh` waits for a `high` slot labelled runner, repository and workflow, leaves a watcher that heartbeats while the job's `Runner.Worker` lives and releases when it ends, and writes `HEAVY_HELD=1` to `$GITHUB_ENV` so the job's own steps pass through. `runner-job-completed.sh` releases. Neither fails a job.

Rollout: `bash tools/heavy-queue/install-runner-hooks.sh` sets `ACTIONS_RUNNER_HOOK_JOB_STARTED` and `ACTIONS_RUNNER_HOOK_JOB_COMPLETED` in the `.env` of every `~/actions-runner-*/` and restarts its unit (named in its `.service` file) when the runner is idle; it prints one line per runner. A busy runner is left alone: run it again later. To undo, delete the two lines from each `.env` and restart the unit.

## API (127.0.0.1 only, JSON)
`POST /acquire {label, priority, pid?}` -> `{id, granted, ahead}`; `POST /beat {id}` (heartbeat and poll) -> same; `POST /release {id, exit?}`; `GET /status`; `GET /` the page.
