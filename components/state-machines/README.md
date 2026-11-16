# state-machines

Explicit state machines as plain tables. `index.ts` loads in node and needs no package; `ui.ts` holds the React hook and needs `react`.

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
