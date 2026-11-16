# board-registry

The board UI's registry of things (space, piece, marker, stack), highlighted straight from the legal-action list, plus stack layout for pieces sharing a space. Pure functions, no packages, no DOM: the game's React (or other) view reads the results. Idea from Rally the Troops `world.js` (ISC, written new). Movement is a change of `space` in the registry; the animation is opt-in (last line).

- `define(reg, { type, id, space? })`, `remove`, `moveTo(reg, type, id, space)`, `get`, `inSpace(reg, space, type?)` (definition order = stack order, bottom first). `emptyRegistry()`; all updates are pure.
- `Actions`: what a prompt offers, `{ space: ['a','b'], piece: { p1: 1, p2: 0 } }`; a list is legal ids, a table maps id to 1/true (legal) or 0/false (shown but barred).
- `mark(actions, type, id)`: `'legal' | 'barred' | 'none'`. `highlighted(reg, actions)`: every registered thing marked, for the class `action` / `barred`; a click handler sends only these.
- `unknownOffered(reg, actions)`: offered ids the registry lacks (a test can assert none).
- `stackLayout(n, opts)`: offsets `{ dx, dy }` from the anchor. `collapsed` step per piece; expanded (`expanded` or `n <= threshold`) steps `major` along a row of `wrap`, `minor` between rows; `bounds` + `anchor` + `size` shift the splay to stay inside the board padding. Expand on click or focus and raise z-index in the view.

Pairs with `board-model` (spaces, adjacency, `fromLayout`) and `board-layout` (click rects: `spaceAt`). Words shown on screen are the game's.
- Movement (K235, breaking: now `../kit/effect-library/index`, file `movement.ts`; opt-in, pure): `placements(reg, { rectOf, size?, stack?, types? })` gives each piece rect (`type:id`; its space rect plus its `stackLayout` offset); `movements(prevReg, nextReg, opts)` gives `{ moves, ghosts }` from the effect library `entryMotions` (a Motion per piece whose rect changed, restacked ones too; `arc`, `stagger` pass through). Play them with `move` verbs; never calling it leaves the board as it was.

## Use it in 10 lines

```ts
import { define, emptyRegistry, highlighted } from '../kit/board-registry/index'

let reg = emptyRegistry()
reg = define(reg, { type: 'space', id: 'rome' })
reg = define(reg, { type: 'piece', id: 'p1', space: 'rome' })
// what the open prompt offers: spaces by id, pieces legal (1) or barred (0)
console.log(highlighted(reg, { space: ['rome'], piece: { p1: 1 } }))
```
