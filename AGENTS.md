# AGENTS.md: game-kit

For architects, build workers and reviewers of the owner's board-game adaptations. Read this, then the one catalogue entry and README of the component you touch. You should never need to read component source.

## What this is
Open work: run `node kit.mjs state` for what is open; don't read PLAN.md.

Private shared code for digital board-game builds: one best version of each reusable component (engine kernel, simulation, AI, saves, settings, UI frames, tooling, gates). Rules, card names, zones, texts and looks of any one game never live here. Index: [README.md](README.md). Catalogue of every component: [docs/CATALOG.md](docs/CATALOG.md) (generated). Task guides: [docs/recipes/](docs/recipes/README.md). Known gaps and wishes: [docs/GAPS.md](docs/GAPS.md). Build plan: [docs/PLAN.md](docs/PLAN.md).

## The locked copy (in a game)
- A game holds `kit/`, a copy of named components at a tag. **Never edit `kit/`**, never copy a component into `src/`, never port from an older game what the kit has.
- `node ../game-kit/kit.mjs pull ../game-kit <tag> <component...>` copies components (and their `needs`) and writes `kit/kit.lock.json` plus `kit/CATALOG.md`. `node kit/kit.mjs check` fails when `kit/` differs from the lock; every game runs it in its check chain.
- Inside a game, find what exists without the kit checkout: `node kit/kit.mjs list`, `node kit/kit.mjs search <word>`.
- Before adding a row to `docs/PLAN.md`, take its id with `node kit.mjs next-id` (in the game-kit checkout); it reads main and every open PR.
- Start a new game: `node tools/game-server/server.mjs add ...`, then `node kit.mjs new <dir> <id> "<Name>"` (scaffold).
- Workers: `worktree-setup` and `worker-finish` (tooling-scripts) set up and close a worktree; `worktree-teardown` removes it.
- `reference-game` is the contract test of the kit's pieces; `card-parts` and `card-zoom`: the game owns its layout, the kit gives parts.
- Pulling a newer tag happens only when the game needs something in it. Commit `kit/`.

## Choose components for a new game
1. `search` / [CATALOG.md](docs/CATALOG.md): each entry says when to use it and when not.
2. Read the component's README (its "Use it in 10 lines" is real, type-checked code) and, for `engine-core`, its guides (`timing.md`, `undo.md`, `random.md`, `legal.md`, `debug.md`).
3. Pull tooling first (plan-checker, repo-gate, traceability, check-runner, ci-templates). Recipe: [new-game](docs/recipes/new-game.md).
4. A need the kit lacks: change the kit (below) or write "Kit gap" in the PR; do not fork.

## Change the kit
1. Look at open PRs: **one open PR per component**. Wait for or continue the one touching yours.
2. Branch `k<n>-<name>` from `origin/main` in a worktree of this repository. Add or find the row in [docs/PLAN.md](docs/PLAN.md) (next free K number; a new component also gets a line in `docs/SELECTION.md`). Mark the row done in the same PR.
3. A bug: failing test first, then the fix.
4. Interfaces grow by addition; nothing breaking. A breaking change says `breaking` in its title and lists what a game must change.
5. New component: `components/<name>/` with `component.json` (`name`, `source.game`, `source.commit`, `source.paths`, `needs`), README, tests, a line in `docs/SELECTION.md`, and an entry in `docs/catalog-notes.json` (`use`, `not`). `npm run check` fails without them.
6. README: purpose in the first line, a **Use it in 10 lines** section (from the component's own tests or types; never an invented API; `scripts/readme-examples.mjs` type-checks every TypeScript one in `npm run components:check`).
7. Done = independent review, CI green on the runner, squash-merge. Then a tag on main: **middle number up for a feature or new component, last number up for a fix**. Draft PR, no hooks, never merge your own batch.

## Rules agents break most
- Editing `kit/` in a game, or copying kit code into `src/`.
- `'..'` or `'../x'` strings in a component code file (the check flags them); use `dirname()`.
- Importing a kit component from another without listing it in `needs`.
- `async` functions without `await` (lint `require-await`), tests included.
- Deciding a game rule or a look yourself: ask the arbiter or director session, or write it in the PR ("Rules questions", "Look questions", "Kit gap").
- Showing rule ids (`TURN-07`, `AR-12`) on screen: use `plain-text`.
- Reading hidden state in an opponent (see below).
- Unseeded randomness in an engine (`Math.random`, clock): only `ctx.rng`.
- Editing `docs/CATALOG.md` by hand: run `node scripts/catalog.mjs`.
- Running heavy tests locally on Windows.
- Inventing a port, or hard-coding one that is not in `ports.json` (see "Ports" below).
- Re-reading files or pictures already in context; repeating a failed call unchanged (three strikes, then stop and report).

## Where tests and CI run
- Never heavy tests on local Windows. CI and the full gate run on the self-hosted runners (WSL, labelled per game; `kit` for this repo). Local checks: only the ones you touched (types, lint, the test file).
- Here: `npm run check` = lint, typecheck, vitest, `components:check` (component rules and the catalogue is current). Worktrees lack `node_modules`: link them from another checkout, never commit them.
- A game's gate comes from `ci-templates`; its check chain from `check-runner`.

## Ports: one source of truth
- Every port used by a game, tool, test or agent comes from [`ports.json`](ports.json) (readable view: [docs/PORTS.md](docs/PORTS.md), generated). Never invent one.
- Each game owns a block of 10 from 6010: dev = block, preview = +1, e2e = +2, second e2e = +3, the rest spare. 4170-4199 is phone serving only; 5190-5299 is Codex worktree servers; CI picks a free port.
- A new game gets its block with `node tools/game-server/server.mjs add <id> "<Name>" <repo path>`; it prints what to set in vite and Playwright. Commit `ports.json` and `docs/PORTS.md` here.
- Any port change goes into `ports.json` first (validated on load by `validatePorts` in `tools/game-server/lib.mjs`), then into the game. More: [tools/game-server/README.md](tools/game-server/README.md).

## Owner's standing rules that touch code
- **Never prettify**: no reformatting, tidy-ups, renames for style, decorative comments or docstrings. Shortest correct code; change only what the task needs.
- **No hooks** unless asked.
- **No old-save work** in any game until it is complete.
- **Opponents decide from the player's own view** only: `redact`, no hidden state of the real game; a greedy that reads it is a test pilot.
- Screen text matches what the engine does; fit text, never drop it. No rule ids on screen.
- Release ladder: 1.0 no animation or sound; 1.1 VFX; 1.2 SFX and music; 1.3 voice.
- Private repositories: no deployment to public places; GitHub files under 50 MB.

## Reports
Short: the batch id, PR number, branch, check result, what now works, count of open questions. Post-build notes go in `docs/post-build/notes/`.
