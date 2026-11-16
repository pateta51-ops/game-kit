# campaign

The campaign log as plain data and pure functions (release 1.0). No packages; draws nothing; loads in node (tests: `log.test.ts`). Every function returns a new log and never changes its argument, so the log goes into a save as JSON (a game keeps it beside its `saves` history) and undo is keeping the old value. Later parts (steps, saves, screens, graph runner, achievements tab) add to this shape: `readLog` keeps unknown parts and fills missing ones.

## Log

`emptyLog()` gives `{ v: 1, recorded, crossed, counts, sets, order, changes, ledger }`.

- Keys: `record` (again after a cross-out: goes last), `crossOut` (leaves the order), `forget` (removes everywhere), `has`, `isCrossed`. `order` holds the recorded keys as recorded, for display.
- Counts: `count`, `setCount(l, key, value, step)`, `addCount(l, key, delta, step)`; each write keeps `{ step, key, before, after }`; `countHistory(l, key)` lists them for one count ("why is this 5?").
- Sets with crossed-out entries: `setInsert` (brings a crossed-out entry back), `setCrossOut`, `setRemove`, `setHas`, `setOf` gives `{ entries, crossed }`.
- Rewards: `reward(l, { step, label, amount, who?, kind? })` (a spend is negative); `rewardsByStep` groups them in step order with totals; `rewardTotal(l, who?, kind?)`.
- `readLog(parsed)` reads a stored value; undefined when it is not a v1 log.

## Fields declared as data

`FieldDef { id, kind: 'key' | 'count' | 'set', label, scope?: 'shared' | 'player', cite?, hidden? }`: the game lists them; the label and the rulebook citation are what a screen prints. `fieldKey(fields, id, who?)` gives the storage key (`who/id` for a per player field; undefined for an unknown field or a wrong scope). `visibleKeys(l, fields)` gives the recorded keys in order and the crossed-out ones, without hidden fields.

The `step` of a write is a string the game chooses (a scenario id; `stepKey(step)` fits).

## Steps and saves (`steps.ts`)

- `Step { kind: 'prologue' | 'scenario' | 'interlude' | 'upgrade' | 'epilogue' | 'side', id, part?, then? }`; `detour(save, kind, id)` makes a step whose `then` is the current one, so ending it returns there. `stepKey` gives `kind:id`.
- The game's flow is a `NextStep = (save) => Step | null` reading `position.done`, `position.resolutions` (by step key), `played(save, step)` and the log; `linear(steps)` for a list. Null ends the campaign (`status: 'over'`).
- `newCampaign(id, version, first, seed, log?)`; `standalone(step, seed)` with `endsAfterOne` is a scenario played alone.
- `begin(save, seed?)` gives `{ save, log }`: a frozen copy of the log for the game's setup; the game never reads the campaign. `end(save, { log, outcome?, resolution? }, next)` takes back the log it wrote, files the attempt in `history` and moves on.
- Save = `{ v, id, version, log, position, seed, history, attempt?, status }`; each attempt keeps `step, seed, logBefore`. `retry(save)` puts back the last attempt's `logBefore` and step. `readSave(parsed, version)` marks another version `incompatible`.
