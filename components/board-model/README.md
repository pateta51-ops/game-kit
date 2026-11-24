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
7. Use the opt-in `movement.ts` entry for weighted reachability and displacement (K602); supply costs, blockers, legal endpoints and interruption rules from the game. Pass collision permission explicitly. Apply the full chain plan in one engine transition, and handle combat or other interruptions in the game.

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

Import `reachableMoves` from `board-model/movement.ts`. It returns the cheapest legal path per destination in board order. Return a nonnegative safe integer from `cost(from, to)`, or null to block an edge. Directed adjacency is respected. A legal transit space can be excluded as an endpoint. A mandatory stop is reachable but cannot be expanded. Equal-cost paths keep the first route found when the frontier is visited in board order. Costs and reachability predicates must depend on the starting board and edge. Use step-by-step game actions when movement changes the legal options.

`displaceAlong(board, from, line, { steps, blocked?, stop? })` follows a supplied line for a single piece. It reports progress, remaining steps and the stop reason.

`displaceChain(board, from, occupants, { steps, next, blocked?, canPush?, stop? })` plans a forced move on a one-piece-per-space snapshot. Pass a map from space to piece ID. `next(space)` supplies the next space toward the push or pull, for example the first space from grid-map's `line`. Without `canPush`, an occupied destination blocks the move. The planner checks each link against adjacency and the game's blockers and prevents cycles. A blocked plan or a line that ends early returns no moves and leaves all steps outstanding. An interruption returns a complete, simultaneous prefix and the steps remaining for the game to resolve and resume.

Apply all returned moves together as origin-to-final updates in an engine action. Validate the settled state with the game's occupancy invariant. The game supplies collision permissions and resolves costs, hazards and combat. Both planners leave their inputs untouched.
