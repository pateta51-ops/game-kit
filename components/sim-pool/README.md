# sim-pool

Plays N whole games of any `GameRules<G>` with a driver, in this thread or on worker threads, with crash-safe records and a resume file. Needs `engine-core`.

## Rules for agents

<!-- hooks: written by scripts/catalog.mjs from docs/catalog-notes.json; do not edit -->
**Hooks a game calls:**
- `simGame`: the module that plays one game for the pool
- `runGames`: play many whole games on worker threads
- `fuzzMain`: fuzz games with invariants and report each finding with a seed
- `randomDriver` + `legalAnswers`: random answers from the legal options
- `botDriver`: a driver that sees the player view only
- `runResumable` + `codeVersion`: a long run that resumes after a crash
- `tune` + `validate`: tune weights, then check on fresh seeds
- `proveResolved` + `provenClauses`: prove each clause resolved in a played game
- `dispatchTrace`: count a clause resolved only when verb dispatch ran it, not in a dry run
<!-- /hooks -->

**Which entry (K723):** browser or UI code imports `sim-pool/browser.ts` (`DriverRng`, `legalAnswers`, `randomDriver`, `botDriver`, `Bot`, `Driver`, `bySeat`, `ANSWER_CAP`, `GameSpec`, `SimGame`; no `node:` module). Node scripts keep `sim-pool/index.ts` (everything, including pool and worker). You must never import `index.ts` from code vite serves to a browser.

**What it does:** Plays many whole games of any `GameRules` with a driver, in-thread or on worker threads, with crash-safe records, a resume file, fuzzing with invariants, grid sweeps and a weight tuner.

**You must:**
1. Write one module that exports `simGame: SimGame<G, S>` (`rules`, `content()`, `start(spec, content)`, `driver(name, spec, content)`); the worker loads it by URL on plain Node, so its `.ts` imports name their extension (a bundled game passes `worker: <bundle URL>`).
2. Make a game a function of its spec (seed, driver, settings) only: keep no counters or caches between games in module variables (use `observation` and `onPrompt` for per-game notes). `fresh: true` shows any leak.
3. Take driver randomness only from the `DriverRng` passed to `choose`, never `state.rng`; a driver sees the player's view only (`botDriver(bot, view)`), never hidden state.
4. Run fuzz and invariants with `process.exitCode = await fuzzMain(process.argv.slice(2), module)`; a game with strict engine invariants reports the same structured violations as a diagnostic game; exit 1 means findings (`exception`, `violation`, `runaway`, `endless`, `dead end`, `hidden-info`), each with seed, step and a replay line.
5. Put `codeVersion([...engine folders], root)` in the `runResumable` settings label; a resume file played with another label or version is refused.
6. Do not pass `until` to `runResumable` (it throws); use `--seed S --until N` in fuzz to replay one game.
7. Set `maxActions` for a game whose length is unusual (default 100,000; no result by then fails the game), and `gameTimeoutMs` (worker threads only) to stop a hung game.
8. For the hidden-shuffle check give `reshuffleHidden` on `SimGame` and pass `hidden: true`; without it the run throws.
9. Use `heavy run` or the game's npm script for long runs, not bare Node on the shared machine.
10. For the whole-game report (K490) pass `whole: { clauses, group? }` (or `true`) in `fuzzMain`'s options and give `trace(content)` on `SimGame` (card-harness `traceAbilities` over the registry the engine plays from, built in `content()`); without `trace` no record has `resolved` and every listed clause fails as never resolved. Set `gameTimeoutMs` in the options too: without it a game that hangs inside one action stalls the run; with it the game is a `timeout` record, counted unfinished with its seed (a crashed worker's game too).
11. Answer with the engine's own options: `randomDriver` over the default `legalAnswers` (the prompt's enabled options) is the legal-move driver; a game `answers` override replaces those options.
12. (K651) For the unreached list pass `whole: { clauses, unreached, proof }`: `unreached` is `[{ clause, why }]`, and `proof` must come from `provenClauses({ log, root, clauses, sources })` over the log that `proveResolved(log, trace, clause)` (`kit/sim-pool/prove`, test code: vitest plus card-harness `trace.ts`) wrote in the card test run just before, never a hand-written object; a stale or foreign log fails the check. A listed clause that resolved fails as stale; one with no proof fails. Give `changed(clause, before, after, content)` on `SimGame` so a resolve counts only when the effect moved something, and give `effects` on the trace (state before and after each effect) so it judges each effect, not the whole action; pass `rounds: { games, max?, settings(seed, driver, unreached) }` to steer coverage rounds (they stop when a round adds no clause, or at `max`, default 10); pass `findings: <path>` and replay one failure with `--finding <seed>` (its recorded settings, not the seed's).
13. (K666) A game without a kit registry passes `proveResolved(log, clauseTrace(gameLog, clauseOf, changed?), clause)`: `clauseOf` maps each entry of its own log to `{ clause, step, kind: 'resolved' | 'applied', before?, after? }`; an `applied` step proves a static clause only when `changed` (default: before and after differ) says it had an effect, and only when the step carries both `before` and `after`; a trace not returned by `clauseTrace` is refused. Build the trace from what the engine wrote in the test, never a hand-written list of steps.
14. (K708) When the engine reads a record's `effects` outside a real resolve (a dry-run offer check, a preview, a passive scan), build the trace with `dispatchTrace(registry, probe, kind?)` instead of card-harness `traceAbilities`: `registry` and `considered` are the same, but `resolved` holds only the ids the game's verb dispatch noted on `probe` (`probe.note({ kind: 'clause', id })`, outside dry run only; `kind` default `clause`); `probe` is anything with `listen(fn)` returning a stop (card-harness `createProbe` from K707). It fits `SimGame.trace`, `expectResolved` and `proveResolved`; call `stop()` when the trace is dropped. Tests: `k708.test.ts`.

**Common mistakes:**
- A game whose result differs between a pool run and a single run: module state is carried between games.
- A driver with `stateful: true` in a hidden-info run: it is skipped, not checked.
- Tuning on 1,000 games at low win rates: that is noise; use 3,000 or more and `validate` on fresh seeds (training seeds are refused).
- A worker module that fails to load: the crash is charged to the next game and every game becomes a crash record.
- A whole-game report with `--until`: it is not printed (a stopped game is not unfinished).

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
- Fuzz and invariant run: `process.exitCode = await fuzzMain(process.argv.slice(2), module, { settings? })`. `--games N --prefix P --driver D --workers N` plays `P-0..`, invariants on; findings are `exception`, `violation`, `runaway` (engine-core's task-loop guard) and `endless` (`maxActions`), each with seed, step and a replay line; exit 1 on any. `--seed S --until N` replays one game to step N (the driver still answers there, so the finding shows again); `runResumable` refuses `until`. `fuzz(module, options)` returns `{ records, findings }`; `settings(seed, driver)` draws a game's settings from its seed. Also a failure: no legal answer (`dead end`), `promptProblem(state)` returning text (a `TODO:` prompt), and with `undoCheck: true` an action that drew randomness (rng changed or `reseed`) without a `reveal` event (violation `bad-undo`). The game's engine-core `invariants` run after settled setup and every action. Strict refusals and returned diagnostic violations both fail the run. `breakAt(game, content, spec, n | stop(state, actions))` → `{ history, state }`: the game stopped there as an engine-core `History` to import.
- Whole-game report (K490, opt-in): `fuzzMain(args, module, { whole: { clauses, group } })` prints after the findings `whole-game report:`, per group `<group>: F of S games finished`, findings by kind each with `seed S step N: replay --seed ...`, `clauses resolved: N`, then its failures, and exits 1 on any: `<mode>/<tier>: 3 of 200 games did not finish (seeds ...)` and `never resolved: <clause ids>`. `group(record)` defaults to `<settings.mode>/<settings.tier>` (`-` when unset); a game finishes with a result and no error or violation. `SimGame.trace(content)` → `{ resolved, clear() }` (card-harness `AbilityTrace` fits): cleared before each game, its ids stored sorted on the record as `resolved`, so the report merges them across workers. `wholeGame(fuzzRun, options)` → `{ groups, byKind, resolved, neverResolved, failures }`; `formatWholeGame(w)` the lines. Not printed with `--until`.
- Sanity bands: the game writes `SanityBands<S>` (records → `Band[]`: id, text, target, actual, pass); `formatBands(bands, skipIds)` → `{ lines, failed }`; a skipped band prints as INFO and is not counted. Exit 1 when `failed > 0`.
- Code version: `codeVersion(['src/engine', ...], root)` = git short id (or `nogit`) + a hash of those files and folders (uncommitted edits count, CRLF as LF, no `node_modules` or dot folders); `root` is the repository's top folder. Put it in the `runResumable` settings label and a resumed sweep refuses another version.
- Workers run `worker.ts` on plain node (the game module is loaded the same way: `.ts` imports name their extension); a bundled game passes `worker: <bundle URL>`. K101, opt-in: `view?(state, content)` and `hasten?(state, content)` → action on `SimGame`; `secrets?(state, content)` (K238): with `view: true` a view that holds one of those strings (value, key or whole word) fails the game (`view leak: ...`); `leakKeys?(state, content)` names key names it must not hold (opt-in: `['rng']`; `stack` may be a real zone); `view: true` (request, `fuzz`, `playOne` options) builds and serializes the view after setup and every action (a throw fails the game: `view after N action(s): ...`; `viewBytes` on the record is the largest); `hasten: N` (also `--hasten N`) applies the game's hasten action instead of the driver's after every N actions so late stages are reached. K737: a driver's `choose` and `hasten` may return an engine-core `DebugAction` (type `G['action'] | DebugAction`, no cast; applied and recorded like any action); `randomDebug?(state, content, rng)` returns `DebugAction | undefined` on `SimGame` (the game invents the edit; `rng` is seeded, so a replay repeats it) and `debug: N` (also `--debug N`, and a `replayStep` option) applies it instead of the driver's answer after every N play actions, only when `GameRules.debug` is set; no hook or no `GameRules.debug` means no change. `replayStep(game, content, spec, step, { view?, hasten? }, top = 15)` replays one game to a step and returns `lines`: that step's ms (answers, choose, apply, view), the view size, and the slowest steps.
- K273 watchdog and report: `gameTimeoutMs` in the request (default off) stops a game that runs longer in wall-clock ms: its worker is terminated and the game becomes a failed record with `errorName: 'timeout'` (never checkpointed); the rest goes on. With it set, games always run on worker threads. `report(records, { winner?, first? })` → `{ games, completed, completedShare, failures: { timeout, crash, violation, error }, length: { min, median, max } (actions, completed games), winsBySeat, winShareBySeat, firstPlayer }`; `formatReport(r)` is the text. `winner` defaults to the result when a string or number, else `result.winner`.

```ts
import { formatReport, report, runGames } from '../kit/sim-pool/index'

const specs = [{ index: 0, seed: 'a', driver: 'random' }]
const records = await runGames({ module: new URL('./sim-game.ts', import.meta.url).href, specs, gameTimeoutMs: 60_000 }, 4)
console.log(formatReport(report(records, { first: () => 0 })))
```

## Unreached list, coverage rounds, findings file (K651)

Proof comes from what ran, not from test text. In each full-resolve card test of a clause no game reaches, call `proveResolved(log, trace, clause)` from `kit/sim-pool/prove` (test code: it imports vitest and card-harness's `trace.ts` only; the sim-pool index never loads it). It runs card-harness's `expectResolved` (the test fails unless the clause ran) and, once the test finished passing, appends `{ clause, file, test, root, at }` to `log`; an `it.fails` test, a failed test, or a test that never calls it (an `expect` with no matcher, a bound that always holds, an `expect` inside an `if`) records nothing. `provenClauses({ log, root, clauses, sources })` → `{ proven, problems }`: a record counts only when its `root` equals `root` exactly and it is newer than its test file and every path in `sources`; else `proof log <log>: <clause> was recorded under <root>, not this project <root>` or `... was recorded before its test or a source changed: run the card tests again`; a missing log is a problem too. Delete the log before the card test run.

`wholeGame` with `unreached` and `proof`: a clause no game resolved passes only when listed and proven; failures `stale unreached entry (resolved in a game): <ids>`, `unreached with no counted full-resolve test: <ids>`, and each proof problem; `WholeGame` gains `proven`, `stale`, `unproven`, `noOp` (resolved only with no change) and `rounds`. `SimGame.changed` judges each effect when the trace gives `effects` (`{ clause, before, after }` per effect, written by the game's engine, which alone knows where one effect ends); without them it judges the whole action, so a no-op clause counts when another effect of the same action moves the part it reads (engine-core gives sim-pool no per-effect boundary). Ids without an entry resolved in setup or between actions count unchecked. `coverRounds(module, options, clauses, rounds, firstRun)` plays rounds of seeds `<prefix>-r<k>-<n>`; `fuzzMain` prints `coverage round K: N games, +A clause(s), U unreached` and how it stopped. `findings` writes `FindingEntry[]` (the finding with its game's settings); `--finding S` prints the replayed finding and `finding S: the same failure again` (exit 1), `fails differently (...)` (exit 1) or `no longer fails` (exit 0); an unknown seed exits 2.

```ts
import { fuzzMain, provenClauses } from '../kit/sim-pool/index'

const clauses = ['add', 'draw', 'noop', 'rare', 'never'] // every printed clause id
// the card tests ran first; each full-resolve test of a listed clause called proveResolved('.cache/proof.jsonl', trace, clause)
const proof = provenClauses({ log: '.cache/proof.jsonl', root: process.cwd(), clauses, sources: ['src'] })
const unreached = [{ clause: 'never', why: 'no game deals it' }]
const rounds = { games: 30, settings: (_seed: string, _driver: string, left: readonly string[]) => (left.includes('rare') ? { steer: 'rare' } : {}) }
const module = new URL('../kit/sim-pool/fake/coverage.ts', import.meta.url).href // yours: the module exporting simGame
process.exitCode = await fuzzMain(process.argv.slice(2), module, { whole: { clauses, unreached, proof, rounds, findings: 'tests/whole-game/findings.json' } })
// replay one failure with its recorded settings: the same script with --finding <seed>
```

## Trace from a game's own log (K666)

A game whose clauses do not run through a kit registry passes `proveResolved` a `ClauseTrace` in place of the registry trace: `{ steps, changed? }`, where `steps` is a list of `ClauseStep` `{ clause, step, kind: 'resolved' | 'applied', before?, after? }`. Build it with `clauseTrace(entries, clauseOf, changed?)`: `clauseOf(entry, index)` maps each entry of the game's own log to a step, a list of steps, or `undefined`. A `resolved` step proves its clause. An `applied` step (a static or passive clause: a modifier that changes a value, a rule check) proves it only when `changed(clause, before, after)` is true (the K651 `changed` rule; default: `before` and `after` are not deep-equal), so applied with no effect proves nothing and the test fails with `Not resolved: <id> (applied with no effect)`; an `applied` step missing `before` or `after` proves nothing (`(applied without before and after)`); a clause with no step fails with `(not in the trace)`. Only a trace returned by `clauseTrace` is accepted: a hand-built `{ steps }` object throws `proveResolved: build the trace with clauseTrace(), not by hand`. The record and its rules are K651's: written only when the test passed and is not `it.fails`, under this project root, read back by `provenClauses`. A registry trace works as before.

```ts
import { clauseTrace, proveResolved, type ClauseStep } from '../kit/sim-pool/prove'

// the game's own log of one card test (in a test: the engine wrote it while the test played)
const gameLog = [
  { step: 1, card: 'c12', did: 'gain', value: [2, 5] },
  { step: 2, card: 'c30', did: 'modify', value: [4, 3] }, // a static cost modifier: 4 became 3
]
const trace = clauseTrace(gameLog, (e): ClauseStep => ({ clause: `${e.card}-1`, step: e.step, kind: e.did === 'modify' ? 'applied' : 'resolved', before: e.value[0], after: e.value[1] }))
proveResolved('.cache/proof.jsonl', trace, 'c12-1', 'c30-1')
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
