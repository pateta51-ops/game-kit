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
