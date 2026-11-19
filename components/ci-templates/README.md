# ci-templates

Pull this component and use it where it is: a game never edits or copies its `kit/` files. Nothing here names a repository, runner or login.

1. Write `ci.config.json` in the repository root: `{ "repo": "<owner>/<repo>", "runnerLabel": "<label>" }`. Optional: `"ownerLogin"` (default the repository's owner), `"workflows"` (default `["ci.yml", "full-gate.yml"]`; add `"nightly-fuzz.yml"` when the game has `npm run fuzz:nightly`), `"e2eScripts"` (the npm scripts the full gate and `local-ci.sh` run, default `["test:e2e"]`), `"pathsIgnore"` (paths whose pushes to main run no CI, for example `["bugs/**"]`), `"runDrafts": true` (CI on draft pull requests too), `"push": false` (no CI on a push to main), `"prTypes"` (the pull_request types, instead of the template's). A gate of several steps: `"ci": { "steps": [...] }` puts those steps where `ci.yml` has `npm run check`, and `"gate": { "steps": [...] }` does the same in `full-gate.yml`; both also take `"name"` (the job's), `"timeoutMinutes"`, `"node"` (more `with` keys for setup-node, for example `{ "cache": "npm" }`), `"install"` (the step instead of `npm ci --no-audit --no-fund`) and, `ci` only, `"checkout"` (the checkout's `with`). More jobs in `ci.yml` (same runner and guard, a checkout first): `"jobs": { "python": { "name": "...", "timeoutMinutes": 15, "steps": [...] } }`. A step is a command (`"npm run lint"`) or the step's keys in the order to write them (`{ "name": "...", "uses": "actions/setup-python@v7", "with": { "python-version": "3.13" } }`, `run`, `env`, `if`, `working-directory`); a `run` of several lines is written as a block. In the full gate, commands run in `full-gate/`, and a path in `with` or `working-directory` starts with `full-gate/`.

Queue wait (K434): on a self-hosted job the heavy-queue `runner-job-started` hook waits for a slot before the first step, and that wait counts against `timeout-minutes`. So the rendered job gets `timeoutMinutes + queueWaitMinutes` (`queueWaitMinutes` in `ci.config.json`, default 60, `false` for none) and each of its `run` steps without a `timeout-minutes` of its own gets `timeoutMinutes` (the job's value before the addition). Jobs whose `runs-on` has no `self-hosted` (hosted runners) are written as before.

More optional keys (K190); without them the workflows are as before. In `ci` and `gate` (the job): `"id"` (the job's id), `"if"` (the job's condition, or `false` for none), `"runsOn"` (the `runs-on` value, for example an expression over a dispatch input), `"name": false` (no job name), `"nodeVersion"` (`node-version: 22` instead of `.nvmrc`; a conditional npm cache is `"node": { "cache": "${{ ... }}" }`, or no `cache` for none), `"before"`, `"after"` and `"replace"` (steps put before, after or instead of one of the template's steps, named `checkout`, `prepare` (gate), `node`, `install`, `check`, `browsers` (gate), `e2e` (gate); `replace` takes `false` to drop it; a step may have `timeout-minutes`, `env`, `if`, `id`; this is the generic place for a media guard, a merge, a venv), `"python": { "version", "requirements", "cachePath", "venv" }` (setup-python before the Node step, then `pip install -r`, or a venv in `$RUNNER_TEMP` whose python is `PYTHON` for the later steps), `"rust": { "toolchain", "components", "commands", "workingDirectory" }` (toolchain step and one step per command, after the check), `"failureArtifact": { "name", "path" (text or list), "retentionDays", "stepName", "uses" }` (last step, on failure), `"e2ePort"` (gate: a number puts `E2E_PORT` on the e2e step, `"free"` picks a free port in it; without it the template's step already does), `"flat": true` (gate: no `full-gate/` folder, `defaults` or checkout `path`). `ci` only: `"dispatch": true` (a `workflow_dispatch` trigger), `"inputs"` (its inputs; this alone also adds it), `"branchesIgnore"` (the pull_request's `branches-ignore`), `"draftConcurrency": true` (the concurrency group also names draft or ready). `gate` only: `"inputs"` (more dispatch inputs after `pr` and `sha`, for example `runner` and `bands`; lists are written as block lists). `runDrafts` also changes the header comment. A key with no place in the template stops the render. `local-ci.sh` runs only `steps`, not these extras.

The Full gate run is titled `Full gate PR #<pr> <sha>` (K321), so a landing script finds the tested head in the run's title (a dispatched run's headSha is main's tip). `examples/<game>.json` (with the game's own workflow beside it as `<game>.<file>`) are the configs of EBR (`ci.yml`), Imperium (`ci.yml`, `full-gate.yml`), Warp's and STCC (`full-gate.yml`); the test renders each and compares jobs, triggers and steps with the game's file. EBR's `verify.yml` is a separate workflow that the templates do not write.
2. `node kit/ci-templates/render.mjs` writes `.github/workflows/` from the templates and that file (GitHub reads workflows only there); commit them. Put `node kit/ci-templates/render.mjs --check` in the game's check: it fails when a workflow was edited by hand or is older than the templates, and prints a warning per differing line naming the field (for example `timeout-minutes` hand-set to 30 while `ci.config.json` says 10). Workflows are generated: every change goes into `ci.config.json`, or the next render overwrites it. Run the first again after each pull of this component.
3. Run the scripts from `kit/ci-templates/`: the written full gate calls `kit/ci-templates/full-gate.mjs`, which reads the slug and `e2eScripts` from `ci.config.json`; `bash kit/ci-templates/local-ci.sh <pr | branch> <sha>` and `bash kit/ci-templates/watch-run.sh <run-id>` take the slug from `REPO_SLUG`, else from the checkout's `origin`; `local-ci.sh` uses the `gate-slot.sh` beside it. The vitest reporter is `./kit/ci-templates/skip-reporter.ts` (vitest 2 and later).
4. Install the runner, from WSL Ubuntu, with a registration token (valid one hour):

```bash
RUNNER_REPO=<owner>/<repo> RUNNER_LABEL=<label> RUNNER_TOKEN=<token> bash kit/ci-templates/install-wsl.sh
```

`RUNNER_LABEL` is the `runnerLabel` of `ci.config.json`. When `repo-gate` is pulled too, the runner's machine name goes in its runners file, and a label that is also a runner name needs `.github/` and `ci.config.json` in the gate's `skipText`.

The older way still works: copy the files and replace the three placeholders by hand (the paths below are for that way).

| Placeholder | Meaning | Where it goes |
|---|---|---|
| `{{REPO_SLUG}}` | `owner/repo` of the game's GitHub repository | `full-gate.mjs` (refuses to run in any other repository), `local-ci.sh` (names the `/tmp/<repo>-ci` output folder), `watch-run.sh` |
| `{{RUNNER_LABEL}}` | the label of the self-hosted runner | `ci.yml`, `full-gate.yml`, `nightly-fuzz.yml` (`runs-on: [self-hosted, ...]`) |
| `{{OWNER_LOGIN}}` | the GitHub login allowed to start these jobs | `ci.yml`, `nightly-fuzz.yml` (`github.repository_owner`), `full-gate.yml` (`github.actor`) |

Copy to: `ci.yml`, `full-gate.yml` and `nightly-fuzz.yml` to `.github/workflows/`, `full-gate.mjs` to `.github/scripts/`, `local-ci.sh`, `gate-slot.sh`, `watch-run.sh` and `gate-numbers.py` to `tools/architect/`, `skip-reporter.ts` to `tools/`, `install-wsl.sh` anywhere (it takes the slug and label as `RUNNER_REPO=<owner>/<repo> RUNNER_LABEL=<label>` environment variables, not placeholders).

`install-wsl.sh` needs a registration token (valid one hour). With `gh` only on Windows, fetch it in PowerShell so that it stops when `gh` fails (for example HTTP 500); the script itself exits 2 before downloading anything when the token it is given is missing or malformed:

```powershell
$t = gh api -X POST repos/<owner>/<repo>/actions/runners/registration-token -q .token; if ($LASTEXITCODE -ne 0 -or -not $t) { "no token: run again" } else { wsl -d Ubuntu -e env RUNNER_REPO=<owner>/<repo> RUNNER_LABEL=<label> RUNNER_TOKEN=$t bash <path>/install-wsl.sh }
```

Other settings are environment variables: `E2E_SCRIPTS` (comma list of npm scripts the full gate runs, default `test:e2e`), `GATE_DIR` and `GATE_SLOTS` (gate slots), `LOCAL_CI_DIR`, `PW_CHROMIUM_PATH`, `RUNNER_WANT_PYMUPDF=1`.

The workflows never use `pull_request_target`, and the full gate refuses a pull request whose head is outside the repository: keep both.

A workflow whose `{{OWNER_LOGIN}}` is left unfilled skips its jobs silently (the guard never matches): fill it in before the first run.

- `bash tools/architect/watch-run.sh <run-id>`, as one background command: waits for the run, prints its conclusion, jobs and failed steps. Token: `GH_TOKEN`, `GITHUB_TOKEN` or `gh auth token`. `WATCH_TIMEOUT` (seconds, default 3600), `WATCH_INTERVAL` (30). Exit 0 success, 1 failed, 2 not found, 3 timed out, 4 API error (its message is printed); a network failure is retried quietly. Needs `curl` and `python3`.
- `node tools/architect/watch-run.mjs <run-id>` (K238): the same in plain Node, with no bash, curl or python3 (copy it beside `watch-run.sh`; it carries the `{{REPO_SLUG}}` placeholder too). Same variables and exit codes.
- `python3 tools/architect/gate-numbers.py <log> [regex ...]`: the count lines of a saved job log or a `local-ci.sh` log, for the merge message; the defaults are what vitest, tsc, eslint, Playwright and the kit's tools print; extra regexes add the game's own lines, for example `'traceability \(' 'content:gate:' 'games \d+, exceptions'`.
- `nightly-fuzz.yml` runs `npm run fuzz:nightly` (the game writes it) on main, in its own concurrency group and its own `nightly/` checkout, so it never replaces or collides with a queued gate; set the cron to an idle hour.
- `skip-reporter.ts`: `reporters: ['default', ['./tools/skip-reporter.ts', { inputs: [['<git-ignored path>', '<command that makes it>']] }]]` in the vitest config lists every skipped test by file at the end of a run and in the GitHub job summary.

## What a game must set

| Name | Where | What it is for |
|---|---|---|
| `repo` (`<owner>/<repo>`) | `ci.config.json`, required | slug the gate refuses to run outside of, the `local-ci.sh` output folder, `watch-run` |
| `runnerLabel` | `ci.config.json`, required | the `runs-on: [self-hosted, <label>]` of every workflow, and `RUNNER_LABEL` of `install-wsl.sh` |
| `ownerLogin` | `ci.config.json`, optional (default the repo's owner) | the login whose pushes and pull requests may start jobs; another login's jobs are skipped silently |
| `e2eScripts`, `workflows`, `pathsIgnore`, `runDrafts`, `push`, `prTypes` | `ci.config.json`, optional | which npm scripts the full gate runs, which workflows are written, and when CI runs |
| `GH_TOKEN` | the full gate sets it from `github.token`; nothing to create | the gate reads the pull request through the API; `watch-run` takes `GH_TOKEN`, `GITHUB_TOKEN` or `gh auth token` |
| `RUNNER_REPO`, `RUNNER_LABEL`, `RUNNER_TOKEN` | environment of `install-wsl.sh` | registers the self-hosted runner; the token is valid one hour; `RUNNER_DIR`, `RUNNER_NAME` optional |
| `REPO_SLUG` | environment of `local-ci.sh`, `watch-run` | only when the checkout's `origin` is not the repository |
| `E2E_SCRIPTS`, `E2E_PORT`, `PW_CHROMIUM_PATH`, `PW_SKIP_WEBKIT`, `GATE_DIR`, `GATE_SLOTS`, `LOCAL_CI_DIR` | environment, optional | the e2e scripts, the free port the gate picks, a Chromium for Playwright, gate slots and output |

The game sets no repository secrets or variables: the workflows use only the built-in `github.token`, and never `pull_request_target`.

## Use it in 10 lines

```sh
node kit/ci-templates/render.mjs          # writes .github/workflows/ from ci.config.json
node kit/ci-templates/render.mjs --check  # in the game's check: fails when the workflows are stale
```
