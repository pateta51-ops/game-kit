# play-stats

The records of finished games, the totals and best scores read from them, and a clock of playing time. No packages; draws nothing; loads in node (tests: `stats.test.ts`, `clock.test.ts`). The game keeps its record fields, the score comparison, its words and its screen.

## Store (`stats.ts`)

A record is `{ id, at }` (the game's identity, when it ended in ms) plus the game's own fields. `createPlayStats<R>({ key, valid, compare, same?, max?, dropWorst?, storage?, onError? })`:

- `valid(r)`: the game's fields are there with their types. A stored entry that fails it is skipped, never returned.
- `compare(a, b)`: a sort order, negative when `a` is the better score (ties: the game decides, say the earlier one).
- `same(a, b)`: the same ending (say the same final hash and seed). Such a record is never added twice: the first keeps its id and date and takes the new fields.
- `max` (default 5000): past it the oldest records go, or the worst by `compare` with `dropWorst`; never the one just recorded.
- `storage`: `getItem`, `setItem`, `removeItem` (default `localStats`, the browser's localStorage). Every call is guarded.
- `onError(what, error)`: once per store for the first `read` or `write` refusal, and once for `unreadable` text; default one console warning.

It returns `read()` (latest first), `record(rec)` (the record as stored, or null when the write was refused; a record with the same `id` is replaced: an Undo after the end, then another ending), `remove(id)` (an Undo past the end) and `clear()`; the last two give false on a refusal; `clear` removes `key` only, a `<key>.unreadable` copy stays. Stored as `{ version: 1, records }` under `key`. Text that cannot be read in full is copied to `<key>.unreadable` before the next write (the first such text stays).

## Figures

Pure, over any list (filter it first for a per-difficulty view):

- `ranked(list, compare)`: best first.
- `bestBy(list, group, compare)`: one record per group (per character, per difficulty), best first.
- `personalBest(rec, list, compare, sameGroup?)`: the best earlier record of the same group that `rec` beats, else null.
- `totals(list, kind, value?)`: `{ games, by, sum, average }`; `by` counts each `kind(r)` (win, loss), `average` is null with no games or no `value`.

## Clock (`clock.ts`)

`createPlayClock({ key, idleMs?, storage?, now? })`: `start(id)` on a new game, `resume(id)` on continue or when the page shows again (another id starts at zero), `tick()` on each move (nothing while paused), `pause()` when the page hides, `stop()` for a game that is not recorded, `session()` gives `{ id, playMs }` or null. The time between two ticks counts up to `idleMs` (default 5 minutes). Kept under `key`; when storage refuses it holds for the page.

## Use it in 10 lines

```ts
import { createPlayStats, type PlayRecord } from '../kit/play-stats/index'

type Rec = PlayRecord & { score: number }
const stats = createPlayStats<Rec>({
  key: 'mygame-scores',
  valid: (r) => typeof r.score === 'number',
  compare: (a, b) => b.score - a.score,
})
stats.record({ id: 'g1', at: Date.now(), score: 42 })
console.log(stats.read())
```
