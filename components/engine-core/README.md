# engine-core

The kernel of a game engine: seeded random numbers, canonical JSON and hashes, the task runner with prompts, copy on write, replay, undo and the save format. A game passes one `GameTypes` bundle and a `GameRules<G>` (handlers, `blank`, `setup`, `contentHash`, optional `stamp`, `invariants`, `revealWords`); see `fake/counter.ts`. Import from `index.ts` only. Options legal but doing nothing (`idle`, K91): `idle.md`.

## Parts

- Undo by action (`newHistory`, `recordAction`, `appendAction`, `undo`, `redo`, `canUndo`, `stateAt`) or by step (`newSteps`, `addStep`, `extendStep`, `undoStep`, `redoStep`, `canUndoStep`, `replaySteps`): `undo.md`.
- Recorded entropy (`AnswerAction.reseed`, `freshWords`), named random overrides and the undo bar (`setRngOverrides`, `randomWords`, K108): `random.md`.
- Test and play helpers (`differentialApply`, kernel properties, `enumerateAnswers`, `firstPicks`, `randomPicks`, `playUntil`, `expectEvents`, `skipEmptyProblems`, K25, K30): `helpers.md`.
- Step causes (`inCause`, `ruleCause`, `effectCause`, `causeProblems`, K79, opt-in; work queued with `ctx.then` inside `inCause` runs later without the cause): `cause.md`.
- Object references and last-known snapshots (`newObjectTrack`, `refOf`, `leaveZone`, `lastKnown`, K113, opt-in): `objref.md`.
