# sim-pool

Plays N whole games of any `GameRules<G>` with a driver, in this thread or on worker threads, with crash-safe records and a resume file. Needs `engine-core`.

A game writes one module that exports `simGame: SimGame<G, S>`:

- `rules`, `content()` (loaded once per thread), `start(spec, content)` → `{ options, rules }` for `createGame`.
- `driver(name, spec, content)` → `Driver<G>`: `choose(state, answers, rng)` → action, `reasons()`. The game's greedy and planner drivers live in the game; `randomDriver(weight?)` is here.
- `answers?(state, content, rng)`: the legal answers; default `legalAnswers(prompt, rng)` (subsets of enabled options, min..max; over 512, 512 samples).
- `summary?(state, actions, content, seen)` → `S`: the game's own counters, stored on each record. `observation?(spec, content)` → a new `seen` per game; `onPrompt?(seen, state, answers)` at every open prompt before the driver answers (per-game notes go there, never in module variables).
- `maxActions?` (default 100,000): a game with no result by then fails.

Run it:

```ts
const records = await runGames({ module: new URL('./sim-game.ts', import.meta.url).href, specs }, workers);
const all = await runResumable(request, workers, 'run.jsonl', settingsLabel);
```

- `GameSpec`: `{ index, seed, driver, settings? }`. Records come back in index order, the same for any worker count.
- Driver random numbers: `DriverRng` keyed by seed, driver and prompt id; never the game's `state.rng`.
- A game is a function of its spec (seed, driver, settings) only, whatever its index and the games before it on the worker. To replay one alone pass the same three. `fresh: true` in the request gives every game a worker of its own: records that differ from a plain run mean the game's module (a driver cache, counters) keeps something between games.
- Grid sweep: `sweep({ module, cells: grid({ hit: [0, 0.5], run: [0, 1] }), games, driver, metrics: { runs: (r) => r.summary.runs }, workers, file, label, out? })` plays seeds `sweep-0..` in every cell through `runResumable`; returns `{ records, cells, csv }`, one CSV row per cell: the cell's settings, games, failed, and each metric's mean, `_sd`, `_se`.
- `SimRecord`: index, seed, driver, settings, result, actions, hash (of the action list), error, errorName, violations, log (failed games only), summary.
- An error or invariant violation fails that game only; a worker that dies becomes a crash record and a new worker goes on. A worker that dies before its first game (the module fails to load) charges the crash to the next game, so a broken module gives a run of crash records; one that dies after its last game loses nothing.
- Resume file: one JSON line per finished game; a stopped run continues; other settings are refused; crashes, a partial last line and corrupt lines are played again.
- Fuzz and invariant run: `process.exitCode = await fuzzMain(process.argv.slice(2), module, { settings? })`. `--games N --prefix P --driver D --workers N` plays `P-0..`, invariants on; findings are `exception`, `violation`, `runaway` (engine-core's task-loop guard) and `endless` (`maxActions`), each with seed, step and a replay line; exit 1 on any. `--seed S --until N` replays one game to step N (the driver still answers there, so the finding shows again); `runResumable` refuses `until`. `fuzz(module, options)` returns `{ records, findings }`; `settings(seed, driver)` draws a game's settings from its seed. Also a failure: no legal answer (`dead end`), `promptProblem(state)` returning text (a `TODO:` prompt), and with `undoCheck: true` an action that drew randomness (rng changed or `reseed`) without a `reveal` event (violation `bad-undo`). The game's own state assertion is its engine-core `invariants`, run after every action. `breakAt(game, content, spec, n | stop(state, actions))` → `{ history, state }`: the game stopped there as an engine-core `History` to import.
- Sanity bands: the game writes `SanityBands<S>` (records → `Band[]`: id, text, target, actual, pass); `formatBands(bands, skipIds)` → `{ lines, failed }`; a skipped band prints as INFO and is not counted. Exit 1 when `failed > 0`.
- Code version: `codeVersion(['src/engine', ...], root)` = git short id (or `nogit`) + a hash of those files and folders (uncommitted edits count, CRLF as LF, no `node_modules` or dot folders); `root` is the repository's top folder. Put it in the `runResumable` settings label and a resumed sweep refuses another version.
- Workers run `worker.ts` under tsx (the game needs `tsx`); a bundled game passes `worker: <bundle URL>`. K101, opt-in: `view?(state, content)` and `hasten?(state, content)` → action on `SimGame`; `view: true` (request, `fuzz`, `playOne` options) builds and serializes the view after setup and every action (a throw fails the game: `view after N action(s): ...`; `viewBytes` on the record is the largest); `hasten: N` (also `--hasten N`) applies the game's hasten action instead of the driver's after every N actions so late stages are reached. `replayStep(game, content, spec, step, { view?, hasten? }, top = 15)` replays one game to a step and returns `lines`: that step's ms (answers, choose, apply, view), the view size, and the slowest steps.
