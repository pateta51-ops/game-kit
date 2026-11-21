# game-kit

The shared code for the owner's digital board-game builds: the best version of each reusable component, taken from the games already built. Private. For new games.

Needs Node 22.18 or newer: every kit tool runs with plain `node` (type stripping, no tsx or build step), so relative imports name their `.ts`/`.tsx` file and code uses erasable TypeScript syntax only (no enums, namespaces or parameter properties). Upgrading a game past that change: [upgrade-kit](docs/recipes/upgrade-kit.md).

## Start here (agents)

1. [AGENTS.md](AGENTS.md): the rules, in a game's `kit/` copy and here.
2. [docs/recipes/](docs/recipes/README.md): the paths (new game, game batch, kit change) and one guide per task, with the components it uses.
3. `node kit.mjs search <words>` (in a game: `node kit/kit.mjs search <words>`; every word must match one entry, titles and tags rank first, an effect hit prints the effect's line, a miss is logged to `~/.game-kit/search-misses.log`, newest: `search --misses`; `kit.mjs effects [words]` lists effects only), then the component's README. Never read `docs/PLAN.md`, `docs/CATALOG.md` or `docs/SELECTION.md` whole; what is open: `node kit.mjs state`.

Generated, never edited by hand: [docs/CATALOG.md](docs/CATALOG.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (`node scripts/catalog.mjs`), `docs/PLAN.md` (`node scripts/plan.mjs`), [docs/PORTS.md](docs/PORTS.md) (from [ports.json](ports.json), the one port registry; [tools/game-server/](tools/game-server/README.md)).

## Rules

1. **Shared code is edited here, nowhere else.** A game carries a locked copy in its `kit/` folder.
2. **A game pins a version.** It pulls named components at a tag; nothing changes in a game until it pulls again.
3. **A game never edits its copy.** `node kit/kit.mjs check` fails when `kit/` differs from `kit/kit.lock.json`; every game runs it in its check chain.
4. **Existing games take the tooling and the presentation.** They pull the build-tooling components as `docs/RETROFIT_PLAN.md` says (owner, 15 Nov 2026), and since 18 Nov 2026 their animations are rebuilt on `motion-frame` and `effect-library` (`docs/MOTION_RETROFIT_STUDY.md`); their engines and card code are not retrofitted.
5. **A component is generic.** The game plugs in through data or a small interface. No game's rules, card names, zones or texts live here.
6. **Each component records where it came from** (`component.json`: game, commit, paths), and any licence notice travels with it.

## Layout

- `kit.mjs` - pull, check (`--source`), outdated, list, search, new, state, next-id (`--reserve`), worktree, finish, teardown (no dependencies; usage at the top of the file).
- `scripts/` - `catalog.mjs` (CATALOG and ARCHITECTURE), `plan.mjs` (PLAN from `docs/plan/K<n>.md`), `check-components.mjs`, `readme-examples.mjs`, `state.mjs`, `agent.mjs` (worker commands), `coverage-table.mjs` (`npm run coverage`: line coverage per component).
- `components/<name>/` - one folder per component: code, tests, `component.json`.
- `docs/SELECTION.md` - which game each component comes from, and why.
- `docs/PLAN.md` - the batches that build the kit, and their state (generated from `docs/plan/K<n>.md`, one file per row, and `docs/plan/_template.md`).
- `docs/evaluation/` - the evidence behind the selection.
- `docs/patterns/` - things that are shared as a described pattern, not as code.

## Components

`node kit.mjs list` (one line each) or `search <word>`; full entries in [docs/CATALOG.md](docs/CATALOG.md). Read a component's README before using it; `needs` are pulled with it. Origin of each: `docs/SELECTION.md`.

Card and board parts (v0.66.0): `card-hand`, `card-pile`, `drag-drop`, `deck-motions` ([card-table](docs/recipes/card-table.md)); `counter`, `token-flights`, `track`, `market-row`, `player-board`, `card-attachments`, `token-bag`, `target-arrow` ([board-pieces](docs/recipes/board-pieces.md)).

What the kit is for (owner, 17 Nov 2026):
- It is a catalogue of building blocks, not a game build. Animation is in scope: every motion part takes a `speed` factor, and 0 or prefers-reduced-motion means still. The 1.0 no-animation rule applies to game releases, not to the kit.
- Hand, piles, card zones, resources, tracks and similar are shared kit parts. A game owns only its layout (its combination of zone positions) and its look, through `data-part` hooks. Parts are unstyled apart from structural CSS and put no hidden ids in the DOM.
- New parts are ported from existing game code (STCC, Imperium, Unstoppable, Earthborne, Rome, Warp's Edge), not written from scratch.

`engine-core` guides beside its README: `undo.md`, `random.md`, `helpers.md`, `cause.md`, `objref.md`, `legal.md` (reasons, legal table, preview), `debug.md`, `timing.md` (batches, cancel, instead, replacement, triggers, continuous effects and layers, checkpoint), `idle.md`. Patterns with the code that implements them: `docs/patterns/`.

## Using it in a game

From the game's repo root, with this repo checked out beside it:

```bash
node ../game-kit/kit.mjs pull ../game-kit <tag> engine-core bug-reporter
```

```bash
node kit/kit.mjs check
```

`pull` also copies `docs/recipes/` to `kit/recipes/` and `docs/CATALOG.md` to `kit/CATALOG.md`; `node kit/kit.mjs list` and `search <word>` read it. A game holds one kit tag (`kit/kit.lock.json` holds one `ref`): `pull <tag>` moves every component the game has to that tag, and component names after it add components at the same tag. An old per-component lock keeps working; the next pull converts it and says so. Pull is atomic: it builds a new `kit/` aside, verifies it, then swaps; a failed pull leaves `kit/` as it was and says what failed. `check` also fails on a stray folder or file in `kit/` that the lock does not list. `node kit/kit.mjs outdated [../game-kit]` shows the game's tag against the latest and the PLAN rows and `breaking` notes between them. Commit the `kit/` folder.

- From a worktree this repo is not beside the game: give the checkout's full path (`C:/projects/game-kit`) in both places.
- Run `git -C <kit checkout> fetch --tags` first when the tag is new.
- A component names the others it needs in its `component.json` (`needs`): pull those too (`pull` now does it for you, keeping a need already pulled at its own ref). `check` fails when a pulled component's need is absent: a game that pulled a component without its needs must pull them (`node kit/kit.mjs pull <kit> <tag> <needed...>`).
- Read a component's `README.md` (or its `component.json` and index file) before using it; never its source game.
- `engine-core` `appendAction(game, history, state, action, content)`: `state` is trusted to be the state at `history.cursor` (not checked); a cursor out of range is refused.

## Changing the kit

A game that needs something the kit lacks changes the kit. It never edits its copy, forks a component into its own code, or copies from an older game what the kit holds or plans.

1. **What goes in.** A component, or a feature of one, that the next game would use unchanged. One game's rules, zones, texts and look stay in that game. A row of stage 2 or 3 in `docs/PLAN.md` that is not built yet is built when the first game needs it; a stage 4 row waits for the owner (point 2). Anything else first gets a row there (the next free K number: take it with `node kit.mjs next-id --reserve` right before adding the row file `docs/plan/K<n>.md`) and, for a new component, a line in `docs/SELECTION.md` (base game, commit, why that one).
2. **Who decides.** The game's planner or architect, for size S or M. The owner, for stage 4 and for size L.
3. **Who builds.** A worker started by the architect of the game that needs it, in a worktree of this repository, on a branch `k<n>-<name>`. One open pull request per component: look at the open ones first, and wait for, or continue, one that touches the same component.
4. **How.** As "How a batch works" in `docs/PLAN.md`. Interfaces grow by addition, so a game that pulls a newer tag still compiles; a change that breaks callers says `breaking` in its title and lists what a game must change.
5. **Done.** An independent review, CI green on the `kit` runner, squash-merge, the row in `docs/PLAN.md` marked done in the same pull request. Then a tag on main: the middle number goes up for a new component or feature, the last for a fix.
6. **Back in the game.** Run `node kit/kit.mjs outdated` to see the rows and breaking notes since the game's tag, pull the one new tag (`pull <tag>` moves the whole kit; names add components), run the game's check, commit `kit/`. A game pulls a newer tag only when it needs something in it.

A bug in a component is fixed the same way: a failing test here first, then the fix, a tag, a pull.
