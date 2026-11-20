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
