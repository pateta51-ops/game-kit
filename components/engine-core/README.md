# engine-core

The kernel of a game engine: seeded random numbers, canonical JSON and hashes, the task runner with prompts, copy on write, replay, undo and the save format. A game passes one `GameTypes` bundle and a `GameRules<G>` (handlers, `blank`, `setup`, `contentHash`, optional `stamp`, `invariants`, `revealWords`); see `fake/counter.ts`. Import from `index.ts` only.

## Undo

- **By action** (`newHistory`, `recordAction`, `appendAction`, `undo`, `redo`, `canUndo`, `stateAt`): the options, the actions and a cursor; every move replays from the start.
- **By step** (`newSteps`, `addStep`, `extendStep`, `undoStep`, `redoStep`, `canUndoStep`, `replaySteps`): a step is one decision of the player plus the answers the settings gave after it, so one Undo takes back what one click did. The two are separate; use one.
  - `newSteps(state, actions?, { keep, every })` starts at a state (undo never goes before it). `addStep` for the player's answer, `extendStep` for each answer the game gave for the player (it joins the top step; before any step, the start of the game). Each returns `{ ok, history, events, error }`; the state is `history.state`, the recorded game `history.actions`.
  - The newest `keep` steps (default 60) hold the state before them, older ones every `every`-th (default 20, 0 for none); the rest are replayed from the nearest one kept.
  - `canUndoStep(h, mode, { afterGameOver })`: Safe refuses a step that revealed something, with `revealWords`; Free allows it (`peek`) and sets `undoUsed`, and `peeked` when it did reveal. After game over undo is refused unless `afterGameOver` is true.
  - Nothing is saved by the kit. To get the same steps after a reload, the game stores `history.steps.map((s) => s.start)` in its own data and calls `replaySteps(game, options, rules, actions, content, starts)`; `starts` may instead be a function `(state, action, index) => boolean` saying the answer was the player's.

## Non-deterministic play: recorded entropy

`AnswerAction` has an optional `reseed: RngWords`. When present, the kernel replaces `state.rng` with those words before the answer resolves; when absent nothing changes (saves, replays and goldens stay byte for byte the same). The words are part of the recorded action, so `replay`, `createSave`, `restoreSave` and `redo` reproduce the same game. `validateAction` refuses malformed words (`BAD_RESEED`). `freshWords()` (app side, uses `crypto.getRandomValues`; the kernel stays pure) returns four 32-bit words; the game's app decides when to attach `reseed`, e.g. `{ ...answer, reseed: freshWords() }`. `undo` is unchanged.

## Test helpers

- `differentialApply(game, state, action, content)`: applies one action three ways (copy on write with freezing on, with freezing off on an unfrozen copy, full copy) and returns `{ state, events, problems }`; `problems` is empty when the input did not change and the three results are equal. A game drives the write paths its random games do not reach through it, with `setCowChecks(true)` around the test. It switches the engine's modes and puts them back: test code only.
- `kernel.property.test.ts` holds the kernel's properties on a fixture game (legal answers and `validateAction` agree both ways, invariants under random legal play, same seed and actions give the same hash). A game repeats them on its own rules with its own list of legal answers.
