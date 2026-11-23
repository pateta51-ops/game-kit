# worker-rules

One block of worker rules (`docs/worker-rules.md`) that `kit.mjs pull` stamps into every game's `AGENTS.md` (K714).

## Rules for agents

**What it does:** Keeps the worker rules in one place; `pull` writes them into the game's `AGENTS.md` between `<!-- kit:worker-rules start -->` and `<!-- kit:worker-rules end -->`.

**You must:**
1. Change the rules only in `docs/worker-rules.md` of the game-kit repository (about 200 words at most, plain words, no name, no local path); a game never edits the text between the markers.
2. Keep a game's own lines outside the markers; `pull` never touches them. A game with no markers gets them added with the heading `## Worker rules (from the kit)`.
3. In a game, run `node kit/kit.mjs worker-rules --adopt .` to list hand-written worker-rule sections outside the markers, and remove them by hand; `node kit/kit.mjs check` warns (never fails) while one remains.

**Common mistakes:**
- Deleting the markers (the next pull adds a second block).
- Keeping an old hand-written list beside the block.

## Use it in 10 lines

```sh
node ../game-kit/kit.mjs pull ../game-kit <tag>
node kit/kit.mjs worker-rules --adopt .
```
