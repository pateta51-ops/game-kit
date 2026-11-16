# replay-cli

Headless replays, golden games and a determinism check across two checkouts. Needs `engine-core` and `sim-pool`.

## replay.ts: one log

`tsx replay.ts <log.json> (--engine <module> | --config <replay.json>) [--record <out.json>]`. The module exports `engine: { game, content(), format?, describe? }`. A log is a sealed save or a record with per-action hashes. Exit 0 same, 1 differs, 2 unusable.

## golden.ts: whole games

The game writes one module that exports `simGame` (the `sim-pool` contract), `goldens: GoldenSpec[]` and optionally `format` (its `SaveFormat`). A `GoldenSpec` is `{ name, driver, seed?, settings? }`; the seed is `golden-<name>` unless given; the list (which settings, which drivers) is the game's. Games are played as `sim-pool` plays them, so a golden equals the simulated game of the same seed and driver.

Golden games, as saves in a folder (`<name>.json`, fixed `savedAt`, one action per line):

- `tsx golden.ts check <dir> --game <module>`: plays every game again and compares the bytes. A failure says whether the stored game still replays (the driver changed) or not (the engine or the content changed) and names the first action that differs (stored and now); a missing file and a file with no game also fail. Run it in CI, or call `checkGoldens(mod, dir, nodeIo)` from a test.
- `--update-golden`: writes the files that changed, after a deliberate rules change.

Record on one checkout, replay on another (a refactor or a performance change must replay the same):

- On the base: `tsx golden.ts record <out.json> --game <module>` plays the games and writes the options as given, the actions, and a state hash and an event hash after every action.
- On the head: `tsx golden.ts replay <out.json> --game <module>` applies the actions and prints, per game, the first action after which the state or the events differ, or that is refused.
- `record` exits 1 when a game does not start (`FAILED`, kept in the file) or stops on an error (`STOPPED`); a stop at `--cap` is marked and exits 0. `replay` also fails a game cut short (missing hashes, actions or games) and one whose stop reason differs.
- Every `contentHash` value is blanked before hashing, so a content change alone does not make every game differ.
- A base whose kit copy lacks `golden.ts` is recorded with the head's script and the base's `--game` module.

Flags: `--only <name prefix>`; `--games <export>` (another spec list than `goldens`, for a larger record set); `--seedx <text>` (appended to every seed: another sample); `--cap <n>` (stop each recorded game after n actions; a game that stops early is still recorded and replayed).

Exit codes: 0 all the same, 1 a golden or a game differs, 2 bad usage, an unreadable file or a module that does not load.

Not here: checkpoint goldens (one projection per round, the driver answering again at replay).
