# engine-core: test and play helpers

## Test helpers

- `differentialApply(game, state, action, content)`: applies one action three ways (copy on write with freezing on, with freezing off on an unfrozen copy, full copy) and returns `{ state, events, problems }`; `problems` is empty when the input did not change and the three results are equal. A game drives the write paths its random games do not reach through it, with `setCowChecks(true)` around the test. It switches the engine's modes and puts them back: test code only.
- `kernel.property.test.ts` holds the kernel's properties on a fixture game (legal answers and `validateAction` agree both ways, invariants under random legal play, same seed and actions give the same hash). A game repeats them on its own rules with its own list of legal answers.

## Answers and play helpers (K25, K30)

- `enumerateAnswers(state)`: every answer `validateAction` accepts (each set of enabled ids from `min` to `max`, in option order); none when no prompt is open or the game is over.
- `firstPicks(state)`, `randomPicks(state, seed)` (seeded by the seed and prompt id), `playUntil(game, { state, events? }, content, stop, pick?, cap?)` (answers until `stop`, the end or `cap`; events accumulate), `expectEvents(events, key, ...types)` (throws unless the types occur in that order).
- `skipEmptyProblems(game, starts, content, auto, seed?, cap?)`: plays each start with `randomPicks`; at every prompt the game's skip-empty function `auto` answers (non-null), the answer must be the only legal one. Returns `{ autos, problems }`; a game's test expects `problems` empty and `autos` above zero.
- No test runner is imported: they throw plain errors. Source: 7th Inning Stretch.
