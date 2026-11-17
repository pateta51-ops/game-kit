Arrange the zones of a game screen by hand (card zones, piles, hand, market, tracks, log, buttons) in a one-file wireframe editor; its JSON is a `board-layout` zones layout per screen.

## Parts
- `editor.html`: the editor. One file, no packages, no network: open it from disk, a dev server or a claude.ai artifact.
- `index.ts`: the logic it runs (pure, tested). `editor.html` carries a generated copy: after editing `index.ts` run `node components/layout-editor/build.mjs`; the test fails while the copy is stale.
- `capture.mjs <url> <out.json> [--w 3840 --h 2160] [--screen desktop] [--parts] [--wait ms]`: opens a running page (playwright-core) and records the rect of every `[data-zone="<id>"]` element (with `--parts`, every `[data-part]` too). An id without a dot nests under the nearest marked ancestor (`you` > `hand` gives `you.hand`). This turns a game's existing screen into its starting wireframe.
- `examples/two-player.json`: a two-player table (39 zones) and a phone screen.

## Document
```
{ "screens": { "<name>": { "w", "h", "card": [w, h],
  "zones": { "<id>": { "r": [x, y, w, h], "label"?, "cards"?, "fan"?: "row"|"column"|"stack"|"grid", "locked"?, "hidden"? } } } } }
```
Each screen is a `board-layout` zones layout (`{ w, h, zones: { id: { r } } }`) plus optional fields, so `zone()`, `zonePct()` and `slots()` read it unchanged. Stage pixels. Nesting is by id: `you.hand` sits inside `you`. Import also takes a single layout (no `screens`, becomes screen `main`) and the older `zones: { id: [x, y, w, h] }`.

`cards` with `fan`: the cards sit side by side without overlap (row, column, one pile, or a grid) at the screen's `card` size; a zone too small gets a warning.

## Host page
- `window.LAYOUT_EDITOR_INIT = doc` before the editor's script runs: start from that doc instead of localStorage.
- `window.layoutEditor.load(doc)`, `.get()`, `.onChange(fn)` (called with the doc after every change).
- Without a host it autosaves to localStorage (`layout-editor-doc`; backdrops in `layout-editor-doc-bg`).

## Helpers (`index.ts`)
`normalizeDoc(any)`, `screenLayout(doc, name)`, `childrenOf(doc, screen, id)`, `parentOf(screen, id)`, `moveZone`, `resizeZone(screen, id, r, keepChildren?)` (children scale with the parent, or keep their size), `mirrorZones(screen, ids, 'v'|'h', [from, to]?)`, `renameZone`, `snap(r, others, grid, tol, edges?)`, `cardFit(zone, card, cards?, fan?) -> { fits, perRow, scale }`, `layoutWarnings(screen)`, `alignZones`, `distributeZones`. All return new objects.

## Use it in 10 lines

```ts
import { zone } from '../kit/board-layout/index'
import { cardFit, layoutWarnings, mirrorZones, normalizeDoc, screenLayout } from '../kit/layout-editor/index'

const doc = normalizeDoc({ w: 3840, h: 2160, zones: { you: [0, 1400, 3200, 760], 'you.hand': [40, 1820, 1500, 300] } })
let L = screenLayout(doc, 'main')
L = mirrorZones(L, ['you'], 'v', ['you', 'claude'])
const style = zone(L, 'claude.hand')
const fit = cardFit({ r: [40, 1820, 1500, 300] }, [180, 252], 7, 'row')
console.log(style, fit.fits, layoutWarnings(L))
```

## For the owner
1. Open `editor.html` (double-click it, or the link the architect gives you). It starts with the last layout you had, or the one the game sent.
2. Mouse or finger: drag a box to move it; drag the white squares to resize; click to select; Shift+click (or the **Multi** button on a phone) adds to the selection; drag on empty space to select every box inside the frame.
3. Boxes snap to the grid (**Grid**) and to the edges and centres of other boxes (pink lines). Hold **Alt** to move freely. Arrow keys move the selection 1 px, Shift+arrow 10 px.
4. A box inside another (`you.hand` in `you`) moves with it; resizing the outer box scales the inner ones (tick **keep size** to keep them as they are).
5. Right panel: **Screen** (name, size, card size and a card scale slider, backdrop picture with its opacity), **Zone** (id, label, position, how many cards and how they lie, mirror), **Warnings** (click one to select the box), **Zones** (the list; click to select, **shown/hidden**, **lock**).
6. Top bar: screen tabs and **+ screen**, **Undo** / **Redo** (Ctrl+Z / Ctrl+Y), **+ Zone** (inside the selected box), **Duplicate**, **Delete**, **Forward** / **Back**, align (left, centre, right, top, middle, bottom) and distribute for several boxes.
7. **Mirror**: Flip turns the selection upside down (↕) or left-right (↔) inside the screen; type an id first (e.g. `claude`) to make a mirrored copy instead.
8. Red edge: the cards do not fit. Orange dashes: the box overlaps a neighbour or sticks out.
9. Send it back: **Import / Export**, then **Copy** (paste it in the chat) or **Download** (attach `layout.json`). **Load this text**, a file, or dropping a `.json` on the page brings one in; dropping a picture sets the backdrop.

## Does not do
Zoom and pan (the screen always fits the window), rotation, non-rectangular zones, overlapping card fans (cards are drawn side by side), editing several zones' numbers at once.
