# Weighted movement and displacement

Import `reachableMoves`, `displaceAlong`, `displaceChain` and their types from [`movement.ts`](movement.ts). Pass a `Board` from [`index.ts`](index.ts) with `spaces`, `order` and `adjacency` keyed by space ID. `createBoard` makes symmetric edges. Supply directed adjacency on the board for one-way routes.

## Weighted destinations

`reachableMoves(board, from, { points, cost, stop?, end? }): Destination[]`

- `points` is a nonnegative safe integer. `cost(from, to)` returns a nonnegative safe integer (zero is allowed) or `null` to block the edge.
- `stop(space)` returning true prevents expanding the route at that space. `end(space)` returning false excludes the space from the results but permits transit.
- Each destination is `{ space: string, cost: number, path: readonly string[] }`. Its cheapest path includes the origin and destination. The origin is excluded from the destinations. Results are in board order. Equal-cost routes keep the first one found when expanding the frontier in board order.
- Keep costs and predicates stable for one search. Use step-by-step engine actions when movement changes the available options.

## Forced movement

`displaceAlong(board, from, line, { steps, blocked?, stop? })` follows a single piece along the sequence of spaces after the origin. `steps` is a nonnegative safe integer. `blocked(from, to)` bars an edge and `stop(space)` interrupts after arriving. It returns `{ path, destination, moved, remaining, stop }` and can report partial movement on `blocked` or `endOfLine`.

`displaceChain(board, from, occupants, { steps, next, blocked?, canPush?, stop? })` plans from a one-piece-per-space `ReadonlyMap<string, string>` of space ID to piece ID. Supply these game policies:

| Option | Contract |
|---|---|
| `steps` | Nonnegative safe integer distance for the lead piece |
| `next(space)` | Next adjacent space in push or pull direction, or `undefined` at the end |
| `blocked(piece, from, to)` | True to bar that piece from crossing the edge |
| `canPush(moving, occupant)` | True to permit displacing that occupant. Occupied destinations block without permission. |
| `stop(space)` | True to interrupt at the lead piece's new space if steps remain |

The result is `{ destination: string, moved: number, remaining: number, stop, moves: readonly PieceDisplacement[] }` where each move is `{ piece: string, from: string, to: string }`. `destination` and `moved` describe the lead piece. Under `complete`, every requested step was planned. Under `blocked` or `endOfLine`, the plan has no moves, the origin as its destination, and every step remaining. Under `interrupted`, `moves` is the whole simultaneous prefix and `remaining` is the distance still outstanding.

## Rules for agents

1. Call the planner inside the action using the current board and positions. Apply all origin-to-final updates as one new position record before checking settled occupancy. Both planners preserve their inputs.
2. Commit an interrupted chain's whole prefix together. Resolve the interruption with game rules, then replan from the lead piece's current position with the outstanding distance if it can resume. Keep collision permissions, costs, combat and continuation eligibility in game code.
3. [The maintained examples](examples/movement.ts) implement a one-way weighted route with zero-cost transit and a position update for full or interrupted chains. [The example tests](movement-example.test.ts) execute them, including blocked and short plans. The [engine integration test](../../tests/board-movement.integration.test.ts) runs the same batch update at the settled action boundary and checks occupancy.
