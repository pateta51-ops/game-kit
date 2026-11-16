# ci-templates

Pull this component and use it where it is: a game never edits or copies its `kit/` files. Nothing here names a repository, runner or login.

1. Write `ci.config.json` in the repository root: `{ "repo": "<owner>/<repo>", "runnerLabel": "<label>" }`. Optional: `"ownerLogin"` (default the repository's owner), `"workflows"` (default `["ci.yml", "full-gate.yml"]`; add `"nightly-fuzz.yml"` when the game has `npm run fuzz:nightly`), `"e2eScripts"` (the npm scripts the full gate and `local-ci.sh` run, default `["test:e2e"]`), `"pathsIgnore"` (paths whose pushes to main run no CI, for example `["bugs/**"]`), `"runDrafts": true` (CI on draft pull requests too).
2. `node kit/ci-templates/render.mjs` writes `.github/workflows/` from the templates and that file (GitHub reads workflows only there); commit them. Put `node kit/ci-templates/render.mjs --check` in the game's check: it fails when a workflow was edited by hand or is older than the templates. Run the first again after each pull of this component.
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
- `python3 tools/architect/gate-numbers.py <log> [regex ...]`: the count lines of a saved job log or a `local-ci.sh` log, for the merge message; the defaults are what vitest, tsc, eslint, Playwright and the kit's tools print; extra regexes add the game's own lines, for example `'traceability \(' 'content:gate:' 'games \d+, exceptions'`.
- `nightly-fuzz.yml` runs `npm run fuzz:nightly` (the game writes it) on main, in its own concurrency group and its own `nightly/` checkout, so it never replaces or collides with a queued gate; set the cron to an idle hour.
- `skip-reporter.ts`: `reporters: ['default', ['./tools/skip-reporter.ts', { inputs: [['<git-ignored path>', '<command that makes it>']] }]]` in the vitest config lists every skipped test by file at the end of a run and in the GitHub job summary.
