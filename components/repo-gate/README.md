# repo-gate

The repository gate: file sizes, raw scans, secrets, session URLs, tailnet hosts, runner names, card ids and names in rules code, art and repository budgets (the list is at the top of `repo-gate.ts`). Use it as pulled:

1. Copy `repo-gate.config.example.json` to `repo-gate.config.json` in the repository root and set every check (an empty value turns a check off).
2. `"repo-gate": "tsx kit/repo-gate/repo-gate.ts"` in `package.json`, inside the game's check. Exit 0 clean, 1 findings, 2 no git or no config.
3. Runner names: copy `runners.example.json` to the `runnersFile` of the config (default `tools/repogate/runners.json`) and list the machine name of each registered runner. That file is exempt from the RUNNER_NAME check, and only from that one.

A file that is not checked out is sized from the objects the clone holds; a blob a partial clone does not hold is never fetched and is a SIZE finding (its size cannot be read): run the gate where the files are checked out or fetched.

The runner is installed with `ci-templates` (from WSL Ubuntu, with a registration token valid one hour); its name then goes in the runners file:

```bash
RUNNER_REPO=<owner>/<repo> RUNNER_LABEL=<label> RUNNER_TOKEN=<token> bash kit/ci-templates/install-wsl.sh
```

A label that is also a runner name needs `.github/` and `ci.config.json` in `skipText`.
