# sim-pool

Plays N whole games of any `GameRules<G>` with a driver, in this thread or on worker threads, with crash-safe records and a resume file. Needs `engine-core`.

A game writes one module that exports `simGame: SimGame<G, S>`:

- `rules`, `content()` (loaded once per thread), `start(spec, content)` → `{ options, rules }` for `createGame`.
- `driver(name, spec, content)` → `Driver<G>`: `choose(state, answers, rng)` → action, `reasons()`. The game's greedy and planner drivers live in the game; `randomDriver(weight?)` is here.
- `answers?(state, content, rng)`: the legal answers; default `legalAnswers(prompt, rng)` (subsets of enabled options, min..max; over 512, 512 samples).
- `summary?(state, actions, content)` → `S`: the game's own counters, stored on each record.
- `maxActions?` (default 100,000): a game with no result by then fails.

Run it:

```ts
const records = await runGames({ module: new URL('./sim-game.ts', import.meta.url).href, specs }, workers);
const all = await runResumable(request, workers, 'run.jsonl', settingsLabel);
```

- `GameSpec`: `{ index, seed, driver, settings? }`. Records come back in index order, the same for any worker count.
- Driver random numbers: `DriverRng` keyed by seed, driver and prompt id; never the game's `state.rng`.
- `SimRecord`: index, seed, driver, settings, result, actions, hash (of the action list), error, violations, log (failed games only), summary.
- An error or invariant violation fails that game only; a worker that dies becomes a crash record and a new worker goes on. A worker that dies before its first game (the module fails to load) charges the crash to the next game, so a broken module gives a run of crash records; one that dies after its last game loses nothing.
- Resume file: one JSON line per finished game; a stopped run continues; other settings are refused; crashes, a partial last line and corrupt lines are played again.
- Workers run `worker.ts` under tsx (the game needs `tsx`); a bundled game passes `worker: <bundle URL>`.
