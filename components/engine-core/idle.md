# Does nothing, apart from legal (K91, opt-in)

Source: netrunner `:change-in-game-state` (`src/clj/game/core/engine.clj`, MIT), design only.

- `KernelOption.idle?: string`: the option is legal (`enabled` stays true, `validateAction` does not read `idle`) but choosing it changes nothing; the words say why. The UI warns on it (or greys it with the words) and never hides it; when chosen, the game resolves it as it says (costs paid if the rules say so) and logs that it did nothing, never swallowing it.
- `markIdle(options, why)`: sets `idle` on the options for which the game's `why(id)` returns words.
- `doesNothing(game, state, picks, content, view)`: probes the answer on the real engine (the input state is not changed) and compares `view` before and after with canonical JSON. `view` is what counts as the game: the game leaves out its bookkeeping (turn or prompt counters, the log, the open prompt) and keeps what a player would call a change.
- `idleProblems(game, state, content, view)`: for a one-pick prompt, probes every enabled option and lists the marks that lie (unmarked but changes nothing, marked but changes the game). A test runs it over seeded games, like the kernel properties; `[]` is a pass.
- The probe runs the action, so it reads hidden information and randomness: use it in tests, not to decide what the player sees.
