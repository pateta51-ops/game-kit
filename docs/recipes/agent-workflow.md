# Work as an agent in this repo

Use when you are a worker given one batch. The order below is the order of use. The scripts are in `components/tooling-scripts` (flags in its README); `kit.mjs` is at the root of a kit checkout (pulled into a game as `kit/kit.mjs`, with `kit/agent.mjs` beside it: `node kit/kit.mjs worktree|finish|teardown` works in a game, using the game's own `npm run check`; tried on 7th Inning Stretch).

1. **Id.** A new row in `docs/PLAN.md` needs a free number: `node kit.mjs next-id [n] --reserve` reads origin/main, every open PR's PLAN.md and the reservations, then reserves the id(s) by pushing `refs/kit-reserved/K<n>` to origin (only if absent, so two sessions cannot get the same one before a PR exists). Run it before you write the row.
2. **Worktree.** `node kit.mjs worktree --branch <name>` makes a worktree from origin/main and links `node_modules` (a junction on Windows, kept out of git). With no `node_modules` anywhere it says to `npm ci` or pass `--shared <base>` (in WSL `~/codex/<key>-base`). Already inside a worktree the harness made for you: `node kit.mjs worktree --here [--branch <name>]` only links `node_modules` (from the main checkout, or `--shared`) and switches to the new branch. No install and no tsx needed. Work only in that worktree.
3. **See the state.** `node kit.mjs state` (kit checkout) prints the PLAN rows not done, what waits, the open PRs with the component each touches, each game's oldest kit pin against the latest tag, and what to watch. In a game, `plancheck.py --batch <id>` gives your batch's line ranges; read only those. The plan checker also warns (never fails) when the game's kit pin is 5 or more minor versions behind the latest tag, or a `Phase GK` targets a K row the kit marks done: pull the newer tag or drop the phase.
4. **Build.** Commit at each milestone. Run only your own checks.
5. **Finish.** Run it from Windows node in the worktree (not from inside WSL: a Windows worktree's `.git` path does not resolve there). `node kit.mjs finish [--repo <worktree>] [--check 'npm run check'] [--comment]`: exit 1 on uncommitted changes or a detached HEAD, else it clones the branch in WSL (own TMPDIR beside the clone; no WSL means FAIL with the reason, never a local run), installs, runs the check there and prints `PASS <full sha>` or `FAIL <full sha>` first, then the tail; `--comment` posts that line on the PR. A reviewer compares the sha with the PR head (`gh pr view --json headRefOid`) and rejects a missing or older one. Then push and open the draft PR.
6. **Teardown** after the merge: `node kit.mjs teardown --worktree <dir>` cuts the link (never its target), then removes the worktree. `--force` discards uncommitted changes: only on purpose.

Pitfalls
- Never run the heavy check on local Windows; `kit.mjs finish` runs it in WSL.
- Do not copy `node_modules` into the worktree and do not commit the link.
- `next-id` needs `gh` signed in to see open PRs; re-run it just before you open the PR if the batch was long.
- `kit/` in a game changes only by `kit.mjs pull` (see [new-game.md](new-game.md)).

Proof: `finish` prints `PASS <sha>` for the PR head.
