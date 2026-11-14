# ci-templates

Copy these into a new game and replace the three placeholders. Nothing here names a repository, runner or login.

| Placeholder | Meaning | Where it goes |
|---|---|---|
| `{{REPO_SLUG}}` | `owner/repo` of the game's GitHub repository | `full-gate.mjs` (refuses to run in any other repository), `local-ci.sh` (names the `/tmp/<repo>-ci` output folder) |
| `{{RUNNER_LABEL}}` | the label of the self-hosted runner | `ci.yml` and `full-gate.yml` (`runs-on: [self-hosted, ...]`) |
| `{{OWNER_LOGIN}}` | the GitHub login allowed to start these jobs | `ci.yml` (`github.repository_owner`), `full-gate.yml` (`github.actor`) |

Copy to: `ci.yml` and `full-gate.yml` to `.github/workflows/`, `full-gate.mjs` to `.github/scripts/`, `local-ci.sh` and `gate-slot.sh` to `tools/architect/`, `install-wsl.sh` anywhere (it takes the slug and label as `RUNNER_REPO=<owner>/<repo> RUNNER_LABEL=<label>` environment variables, not placeholders).

Other settings are environment variables: `E2E_SCRIPTS` (comma list of npm scripts the full gate runs, default `test:e2e`), `GATE_DIR` and `GATE_SLOTS` (gate slots), `LOCAL_CI_DIR`, `PW_CHROMIUM_PATH`, `RUNNER_WANT_PYMUPDF=1`.

The workflows never use `pull_request_target`, and the full gate refuses a pull request whose head is outside the repository: keep both.

A workflow whose `{{OWNER_LOGIN}}` is left unfilled skips its jobs silently (the guard never matches): fill it in before the first run.
