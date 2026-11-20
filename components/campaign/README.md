# campaign

The campaign log as plain data and pure functions (release 1.0). No packages; draws nothing; loads in node (tests: `log.test.ts`). Every function returns a new log and never changes its argument, so the log goes into a save as JSON (a game keeps it beside its `saves` history) and undo is keeping the old value. Later parts (steps, saves, screens, graph runner, achievements tab) add to this shape: `readLog` keeps unknown parts and fills missing ones.

## Rules for agents

**What it does:** The campaign log, steps, saves, graph runner and between-scenario screens as plain data and pure functions; nothing is stored by the kit.

**You must:**
1. Treat every log and save as immutable: each function returns a new value; assign it, and undo is keeping the old one.
2. Store the log and save as JSON beside the game's own saves; load with `readLog(parsed)` / `readSave(parsed, version)` (`readLog` returns undefined for a value that is not a v1 log; another version reads as `incompatible`).
3. Declare the game's fields as `FieldDef` data and get storage keys with `fieldKey(fields, id, who?)`; an unknown field or a wrong scope gives undefined.
4. Pass `step` (a string you choose, e.g. `stepKey(step)`) on every count or reward write, so `countHistory` can explain a number.
5. Run a scenario through `begin(save, seed?)` and `end(save, { log, outcome?, resolution? }, next)`: the game sets up from the frozen copy of the log and never reads the campaign itself.
6. Give the campaign a `NextStep` (or `linear(steps)`, or `graphNext(graph)`); returning null ends it (`status: 'over'`).
7. Run `checkGraph` on a graph in a test; it lists data problems.
8. Import `kit/campaign/index` (node-safe) for logic and `kit/campaign/ui` for screens; word every label and citation in the game.

**Common mistakes:**
- Calling `begin` with no active step, or `end` with no attempt in progress: both throw `campaign: no step ...`.
- Resolving a graph node that is not available, or answering an option that does not exist: `campaign: node ... not available` / `no option ...` throws.
- Mutating a log in place: saves and undo then disagree.

## Log

`emptyLog()` gives `{ v: 1, recorded, crossed, counts, sets, order, changes, ledger }`.

- Keys: `record` (again after a cross-out: goes last), `crossOut` (leaves the order), `forget` (removes everywhere), `has`, `isCrossed`. `order` holds the recorded keys as recorded, for display.
- Counts: `count`, `setCount(l, key, value, step)`, `addCount(l, key, delta, step)`; each write keeps `{ step, key, before, after }`; `countHistory(l, key)` lists them for one count ("why is this 5?").
- Sets with crossed-out entries: `setInsert` (brings a crossed-out entry back), `setCrossOut`, `setRemove`, `setHas`, `setOf` gives `{ entries, crossed }`.
- Rewards: `reward(l, { step, label, amount, who?, kind? })` (a spend is negative); `rewardsByStep` groups them in step order with totals; `rewardTotal(l, who?, kind?)`.
- `readLog(parsed)` reads a stored value; undefined when it is not a v1 log.

## Fields declared as data

`FieldDef { id, kind: 'key' | 'count' | 'set', label, scope?: 'shared' | 'player', cite?, hidden? }`: the game lists them; the label and the rulebook citation are what a screen prints. `fieldKey(fields, id, who?)` gives the storage key (`who/id` for a per player field; undefined for an unknown field or a wrong scope). `visibleKeys(l, fields)` gives the recorded keys in order and the crossed-out ones, without hidden fields. The `step` of a write is a string the game chooses (a scenario id; `stepKey(step)` fits).

## Steps and saves (`steps.ts`)

- `Step { kind: 'prologue' | 'scenario' | 'interlude' | 'upgrade' | 'epilogue' | 'side', id, part?, then? }`; `detour(save, kind, id)` makes a step whose `then` is the current one, so ending it returns there. `stepKey` gives `kind:id`.
- The game's flow is a `NextStep = (save) => Step | null` reading `position.done`, `position.resolutions` (by step key), `played(save, step)` and the log; `linear(steps)` for a list. Null ends the campaign (`status: 'over'`).
- `newCampaign(id, version, first, seed, log?)`; `standalone(step, seed)` with `endsAfterOne` is a scenario played alone.
- `begin(save, seed?)` gives `{ save, log }`: a frozen copy of the log for the game's setup; the game never reads the campaign. `end(save, { log, outcome?, resolution? }, next)` takes back the log it wrote, files the attempt in `history` and moves on.
- Save = `{ v, id, version, log, position, seed, history, attempt?, status }`; each attempt keeps `step, seed, logBefore`. `retry(save)` puts back the last attempt's `logBefore` and step. `readSave(parsed, version)` marks another version `incompatible`.
## Graph runner (K158, `graph.ts`, opt-in)
- `CampaignGraph<E> { kind: 'linear' | 'choice', nodes, before?, finale?: { node, when? }, failAfter?, every? }`; `GraphNode { id, label, kind?, when?, setup?, victory?, defeat? }`. `graphNext(g)` is the `NextStep` (resolve a node with `end(..., { resolution: 'won' | 'lost' })`); `available`, `nodeChoice` + `chooseNode` for the player's pick; `checkGraph` lists data problems. `Instruction<E> { id, text, cite, when?, ops?, choose?, inGame?: { window?, effect: E } }`: printed text and citation with log `ops` (record, crossOut, forget, add, set, insert, strike, remove, reward) or a player's `choose` (options with `when`). `instructions(g, node, phase)`; `runBetween(list, log, step, answers)` gives `{ log, ran, ask? }`; `inGameAt(list, window, log)` gives the effects the game runs in that window (default `afterSetup`). `Cond` is data (`has`, `crossed`, `count`, `inSet`, `played`, `won`, `lost`, `not`, `all`, `any`) or a function; `holds(c, log, save?)`.
## Screens (K159, `screens.ts` pure; React in `ui.ts`, static)

`betweenQuestion(save, actions)` + `answerBetween`: the between-scenarios screen as one question (`continue` and the game's `BetweenAction`s, detours). `logSections(log, fields, players)` + `<LogTabs sections tabs />` (the game adds tabs: `changeRows` per instruction, `<AchievementList />`). `handledList` (automated setup as sentences). `startAt({ steps, at, form, answers })` + `<StartForm />`: start anywhere with a chosen history.

## Use it in 10 lines

```ts
import { addCount, emptyLog, record, setCount } from '../kit/campaign/index'

let log = emptyLog()
log = record(log, 'met-the-king')
log = setCount(log, 'gold', 3, 'scenario-1')
log = addCount(log, 'gold', 2, 'scenario-2')
console.log(log.counts)
```
