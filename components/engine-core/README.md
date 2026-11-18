# engine-core

The kernel of a game engine: seeded random numbers, canonical JSON and hashes, the task runner with prompts, copy on write, replay, undo and the save format. A game passes one `GameTypes` bundle and a `GameRules<G>` (handlers, `blank`, `setup`, `contentHash`, optional `stamp`, `invariants`, `revealWords`); see `fake/counter.ts`. Import from one of the entry files below, never from an implementation module. Options legal but doing nothing (`idle`, K91): `idle.md`.

## Entry files (K278)

- `kernel.ts`: everything a game with no timing needs: `GameTypes` / `GameRules` and the other types, `createGame`, `applyAction`, `validateAction`, ctx, ids, RNG, copy on write, replay and hashes, undo by action and by step, saves, errors, object references, causes, legal tables and preview, `query`, `markIdle` (a handler marks an idle option).
- `timed.ts`: timing (`timing.ts`, `replace.ts`, `durations.ts`, `checkpoint.ts`, `triggers.ts`): batches, prevention, replacement, triggers, continuous effects, the checkpoint. Named `timed` because `timing.ts` is the implementation module.
- `tools.ts`: tests, sims and debugging: `answers.ts` (`enumerateAnswers`, `randomPicks`, `playUntil`, ...), `differentialApply`, `doesNothing` and `idleProblems`, debug actions.
- `index.ts`: all three; no name is in two entries (`entries.test.ts`).

## Parts

- Engine port (K390, `port.ts`): `EnginePort<G, W>` is what a game with its own engine passes to `card-harness` Scenario and `tutorial` (see their READMEs); `PortTypes`, `PortPrompt`, `PortAnswer`; `portAnswer` / `portSettle` (a step with its events, taken from `events(s)` past the previous count), `portOptions`, `portResult`; `kernelPort(rules, content, { start?, options?, gameRules?, put? })` wraps an engine-core game (events from `state.log`, so up to `LOG_CAP`).
- Prompts (K222): `ctx.ask(prompt, resume)` pushes `resume` and binds it to the prompt (`task.prompt` = the prompt id); the answer goes to that task, and an answer whose bound task is not on top is an `EngineBugError`. The old form (`ctx.then(resume)`, then `ctx.ask(prompt)`) still works but is deprecated; asking with no task pushed by the handler, `ctx.then` after `ask`, and a prompt nobody can answer (fewer enabled options than `min`, or `max < min`; the message names the prompt, its kind, seat and resume task, and the disabled options with their reasons) are `EngineBugError`s; a stale `prompt` tag left on another task is ignored. `KernelPrompt` has optional `kind` (what is asked) and `seat` (who answers, string or number; compare with `seatKey`, so 0 and '0' are one seat), read by prompt-host, sim-pool `bySeat`, opponent and learned-opponent; timing's default prompts carry `kind` `timing.prevent` / `timing.replace` / `timing.order` and the chooser as `seat`.
- Undo by action (`newHistory`, `recordAction`, `appendAction`, `undo`, `redo`, `canUndo`, `stateAt`) or by step (`newSteps`, `addStep`, `extendStep`, `undoStep`, `redoStep`, `canUndoStep`, `replaySteps`): `undo.md`.
- Saves (`createSave`, `restoreSave`, `importSave`, `exportSave`, `migrateSave`): `CreateSaveInput.state` (optional, K266) is sealed without a replay; it must be the state the log replays to, it is not checked on write, and an inconsistent one fails its hash on load.
- Recorded entropy (`AnswerAction.reseed`, `freshWords`), named random overrides and the undo bar (`setRngOverrides`, `randomWords`, K108): `random.md`.
- Test and play helpers (`differentialApply`, kernel properties, `enumerateAnswers`, `firstPicks`, `randomPicks`, `playUntil`, `expectEvents`, `skipEmptyProblems`, K25, K30; `outcomePicks` from `KernelOption.outcome`, K114): `helpers.md`.
- Step causes (`inCause`, `ruleCause`, `effectCause`, `causeProblems`, K79, opt-in; work queued with `ctx.then` inside `inCause` runs later without the cause): `cause.md`.
- Object references and last-known snapshots (`newObjectTrack`, `refOf`, `leaveZone`, `lastKnown`, K113, opt-in): `objref.md`.
- Barred options with reason codes, the only-option notice (`bar`, `blocked`, `onlyOne`, `askOrTake`, K88), the verb-to-ids table (`legalTable`, `legalIn`, K119) and outcome preview stopping at hidden information (`preview`, K89), opt-in: `legal.md`.
- Derived data on demand (K124, opt-in): `GameRules.queries` by name, read with `query(game, state, content, what, player?, arg?)` (an unknown name is a `GameSetupError`), so a view never carries it.
- Debug edits as engine actions (`DebugAction`: `set`, `force`, `close` and the game's `GameRules.debug` verbs; `debugVerbs`, K100, opt-in): `debug.md`. The console is `debug-console`.
- Timing (K93, K111, K94, K96, K112, K95, opt-in): batches of occurrences with `would`, `cancelBatch`, `ignoreBatch`, `insteadOf`, the prevention window (`Prevention` card data, `prevent`) the replacement loop (`Replacement`, `ReplaceResult`, `changeOccurrence`), triggers (`TriggerCandidate`, `PendingTrigger`, `DEFAULT_PRIORITY`, `enteredPlay`), `simultaneously`, continuous effects with durations (`addEffect`, `boundary`, `effectsOf`, `sumEffects`, `anyEffect`, K96) layered recompute (`layered`, `stampActive`, K112) and the checkpoint after every action (`cfg.checkpoint`: `derive`, `checks`, `RECOMPUTE_CAP`, K95); a game spreads `timingHandlers(cfg)` into its handlers: `timing.md`.

## Use it in 10 lines

```ts
import { applyAction, createGame, hashState } from '../kit/engine-core/kernel'
import { CONTENT, COUNTER, RULES } from '../kit/engine-core/fake/counter' // a tiny fake game; yours is a `GameRules<G>`

let { state } = createGame(COUNTER, { seed: 'demo' }, RULES, CONTENT)
const prompt = state.prompt! // the engine always waits on one prompt
state = applyAction(COUNTER, state, { kind: 'answer', promptId: prompt.id, picks: ['add'] }, CONTENT).state
console.log(state.counter, hashState(state)) // same seed and answers: same state and hash
```
