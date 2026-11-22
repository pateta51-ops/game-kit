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
9. Compute a modified cost with `numberParts` before any payment plan, option label or can-pay check of the game, and pass its `value` to all of them. On `card-language`'s verb pack return it from `cardPack({ due })` (K583); without `due` the pack reads the printed amount of a cost step.
10. Take every field of a `NumberOrder` (step order, setter rule, rounding, floor, cap) from the game's rulings; where they are silent, ask. Use `numberParts` for a stat or cost with set, add, multiply, floor or cap instead of a hand-written fold.
11. Pass `opts.of` whenever a modifier names an `of`, and read which bound holds from `bounds` (`holds`), not from `bound`. Tell two modifiers of one source apart by `ref`.
12. Mark an option the answering player has not seen (a face-down card, an unrevealed option) with `unseen: true`: when it is the only legal answer, `onlyOne` returns null and `askOrTake` asks instead of taking it (K641). The game, or the part that builds the prompt, sets `unseen` on every option over a hidden thing; nothing in the kernel sets it (card-language will set it for hidden picks in its own row).
13. End an effect that lasts "for this combat" or "until the next X" with `{ until: 'event', event, instance }` and one `eventOver(ctx, event, instance)` call from the game's own code when that event happens (K541), not with a hand-kept list; pass the instance (the combat's id) whenever the event can nest or repeat, so an inner or later one does not end it.
14. Expect `askOrTake` to advance `promptSeq` when it takes the only answer, as an opened and answered prompt does (K652): a taken game and an asked one have the same hash and later prompt ids. Re-record any hash or prompt id a game pinned over a taken answer before K652.
15. Keep a status (stunned, a wound, stealth) with `giveStatus` / `removeStatus` / `hasStatus` / `statusesOf` and one `StatusTable` (K542, "Statuses" below), not a hand-kept list per unit; end it by its `ends` duration, and call `statusLeft` when an object leaves play. Read `given` of the result: a non-stacking status given again does nothing.
16. Keep a scenario's objectives (a count to reach, steps in or out of order, failures or a round deadline, an owner seat) with `startObjectives` / `advanceObjective` / `markStep` / `failObjective` / `objectivesRoundEnd` (K546, "Objectives" below), not a hand-kept counter or flag; react to done or failed through `objectivesCheck(react)` in `cfg.checkpoint.checks` (or `reportObjectives`), which reports each one once, not by re-reading `objectiveDone` every step.
17. Decide whether simultaneous triggers ask their order from `triggersFor`'s 4th argument `batch` (every occurrence that happened in that settle, all batches collected together, K696): `interactive` only when the order changes the result, else `silent`; switch a replacement on from card data in `replacementsFor`'s 3rd argument `content` (K697), not by offering it everywhere and declining it later.
18. Mark a state check `afterBatch: true` (K703) when it must see a whole batch settled (no unit of a side left after one effect removed several): it then runs only when no occurrence is pending. Without it a check runs between the occurrences of a batch, as before (`timing.md`, "When state checks run").

**Common mistakes:**
- Using the old `ctx.then` then `ctx.ask` form in new code: it is deprecated.
- A prompt nobody can answer (fewer enabled options than `min`): `EngineBugError`; give a legal option or skip the prompt.
- A derived value that keeps changing in the checkpoint: `EngineBugError` after the recompute cap.
- A modifier whose operation has no step in the `NumberOrder`, a default floor or cap without its step, a `min` on anything but a reduction, or `decreases: 'highestMin'` without split `increase`, `decrease` steps: `EngineBugError`.
- Reading `setters: 'last'` as "the newest wins": it is the last in the array given.
- Using `numberParts` for a stored value clamped after each change, or with a table lookup in the middle: see "Not this part" in `numbers.md`.
- Firing `eventOver` with no instance for scoped effects: it ends only effects with no `instance`.
- Adding a "this combat" effect without `instance` where combats nest: an inner combat's `eventOver` ends it too. Give it the combat's id; `waitingOn(s)` shows what live effects wait on (a typo, an instance already over).
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
- Barred options with reason codes, the only-option notice (`bar`, `blocked`, `onlyOne`, `askOrTake`, K88; a lone `unseen` answer is never taken automatically, K641), the verb-to-ids table (`legalTable`, `legalIn`, K119) and outcome preview stopping at hidden information (`preview`, K89), opt-in: `legal.md`.
- Derived data on demand (K124, opt-in): `GameRules.queries` by name, read with `query(game, state, content, what, player?, arg?)` (an unknown name is a `GameSetupError`), so a view never carries it.
- Debug edits as engine actions (`DebugAction`: `set`, `force`, `close` and the game's `GameRules.debug` verbs; `debugVerbs`, K100, opt-in): `debug.md`. The console is `debug-console`.
- Timing (K93, K111, K94, K96, K112, K95, opt-in): batches of occurrences with `would`, `cancelBatch`, `ignoreBatch`, `insteadOf`, the prevention window (`Prevention` card data, `prevent`) the replacement loop (`Replacement`, `ReplaceResult`, `changeOccurrence`), triggers (`TriggerCandidate`, `PendingTrigger`, `DEFAULT_PRIORITY`, `enteredPlay`), `simultaneously`, continuous effects with durations (`addEffect`, `boundary`, `eventOver` for a named end event and `waitingOn` K541, `effectsOf`, `sumEffects`, `anyEffect`, K96) layered recompute (`layered`, `stampActive`, K112) and the checkpoint after every action (`cfg.checkpoint`: `derive`, `checks`, `RECOMPUTE_CAP`, K95; a check with `afterBatch: true` waits for the whole batch, K703); a game spreads `timingHandlers(cfg)` into its handlers: `timing.md`. K696: `triggersFor(s, occ, content, batch)` also gets every occurrence that happened in its settle (all batches collected together; frozen copies), so a trigger is `interactive` only when the order changes the result; K697: `replacementsFor(s, occ, content)` gets the content, so card data can switch a replacement on (both optional to read; `timing.md`).
- Statuses (K542, `statuses.ts`, opt-in): `giveStatus`, `removeStatus`, `hasStatus`, `statusCount`, `statusesOf`, `statusLeft` over a game's `StatusTable`; see "Statuses (K542)" below.
- Objectives (K546, `objectives.ts`, opt-in): `startObjectives`, `advanceObjective`, `markStep`, `failObjective`, `objectivesRoundEnd`, `objectiveProgress`, `objectiveDone`, `objectiveFailed`, `objectivesOf`, `reportObjectives`, `objectivesCheck`; see "Objectives (K546)" below.
- A number with its parts (K526, K582, `numbers.ts`, opt-in): `numberParts(base, modifiers, order, opts?)` applies `NumberModifier`s (set, add, multiply, floor, cap; own minimum, per-unit count, condition, scope) in the game's `NumberOrder` and returns the value with `parts` (`{ source, op, amount, applied, ref? }`), every floor or cap that bit and whether it still holds (`bounds`; `bound` is the last) and, on request, what changed nothing and why; `effectModifiers` maps the lasting effects (`effectsOf`) onto modifiers; `partsDirection`. For stats, costs, payment, `bar` reasons and a breakdown on screen: [numbers.md](numbers.md).

## Statuses (K542)

A status (stunned, stealth, a wound, "not in combat") is a named lasting effect on any object id, built on `addEffect` (`statuses.ts`, from `timed.ts`): kind `STATUS`, `target` the object, `value` the name, so every `Duration` ends it (`boundary`, `eventOver`, ...) and it is plain state (saves, undo, replay). The game passes one `StatusTable`: per name a `token` key (the view draws it, card-attachments `TokenRow`), `stacks` (a count) or not, `ends` (a `Duration` or `'removed'`) and `endsOnLeave`. Verbs: `giveStatus(ctx, table, object, name, { source?, ends?, instance?, when? })` (a non-stacking status already there: `{ given: false, why: 'already' }`, nothing changes), `removeStatus(ctx, object, name, n?)` (oldest given first; returns how many; `n` a whole number 1 or more, else an `EngineBugError`), `statusLeft(ctx, table, object)` (the object left play), `hasStatus`, `statusCount`, `statusesOf(s, table, object)` (`{ name, token, count }`, first given first); each read takes the game's `EffectsConfig` last (`blanked`, the `when` conditions), so it agrees with `effectsOf` (a status with a `when` needs it). Give, remove and leave act on every status not ended, hidden or not. Each stack is its own effect with its own end: stacks under the table's shared `ends` end together, stacks given with their own `ends` or `instance` end one by one. A name not in the table is an `EngineBugError`. Tests: `k542.test.ts` (with a comparison against a plain model).

```ts
const STATUSES: StatusTable = { stunned: { token: 'stun', ends: { until: 'endOfTurn' } }, wound: { token: 'wound', stacks: true, ends: 'removed', endsOnLeave: true } };
const first = giveStatus(ctx, STATUSES, 'u1', 'stunned'); // { given: true, id, count: 1 }
const again = giveStatus(ctx, STATUSES, 'u1', 'stunned'); // { given: false, why: 'already', count: 1 }: it does not stack
const act = { id: 'act', enabled: !hasStatus(ctx.s, 'u1', 'stunned') }; // a stunned unit cannot act
giveStatus(ctx, STATUSES, 'u1', 'wound'); giveStatus(ctx, STATUSES, 'u1', 'wound'); // stacks: statusCount 2
const tokens = statusesOf(ctx.s, STATUSES, 'u1'); // [{ name: 'stunned', token: 'stun', count: 1 }, { name: 'wound', token: 'wound', count: 2 }]
boundary(ctx, { kind: 'turnEnd' }); // the stun ends with the turn
statusLeft(ctx, STATUSES, 'u1'); // the unit left play: its wounds go (endsOnLeave)
```

## Objectives (K546)

An objective (a mission, a scenario goal, a card to clear) is plain state in `s.objectives` (`objectives.ts`, from `timed.ts`), absent until the game starts one. The game passes `ObjectiveDef`s as data: `id`, `kind: 'count'` with `target`, or `kind: 'steps'` with `steps` (and `ordered: true` when only the next step counts), an optional `fail` (`failures`: fails when `failObjective` has recorded that many; `round`: fails when the game calls `objectivesRoundEnd(ctx, round)` for that round or a later one and it is not done) and an optional `owner` seat. Progress is capped at the target: once done or failed an objective is closed and nothing changes it (`markStep` says `why: 'closed'`; `'already'` for a step marked, `'order'` for an ordered step out of turn). Reads: `objectiveProgress(s, id)` (`have`, `need`, `steps`, `failures`, `outcome`), `objectiveDone`, `objectiveFailed`, `objectivesOf(s, owner?)`. `reportObjectives(ctx)` returns each objective that became done or failed since the last call, once; `objectivesCheck(react)` is the same as a checkpoint state check. When a progress threshold and a failure threshold are both met in one game step, the first call that closes it wins: the game decides which comes first by the order of its calls (`advanceObjective` / `markStep` before or after `failObjective`); the kit makes no choice. An unknown id or step, a count (`target`, `n`, `fail.failures`) not a whole number 1 or more, a round (`fail.round`, `objectivesRoundEnd`) not a whole number 0 or more, an empty `fail: {}`, `markStep` on a count or `advanceObjective` on steps, `failObjective` without `fail.failures`, a repeated id: `EngineBugError`. Tests: `k546.test.ts` (with a comparison against a plain model).

```ts
startObjectives(ctx, [{ id: 'reach', kind: 'count', target: 3, fail: { round: 5 } }, { id: 'escape', kind: 'steps', steps: ['key', 'door'], ordered: true, owner: 'p1' }]);
const two = advanceObjective(ctx, 'reach', 2); // { id: 'reach', have: 2, need: 3, steps: [], failures: 0, outcome: 'open' }
const early = markStep(ctx, 'escape', 'door'); // { marked: false, why: 'order' }: the key comes first
markStep(ctx, 'escape', 'key'); markStep(ctx, 'escape', 'door'); // escape is done
const fired = reportObjectives(ctx); // [{ id: 'escape', outcome: 'done' }], once; objectivesCheck(react) does this in the checkpoint
const late = objectivesRoundEnd(ctx, 5); // ['reach']: not done by the end of round 5
const mine = objectivesOf(ctx.s, 'p1').map((p) => p.outcome); // ['done']
```

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
