# game-log

The game's log, derived from engine events by one table. Cards and rules write nothing: a new game has a complete log by listing its event types once. Pure data and functions, no look. Reuses engine-core's `KernelEvent` (a game's events add `type`).

## Rules for agents

**What it does:** The game's log derived from engine events by one table; cards and rules write nothing. Pure data and functions, no look.

**You must:**
1. Write one `Narrator` table: an event type to a narration (one, several or null); silence is the default, so list every event type that should show.
2. Call `appendLog(log, events, table, step)` once per action and keep the log in the game state; it returns a new array and never edits old rows.
3. Use the same `step` for all rows of one action so undo can rewind (`rewindLog`, `previewAt`, `stepOf`).
4. Keep narrations pure: never push, throw or assume an entity still exists (a throw becomes a `problem` row).
5. Give `cause` as a `ref`, not prose; group rows with `group: { id, role }`.
6. Run `wordingProblems(row)` over what the table writes in a test; export a golden with `exportText`.
7. Draw the log yourself: refs (card, space, piece) are resolved by the client.
8. Save actions, not log rows; rebuild with `replayLog`/`logKeeper` on load (K742).

**Common mistakes:**
- Expecting a catch-all: unlisted events are silent.
- A delta of 0, an empty part or a ref without type or id: `wordingProblems` flags them.


- `Narrator<E>`: event type to `Narrated` (one, several, or null). Silence is the default: no catch-all, and wrapper copies (when/after/would) of one occurrence are left out. A narration is pure, never pushes, throws or assumes an entity still exists; one that throws becomes a `problem` row.
- `appendLog(log, events, table, step)`: returns a new array with rows added; old rows are never edited. Row: `id`, `seq` (the event), `step` (the undo point; one action's rows share it), `kind`, `parts`, `cause`, `group`, `tone`, `tag`.
- Parts: `text`, `num`, `delta`, `ref(type, id, label?)` (card, space, piece: the client resolves it), `icon`, `list`. Build with `text`, `num`, `delta`, `ref`, `icon`.
- `cause` is a ref, never prose. `group: { id, role }` marks a header, members and summary; `blocks(log)` collects each run sharing an id. Rows stay flat, so undo needs no special case.
- `plainLine(row)`: the row as one plain string.
- `stepOf(log, id)`, `rewindLog(log, id, after?)` (log before that line's action, or just after it, and the step to restore), `previewAt(log, id)` (rows through that action and its step, for a read-only snapshot). The game owns snapshots keyed by step.
- Rebuild from actions (K742): `replayLog({ start, apply, events, table, actions })` gives `{ log, state }`: the set-up's events under step 0, then each action's fresh events (seq past the last one narrated, kept, so a trimmed event list is safe) under step i + 1; `table` is a `Narrator` or `(prev, next, fresh, rows) => Narrator`, made per action from the states before and after, that action's fresh events (fold the state per event) and the rows kept so far (carry a heading such as the round from the last row, also after undo); a factory that throws becomes a `problem` row. `logKeeper({ start: (key) => state, apply, events, table, same? })` keeps it beside the game: `sync(actions, key?)` rebuilds when `key` changes (new game, loaded save), rewinds to the first changed action (undo; actions compared with `same`, default `===`), plays on only added actions; `rows()`, `state()`.
- `exportText(log)`: one plain line per row (`step kind: line <tone> (cause)`), stable, for a golden.
- `wordingProblems(row)`: empty parts, non-finite numbers, a delta of 0, a ref without type or id, stray spaces, raw `undefined`/`null`/`NaN`. A game runs it over what its table writes.

```ts
const table: Narrator<Ev> = { hurt: (e) => ({ kind: 'mechanic', parts: [ref('player', e.who), text(' loses '), num(e.n)] }) };
log = appendLog(log, events, table, step);
```

- Map refs (K122, opt-in): `refsOf(row, withCause?)`; `refFocus(ref, mapTypes, on)` and `rowFocus(row, mapTypes, on)` (`on`: hover or click) give `{ highlight, scrollTo? }`: hover lights, click also scrolls, other ref types do nothing. `groupBox(block)` gives `{ id, header, members, summary }` for a battle or activation box. The client draws and scrolls.

Open for later: more optional row fields can be added. The game keeps the log in its own state and decides when to call `appendLog`.

## Use it in 10 lines

```ts
import { appendLog, plainLine, text, num, type Narrator } from '../kit/game-log/index'

type Added = { type: 'added'; n: number; seq: number; turn: number }
const table: Narrator<Added> = { added: (e) => ({ kind: 'action', parts: [text('Counter up by'), num(e.n)] }) }
const log = appendLog([], [{ type: 'added', n: 2, seq: 1, turn: 1 }], table, 0)
console.log(log.map(plainLine))
```
