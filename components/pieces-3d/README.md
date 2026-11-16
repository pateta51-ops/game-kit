# pieces-3d

Pieces built in code, no model file: a rounded d6 and a ten-sided die (WebGL), a seamed ball that rolls by distance, a chip with thickness, card edge and cast shadow. Owner's rule: simple shapes made in code may be true 3D; nothing modelled or generated.

- Dice: `startDiceLayer(look, sel = '[data-p3-die]', on?)` draws every element matching `sel` with `data-p3-die="d6|d10"` and `data-v` as the solid (a canvas per die, one offscreen WebGL context). `data-roll="t0,dur,seed"` tumbles it to its value, `data-turn="t0,dur,out|in"` turns it a quarter (times of `performance.now()`). `look`: `{ body, ink, font, tilt }` (colours, the d10 numeral font, the resting tilt in radians). Returns `null` without WebGL. `on(ok)` (default: `p3-gl` on `<html>`) runs when it starts, stops, or loses and gets back its context. `stop()` removes its canvases and listeners and frees the context; nothing redraws after it.
- Fallback: without `p3-gl` the die's own children show (its flat form, `--die-depth`); with it they are hidden and the solid is drawn over them.
- Ball: `<Ball look />` (`ui.ts`) or a `canvas[data-ball]` painted with `paintBall(canvas, turn, look)`. `look`: `{ leather, seam, curve? }` (#rrggbb; `curve` = points on the unit sphere, default `twoArcSeam()`). `rolled(from, dx, dy, size, perTurn)`, `turnOf(px, size, perTurn)`: one turn per `perTurn * size` px (default 345/110).
- Chip: `<Chip src alt />`, a slab of thickness `--chip-thickness`. Cards: class `p3-lying-card` or `p3-lifted-card`. Resting tilt of any static element (a swatch, a flat piece): class `p3-tilt`, angle from `--piece-tilt` (default 15deg, set it inline or per game); `<Chip tilt="20deg" />` sets it on a chip.
- Verbs: `registerPieceVerbs(verbs, { ballLook?, perTurn? })` after `registerEffects`: on a die (with `p3-gl`) `shake` tumbles and `flip` turns the first die out and the next in (actor class `fx-two` holds both faces; `data-fx-flipped` at half way); on a ball `move` rolls and `settle` rocks back. Any other actor gets the library's verb. Layer option `onActor: copyPieces(ballLook)` repaints a clone's ball and copies its other canvases.
- Pure (node): `cube`, `trapezohedron`, `mesh`, `rest`, `tumble`, `turned`, `front` (the value facing the viewer).
- Demo: `mountPiecesDemo(root, look?)` puts every piece on a page; mount it on a dev route.

## Look

Every class of this component starts with `p3-`, and so do the `data-p3-*` attributes; the dice and ball attributes `data-roll`, `data-turn`, `data-v` and `data-ball` do not. CSS variables (`pieces3d.css`, imported by `ui.ts`): `--card-shadow`, `--card-shadow-lifted`, `--chip-core-1..3`, `--chip-thickness`, `--chip-depth`, `--piece-tilt`, `--piece-perspective`, `--piece-shadow`, `--piece-shadow-ink`, `--die-depth`, `--die-radius`, `--ball-radius`. Colours and the tilt of the dice and ball are parameters (read them from the game's tokens). Light is from the top-left.

Tests: `pieces3d.test.ts` (node: faces per value, ball turn per distance, geometry counts); `pieces3d.e2e.test.ts` (Chromium: the demo draws every piece; skipped off CI without it).
