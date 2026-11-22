# engine-core

The kernel of a game engine: seeded random numbers, canonical JSON and hashes, the task runner with prompts, copy on write, replay, undo and the save format. A game passes one `GameTypes` bundle and a `GameRules<G>` (handlers, `blank`, `setup`, `contentHash`, optional `stamp`, `invariants`, `revealWords`); see `fake/counter.ts`. Import from one of the entry files below, never from an implementation module. Options legal but doing nothing (`idle`, K91): `idle.md`.

## Rules for agents

**What it does:** The game engine kernel: seeded random numbers, canonical JSON and hashes, tasks and prompts, copy on write, replay, undo and saves. A game passes `GameTypes` and `GameRules<G>`.

**You must:**
1. Import only from the entry files `kernel.ts`, `timed.ts`, `tools.ts` or `index.ts`, never an implementation module.
2. Use `ctx.rng` for all randomness; never `Math.random` or the clock (a game's lint preset fails it).
3. Open a prompt with `ctx.ask(prompt, resume)`: one prompt at a time, passing the `resume` task (or, with no `resume`, only after the handler pushed one itself), and with at least `min` enabled options. Violations throw `EngineBugError` naming the prompt.
4. Keep state plain data with finite numbers (`canonicalJson` throws otherwise) and change it only through copy on write (`own`).
5. Supply `contentHash`, `blank` and `setup`; a save whose content hash differs is refused on load.
6. Opt in to timing, debug, legal and queries by using their parts; add `GameRules.debug` for the debug console.
7. Keep `ordered` prompts small: test helpers enumerate every order (about 110k answers for 8 options).
8. A game with its own engine passes an `EnginePort` (`kernelPort` wraps this kernel) to card-harness and tutorial.
9. Compute a modified cost with `numberParts` before any payment plan, option label or can-pay check, and pass its `value` to all of them; none reads the printed cost.
10. Take every field of a `NumberOrder` (step order, setter rule, rounding, floor, cap) from the game's rulings; where they are silent, ask. Use `numberParts` for a stat or cost with set, add, multiply, floor or cap instead of a hand-written fold.

**Common mistakes:**
- Using the old `ctx.then` then `ctx.ask` form in new code: it is deprecated.
- A prompt nobody can answer (fewer enabled options than `min`): `EngineBugError`; give a legal option or skip the prompt.
- A derived value that keeps changing in the checkpoint: `EngineBugError` after the recompute cap.
- A modifier whose operation has no step in the `NumberOrder`, or a default floor or cap without its step: `EngineBugError`.
- Storing a modified number in state: read it at use, so an ended effect or a source that left stops counting.


## Entry files (K278)

- `kernel.ts`: everything a game with no timing needs: `GameTypes` / `GameRules` and the other types, `createGame`, `applyAction`, `validateAction`, ctx, ids, RNG, copy on write, replay and hashes, undo by action and by step, saves, errors, object references, causes, legal tables and preview, `query`, `markIdle` (a handler marks an idle option).
- `timed.ts`: timing (`timing.ts`, `replace.ts`, `durations.ts`, `checkpoint.ts`, `triggers.ts`): batches, prevention, replacement, triggers, continuous effects, the checkpoint, a number with its parts (`numbers.ts`). Named `timed` because `timing.ts` is the implementation module.
- `tools.ts`: tests, sims and debugging: `answers.ts` (`enumerateAnswers`, `randomPicks`, `playUntil`, ...), `differentialApply`, `doesNothing` and `idleProblems`, debug actions.
- `index.ts`: all three; no name is in two entries (`entries.test.ts`).

## Parts

- Engine port (K390, `port.ts`): `EnginePort<G, W>` is what a game with its own engine passes to `card-harness` Scenario and `tutorial` (see their READMEs); `PortTypes`, `PortPrompt`, `PortAnswer`; `portAnswer` / `portSettle` (a step with its events, taken from `events(s)` past the previous count), `portOptions`, `portResult`; `kernelPort(rules, content, { start?, options?, gameRules?, put? })` wraps an engine-core game (events from `state.log`, so up to `LOG_CAP`).
- Prompts (K222): `ctx.ask(prompt, resume)` pushes `resume` and binds it to the prompt (`task.prompt` = the prompt id); the answer goes to that task, and an answer whose bound task is not on top is an `EngineBugError`. The old form (`ctx.then(resume)`, then `ctx.ask(prompt)`) still works but is deprecated; asking with no task pushed by the handler, `ctx.then` after `ask`, and a prompt nobody can answer (fewer enabled options than `min`, or `max < min`; the message names the prompt, its kind, seat and resume task, and the disabled options with their reasons) are `EngineBugError`s; a stale `prompt` tag left on another task is ignored. `KernelPrompt` has optional `kind` (what is asked) and `seat` (who answers, string or number; compare with `seatKey`, so 0 and '0' are one seat), read by prompt-host, sim-pool `bySeat`, opponent and learned-opponent; timing's default prompts carry `kind` `timing.prevent` / `timing.replace` / `timing.order` and the chooser as `seat`.
- Undo by action (`newHistory`, `recordAction`, `appendAction`, `undo`, `redo`, `canUndo`, `stateAt`) or by step (`newSteps`, `addStep`, `extendStep`, `undoStep`, `redoStep`, `canUndoStep`, `replaySteps`); over an engine port by step (`newPortSteps`, `addPortStep`, `extendPortStep`, `undoPortStep`, `redoPortStep`, `canUndoPortStep`, `replayPortSteps`): `undo.md`.
- Saves (`createSave`, `restoreSave`, `importSave`, `exportSave`, `migrateSave`): `CreateSaveInput.state` (optional, K266) is sealed without a replay; it must be the state the log replays to, it is not checked on write, and an inconsistent one fails its hash on load.
- Recorded entropy (`AnswerAction.reseed`, `freshWords`), named random overrides and the undo bar (`setRngOverrides`, `randomWords`, K108): `random.md`.
- Test and play helpers (`differentialApply`, kernel properties, `enumerateAnswers`, `firstPicks`, `randomPicks`, `playUntil`, `expectEvents`, `skipEmptyProblems`, K25, K30; `outcomePicks` from `KernelOption.outcome`, K114): `helpers.md`.
- Step causes (`inCause`, `ruleCause`, `effectCause`, `causeProblems`, K79, opt-in; work queued with `ctx.then` inside `inCause` runs later without the cause): `cause.md`.
- Object references and last-known snapshots (`newObjectTrack`, `refOf`, `leaveZone`, `lastKnown`, K113, opt-in): `objref.md`.
- Barred options with reason codes, the only-option notice (`bar`, `blocked`, `onlyOne`, `askOrTake`, K88), the verb-to-ids table (`legalTable`, `legalIn`, K119) and outcome preview stopping at hidden information (`preview`, K89), opt-in: `legal.md`.
- Derived data on demand (K124, opt-in): `GameRules.queries` by name, read with `query(game, state, content, what, player?, arg?)` (an unknown name is a `GameSetupError`), so a view never carries it.
- Debug edits as engine actions (`DebugAction`: `set`, `force`, `close` and the game's `GameRules.debug` verbs; `debugVerbs`, K100, opt-in): `debug.md`. The console is `debug-console`.
- Timing (K93, K111, K94, K96, K112, K95, opt-in): batches of occurrences with `would`, `cancelBatch`, `ignoreBatch`, `insteadOf`, the prevention window (`Prevention` card data, `prevent`) the replacement loop (`Replacement`, `ReplaceResult`, `changeOccurrence`), triggers (`TriggerCandidate`, `PendingTrigger`, `DEFAULT_PRIORITY`, `enteredPlay`), `simultaneously`, continuous effects with durations (`addEffect`, `boundary`, `effectsOf`, `sumEffects`, `anyEffect`, K96) layered recompute (`layered`, `stampActive`, K112) and the checkpoint after every action (`cfg.checkpoint`: `derive`, `checks`, `RECOMPUTE_CAP`, K95); a game spreads `timingHandlers(cfg)` into its handlers: `timing.md`.
- A number with its parts (K526, `numbers.ts`, opt-in): `numberParts(base, modifiers, order, opts?)` applies `NumberModifier`s (set, add, multiply, floor, cap; own minimum, per-unit count, condition, scope) in the game's `NumberOrder` and returns the value with `parts` (`{ source, op, amount, applied }`), the floor or cap that bit (`bound`) and, on request, what changed nothing; `effectModifiers` maps the lasting effects (`effectsOf`) onto modifiers; `partsDirection`. For stats, costs, payment, `bar` reasons and a breakdown on screen: [numbers.md](numbers.md).

## Use it in 10 lines

```ts
import { applyAction, createGame, hashState } from '../kit/engine-core/kernel'
import { enumerateAnswers } from '../kit/engine-core/tools'
import { CONTENT, COUNTER, RULES } from '../kit/engine-core/fake/counter' // a tiny fake game; yours is a `GameRules<G>`

let { state } = createGame(COUNTER, { seed: 'demo' }, RULES, CONTENT)
const prompt = state.prompt! // the engine always waits on one prompt
state = applyAction(COUNTER, state, { kind: 'answer', promptId: prompt.id, picks: ['add'] }, CONTENT).state
console.log(state.counter, hashState(state)) // same seed and answers: same state and hash
console.log(enumerateAnswers(state, (_s, a) => !a.picks.includes('draw'))) // every legal answer (every order when the prompt is `ordered`), minus those `valid` refuses
```

Cost: an `ordered` prompt lists every order of every pick set (about 110k answers for 8 options, 9.8M for 10), and `valid` filters after the list is built. Keep ordered prompts small or enumerate in the game.
