# board-registry

The board UI's registry of things (space, piece, marker, stack), highlighted straight from the legal-action list, plus stack layout for pieces sharing a space. Pure functions, no packages, no DOM: the game's React (or other) view reads the results. Idea from Rally the Troops `world.js` (ISC, written new). 1.0: no animation; movement is a change of `space` in the registry, which a later layer can tween.

- `define(reg, { type, id, space? })`, `remove`, `moveTo(reg, type, id, space)`, `get`, `inSpace(reg, space, type?)` (definition order = stack order, bottom first). `emptyRegistry()`; all updates are pure.
- `Actions`: what a prompt offers, `{ space: ['a','b'], piece: { p1: 1, p2: 0 } }`; a list is legal ids, a table maps id to 1/true (legal) or 0/false (shown but barred).
- `mark(actions, type, id)`: `'legal' | 'barred' | 'none'`. `highlighted(reg, actions)`: every registered thing marked, for the class `action` / `barred`; a click handler sends only these.
- `unknownOffered(reg, actions)`: offered ids the registry lacks (a test can assert none).
- `stackLayout(n, opts)`: offsets `{ dx, dy }` from the anchor. `collapsed` step per piece; expanded (`expanded` or `n <= threshold`) steps `major` along a row of `wrap`, `minor` between rows; `bounds` + `anchor` + `size` shift the splay to stay inside the board padding. Expand on click or focus and raise z-index in the view.

Pairs with `board-model` (spaces, adjacency, `fromLayout`) and `board-layout` (click rects: `spaceAt`). Words shown on screen are the game's.
