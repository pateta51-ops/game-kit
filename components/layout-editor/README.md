Arrange the zones of a game screen by hand (card zones, piles, hand, market, tracks, log, buttons) in a one-file wireframe editor; its JSON is a `board-layout` zones layout per screen.

## Rules for agents

**What it does:** A one-file wireframe editor that arranges a game screen's zones; its JSON is a `board-layout` zones layout per screen.

**You must:**
1. Open `editor.html` as is (no packages, no network); load a game's start with `window.LAYOUT_EDITOR_INIT = doc` before the script runs.
2. After editing `index.ts` run `node components/layout-editor/build.mjs`; the test fails while the generated copy in `editor.html` is stale.
3. Read the exported JSON with `normalizeDoc` and `screenLayout(doc, name)`; draw with `board-layout` `zone()` / `slots()`.
4. Honour `scale` per zone (draw cards at that fraction) and `kind` (`cards`, `component`, `pile`, `group`).
5. Make a starting wireframe from a running page with `node capture.mjs <url> <out.json>` (it reads `data-zone`).
6. Use the helpers (`mirrorZones`, `consolidate`, `split`, `cardFit`, `layoutWarnings`); they return new objects.

**Common mistakes:**
- Editing the generated copy in `editor.html` by hand.
- Expecting rotation, non-rectangular zones or overlapping fans: not supported.


## Parts
- `editor.html`: the editor. One file, no packages, no network: open it from disk, a dev server or a claude.ai artifact.
- `index.ts`: the logic it runs (pure, tested). `editor.html` carries a generated copy: after editing `index.ts` run `node components/layout-editor/build.mjs`; the test fails while the copy is stale.
- `capture.mjs <url> <out.json> [--w 3840 --h 2160] [--screen desktop] [--parts] [--wait ms]`: opens a running page (playwright-core) and records the rect of every `[data-zone="<id>"]` element (with `--parts`, every `[data-part]` too). An id without a dot nests under the nearest marked ancestor (`you` > `hand` gives `you.hand`). This turns a game's existing screen into its starting wireframe.
- `examples/two-player.json`: a two-player table (39 zones) and a phone screen.

## Document
```
{ "screens": { "<name>": { "w", "h", "card": [w, h], "pile"?: [w, h],
  "zones": { "<id>": { "r": [x, y, w, h], "label"?, "cards"?, "fan"?: "row"|"column"|"stack"|"grid",
    "kind"?: "cards"|"component"|"pile"|"group", "full"?, "scale"?, "locked"?, "hidden"? } } } } }
```
Each screen is a `board-layout` zones layout (`{ w, h, zones: { id: { r } } }`) plus optional fields, so `zone()`, `zonePct()` and `slots()` read it unchanged. Stage pixels. Nesting is by id: `you.hand` sits inside `you`. Import also takes a single layout (no `screens`, becomes screen `main`) and the older `zones: { id: [x, y, w, h] }`.

`cards` with `fan`: the cards sit side by side without overlap (row, column, one pile, or a grid) at the screen's `card` size; a zone too small gets a warning.

`scale` (K298, 0.2-1, absent = 1): the game reads it as "draw the cards in this zone at this fraction of the card size". A pile zone draws its tile at card size x `scale` (this overrides the pile size). Card-fit warnings use the scaled size, and the box label says "cards at 60%".

`kind` (K280; absent = as before: card outlines when `cards` is set, else a plain box):
- `cards`: the card outlines above.
- `component`: a digital part that is not a card (crew board, log, tracker, button, menu): dashed outline, label centred, no card outlines.
- `pile`: one compact pile tile (stacked-card outline, label, a `#` count placeholder) of the screen's `pile` size (default half the card size); `full: true` draws it at the card size. The warning checks the tile fits the box.
- `group`: a container (a player band): thin outline, label in a corner tab.

Consolidate: `consolidate(screen, ids, 'column'|'row', id?)` puts the pile-like zones (`pileLike`: kind `pile`, or a card zone with 1 card or `fan: "stack"`) as compact tiles in a new group `<common id prefix>.piles` (`piles` with none; `id` to choose; a taken default gets `-2`), children renamed `<group>.<last id part>`; the group records the old ids in `from`. `split(screen, id)` puts them back under their old ids at full card size in the group's place. `takeOut(screen, ids)` moves piles out of such a group, each back at full card size (kind `pile`, `full`) beside it, and shrinks the box to the piles left; with fewer than two left the box is removed (a split).

Screens named `mode/variant` (`solo/table`, `2p/rulebook`, `2p/columns`) show as mode tabs, then the current mode's variant tabs (`screenModes(names)`). `copyZones(from, to, id)` copies a zone with its children from another screen.

## Host page
- `window.LAYOUT_EDITOR_INIT = doc` before the editor's script runs: start from that doc instead of localStorage.
- `window.LAYOUT_EDITOR_BG_INIT = { "<screen>": { src, op } }` before the script runs: the starting backdrops (used when localStorage has none; Reset restores them; none when unset).
- `window.layoutEditor.reset()` (no confirmation): the doc, backdrops, selection, zoom (Fit) and screen go back to the start, undo history and the localStorage keys are cleared, onChange fires once. Also `.load(doc)`, `.get()`, `.onChange(fn)` (called with the doc after every change), `.zoom(z?, clientX?, clientY?)` (sets the zoom around a point, 1 = fit; returns it).
- Without a host it autosaves to localStorage (`layout-editor-doc`; backdrops in `layout-editor-doc-bg`).

## Helpers (`index.ts`)
`normalizeDoc(any)`, `screenLayout(doc, name)`, `childrenOf(doc, screen, id)`, `parentOf(screen, id)`, `moveZone`, `resizeZone(screen, id, r, keepChildren?)` (children scale with the parent, or keep their size), `mirrorZones(screen, ids, 'v'|'h', [from, to]?)`, `renameZone`, `snap(r, others, grid, tol, edges?)`, `cardFit(zone, card, cards?, fan?, scale?) -> { fits, perRow, scale }`, `layoutWarnings(screen)`, `alignZones`, `distributeZones`, `kindOf(zone)`, `pileSize(screen)`, `pileLike(zone)`, `consolidate`, `split`, `takeOut`, `copyZones`, `screenModes`, `stageView(sw, sh, fitW, fitH, viewW, viewH, zoom)` and `keepPoint` (zoom maths). All return new objects.

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
0. Hover any button or field: a short note says what it does and its shortcut.
1. Open `editor.html` (double-click it, or the link the architect gives you). It starts with the last layout you had, or the one the game sent.
2. Mouse or finger: drag a box to move it; drag the white squares to resize; click to select; Shift+click (or the **Multi** button on a phone) adds to the selection; drag on empty space to select every box inside the frame.
3. **Snap to grid** (on: faint grid lines, the size beside it) and **Snap to zones** (edges and centres of other boxes, pink lines) are separate toggles. Hold **Alt** to move freely. Arrow keys move the selection 1 px, Shift+arrow 10 px.
4. A box inside another (`you.hand` in `you`) moves with it; resizing the outer box scales the inner ones (tick **keep size** to keep them as they are).
5. Right panel: **Screen** (name, size, card size and a card scale slider, backdrop picture with its opacity), **Zone** (id, label, position, how many cards and how they lie, mirror), **Warnings** (click one to select the box), **Zones** (the list; click to select, **shown/hidden**, **lock**).
6. Zoom: **+** / **−**, the % and **Fit** in the top bar; Ctrl+wheel or pinch zooms around the pointer. Pan with the scrollbars, the wheel, Space+drag, the middle button or two fingers. Names stay the same size on screen.
7. Kind (Zone panel): **component** for a part that is not a card (dashed), **pile** for a draw or discard pile (a small tile; tick **full size** for a card-size one), **group** for a player band. The pile size is under **Screen** (numbers or the % slider).
8. **Consolidate**: select two or more piles (Shift+click), pick column or row, click it: they become small tiles in one box `…piles` (rename it in **Id**). **Split** on that box puts them back at card size. Undo takes either back.
   - **Take one pile out of a consolidated box:** click the pile (in the **Zones** list), then **Take out**. It goes back to a full-size card pile beside the box and the box shrinks. Undo takes it back.
   - **Make a pile look like a card pile again:** select it, **Kind** → pile and tick **full size**; or select it inside the box and use **Take out**.
   - **Shrink one area's cards:** select the box, set **Card size here** (slider or number, 20-100%). That box draws its cards or pile at that share of the card size, says "cards at 60%" in its label, and the red edge goes if they now fit. The game must draw the cards smaller there.
9. Screens named `solo/table`, `2p/rulebook`: the tabs show the modes, then the variants. **Copy zones** (Screen panel) copies a box and what is inside it from another screen, e.g. the crew board from solo into 2p.
10. Top bar: screen tabs and **+ screen**, **Undo** / **Redo** (Ctrl+Z / Ctrl+Y), **+ Zone** (inside the selected box), **Duplicate**, **Delete**, **Forward** / **Back**, align (left, centre, right, top, middle, bottom) and distribute for several boxes.
11. **Mirror**: Flip turns the selection upside down (↕) or left-right (↔) inside the screen; type an id first (e.g. `claude`) to make a mirrored copy instead.
12. Red edge: the cards do not fit. Orange dashes: the box overlaps a neighbour or sticks out.
13. Send it back: **Import / Export**, then **Copy** (paste it in the chat) or **Download** (attach `layout.json`). **Load this text**, a file, or dropping a `.json` on the page brings one in; dropping a picture sets the backdrop.
14. **Reset** (top bar) asks "Reset everything?"; **Reset** (red) puts every screen and backdrop back to the starting layout, **Cancel** or Escape keeps your work. Undo cannot bring it back.

## Does not do
Rotation, non-rectangular zones, overlapping card fans (cards are drawn side by side), editing several zones' numbers at once.
