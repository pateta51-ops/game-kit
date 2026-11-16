# replay-cli

Headless replays, golden games and a determinism check across two checkouts. Needs `engine-core` and `sim-pool`.

## replay.ts: one log

`node replay.ts <log.json> (--engine <module> | --config <replay.json>) [--record <out.json>]`. The module exports `engine: { game, content(), format?, describe? }`. A log is a sealed save or a record with per-action hashes. Exit 0 same, 1 differs, 2 unusable. Checkpoint goldens: an engine with `checkpoint(state, content, action)` names checkpoints (one per round, say; `action` is null after setup); `--checkpoints <golden.json>` compares the hash at each (of `project(state, content)` when the engine has it, else of the state) with the file and names the first that differs; `--update-golden` writes the file.

## golden.ts: whole games

The game writes one module that exports `simGame` (the `sim-pool` contract), `goldens: GoldenSpec[]` and optionally `format` (its `SaveFormat`). A `GoldenSpec` is `{ name, driver, seed?, settings? }`; the seed is `golden-<name>` unless given; the list (which settings, which drivers) is the game's. Games are played as `sim-pool` plays them, so a golden equals the simulated game of the same seed and driver.

Golden games, as saves in a folder (`<name>.json`, fixed `savedAt`, one action per line):
- `node golden.ts check <dir> --game <module>`: plays every game again and compares the bytes. A failure says whether the stored game still replays (the driver changed) or not (the engine or the content changed) and names the first action that differs (stored and now); a missing file and a file with no game also fail. Run it in CI, or call `checkGoldens(mod, dir, nodeIo)` from a test.
- `--update-golden`: writes the files that changed, after a deliberate rules change.
- Each failure gets a verdict line: CRASHED (the game threw, or the file is not JSON), DIVERGED (a stored move is refused now), CHANGED (the stored moves replay; the driver plays another game) with `- path = old` / `+ path = new` lines (`pathDiff`) between the final states of the two games; the count line adds the totals. `--update-golden` also pins the final state in `<name>.final` (optional: a golden without it still passes), so the same actions ending in another state are CHANGED with the path lines.
- Curated view: the module may export `view(state, content)`; the check then pins an 8-digit digest of it after createGame and every action in `<name>.digests` and reports `MOVED <name>` (first move that differs) and `view digests moved: a, b`. `--update-golden` writes the files. Causes (K79, opt-in): with an exported `causes` (engine-core `CauseCheck`) a golden with a counted event that has no cause fails (`NO CAUSE`, action and event named).

Record on one checkout, replay on another (a refactor or a performance change must replay the same):

- On the base: `node golden.ts record <out.json> --game <module>` plays the games and writes the options as given, the actions, and a state hash and an event hash after every action.
- On the head: `node golden.ts replay <out.json> --game <module>` applies the actions and prints, per game, the first action after which the state or the events differ, or that is refused.
- `record` exits 1 when a game does not start (`FAILED`, kept in the file) or stops on an error (`STOPPED`); a stop at `--cap` is marked and exits 0. `replay` also fails a game cut short (missing hashes, actions or games) and one whose stop reason differs.
- Every `contentHash` value is blanked before hashing, so a content change alone does not make every game differ.
- A base whose kit copy lacks `golden.ts` is recorded with the head's script and the base's `--game` module.

Flags: `--only <name prefix>`; `--games <export>` (another spec list than `goldens`, for a larger record set); `--seedx <text>` (appended to every seed: another sample); `--cap <n>` (stop each recorded game after n actions; a game that stops early is still recorded and replayed).
Exit codes: 0 all the same, 1 a golden or a game differs, 2 bad usage, an unreadable file or a module that does not load.

Not here: a driver answering again at replay.

## Use it in 10 lines

```sh
# the two modules to write are shaped like `fake-engine.ts` (`engine`) and `fake-golden.ts` (`simGame` + `goldens`) in this folder
node kit/replay-cli/replay.ts log.json --engine src/engine/replay-engine.ts   # the module exports `engine`
node kit/replay-cli/golden.ts check goldens --game src/engine/golden-game.ts  # every stored game must replay the same
```
