# state-machines

Explicit state machines as plain tables. `index.ts` loads in node and needs no package; `ui.ts` holds the React hook and needs `react`.

## Rules for agents

**What it does:** Explicit state machines as plain tables with a React hook, transition-graph invariants for engines, a generated map of every machine, and a flow queue.

**You must:**
1. Import tables and helpers from `index` (needs no package) and the hook from `ui` (needs `react`).
2. Write the type parameters out: `defineMachine<State, Event>({ id, initial, states, describe })`; `describe.source` is the repository path of the file holding the table and that file must contain `id: '<id>'`.
3. Give every machine a unique `id`; a duplicate id, an initial state not in the table or a target that is not a state throws at definition.
4. Move state only with `transition`, `useMachine().send` or `step`; an illegal event throws in dev and test and only logs (state unchanged) in production, so test with `expectIllegal`.
5. Keep the registry map current: run `node kit/state-machines/machines-doc.ts --write` and `--check` from the repository root with a `machines.config.json` (`modules`, optional `doc`, `srcDir`, `localState`) naming every module that defines machines; `--check` exits 1 when the map is stale or a file under `src/` defines a machine no listed module loads, 2 on bad usage.
6. For an engine whose rules move the state itself, keep its graph as machine tables and check every test and fuzz step with `stepViolations` / `recordingViolations`; a rules change that adds a move fails until the table has it.
7. With `FlowQueue`, run requests through `flush(now, same, run)`; it throws past `max` runs (default 100) naming the call site.

**Common mistakes:**
- Two machines with one id (for example a table defined in two modules): `[machine] duplicate machine id`.
- Reading a hook's `data` after returning to the initial state: it is null by design.
- Putting rule checks (a stack under a question) in the tables: they stay in the game.

## Tables (`machine.ts`)

`defineMachine<State, Event>({ id, initial, states: { [state]: { on: { [event]: target } } }, describe })` registers a table. `transition(m, state, event)` returns the target; an illegal event throws in dev and test, and in production logs and stays. `transitionTo`, `expectEdge`, `can`, `allowedFrom`, `edgesOf`, `hasEdge`, `isState`, `defineTable`, `declareLocalState`, `setMachinesDoc`. The map of every machine is written by `machines-doc.ts`; `test-utils.ts` has `expectIllegal`.

## Hook (`ui.ts`)

`useMachine<State, Event, Data>(m)` returns `{ state, data, send(event, data?) }`. The value sent with an event travels with the state (the open row's item, the enlarged picture); an event sent without one keeps the last and `null` clears it; an illegal event throws from `send` (dev) or logs once and changes nothing (production); the value becomes null whenever the machine is back in its initial state, so state and value cannot disagree. `send` is stable. `step(m, { state, data }, event, data?)` is the pure updater.

## Transition-graph invariants (`graph.ts`)

For an engine whose rules code moves the state itself: keep its graph (stages, which question may follow which) as machine tables that drive nothing, and check every step of every test and fuzz game against them. A rules change that adds a move fails until the table has it.

- A `Track<Position>` is `{ machine, of(position) }`: the machine's state in a recorded position, or null when the position is not on that machine (that step is skipped). Options: `stay` (staying needs no edge; otherwise it needs one), `transient` (states a step may pass through unseen), `between(prev, next)` (states seen inside the step, such as the stage stamped on each event), `start` (the state before the first position).
- `stepViolations(tracks, prev, next)`: for a per-action invariant hook (with `prev` undefined, only that the state exists).
- `recordingViolations(tracks, positions)`: for a whole recorded game.

Both return `{ machine, index, from, to, message }[]`, empty when legal; a state the table lacks is one violation, at the step that arrives at it (the step that leaves it has no edge to judge); the message gives the legal moves and the table's file and line. Checks that tie a state to other data (a stack under a question, a flag set only in one stage) are rules and stay in the game.

## FlowQueue (K109, idea from boardgame.io events.ts)

End-turn / set-phase requests stamped with the turn or phase and the call site. `flush(now, same, run)` runs the current ones, returns the stale ones it dropped, and throws past `max` runs (default 100) naming the call site.

## Use it in 10 lines

```ts
import { can, defineMachine, transition } from '../kit/state-machines/index'

const dialog = defineMachine({
  id: 'dialog',
  initial: 'closed',
  states: { closed: { on: { open: 'open' } }, open: { on: { close: 'closed' } } },
  describe: { purpose: 'The settings dialog', source: 'src/ui/dialog.ts' },
})
console.log(can(dialog, 'closed', 'open'), transition(dialog, 'closed', 'open')) // true 'open'
```
