# Pattern: timing vocabulary (K93, K111, K94, K96, K95)

One vocabulary for the five card-language core rows, fixed before any of them is built. Sources (write-ups in `docs/evaluation/outside/`): halogenandtoast 7, 9, 10 (ArkhamHorror, Marvel); netrunner 1 to 5; marvel-champions 9, 10, 12; forge-xmage F4, F5, F7. ArkhamHorror, Forge and marvel-champions-digital-game are idea only; netrunner and XMage are MIT.

## What engine-core has today (read in full)
- A LIFO task stack: `ctx.then(a, b)` runs a, then b; a handler table per task kind; `run` stops on an open prompt, an empty stack or a result; `MAX_TASKS_PER_ACTION` (50,000) aborts a runaway loop.
- One prompt at a time: the handler pushes its resume task, then `ctx.ask`; the answer is written into that task (`answer`).
- `ctx.emit`: events stamped with `seq` and the game's `stamp` fields, after the fact. Counters `seq` and `promptSeq` in state (`takeSeq`).
- `GameOver` thrown by a rule; `invariants` after every action (test builds); `cardInstanceId` (`C-nn#1`); `canonicalJson` and `hashValue`; copy on write (`own(s, key)` before writing below the top level).
- It has no notion of something that is about to happen: no batch, window, replacement, trigger, duration, checkpoint or derived value. All five rows add to it; nothing existing changes.

## Rules for all five rows
- Everything lives in state as plain data, so saves, replay, undo and goldens work unchanged. Nothing in state is a function: a condition is a key the game registers (`when: 'whileExhausted'`), looked up in a table the game passes.
- One counter `timing.next` hands out every id below (batch, occurrence, effect, trigger). An id is also the timestamp: a lower id was made earlier (K112 sorts by it).
- The kit's tasks have kinds starting `timing.`; a game spreads the kit's handler table into its own (`handlers: { ...timingHandlers(cfg), ...mine }`). The runner does not change.
- Opt-in: `KernelState.timing?` and `KernelTask.batch?` are optional; a game that never calls these sees no difference, byte for byte.
- Prompts are ordinary engine prompts (resume task + `ask`), so an answer is a recorded action.

```ts
interface TimingState {
  next: number;                      // id counter
  current: number | null;            // batch being resolved (cleared on cancel: the Arkham bug)
  occurrences: Occurrence[];         // pending: not yet happened, or happened and not yet collected
  windows: Window[];                 // open windows, innermost last (prevention windows nest)
  effects: ContinuousEffect[];       // K96
  pending: PendingTrigger[];         // K94, collected, not yet resolved
}
```

## Event and batch model (K93)
- An **occurrence** is one thing about to happen ("2 damage to C-07#1"). A **batch** is one effect that can be interrupted; several occurrences may share it (one card that both searches a deck and discards). Cancelling the batch cancels them all.
- **Shared keys** (XMage F7): a batch says which keys all its members share, so a "whenever one or more" trigger reads them once.

```ts
interface Occurrence {
  id: number; batch: number; kind: string;           // 'damage', 'discard', game words
  keys: { player?: string; source?: string; target?: string };
  amount?: number;
  applied: number[];                                 // K111: replacement effects already applied to it
  state: 'pending' | 'cancelled' | 'happened';
}
interface Batch { id: number; shared: ('player' | 'source' | 'target')[] }
```
- The event (`ctx.emit`) is still the record of what happened; the kit emits it when the occurrence becomes `happened`, with `batch` and `occurrence` ids on it so a log groups by batch (K86).

## Windows
A window is `{ timing, kind, batch }`; two windows are equal when those three are (Arkham), so "once per window" compares them.
1. **before** ("when ... would"): players may cancel or answer with an instead. Opened per occurrence.
2. **instead**: the replacement loop (K111) over static replacement effects.
3. **prevention**: numeric, players spend prevention abilities against a counter (K93).
4. the occurrence happens (emit), or not.
5. **after**: the occurrence is queued for trigger collection at the next checkpoint (K94). After-windows never open mid-effect.

The order 1, 2, 3 is the kit default; a game whose rulebook orders them differently passes its own list. A helper that skips a window says so in its name (`damageWithoutWindows`), never a flag.

## Cancel, ignore, instead (K93)
- `cancelBatch(ctx, b)`: removes every stack task with `batch === b`, marks its occurrences `cancelled`, drops its open windows and pending triggers, clears `current` if it was `b`.
- `ignoreBatch(ctx, b)`: drops only the task that does the effect (`timing.do`); the windows stay (Arkham `IgnoreBatch`).
- `insteadOf(ctx, b, ...tasks)`: ignore, then push `tasks` tagged with batch `b` (a later cancel removes them too).

## Prevention window (K93)
```ts
interface Prevention { prevents: string; max?: number; uses?: number }   // card data
interface PreventionWindow { kind: 'prevention'; batch: number; occurrence: number;
  count: number; remaining: number; prevented: number; unpreventable?: boolean }
```
`prevent(ctx, n)` moves up to n from `remaining` to `prevented` in the innermost window; outside a window, or on an unpreventable one, it is an `EngineBugError`. The game gathers candidates (in play, affordable, not used up) with its own query; the kit asks, loops until the player passes or `remaining` is 0, then writes `amount = remaining`.

## Replacement loop and result codes (K111)
```ts
type ReplaceResult = 'kept' | 'updated' | 'replaced' | 'prevented' | 'skipped';
interface Replacement { id: number; controller: string; cls: number; label: string }
```
Loop on one occurrence: collect the game's candidates (`replacementsFor(occ)`), drop those in `occ.applied`, keep only the lowest `cls` (game-declared ordering classes, Forge); none: stop; one: apply; several: the **affected** player picks (a prompt). Record the id in `applied`. Result: `updated` (still happens with changed numbers) loops again; `replaced` (other tasks happen instead), `prevented` (amount 0, nothing happens) and `skipped` (cancelled) stop; `kept` means nothing applied. The loop returns the last code; a one-use effect removes itself in its own apply. Cap: candidates are finite and each applies once per occurrence, so no extra cap.

## Checkpoint after every action (K95)
`timing.checkpoint` runs after every `timing.do` (unless inside a simultaneous group) and wherever the game pushes it (end of each top-level effect, end of phase). Its order, from netrunner's lettered steps:
1. **Collect**: turn `happened` occurrences into pending triggers (K94); drop the occurrences.
2. **Expire**: remove effects whose duration ended (K96).
3. **Recompute until stable**: the game's `derive(state)` writes derived values (blanked cards, "treated as", totals); repeat while `canonicalJson(derivedOf(state))` changes, at most `RECOMPUTE_CAP = 10` passes, then `EngineBugError` naming the keys still moving.
4. **State checks**, the game's named list in rulebook order (win/loss, uniqueness, limits, empty zones). A check may ask (forced choice); the checkpoint resumes after the answer and goes back to 1 if anything changed (bounded by the task cap).
5. **After-window**: order and resolve the pending triggers (K94); each resolution ends with its own checkpoint.

## Triggers: collection and ordering (K94)
```ts
interface PendingTrigger { id: number; ability: string; source: string; player: string;
  occurrences: number[]; once: 'perItem' | 'perInstance';
  order: 'silent' | 'interactive' | { auto: string } }
```
- Collection: the game's `triggersFor(occ)` returns candidates. `perItem` gives one trigger per occurrence ("whenever a card is discarded"); `perInstance` one trigger for every occurrence of the batch ("whenever one or more cards are discarded").
- A card that entered play after the occurrence does not answer it (marvel 10): the kit records `enteredAfter` ids on the occurrence.
- Order: active player's triggers first, then the others in turn order. Within one player: a prompt only if at least one trigger is `interactive` and more than one is not `silent`; otherwise sort by the priority table, then by ability key for a fixed replay.
- Kit default table (netrunner, the game may replace it): lose actions 1, gain actions 2, lose resources 4, gain resources 6, draw 8, default 10, last 999.
- Before each resolves: still valid (source in play or a ghost, K92; not blanked)? If not, it is dropped with an event saying why.
- **Simultaneously** (Arkham 10): `simultaneously(ctx, tasks)` runs each member on an empty stack, keeps what each pushed, then pushes all the follow-ups in front of the rest. No checkpoint runs between members, so after-windows and defeat wait until the whole group has landed. A member that asks a prompt is an engine bug: choices go in the follow-ups.

## Continuous effects and durations (K96)
```ts
type Duration =
  | { until: 'endOfTurn' | 'endOfRound' | 'endOfPhase'; phase?: string }
  | { until: 'turnBegins' | 'nextTurnBegins'; player: string }    // 'next' becomes plain at the first turn start
  | { until: 'endOfBatch'; batch: number; ifCancelled: 'expire' | 'wait' }
  | { until: 'used'; uses: number }
  | { while: 'sourceInPlay' }
  | { until: 'game' };
interface ContinuousEffect { id: number; kind: string; source: string; value: number | string;
  when?: string; duration: Duration; layer?: string }
```
- Static abilities register `while: 'sourceInPlay'` when the card becomes active and leave with it; lasting ones carry a duration.
- `boundary(ctx, { kind: 'turnEnd' | 'roundEnd' | 'phaseEnd' | 'turnBegin', player?, phase? })` marks which durations end; they are removed at the next checkpoint step 2.
- Read at use, never written into the card: `effectsOf(s, kind, filter)`, `sumEffects`, `anyEffect`. The `when` key is looked up in the game's condition table. A blanked source's effects are skipped (the blanked set is a derived value, step 3).
- `layer` and the id-as-timestamp are left for K112 (layered recompute); K96 only stores them.

## Rows, pieces, files, order
Build in this order; each needs the ones above it.

| Order | Row | Adds | engine-core files |
|---|---|---|---|
| 1 | K93 | `TimingState`, id counter, `Occurrence`, `Batch` and shared keys, windows 1 and 3, `timing.do`, `cancelBatch`, `ignoreBatch`, `insteadOf`, prevention window and `prevent` | `types.ts` (optional `timing`, `batch`), new `timing.ts`, `index.ts`, README |
| 2 | K111 | window 2: replacement loop, applied-set, chooser prompt, ordering classes, `ReplaceResult` | new `replace.ts`, `timing.ts` (calls the loop), `index.ts`, README |
| 3 | K94 | after-window, `PendingTrigger`, collection per item / per instance, entered-after ids, ordering prompt and priority table, revalidation, `simultaneously` | new `triggers.ts`, `index.ts`, README |
| 4 | K96 | `ContinuousEffect`, `Duration`, `boundary`, queries, `endOfBatch` with `ifCancelled` (needs K93 batches) | new `durations.ts`, `index.ts`, README |
| 5 | K95 | `timing.checkpoint` with steps 1 to 5, `derive` and `RECOMPUTE_CAP`, state-check list | new `checkpoint.ts`, `types.ts` (optional `GameRules.derive`, `checks`), `index.ts`, README |

Each row ships its tests on the fake game (`fake/`), a fixture card per piece, and a README section of a few lines (the whole README stays at most 30 lines, so sections stay short or a row adds `timing.md` beside it). Later rows that build on this note: K112 (layers), K113 (zone-change counter on `source`), K114 (batch keys as their own row), K92 (ghost sources for triggers).
