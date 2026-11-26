# growing-map

Explore a board by drawing from a seeded tile deck and joining a tile's new spaces at open edges. The game supplies tile geometry and decides which edges fit.

## Rules for agents

1. Call `createGrowingMap(board, openEdges, tiles, ctx.rng)` during engine setup. Supply a `board-model` board and game-defined tile IDs. The engine shuffles the IDs once and `growMap` takes the first remaining tile. Repeat IDs represent multiple copies of a tile.
2. Give each `OpenMapEdge` a unique ID and the ID of its owning board space. Generate new space and edge IDs from their placement so repeated tiles can coexist. Use stable IDs for prompts.
3. In the action handler, pass the selected edge ID and a pure placement policy to `growMap`. For the supplied tile and open edge, return the new `spaces`, their internal `links`, the `joins` from open edge IDs to new space IDs, and the tile's new `openEdges`. Return `null` when the tile cannot be placed there. The game checks geometry, overlap and joining rules in this policy.
4. Replace the authoritative state with `result.map` only on `kind: 'grew'`. With the engine draft, assign it as `result.map as Draft<GrowingMap>` to the top-level map field. Keep the map and its space records immutable. The board, deck and edge markers advance together. For `blocked`, `closed-edge` or `empty-deck`, the result contains the input map and the deck stays in order. Invalid placement data throws before changing the map.
5. Keep remaining tile order in engine state. Redact it from player views and emit a revealing event when the tile identity becomes public.

One action must join the selected edge. It can join more marked edges to the same tile if the game permits it. Every join consumes the named marker and connects its existing space to a new tile space. Internal links and new markers can name only new tile spaces. Existing spaces, ownership and neighbor order are preserved. The game supplies coordinates, turning and collision rules. Use `grid-map` separately when you need square-grid geometry.

## Use it in 10 lines

```ts
import { createBoard } from '../kit/board-model/index'
import type { CtxRng } from '../kit/engine-core/index'
import { createGrowingMap, growMap } from '../kit/growing-map/index'

export function explore(rng: CtxRng) {
  const map = createGrowingMap(createBoard([{ id: 'home' }]), [{ id: 'east', space: 'home' }], ['room'], rng)
  return growMap(map, 'east', tile => ({
    spaces: [{ id: tile }], links: [], joins: [{ edge: 'east', space: tile }], openEdges: [],
  }))
}
```
