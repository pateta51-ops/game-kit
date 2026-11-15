# game-kit

The shared code for the owner's digital board-game builds: the best version of each reusable component, taken from the games already built. Private. For new games.

## Rules

1. **Shared code is edited here, nowhere else.** A game carries a locked copy in its `kit/` folder.
2. **A game pins a version.** It pulls named components at a tag; nothing changes in a game until it pulls again.
3. **A game never edits its copy.** `node kit/kit.mjs check` fails when `kit/` differs from `kit/kit.lock.json`; every game runs it in its check chain.
4. **New games only.** The existing games are not retrofitted. The owner will consider that only after a full pro and con analysis.
5. **A component is generic.** The game plugs in through data or a small interface. No game's rules, card names, zones or texts live here.
6. **Each component records where it came from** (`component.json`: game, commit, paths), and any licence notice travels with it.

## Layout

- `kit.mjs` - pull and check tool (no dependencies, Node 22+).
- `components/<name>/` - one folder per component: code, tests, `component.json`.
- `docs/SELECTION.md` - which game each component comes from, and why.
- `docs/PLAN.md` - the batches that build the kit, and their state.
- `docs/evaluation/` - the evidence behind the selection.
- `docs/patterns/` - things that are shared as a described pattern, not as code.

## Using it in a game

From the game's repo root, with this repo checked out beside it:

```bash
node ../game-kit/kit.mjs pull ../game-kit v0.1.0 engine-core bug-reporter
```

```bash
node kit/kit.mjs check
```

`pull` with no component names re-pulls every component the game already has, at the new version. Commit the `kit/` folder.

- From a worktree this repo is not beside the game: give the checkout's full path (`C:/projects/game-kit`) in both places.
- Run `git -C <kit checkout> fetch --tags` first when the tag is new.
- A component names the others it needs in its `component.json` (`needs`): pull those too.
- Read a component's `README.md` (or its `component.json` and index file) before using it; never its source game.
- `engine-core` `appendAction(game, history, state, action, content)`: `state` is trusted to be the state at `history.cursor` (not checked); a cursor out of range is refused.

## Changing the kit

A game that needs something the kit lacks changes the kit. It never edits its copy, forks a component into its own code, or copies from an older game what the kit holds or plans.

1. **What goes in.** A component, or a feature of one, that the next game would use unchanged. One game's rules, zones, texts and look stay in that game. A row of stage 2 or 3 in `docs/PLAN.md` that is not built yet is built when the first game needs it; a stage 4 row waits for the owner (point 2). Anything else first gets a row there (the next free K number) and, for a new component, a line in `docs/SELECTION.md` (base game, commit, why that one).
2. **Who decides.** The game's planner or architect, for size S or M. The owner, for stage 4 and for size L.
3. **Who builds.** A worker started by the architect of the game that needs it, in a worktree of this repository, on a branch `k<n>-<name>`. One open pull request per component: look at the open ones first, and wait for, or continue, one that touches the same component.
4. **How.** As "How a batch works" in `docs/PLAN.md`. Interfaces grow by addition, so a game that pulls a newer tag still compiles; a change that breaks callers says `breaking` in its title and lists what a game must change.
5. **Done.** An independent review, CI green on the `kit` runner, squash-merge, the row in `docs/PLAN.md` marked done in the same pull request. Then a tag on main: the middle number goes up for a new component or feature, the last for a fix.
6. **Back in the game.** Pull the components at the new tag, run the game's check, commit `kit/`. A game pulls a newer tag only when it needs something in it.

A bug in a component is fixed the same way: a failing test here first, then the fix, a tag, a pull.
