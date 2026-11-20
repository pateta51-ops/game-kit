# sim-pool

Plays N whole games of any `GameRules<G>` with a driver, in this thread or on worker threads, with crash-safe records and a resume file. Needs `engine-core`.

## Rules for agents

**What it does:** Plays many whole games of any `GameRules` with a driver, in-thread or on worker threads, with crash-safe records, a resume file, fuzzing with invariants, grid sweeps and a weight tuner.

**You must:**
1. Write one module that exports `simGame: SimGame<G, S>` (`rules`, `content()`, `start(spec, content)`, `driver(name, spec, content)`); the worker loads it by URL on plain Node, so its `.ts` imports name their extension (a bundled game passes `worker: <bundle URL>`).
2. Make a game a function of its spec (seed, driver, settings) only: keep no counters or caches between games in module variables (use `observation` and `onPrompt` for per-game notes). `fresh: true` shows any leak.
3. Take driver randomness only from the `DriverRng` passed to `choose`, never `state.rng`; a driver sees the player's view only (`botDriver(bot, view)`), never hidden state.
4. Run fuzz and invariants with `process.exitCode = await fuzzMain(process.argv.slice(2), module)`; exit 1 means findings (`exception`, `violation`, `runaway`, `endless`, `dead end`, `hidden-info`), each with seed, step and a replay line.
5. Put `codeVersion([...engine folders], root)` in the `runResumable` settings label; a resume file played with another label or version is refused.
6. Do not pass `until` to `runResumable` (it throws); use `--seed S --until N` in fuzz to replay one game.
7. Set `maxActions` for a game whose length is unusual (default 100,000; no result by then fails the game), and `gameTimeoutMs` (worker threads only) to stop a hung game.
8. For the hidden-shuffle check give `reshuffleHidden` on `SimGame` and pass `hidden: true`; without it the run throws.
9. Use `heavy run` or the game's npm script for long runs, not bare Node on the shared machine.

**Common mistakes:**
- A game whose result differs between a pool run and a single run: module state is carried between games.
- A driver with `stateful: true` in a hidden-info run: it is skipped, not checked.
- Tuning on 1,000 games at low win rates: that is noise; use 3,000 or more and `validate` on fresh seeds (training seeds are refused).
- A worker module that fails to load: the crash is charged to the next game and every game becomes a crash record.

A game writes one module that exports `simGame: SimGame<G, S>`:

- `rules`, `content()` (loaded once per thread), `start(spec, content)` → `{ options, rules }` for `createGame`.
- `driver(name, spec, content)` → `Driver<G>`: `choose(state, answers, rng)` → action, `reasons()`. The game's greedy and planner drivers live in the game; `randomDriver(weight?)` is here. K271: `Bot<V, A>` (`name`, `choose(view, answers, rng)`, `reasons?()`) is one bot shape for the sim and game-store (`botOpponent`); `botDriver(bot, view)` makes it a `Driver` that sees `view(state, prompt.seat)` only. K222: `bySeat({ a: driverA, b: driverB }, other?)` answers each prompt with the driver of its `prompt.seat` (`other` for no seat or an unlisted one, else it throws).
- `answers?(state, content, rng)`: the legal answers; default `legalAnswers(prompt, rng)` (subsets of enabled options, min..max; a prompt of kind `order` also gets every order; over 512, 512 samples).
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
- Grid sweep: `sweep({ module, cells: grid({ hit: [0, 0.5], run: [0, 1] }), games, driver, metrics: { runs: (r) => r.summary.runs }, workers, file, label, out? })` plays seeds `sweep-0..` in every cell through `runResumable`; returns `{ records, cells, csv }`, one CSV row per cell: the cell's settings, games, failed, and each metric's mean, `_sd`, `_se`. K200 tuner (tune.ts): `tune({ space, setups, play(weights, seed, setup) → { win, score? } or batch: poolBatch({ module, driver, workers, outcome }), out, tag, version, generations 15, population 24, elite 6, games 600, scoreWeight, keep, floor })`: a `WeightSpace` is name → start, step, min/max, `scale` (start × e^z), `fixed`; every set plays the same seeds `tune:<tag>:<gen>-i` per setup, the elite's mean and spread give the next generation; `<out>/best.json` (`WeightsFile`: weights, bounds, version, seed) and `gen-<n>.json` each generation, a stopped run resumes, another version is refused. A generation's best is optimistic: `validate({ candidate, baseline, setups, games, seed })` plays both on the same fresh seeds (training seeds refused) → per setup and over all: win rates, diff, paired se, z, 95 % low/high. Use 3,000+ games per setup at low win rates (1,000 is noise); test a log correlation by intervention (a weight changed, validated). Rule: an opponent the player faces decides from the player's own view only (no hidden state); a greedy that reads hidden state is a test pilot only.
- `SimRecord`: index, seed, driver, settings, result, actions, hash (of the action list), error, errorName, violations, log (failed games only), summary.
- An error or invariant violation fails that game only; a worker that dies becomes a crash record and a new worker goes on. A worker that dies before its first game (the module fails to load) charges the crash to the next game, so a broken module gives a run of crash records; one that dies after its last game loses nothing.
- Resume file: one JSON line per finished game; a stopped run continues; other settings are refused; crashes, a partial last line and corrupt lines are played again.
- Fuzz and invariant run: `process.exitCode = await fuzzMain(process.argv.slice(2), module, { settings? })`. `--games N --prefix P --driver D --workers N` plays `P-0..`, invariants on; findings are `exception`, `violation`, `runaway` (engine-core's task-loop guard) and `endless` (`maxActions`), each with seed, step and a replay line; exit 1 on any. `--seed S --until N` replays one game to step N (the driver still answers there, so the finding shows again); `runResumable` refuses `until`. `fuzz(module, options)` returns `{ records, findings }`; `settings(seed, driver)` draws a game's settings from its seed. Also a failure: no legal answer (`dead end`), `promptProblem(state)` returning text (a `TODO:` prompt), and with `undoCheck: true` an action that drew randomness (rng changed or `reseed`) without a `reveal` event (violation `bad-undo`). The game's own state assertion is its engine-core `invariants`, run after every action. `breakAt(game, content, spec, n | stop(state, actions))` → `{ history, state }`: the game stopped there as an engine-core `History` to import.
- Sanity bands: the game writes `SanityBands<S>` (records → `Band[]`: id, text, target, actual, pass); `formatBands(bands, skipIds)` → `{ lines, failed }`; a skipped band prints as INFO and is not counted. Exit 1 when `failed > 0`.
- Code version: `codeVersion(['src/engine', ...], root)` = git short id (or `nogit`) + a hash of those files and folders (uncommitted edits count, CRLF as LF, no `node_modules` or dot folders); `root` is the repository's top folder. Put it in the `runResumable` settings label and a resumed sweep refuses another version.
- Workers run `worker.ts` on plain node (the game module is loaded the same way: `.ts` imports name their extension); a bundled game passes `worker: <bundle URL>`. K101, opt-in: `view?(state, content)` and `hasten?(state, content)` → action on `SimGame`; `secrets?(state, content)` (K238): with `view: true` a view that holds one of those strings (value, key or whole word) fails the game (`view leak: ...`); `leakKeys?(state, content)` names key names it must not hold (opt-in: `['rng']`; `stack` may be a real zone); `view: true` (request, `fuzz`, `playOne` options) builds and serializes the view after setup and every action (a throw fails the game: `view after N action(s): ...`; `viewBytes` on the record is the largest); `hasten: N` (also `--hasten N`) applies the game's hasten action instead of the driver's after every N actions so late stages are reached. `replayStep(game, content, spec, step, { view?, hasten? }, top = 15)` replays one game to a step and returns `lines`: that step's ms (answers, choose, apply, view), the view size, and the slowest steps.
- K273 watchdog and report: `gameTimeoutMs` in the request (default off) stops a game that runs longer in wall-clock ms: its worker is terminated and the game becomes a failed record with `errorName: 'timeout'` (never checkpointed); the rest goes on. With it set, games always run on worker threads. `report(records, { winner?, first? })` → `{ games, completed, completedShare, failures: { timeout, crash, violation, error }, length: { min, median, max } (actions, completed games), winsBySeat, winShareBySeat, firstPlayer }`; `formatReport(r)` is the text. `winner` defaults to the result when a string or number, else `result.winner`.

```ts
import { formatReport, report, runGames } from '../kit/sim-pool/index'

const specs = [{ index: 0, seed: 'a', driver: 'random' }]
const records = await runGames({ module: new URL('./sim-game.ts', import.meta.url).href, specs, gameTimeoutMs: 60_000 }, 4)
console.log(formatReport(report(records, { first: () => 0 })))
```

## Use it in 10 lines

```ts
import { playOne, randomDriver, type SimGame } from '../kit/sim-pool/index'
import { CONTENT, COUNTER, RULES, type Counter } from '../kit/engine-core/fake/counter'

const simGame: SimGame<Counter> = {
  rules: COUNTER,
  content: () => CONTENT,
  start: (spec) => ({ options: { seed: spec.seed }, rules: RULES }),
  driver: () => randomDriver<Counter>(),
}
// the game's module exports `simGame`; runGames({ module, specs }, workers) plays many in worker threads
const record = playOne(simGame, CONTENT, { index: 0, seed: 's1', driver: 'random' })
console.log(record.result, record.actions)
```

## Hidden-shuffle check (K274, G06/T9)

Hidden information is otherwise only a convention. A game gives `reshuffleHidden(state, seat, rng, content)` on `SimGame`: a copy of the state with everything hidden from `seat` randomised but consistent (opponent hand and deck order shuffled together). With `hidden: true` (or a share 0..1; also `fuzz({ hidden })` and the `hidden` request field) the pool asks the deciding driver twice before each checked decision, on the real state and on the reshuffled one, with the same fresh `DriverRng` and the same answers; a different answer fails the game as `hidden-info: at step N seat S ...` and `fuzz` reports a finding of kind `hidden-info` (seed, step, driver). An honest `Bot` sees only the view, so it always passes. The check never touches the game's rng or actions (records are identical on and off) and runs before the real `choose`. It needs a pure `choose`: a driver with `stateful: true` is skipped.

```ts
import { playOne, randomDriver, type SimGame } from '../kit/sim-pool/index'
import { CONTENT, COUNTER, RULES, type Counter } from '../kit/engine-core/fake/counter'

const game: SimGame<Counter> = {
  rules: COUNTER,
  content: () => CONTENT,
  start: (spec) => ({ options: { seed: spec.seed }, rules: RULES }),
  driver: () => randomDriver<Counter>(),
  reshuffleHidden: (state) => ({ ...state, pile: [...state.pile].reverse() }),
}
const record = playOne(game, CONTENT, { index: 0, seed: 's1', driver: 'random' }, undefined, { hidden: true })
console.log(record.error ?? 'no hidden-info finding')
```
