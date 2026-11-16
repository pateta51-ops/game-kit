# repo-gate

The repository gate: file sizes, raw scans, secrets, session URLs, tailnet hosts, runner names, card ids and names in rules code, art and repository budgets (the list is at the top of `repo-gate.ts`). Use it as pulled:

1. Copy `repo-gate.config.example.json` to `repo-gate.config.json` in the repository root and set every check (an empty value turns a check off).
2. `"repo-gate": "node kit/repo-gate/repo-gate.ts"` in `package.json`, inside the game's check. Exit 0 clean, 1 findings, 2 no git or no config.
3. Runner names: copy `runners.example.json` to the `runnersFile` of the config (default `tools/repogate/runners.json`) and list the machine name of each registered runner. That file is exempt from the RUNNER_NAME check, and only from that one.

Options a game sets (the defaults keep every check on):

- `rawScan`: the regexp source of raw scan paths; `""` turns RAW_SCAN off.
- `contentName: false` turns CONTENT_NAME off.
- `sessionUrl: false`, `tailnetHost: false`, `runnerName: false` turn SESSION_URL, TAILNET_HOST, RUNNER_NAME off.
- `engineTests: true` checks the engine's `*.test.ts` files for CONTENT_ID and CONTENT_NAME too.
- K181: a file not checked out is sized in one pass whatever the number of blobs: one `rev-list --objects --missing=print` finds the blobs a partial clone lacks (unsized, never fetched, never one call per blob), one `cat-file --batch-check` sizes the rest.
- `skipMissingBlobs: true`: a blob a partial clone does not hold is counted in a notice, not a SIZE finding (the full checkout's gate checks it).
- `maxRepoMB: 0` is no limit; `warnRepoMB` prints a warning above it and still passes.
- `portFrom`, `portTo` (PORT): a pull request that changes a `portFrom` file changes a `portTo` file too, or has a line `port: n/a (<reason>)` in its body. Checked on a `pull_request` event (check out 2 commits deep) or with `PORT_RULE_BASE` (a revision) and `PORT_RULE_BODY_FILE`; a `workflow_dispatch` run without them fails; a local run or a push prints that it was not checked.

Text that is not checked out is read from its blob when the clone holds it; UTF-16 text with a byte-order mark is decoded; SESSION_URL also finds chat URLs.

Warp's Edge: `engineFolders` and `engineAllowed` with the Rust twins, `contentSkip: ["glossary.json"]`, `skipText: []`, `rawScan: ""`, `contentName: false`, `sessionUrl: false`, `tailnetHost: false`, `runnerName: false`, `engineTests: true`, `portFrom: "src/engine/"`, `portTo: "engine-rs/crates/"`. STCC: `artFolder: ""`, `engineFolders: []`, `skipText: []`, `rawScan: "\\.(tiff?|psd|raw)$"`, `maxRepoMB: 0`, `warnRepoMB: 800`, `skipMissingBlobs: true`.

A file that is not checked out is sized from the objects the clone holds; a blob a partial clone does not hold is never fetched and is a SIZE finding (its size cannot be read): run the gate where the files are checked out or fetched.

The runner is installed with `ci-templates` (from WSL Ubuntu, with a registration token valid one hour); its name then goes in the runners file:

```bash
RUNNER_REPO=<owner>/<repo> RUNNER_LABEL=<label> RUNNER_TOKEN=<token> bash kit/ci-templates/install-wsl.sh
```

A label that is also a runner name needs `.github/` and `ci.config.json` in `skipText`.

## Use it in 10 lines

```sh
# package.json: "repo-gate": "node kit/repo-gate/repo-gate.ts", inside the game's check
npm run repo-gate   # exit 0 clean, 1 findings, 2 no git or no config
```
