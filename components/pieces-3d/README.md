# pieces-3d

Pieces built in code, no model file: a rounded d6 and a ten-sided die (WebGL), a seamed ball that rolls by distance, a chip with thickness, an extruded die-cut token (WebGL), card edge and cast shadow. Owner's rule: simple shapes made in code may be true 3D; nothing modelled or generated.

## Rules for agents

**What it does:** Pieces built in code (dice, ball, chip, tilted card), no model files.

**You must:**
1. Import `ui.ts` for `Ball` and `Chip` (it loads `pieces3d.css`); import the pure parts from `index.ts`.
2. Start dice once with `startDiceLayer(look)`, keep `stop()`; it returns `null` without WebGL, so keep each die's own flat children as the fallback (shown unless `p3-gl` is on `<html>`).
3. Mark dice `data-p3-die="d6|d10"` with `data-v`; animate them with `data-roll` / `data-turn`.
4. Pass colours, fonts and tilts from the game's tokens (`look`); set `--piece-tilt` per game.
5. Import the animation verbs (`shake`, `flip`, `move`, `settle`) from `pieces-3d-verbs`, not from here.
6. Only simple code-built shapes; never add a modelled or generated mesh.
7. A transparent round or irregular token in a `<Chip>` needs `dieCut`; without it a dark rectangle shows behind the picture.
8. A token that should be a true 3D piece (thickness, a back, turned over): `<Token src back? mm pxPerMm />` from `ui.ts`, with `startTokenLayer(look?)` started once and its `stop()` kept, as for the dice. `mm` is its real size, `pxPerMm` the game's one px-per-mm scale; never set its width or height another way. The scan must be readable by a canvas (same origin or CORS), or no outline can be traced and the flat chip stays.

**Common mistakes:**
- Importing the verbs from `pieces-3d` no longer works (moved).
- Assuming WebGL is present: the flat fallback must still read.


- Dice: `startDiceLayer(look, sel = '[data-p3-die]', on?)` draws every element matching `sel` with `data-p3-die="d6|d10"` and `data-v` as the solid (a canvas per die, one offscreen WebGL context). `data-roll="t0,dur,seed"` tumbles it to its value, `data-turn="t0,dur,out|in"` turns it a quarter (times of `performance.now()`). `look`: `{ body, ink, font, tilt }` (colours, the d10 numeral font, the resting tilt in radians). Returns `null` without WebGL. `on(ok)` (default: `p3-gl` on `<html>`) runs when it starts, stops, or loses and gets back its context. `stop()` removes its canvases and listeners and frees the context; nothing redraws after it.
- Fallback: without `p3-gl` the die's own children show (its flat form, `--die-depth`); with it they are hidden and the solid is drawn over them.
- Ball: `<Ball look />` (`ui.ts`) or a `canvas[data-ball]` painted with `paintBall(canvas, turn, look)`. `look`: `{ leather, seam?, curve?, stitch?, stitchCount?, stitchWidth?, stitchFlip?, seamLine?, seamLineWidth?, seamLineDash? }` (#rrggbb; `stitch: 'chevron'` draws rows of V stitches, `stitchCount` around the measured seam (default 56: 14 per visible arc at rest), each V symmetric about the seam with a 75 degree opening (`chevrons(curve, count)` gives each stitch's frame, `chevronPoints` its apex and arm ends), default seam colour #e63a30; `stitchWidth` = V half width as a fraction (default 0.14); `stitchFlip: true` turns the stitches on curve positions [0.25, 0.75) of the curve's point list (or a given `[from, to]`) the other way, so both visible arcs point the same screen way, switching at `twoArcSeam()`'s far points (still hidden when the game rotates the curve about the view axis); `seamLine` (#rrggbb) + `seamLineWidth` (fraction of the diameter, default 0.01) draw a line under the stitches through every apex (`seamLineDash`: dashes instead, one per stitch centred on its apex, this fraction of the stitch spacing long, round ends; 0/unset = solid), instead of the default bars and groove (XD-63); `curve` = points on the unit sphere, default `twoArcSeam()`). `rolled(from, dx, dy, size, perTurn)`, `turnOf(px, size, perTurn)`: one turn per `perTurn * size` px (default 345/110).
- Chip: `<Chip src alt />`, a slab of thickness `--chip-thickness`. Cards: class `p3-lying-card` or `p3-lifted-card`. Resting tilt of any static element (a swatch, a flat piece): class `p3-tilt`, angle from `--piece-tilt` (default 15deg, set it inline or per game); `<Chip tilt="20deg" />` sets it on a chip. `<Chip dieCut />` (opt-in): for a round or irregular transparent token, the edge and the cast shadow follow the picture's alpha outline and the rectangle layers are off; without it the chip is a rectangular slab.
- Token (K718): `<Token src back? mm={{ w, h, thickness }} pxPerMm edge? tilt? turn? spin? />` (`ui.ts`) is a die-cut scan (PNG or WebP with alpha, any shape) drawn as a true extruded solid by `startTokenLayer(look = { tilt?, edge? }, sel = '[data-p3-token]', on?)`: one offscreen WebGL context, a canvas per token, `stop()` frees it. The outline is traced from the scan's alpha (`traceAlpha`, `simplify`), filled (`triangulate`) and pushed to its thickness (`extrude`); front textured with `src`, back with `back` or the front seen through (mirrored), side walls in `edge` or the mean colour just inside the scan's edge (`edgeColour`, darkened). Size = `mm` x `pxPerMm` (`tokenSize`). `tilt`, `turn`, `spin` in radians (rotations about x, the upright axis, the view axis; `turn: Math.PI` shows the back; default tilt `look.tilt` or 15 degrees). Its flat form, the `<Chip dieCut>` inside, shows until the solid is drawn (`data-p3-drawn`), wherever WebGL is not (`startTokenLayer` returns `null`), and for an outline that pinches or touches itself (`extrude` returns `null`, `isSimple` false); an outline past `MAX_POINTS` (400) is simplified further first. Plain markup works too: `data-p3-token`, `data-src`, `data-back`, `data-size="w,h,d"` (px), `data-rot="tilt,turn,spin"`, `data-edge`.
- Verbs (`shake`, `flip`, `move`, `settle`, `copyPieces`) moved to `pieces-3d-verbs` (import from `../kit/pieces-3d-verbs/index`) (K235, breaking), so a 1.0 game does not pull the effects code.
- Pure (node): `cube`, `trapezohedron`, `mesh`, `rest`, `tumble`, `turned`, `front` (the value facing the viewer).
- Demo: `mountPiecesDemo(root, look?)` puts every piece on a page, an extruded hexagon token among them (`look.token`: your own scan); mount it on a dev route.

## Look

Every class of this component starts with `p3-`, and so do the `data-p3-*` attributes; the dice and ball attributes `data-roll`, `data-turn`, `data-v` and `data-ball` do not. CSS variables (`pieces3d.css`, imported by `ui.ts`): `--card-shadow`, `--card-shadow-lifted`, `--chip-core-1..3`, `--chip-thickness`, `--chip-depth`, `--piece-tilt`, `--piece-perspective`, `--piece-shadow`, `--piece-shadow-ink`, `--die-depth`, `--die-radius`, `--ball-radius`. Colours and the tilt of the dice and ball are parameters (read them from the game's tokens). Light is from the top-left.

Tests: `pieces3d.test.ts` (node: faces per value, ball turn per distance, geometry counts); `token.test.ts` (node: outline traced from a disc, hexagon and non-convex alpha, closed mesh counts, size); `chip.test.tsx` (jsdom: Chip, Token fallback); `pieces-3d-verbs`: the Chromium test of the demo.

## Use it in 10 lines

```ts
import { rolled, turnOf } from '../kit/pieces-3d/index'

console.log(turnOf(120)) // how far a ball turns for 120 px of travel; `rolled` applies it to a matrix
console.log(typeof rolled)
```

```tsx
import { Ball } from '../kit/pieces-3d/ui'

export const Pitch = () => <Ball look={{ leather: '#f6f3ea' }} width={96} height={96} />
```

```tsx
import { Token } from '../kit/pieces-3d/ui'
import { startTokenLayer } from '../kit/pieces-3d/index'

const layer = startTokenLayer() // once; null without WebGL (the flat chip shows)
export const Credit = () => <Token src="/tokens/credit.webp" mm={{ w: 25, h: 25, thickness: 2 }} pxPerMm={6} turn={Math.PI} />
export const stopTokens = () => layer?.stop()
```
