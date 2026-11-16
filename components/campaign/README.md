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

The `step` of a write is a string the game chooses (a scenario id); K157 gives steps their tags.
