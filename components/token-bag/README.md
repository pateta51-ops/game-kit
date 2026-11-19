# token-bag
A bag of tokens with its count; the draw shown as a 2D flight from the bag or a 3D shake-and-draw that never decides the draw, and falls back to 2D. Port of Warp's Edge `bag3d` (decision 017). `index.ts` is pure (loads in node); `ui.ts` adds React; `scene.ts` is the only file that imports three.js and is reached only through dynamic imports, so a game's main bundle does not carry it (the game depends on `three` and `@types/three` 0.170.0).

## The game passes
- `faceUrl(kind)`: the image (SVG or raster) of a token kind; it is rasterised once per session and size onto the coin's face (512 px, stepping down to keep GPU textures inside 32 MB).
- `exterior` (optional): a pre-painted `HTMLCanvasElement` (`EXTERIOR_WIDTH` x `EXTERIOR_HEIGHT`, used as is) or `(canvas, ctx) => void | Promise<void>`, painted once per function and cached (never repainted per scene mount); the cache is keyed by the print function, so pass a stable one: an inline arrow repaints every time; it paints the game's print on the cloth over the plain weave (`EXTERIOR_ACROSS`, `EXTERIOR_UP` give the texel scale; front of the bag at canvas x = W / 2). `backdrop`: clear colour (default `#0a121a`).
- `count`, `chosen` (`'2d' | '3d'` from settings), `speed` (the settings' factor: 1 normal, 2 slow, 0 none), `reduced()` (default `prefers-reduced-motion`).
- `draw`: `{ key, left, drawn }`, set when an answer drew: `left` is the view's unordered contents after the draw, `drawn` the tokens in draw order (the scene shows the bag before the draw: `drawContents`). Clear it in `onDrawDone(key)`.
- `children`: the 2D bag's face (the game's look); default is the count.

## What it does
- The dock is `[data-bag][data-place="bag"]` (`place` prop) in both modes: token-flights fly from it in 2D (speed 0, reduced motion, 2D mode, or a failed scene all end in `onDrawDone` so the game's flights show the draw).
- 3D: the bag rests as a canvas that renders a frame only when ready or resized (never a loop). A draw starts from the dock's bag in place, the camera pulls back, the backdrop fades in, the drawn tokens land face up in a row, any tap or key skips, then it returns to the dock.
- The engine has drawn already; the scene never waits the game. Which coin rises comes from the drawn kinds alone (`assignDraws`); its only randomness is a seeded layout of the pile (decoration, never `ctx.rng`).
- Session fallback to 2D (`getFallback`, `FALLBACK_TEXT`): no WebGL, the scene throws, context lost, below 30 fps for 2 s.
- Look: structure only (inline: fixed overlay, canvas size); style `data-part="token-bag"`, `token-bag-count`, `token-bag-n`, `token-bag-draw`, `token-bag-skip`. Not here: Warp's token tables, a game's draw events (the game maps them to `draw`).

- K441: the Draw hides every dock bag at any time (class `token-bag-drawing` on `<html>`, one injected style), keeps the count and hint inside the safe area and grows them with `clamp()`, ends when `back()` rejects, and with `e2eHooks` (default off) sets `window.__bag3dStats()` / `window.__bag3dSeek(t)` for e2e while it plays (cleanup removes only its own).

## Finite supply (K373)
`supply.ts`: the engine keeps integers, the table draws the box's real pieces. `placeTokens(places, box)` gives each place (in order) the change of its number out of what the ones before it left, largest values first, at most its `cap`; what the supply or the cap cannot draw is `short` (show it as a badge; the number beside it stays exact). Also `makeChange`, `countOf`, `valueOf`, `tokenSplit` (no supply limit), `heapOf` and `heapSpot` (the supply as a heap that keeps its shape), `discStack`, `heldAndAside`. A game's counts per kind and value are its own.

## Use it in 10 lines
```ts
import { placeTokens } from '../kit/token-bag/index'

const box = { coin: { 3: 6, 1: 10 } } // the game's component list
const { places, supply } = placeTokens([{ id: 'mat', kind: 'coin', amount: 7, cap: 7 }], box)
console.log(places.mat, supply.coin) // { tokens: [3, 3, 1], short: 0 } and what is left
```

```ts
import { assignDraws, drawContents, rateFor } from '../kit/token-bag/index'

const contents = drawContents(['coin', 'gem'], ['coin']) // the bag before the draw
console.log(assignDraws(contents, ['coin'])) // which coin rises: one carrying the drawn kind
console.log(rateFor(1), rateFor(2), rateFor(0)) // 1, 0.5, 0: no scene at speed 0
```

```tsx
import { TokenBag } from '../kit/token-bag/ui'

export const Bag = ({ n, drawn, left }: { n: number; drawn: string[]; left: string[] }) => (
  <TokenBag count={n} chosen="3d" speed={1} faceUrl={(k) => `/tokens/${k}.svg`} draw={drawn.length ? { key: n, left, drawn } : null} onDrawDone={() => undefined} />
)
```
