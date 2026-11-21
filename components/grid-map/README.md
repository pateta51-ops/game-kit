# grid-map

A square grid with walls as data: adjacent spaces, distance, every shortest path, line of sight, tiles that turn, and targeting shapes (within range, adjacent, row, column, line, area). Pure functions, no state, no packages, draws nothing. Written for the kit.

## Use it in 10 lines

```ts
import { gridMap, lineOfSight, neighbours, rotateTile, shortestPaths, within } from '../kit/grid-map/index'

const g = gridMap({
  rows: 4, cols: 6,
  walls: [[0, 0, 'e'], [3, 1, 'n']], // [row, col, side of that cell]
  merges: [{ id: 'hall', cells: [[1, 3], [1, 4]] }],
  tiles: [{ id: 'A', row: 0, col: 0, rows: 4, cols: 3 }, { id: 'B', row: 0, col: 3, rows: 4, cols: 3 }],
})
console.log(neighbours(g, 'r0c0'), within(g, 'r0c0', 2, { sight: true }), lineOfSight(g, 'r1c2', 'hall'))
const { paths, overflow } = shortestPaths(g, 'r0c0', ['hall', 'r3c5'], { diagonal: true, maxPaths: 8 })
const turned = rotateTile(g, 'A', 180) // turned.grid is the new grid, turned.map['r0c0'] === 'r3c2'
console.log(paths, overflow, turned.map)
```

## Rules for agents

**What it does:** Answers "what is next to, how far, which ways, can it see, what does this shape cover" on a square grid with walls, merged spaces and turnable tiles. It holds no pieces and knows no rule of any game.

**You must:**
1. Build the grid once with `gridMap({ rows, cols, walls?, merges?, tiles? })` and keep the result in game state or beside it; every call takes it as the first argument and none changes it. `gridMap({ rows, cols })` is a plain open grid.
2. Name spaces as the grid does: `r<row>c<col>` (row 0 at the top, column 0 at the left) for a plain cell, the merge's own id for a merged space. `spaceAt(g, row, col)` and `cellsOf(g, space)` convert.
3. Write a wall as `[row, col, side]` with side `n`, `e`, `s` or `w` of that cell. Marking either cell of an edge makes it a wall; mark it on the cell of the tile the wall is printed on, because a wall turns with the tile whose cell marks it.
4. Keep each merge inside one tile (or outside all tiles) and give it an id that is not of the form `r1c2`; `gridMap` throws otherwise.
5. After `rotateTile(g, tile, 180)` use the returned `grid` from then on and move every piece with the returned `map` (old space id to new space id; every space of the grid is in it).
6. Pick the wall reading on purpose for each targeting shape (table below) and pass the option; never filter the result by hand to add or remove walls.
7. Pass `area` exactly one of `{ square: true }` or `{ diamond: true }`; it throws without.
8. Check `overflow` from `shortestPaths` before treating `paths` as the full list, and `null` from `distance` (no way there).
9. Take the diagonal at a wall's free end from the game's rulings, never from a guess: `wallEnd: 'closed'` (the default) bars a diagonal step through any corner a wall touches; `wallEnd: 'open'` allows it through the free end of a single wall segment and still bars it where two or more segments meet. Pass the same value to every call that takes it (`neighbours`, `distance`, `shortestPaths`, `within`, `adjacent`, `line` with `stopAtWall`).
10. Keep step costs, movement rules, who blocks whom and what a card may target in the game: filter the ids these calls return.

**Common mistakes:**
- Expecting a wall to block line of sight between two cells whose shared corner is the free end of that wall: touching one free wall end is clear. A corner where two or more wall segments meet blocks, and so does a wall end on the border of the board: a wall across the full width blocks sight completely.
- Marking a wall on the border of the board to block sight: such a wall blocks no sight and no step (nothing lies beyond it).
- Expecting a diagonal step past a corner a wall touches, or into or out of a merged space: neither is a step (the first changes with `wallEnd: 'open'`). A diagonal between two plain cells past the corner of a merged space is a step.
- Comparing path order with reading order: paths are ordered by plain string comparison of their space ids (`r10c0` sorts before `r2c0`); every other list is in reading order (top row first, left to right; a merged space sits at its first cell).
- Asking about a space id the grid lacks: every call throws `unknown space` (targets in a `to` set that the grid lacks are skipped).
- Turning a tile by 90: only 180 is accepted.
- Using this for a hex or free-form board: that is `board-model`.

## Calls

- `neighbours(g, space, { diagonal?, wallEnd? })`: spaces one step away. A step crosses an edge with no wall. With `diagonal`, also the diagonal cell across a shared corner when no wall segment touches that corner (`wallEnd: 'open'`: when at most one does) and neither cell is part of a merged space; the two other cells at the corner may be.
- `distance(g, from, to, { diagonal?, wallEnd? })`: fewest steps to the nearest of `to` (one id, an array or a set); a merged space is one step; `null` when cut off.
- `shortestPaths(g, from, to, { diagonal?, wallEnd?, maxPaths = 64 })`: `{ distance, paths, overflow }`. Every shortest path, each from `from` to a target, in a fixed order; at most `maxPaths` of them, and `overflow: true` when more exist. Target: under 1 ms at the 95th percentile on a 9 x 8 grid; the test asserts under 5 ms, the margin for a shared CI machine.
- `lineOfSight(g, a, b)`: true when some straight segment from a corner of one of a's cells to a corner of one of b's cells shares no point with a wall. One exception: the segment may touch the free end of a single wall segment. It may not touch a point where two or more wall segments meet, touch a wall end that lies on the border of the board, cross a wall, or run along one. Walls lying on the border itself are left out. A space always sees itself.
- `rotateTile(g, tile, 180)`: `{ grid, map }`. The tile's cells, its merges and the walls its cells mark turn half a circle about the tile's centre; a wall marked from a neighbouring tile's cell stays. The tile's `turn` flips between 0 and 180, so turning twice gives a grid equal to the first.
- `tileOf(g, space)` (tile id or `null`), `spacesOf(g, tile)`, `adjacentTiles(g, tile)` (tiles sharing a stretch of border; touching at a corner does not count; walls do not matter).

## Targeting shapes

Each returns space ids in reading order (`line`: in order along the line) and works on a grid with no walls.

| Shape | Covers | Walls by default | Option for the other reading |
|---|---|---|---|
| `within(g, from, n, { diagonal?, wallEnd?, throughWalls?, sight? })` | spaces 1 to n steps away, not `from` | respected: steps go round walls | `throughWalls: true` counts cells as if no wall stood; `sight: true` keeps only spaces `from` sees |
| `adjacent(g, space, { diagonal?, wallEnd?, throughWalls? })` | the next spaces, orthogonal or also diagonal | respected, as in `neighbours` | `throughWalls: true` |
| `rowOf(g, space, { stopAtWall? })`, `columnOf(...)` | every space in the row or column, the space itself included | ignored | `stopAtWall: true` stops each way at the first wall crossed |
| `line(g, from, direction, { length?, stopAtWall?, wallEnd? })` | the cells in one of `n ne e se s sw w nw`, nearest first, not `from` | ignored | `stopAtWall: true` stops at a walled edge, or for a diagonal at a corner a wall touches (`wallEnd: 'open'`: a corner two or more touch) |
| `area(g, centre, radius, { square \| diamond, sight? })` | cells within `radius` counted as a square (diagonals count 1) or a diamond (they count 2), the centre included | ignored | `sight: true` keeps only spaces the centre sees; for a blast that goes round walls use `within` |

`throughWalls` still never steps diagonally into or out of a merged space. A merged space is covered when any of its cells is; a shape from a merged space starts from each of its cells.

## From a board-model board

`board-model` holds any board as spaces and edges; `grid-map` is for the case where those spaces are the cells of a square grid. Give each `board-model` space its cell as `x` (column) and `y` (row), then build `gridMap({ rows: max y + 1, cols: max x + 1 })` and keep the table `r<y>c<x>` to board space id (the last test in `grid-map.test.ts` does this for a 3 x 3 board with no walls). Edges the board lacks between neighbouring cells become walls: `[y, x, side]`. Keep placement kinds, owners and tiles on the `board-model` board and ask `grid-map` only for distance, sight and shapes; the two components do not import each other.
