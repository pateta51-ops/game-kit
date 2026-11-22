# heavy-queue

One machine-wide queue for heavy runs (`kit.mjs finish`, e2e suites, full gates, self-hosted CI jobs) on the WSL PC, so they run one (or `HEAVY_SLOTS`) at a time instead of timing out together. Plain Node, no dependencies. Not a kit component: it runs on the owner's PC and is never pulled into a game.

## Rules for agents

**What it does:** one queue per machine (WSL) so heavy runs (checks, e2e, full gates, simulations, CI jobs, YuE2 music) go one at a time, or `HEAVY_SLOTS` at a time, instead of timing out together.

**You must:**
1. Run anything heavy through it: `heavy run [--priority high|normal] [--label <text>] -- <cmd...>` in WSL (the game's npm scripts and `kit.mjs finish --check` already wrap it). Never start vitest, Playwright, `tsc -b`, `vite build` or a simulation bare: they are listed as unqueued and reniced.
2. Use `--slots <n|all>` when the job must run alone (YuE2 uses `all`), and `--mem <GiB>` to cap its memory: the job is killed by the kernel at the cap (exit 137) and not the WSL VM. With no way to set a cap, `heavy` exits 4 and does not run the command.
3. Install it once on the machine: `bash tools/heavy-queue/install-wsl.sh` from a WSL path of a game-kit checkout (`HEAVY_SLOTS=2` for two slots); it needs systemd in WSL. Run it again to update; the kit's tools find `heavy` on PATH or in `~/.local/bin`.
4. Let the exit code through: `heavy` returns the command's exit code.
5. Do not put a command that waits on an API (an LLM playtest, a generation call) in the queue: it holds a slot while it waits.
6. Read `heavy status` or the status page (port `tools.heavy-queue` in `ports.json`) to see what is running or waiting; `heavy load` prints one line.
7. Take `HEAVY_WORKERS` for test worker counts (vitest `maxWorkers`, Playwright `workers`); never hard-code them.
8. The server gives WSL's file cache back (K495): after a job ends, at most every `HEAVY_DROP_EVERY_MS` (default 600000), when `Cached` exceeds `HEAVY_DROP_CACHE_GB` (default 6, 0 = off) it runs `sudo -n sh -c 'sync; echo 1 > /proc/sys/vm/drop_caches'` and logs the GB before and after. It needs passwordless sudo; if that fails it warns once and never retries (restart the service to try again). `/status`, `heavy load` and the page show the cache size, the page the last drop. Never run the real drop in a test: inject `readCache` and `runDrop`.
9. Use `heavy cancel` (K571) only on your own stuck or duplicate job (a job you started, or a second copy of the same run); never end another session's running job unless you were told to. A waiting job may be dropped the same way.

**Common mistakes:**
- A `heavy run` inside a job that already holds a slot runs at once (`HEAVY_HELD=1`): not a second queue.
- No server answering: it falls back to a `flock` lock, or runs at once with a warning; heavy runs may then collide.
- Killing the job by hand and expecting the slot to stay: a lease is freed when its `heavy` process dies.

## Install (WSL)
`bash tools/heavy-queue/install-wsl.sh` (from a WSL path of a game-kit checkout; `HEAVY_SLOTS=2 bash ...` for two slots). A normal run that has waited `HEAVY_AGE_MS` (default 10 min) ranks with high ones, so a stream of CI jobs cannot starve `finish` runs. It copies the tool to `~/.local/share/heavy-queue` (`HEAVY_HOME`), writes the always-on systemd unit `heavy-queue.service` (runs that copy as you, restarts on failure) and links `heavy` into `~/.local/bin`; nothing points at a checkout. Run it again to update the copy or change the slots; it is idempotent. A restarted queue forgets its leases: running clients and runner watchers take theirs again at their next heartbeat, waiting ones queue again.

Status page: `http://127.0.0.1:<port>/` (port: `tools.heavy-queue` in `ports.json`, 6005), from WSL or Windows: running, waiting, recent runs with waits, durations and exit codes. `heavy status` prints the same as JSON.

## heavy run
```
heavy run [--priority high|normal] [--label <text>] [--slots <n|all>] [--mem <GiB>] -- <cmd...>
```
`--slots <n|all>` (K474) holds that many slots (all = every slot), so nothing else runs beside it; the first in line waits until enough are free, so it is not starved. `--mem <GiB>` runs the command in `systemd-run --user --scope -p MemoryMax=<n>G -p MemorySwapMax=0`: when it goes over, the kernel kills the job (exit 137) and not the WSL VM. It is checked with a probe first (before waiting for a slot): a scope is started and its own cgroup `memory.max` must equal the requested bytes (and `memory.swap.max` be 0 when it exists); otherwise `heavy` exits 4 and does not run the command, never uncapped. A job killed by the cap exits 137, passed through unchanged. Order with `--slots`: high before normal, then arrival; the first in that order waits until enough slots are free, so a high waiter jumps an earlier normal all-slots waiter, a running all-slots job is never preempted, and a high waiter behind it starts when it ends. All of a job's slots are freed when its `heavy` process dies. Needs a systemd user session (WSL with systemd, as `install-wsl.sh` assumes). Right after a WSL boot the user session may not be up yet: the probe is retried up to `HEAVY_CAP_RETRIES` times (default 6), `HEAVY_CAP_WAIT_MS` apart (default 10000), one line per retry, before exit 4.

Waits for a slot (`high` - CI jobs, full gates, landings - goes before `normal` - worker runs; first come first served within one), runs the command with the terminal's stdio, heartbeats while it runs, releases, and exits with the command's exit code (Ctrl-C, SIGTERM and SIGHUP reach the command, which runs in its own process group and is killed if `heavy` itself is killed; a wait is cancelled). The command gets `HEAVY_HELD=1`, so a `heavy run` inside it runs at once. A lease whose heartbeats stop for 30 s (`HEAVY_TTL` ms on the server) or whose process dies is freed, so a crashed holder never jams the queue.

No server answering (at the start, or for 60 s while waiting, `HEAVY_GIVEUP` ms): it holds `/tmp/heavy-queue.lock` with `flock` (through `wsl -e flock` on Windows) while the command runs; with neither it runs at once with a warning. `HEAVY_URL` points the client at another server.

Already wired in: `node kit.mjs finish` runs its check through `heavy` (normal) and `ci-templates/gate-slot.sh` (the heavy steps of `local-ci.sh`) through `heavy` (`HEAVY_PRIORITY`, default high) when `heavy` is on PATH or in `~/.local/bin`; without it both work as before.

## heavy cancel (K571)
```
heavy cancel <id>  |  heavy cancel --label <text>
```
Ids and labels are in `heavy status`. `--label` matches a job whose label equals the text or starts with it followed by a space; all matches are cancelled and one line is printed for each (`cancelled waiting|running job <id>: <label>`); no match: exit 1. A waiting job leaves the queue and never starts. For a running job the server flags the lease; its `heavy run` sees that at its next heartbeat, sends TERM to the whole process group it started (children included), KILL after `HEAVY_GRACE` ms (default 3000), then releases the slots. In both cases that `heavy run` exits 143 with the line `cancelled: <label>`; the history shows the reason `cancelled`. A running job not started by `heavy run` (a runner-hook lease: the hook only holds a slot, the job is GitHub's) is refused (the server answers 409, `heavy cancel` says so and exits 1) and keeps its slot, so no process is left running with a free slot; end such a job from GitHub. Exit 3 when no queue answers.

## Runner hooks (self-hosted GitHub runners)
`runner-job-started.sh` waits for a `high` slot labelled runner, repository and workflow, leaves a watcher that heartbeats while the job's `Runner.Worker` lives and releases when it ends, and writes `HEAVY_HELD=1` to `$GITHUB_ENV` so the job's own steps pass through. `runner-job-completed.sh` releases. Without node or a queue the started hook holds the flock lock until the job ends instead. Neither fails a job.

Rollout (after `install-wsl.sh`): `bash ~/.local/share/heavy-queue/install-runner-hooks.sh` sets `ACTIONS_RUNNER_HOOK_JOB_STARTED` and `ACTIONS_RUNNER_HOOK_JOB_COMPLETED` in the `.env` of every `~/actions-runner-*/` and restarts its unit (named in its `.service` file) when the runner is idle; it prints one line per runner. A busy runner is left alone: run it again later. To undo, delete the two lines from each `.env` and restart the unit.

## Unqueued runs (K418)
Every `HEAVY_SWEEP_MS` (default 20 s, 0 = off) the server scans `/proc` for heavy test processes (vitest, playwright, `vite build`, `tsc -b`, pytest, headless chromium) whose environment lacks `HEAVY_HELD=1` and that are not under a GitHub `Runner.Worker`. Each is reniced to 19 once, listed as `unqueued: [{pid, cmd, cwd, firstSeen}]` in `/status` (so `heavy status` shows it) and in a red "Unqueued" table on the page, and appended to `bypass.log` in `HEAVY_HOME` (the folder in `cwd` names the game or worktree). It drops off the list when its pid ends. Nothing is killed.

## API (127.0.0.1 only, JSON)
`POST /acquire {label, priority, pid?}` -> `{id, granted, ahead}`; `POST /beat {id}` (heartbeat and poll) -> same; `POST /cancel {id}` (200 `{ok, was}`; 409 for a running lease not from `heavy run`); `POST /release {id, exit?}` (`/beat` answers 404 for a lease the queue never knew, as after a restart, and 410 for one that ended); `/acquire` with `resume: true` takes a running lease back; `GET /status`; `GET /` the page.

## Worker cap, load, more unqueued (K454)
Cores (`HEAVY_CORES`, default the machine's) divided by slots, at least 1, is the worker cap: it is in `/status` (`cores`, `workers`, shown on the page) and every `heavy run` job gets `HEAVY_WORKERS` set to it (the runner hook writes it to `$GITHUB_ENV` too). The kit's vitest config template reads it for `maxWorkers`; a Playwright config uses `workers: Number(process.env.HEAVY_WORKERS) || undefined`. Slots and WSL memory are unchanged. The sweep also flags node/python puppeteer scripts (headless chromium only; a normal browser is never listed, and processes carrying `HEAVY_HELD=1` never are). `heavy load` prints one line: `load <1m 5m 15m> | cores N | slots used/total | queued N | unqueued N`. Update the live service with `install-wsl.sh`.
