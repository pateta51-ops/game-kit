# Work as an agent in this repo

Use when you are a worker given one batch. The order below is the order of use. The scripts are in `components/tooling-scripts` (flags in its README); `kit.mjs` is at the root of a kit checkout (pulled into a game as `kit/kit.mjs`).

1. **Id.** A new row in `docs/PLAN.md` needs a free number: `node kit.mjs next-id [n]` reads origin/main and every open PR's PLAN.md. Run it before you write the row; two PRs taking the same K number is what it prevents.
2. **Worktree.** `npx tsx components/tooling-scripts/worktree-setup.ts --branch <name>` makes a worktree from origin/main and links `node_modules` (a junction on Windows, kept out of git). With no `node_modules` anywhere it says to `npm ci` or pass `--shared <base>` (in WSL `~/codex/<key>-base`). Work only in that worktree.
3. **See the state.** `node kit.mjs state` (kit checkout) prints the PLAN rows not done, what waits and what to watch. In a game, `plancheck.py --batch <id>` gives your batch's line ranges; read only those. The plan checker also warns (never fails) when the game's kit pin is 5 or more minor versions behind the latest tag, or a `Phase GK` targets a K row the kit marks done: pull the newer tag or drop the phase.
4. **Build.** Commit at each milestone. Run only your own checks.
5. **Finish.** `npx tsx components/tooling-scripts/worker-finish.ts [--repo <worktree>] [--check 'npm run check']`: exit 1 on uncommitted changes or a detached HEAD, else it clones the branch in WSL, installs, runs the check there and prints PASS or FAIL with the tail. Then push and open the draft PR.
6. **Teardown** after the merge: `worktree-teardown.ts --worktree <dir>` cuts the link (never its target), then removes the worktree. `--force` discards uncommitted changes: only on purpose.

Pitfalls
- Never run the heavy check on local Windows; `worker-finish` runs it in WSL.
- Do not copy `node_modules` into the worktree and do not commit the link.
- `next-id` needs `gh` signed in to see open PRs; re-run it just before you open the PR if the batch was long.
- `kit/` in a game changes only by `kit.mjs pull` (see [new-game.md](new-game.md)).

Proof: `worker-finish` prints PASS.
