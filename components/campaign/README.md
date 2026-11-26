# campaign

Campaign steps, logs, calendars, rosters and shared card boxes as plain data and pure functions. The log goes into a JSON save beside the scenario history. The logic entry works in Node and on the web. `readLog` fills missing fields and keeps fields the game owns.

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
8. Import `kit/campaign/index` (node-safe) for logic and `kit/campaign/ui` for screens. The game writes the labels and citations.
9. Use `scheduleCalendarEntry` with stable IDs from the game's between-scenario instructions. Call `startCalendarDay` before `begin` at the first scenario of the day. Keep the previous log while the day is waiting for a choice, and save the returned log once it resolves.
10. Use `changeCampaignRoster` for joins, absences, retirement and deck edits. Pass the whole shared card box and batch deck exchanges together. Scenario setup uses only players whose status is `active`. Use `remainingCampaignCards` against the current box when accepting a restored roster.

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
## Calendar, roster and shared card box (K595)

- `scheduleCalendarEntry(log, day, instructionId)` records a between-scenario instruction ID for a positive safe integer day. Each ID can be scheduled once per day. A day already started is closed to edits. The game supplies the corresponding `Instruction` definitions and keeps IDs stable for saved campaigns.
- `startCalendarDay(log, day, instructions, answers?, save?)` resolves that day's entries in recording order using `runBetween`. Read `ran` for resolved instructions. If `ask` is present, keep the log and retry with the answer. Day instructions accept existing log operations, predicates and choices. Missing definitions or in-game instructions are errors. You can skip empty days but must process queued earlier days first.
- After a day resolves, starting that day or an earlier day again returns the same log with no instructions. Later days can schedule the same instruction. The optional `betweenSessions` field holds the calendar and roster, so `begin`, `end` and `retry` already carry them through the normal save snapshots. A game that uses no calendar or roster keeps the original v1 log shape.
- `campaignRoster(log)` returns the players in join order. `changeCampaignRoster(log, edits, { box, allow? })` accepts `join` (with deck), `sitOut`, `return`, `retire` and `setDeck` (with deck). Each edit names a stable `player` ID. Decks list one card ID per physical copy, including repeated IDs. Sitting-out players keep their cards reserved. Retirement releases their deck and preserves their identity. When the game grants a deck upgrade, use `setDeck` to add or exchange cards against the same box. The game supplies any eligibility or deck construction rule through the optional pure `allow` callback.
- `box` maps card IDs to nonnegative safe integer copy limits. A missing card has no copies. Deck exchanges validate the final allocation as a batch. Errors leave the input log intact. `remainingCampaignCards(log, box)` returns free copies and reports over-allocation. Restoring a save validates the calendar and roster shape. Validating against the game's selected box still requires the game data.

## Screens (K159, `screens.ts` pure; React in `ui.ts`, static)

`betweenQuestion(save, actions)` + `answerBetween`: the between-scenarios screen as one question (`continue` and the game's `BetweenAction`s, detours). `logSections(log, fields, players)` + `<LogTabs sections tabs />` (the game adds tabs: `changeRows` per instruction, `<AchievementList />`). `handledList` (automated setup as sentences). `startAt({ steps, at, form, answers })` + `<StartForm />`: start anywhere with a chosen history.

## Use it in 10 lines

```ts
import { begin, changeCampaignRoster, emptyLog, newCampaign, scheduleCalendarEntry, startCalendarDay } from '../kit/campaign/index'
import type { Instruction } from '../kit/campaign/index'

const supply: Instruction = { id: 'supply', text: 'Stock the camp.', cite: 'Setup', ops: [{ op: 'record', key: 'stocked' }] }
let log = changeCampaignRoster(emptyLog(), [{ kind: 'join', player: 'scout', deck: ['lamp'] }], { box: { lamp: 1 } })
log = startCalendarDay(scheduleCalendarEntry(log, 1, 'supply'), 1, { supply }).log
const campaign = newCampaign('trail', '1', { kind: 'scenario', id: 'camp' }, 42, log)
const attempt = begin(campaign)
console.log(attempt.log.recorded)
```
