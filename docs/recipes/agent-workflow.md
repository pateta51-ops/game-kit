# Work as an agent in this repo

Use when you are a worker given one batch. The order below is the order of use. The worker scripts are `scripts/agent.mjs`; `kit.mjs` is at the root of a kit checkout (pulled into a game as `kit/kit.mjs`, with `kit/agent.mjs` beside it: `node kit/kit.mjs worktree|finish|teardown` works in a game, using the game's own `npm run check`; tried on 7th Inning Stretch).

1. **Id.** A new plan row is a file `docs/plan/K<n>.md` (copy a neighbour; then `node scripts/plan.mjs` regenerates `docs/PLAN.md`) and needs a free number: `node kit.mjs next-id [n] --reserve` reads origin/main, every open PR's `docs/plan/` file names and the reservations, then reserves the id(s) by pushing `refs/kit-reserved/K<n>` to origin (only if absent, so two sessions cannot get the same one before a PR exists). Run it before you write the row.
   On a `docs/PLAN.md` conflict take either side and regenerate it with `node scripts/plan.mjs`.
2. **Worktree.** `node kit.mjs worktree --branch <name>` makes a worktree from origin/main and links `node_modules` (a junction on Windows, kept out of git). With no `node_modules` anywhere it says to `npm ci` or pass `--shared <base>` (in WSL `~/codex/<key>-base`). Already inside a worktree the harness made for you: `node kit.mjs worktree --here [--branch <name>]` only links `node_modules` (from the main checkout, or `--shared`) and switches to the new branch. No install and no tsx needed. Work only in that worktree.
3. **See the state.** `node kit.mjs state` (kit checkout) prints the PLAN rows not done, what waits, the open PRs with the component each touches, each game's oldest kit pin against the latest tag, and what to watch. In a game, `plancheck.py --batch <id>` gives your batch's line ranges; read only those. The plan checker also warns (never fails) when the game's kit pin is 5 or more minor versions behind the latest tag, or a `Phase GK` targets a K row the kit marks done: pull the newer tag or drop the phase.
4. **Build.** Commit at each milestone. Run only your own checks.
5. **Finish.** Run it from Windows node in the worktree (not from inside WSL: a Windows worktree's `.git` path does not resolve there). `node kit.mjs finish [--repo <worktree>] [--check 'npm run check'] [--comment]`: exit 1 on uncommitted changes or a detached HEAD, else it clones the branch in WSL (own TMPDIR beside the clone; no WSL means FAIL with the reason, never a local run), installs, runs the check there and prints `PASS <full sha>` or `FAIL <full sha>` first, then the tail; `--comment` posts that line on the PR. A reviewer compares the sha with the PR head (`gh pr view --json headRefOid`) and rejects a missing or older one. Then push and open the draft PR.
6. **Teardown** after the merge: `node kit.mjs teardown --worktree <dir>` cuts the link (never its target), then removes the worktree. `--force` discards uncommitted changes: only on purpose.

## Checks and what each catches
In this repo `npm run check` (CI runs it through `check-runner`):
- `lint`: ESLint with type-checked rules (`require-await`, no `any`, type imports).
- `typecheck`: `tsc -b`, including components' tests.
- `test`: vitest, every component's tests and `tests/` (the reference game is generated and checked by `components/reference-game/reference.test.ts`).
- `components:check`: `scripts/check-components.mjs` (`component.json` fields, `needs` exist, README first line, a test file, no import outside the folder unless in `needs`, packages listed); `scripts/catalog.mjs --check` (`CATALOG.md`, `ARCHITECTURE.md`, `PLAN.md` current, a `catalog-notes.json` entry per component); `scripts/readme-examples.mjs` (every "Use it in 10 lines" block type-checks).

In a game made by `kit.mjs new`, `npm run check` runs `scripts/check-runner.config.json`: tests, lint (`lint-preset`: pure engine, no `Math.random`, UI imports the engine only through `src/engine/api.ts`), types, `kit:check` (`kit/` equals the lock), `ci:check` (workflows equal the template), `repo-gate` (file sizes, secrets, hosts, card names in rules code), build, `size` (`bundle-size`). Added by hand per game: `traceability` (tests cite rule ids), `theme-check`, `plain-text`, `plan-checker`.

## Brief a worker
A worker starts with a fresh context. The brief stands alone when it names:
- the repo, the branch `k<n>-<name>` (or the game batch id) and the row id, already reserved;
- the files or plan line ranges to read (never "read the plan"), and the recipe;
- what done looks like: the test that proves it, and `finish` printing `PASS <sha>`;
- what is out of scope, the arbiter or director session for questions, and the size at which to stop and report.

## Before you say done
- `git status` clean, every change committed and pushed; the PR head equals the sha in the `PASS` line.
- The behaviour is shown by a test that failed before (a bug) or by real data (a run, a screenshot), not by reading the code.
- Generated files regenerated, not edited: `node scripts/catalog.mjs`, `node scripts/plan.mjs`.
- The row file says `state: done`; open questions are in the PR body ("Rules questions", "Look questions", "Kit gap").

Pitfalls
- Never run the heavy check on local Windows; `kit.mjs finish` runs it in WSL.
- Do not copy `node_modules` into the worktree and do not commit the link.
- `next-id` needs `gh` signed in to see open PRs; re-run it just before you open the PR if the batch was long.
- `kit/` in a game changes only by `kit.mjs pull` (see [new-game.md](new-game.md)).
- Recipe links to `../../components/<name>/README.md` work in the kit checkout; in a game read `kit/<name>/README.md`.
- Reading `docs/PLAN.md`, `CATALOG.md` or `SELECTION.md` whole burns the budget: `kit.mjs state`, `kit.mjs search`, then one entry.
- `finish` clones the committed branch: uncommitted work is not checked, and it refuses to run on a dirty tree.

Proof: `finish` prints `PASS <sha>` for the PR head.
