# game-log

The game's log, derived from engine events by one table. Cards and rules write nothing: a new game has a complete log by listing its event types once. Pure data and functions, no look. Reuses engine-core's `KernelEvent` (a game's events add `type`).

- `Narrator<E>`: event type to `Narrated` (one, several, or null). Silence is the default: no catch-all, and wrapper copies (when/after/would) of one occurrence are left out. A narration is pure, never pushes, throws or assumes an entity still exists; one that throws becomes a `problem` row.
- `appendLog(log, events, table, step)`: returns a new array with rows added; old rows are never edited. Row: `id`, `seq` (the event), `step` (the undo point; one action's rows share it), `kind`, `parts`, `cause`, `group`, `tone`, `tag`.
- Parts: `text`, `num`, `delta`, `ref(type, id, label?)` (card, space, piece: the client resolves it), `icon`, `list`. Build with `text`, `num`, `delta`, `ref`, `icon`.
- `cause` is a ref, never prose. `group: { id, role }` marks a header, members and summary; `blocks(log)` collects each run sharing an id. Rows stay flat, so undo needs no special case.
- `plainLine(row)`: the row as one plain string.
- `stepOf(log, id)`, `rewindLog(log, id, after?)` (log before that line's action, or just after it, and the step to restore), `previewAt(log, id)` (rows through that action and its step, for a read-only snapshot). The game owns snapshots keyed by step.
- `exportText(log)`: one plain line per row (`step kind: line <tone> (cause)`), stable, for a golden.
- `wordingProblems(row)`: empty parts, non-finite numbers, a delta of 0, a ref without type or id, stray spaces, raw `undefined`/`null`/`NaN`. A game runs it over what its table writes.

```ts
const table: Narrator<Ev> = { hurt: (e) => ({ kind: 'mechanic', parts: [ref('player', e.who), text(' loses '), num(e.n)] }) };
log = appendLog(log, events, table, step);
```

Open for later: `ref.type` is any word (space and piece refs, K122); more optional row fields can be added. The game keeps the log in its own state and decides when to call `appendLog`.
