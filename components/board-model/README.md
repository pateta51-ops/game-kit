# board-model

Spaces as data, adjacency computed once, named placement kinds resolved by the board. Cards never filter spaces: card data names a kind (`'land'`, `'isolated'`), the board answers with the legal spaces. Pure functions, no packages. Idea from Terraforming Mars (GPL, written new).

## Rules for agents

**What it does:** Holds board spaces as data with adjacency built once, and resolves named placement kinds ("land", "isolated") to the legal spaces.

**You must:**
1. Build the board once with `createBoard(spaces, edges)` (or `hexRows`, or `fromLayout(parseLayout(svg))`) and update it with `setSpace`, which returns a new board.
2. Give every space a unique `id` and make every edge name existing spaces; a duplicate id or an unknown edge end throws.
3. Put placement rules in kinds `(board, space, ctx) => boolean`: spread `baseKinds()` and add the game's own kinds.
4. Let card data name a kind and ask `availableSpaces(board, kinds, kind, ctx)`; never filter spaces in card code.
5. Pass the context a kind needs (for `away-from`: `{ tile }`).
6. Keep costs, bonuses and expansion tiles in the game's kinds, not in the board.
7. Use the opt-in `movement.ts` entry for weighted reachability and displacement (K602); supply costs, blockers, legal endpoints and interruption rules from the game. Never infer combat or collision outcomes.

**Common mistakes:**
- Asking for a kind the table lacks: `availableSpaces` throws `unknown placement kind`.
- Calling `setSpace` on an unknown id: it throws.
- Expecting `any`, `land` or `water` to include built-on spaces: they only return spaces with no `tile`.
- Mutating `board.spaces` directly: the board is shared between states.

- `createBoard(spaces, edges)`: `Space` is `{ id, type?, x?, y?, rect?, tile?, owner? }`. Adjacency is built once and is symmetric. `neighbours(board, id)`.
- `hexRows(rows)`: offset-row hex map from rows of types (`null` = hole); ids `r,c`.
- `fromLayout(parseLayout(svg), typeOf?)`: adapter for `board-layout` output (`nodes`, `edges`); rect centres become x, y.
- `setSpace(board, id, patch)`: pure update; adjacency is shared.
- `availableSpaces(board, kinds, 'isolated', ctx?)`: `kinds` is a table of `(board, space, ctx) => boolean`. `baseKinds()` has `any`, `land`, `water`, `isolated`, `away-from` (ctx `{ tile }`); spread it and add the game's own.
- `emptyBoard(n, type?)`: test fixture of free, unconnected spaces.

Costs, bonuses and expansion tiles belong in the game's kinds, not here.

## Use it in 10 lines

```ts
import { availableSpaces, baseKinds, createBoard } from '../kit/board-model/index'

const board = createBoard(
  [{ id: 'a', type: 'land' }, { id: 'b', type: 'water' }, { id: 'c', type: 'land' }],
  [['a', 'b'], ['b', 'c']],
)
const kinds = { ...baseKinds(), shore: (b: typeof board, s: { id: string }) => (b.adjacency[s.id] ?? []).length > 1 }
console.log(availableSpaces(board, kinds, 'land').map((s) => s.id))
```

## Movement rules (K602)

Import `reachableMoves` and `displaceAlong` from `board-model/movement.ts`. `reachableMoves(board, from, { points, cost, end?, stop? })` returns the cheapest legal path per destination in board order. `cost(from,to)` returns a positive integer or null to block a step. A legal transit space need not be a legal endpoint; a mandatory stop can be reached but not expanded. Costs and conditions must be pure functions over the starting board and the edge, not path-dependent effects. This is not enumeration of every possible path. Use a game-specific step-by-step action when moving changes the legal options. `displaceAlong(board, from, line, { steps, blocked?, stop? })` follows the game-supplied ordered line after the origin, checks adjacency and blockers, returns destination, visited path, remaining steps and the reason it stopped. It does not push other pieces, consume resources or apply collision damage. The game can resume movement with the returned remaining points after resolving an interruption. Both helpers are pure and leave the existing board-model entry unchanged.
