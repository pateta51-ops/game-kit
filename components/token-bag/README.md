# token-bag
A bag of tokens with its count; the draw shown as a 2D flight from the bag or a 3D shake-and-draw that never decides the draw, and falls back to 2D. Port of Warp's Edge `bag3d` (decision 017). `index.ts` is pure (loads in node); `ui.ts` adds React; `scene.ts` is the only file that imports three.js and is reached only through dynamic imports, so a game's main bundle does not carry it (the game depends on `three` and `@types/three` 0.170.0).

## Rules for agents

**What it does:** A bag of tokens with its count; a draw shows as a 2D flight from the bag dock or a 3D shake-and-draw that never decides the draw, with a session fallback to 2D.

**You must:**
1. Install `react`, `react-dom` and `three` (with `@types/three`, 0.170.0) in the game; import from `ui` for React and `index` for the pure parts (loads in Node). Only `scene.ts` imports three.js, through dynamic imports, so never import it statically.
2. Pass `faceUrl(kind)` for every token kind, `count`, `chosen` (`'2d'` or `'3d'` from settings), `speed` (1 normal, 2 slow, 0 none) and `reduced()`.
3. Resolve the draw in the engine first: set `draw={{ key, left, drawn }}` when an answer drew (`left` the bag's unordered contents after the draw, `drawn` the tokens in draw order), and clear it in `onDrawDone(key)`.
4. Mark the dock `[data-bag][data-place="bag"]` (or the `place` prop); token-flights fly from it in 2D, and speed 0, reduced motion, 2D mode or a failed scene all end in `onDrawDone`.
5. Pass a stable `exterior` function or a ready canvas: the print is cached by the function, so an inline arrow repaints every time.
6. Never use the scene for randomness: which coin rises comes from the drawn kinds only (`assignDraws`); the pile layout is decoration, never `ctx.rng`.
7. For a finite box use `placeTokens(places, box)`; show `short` as a badge, since the number beside it stays exact.
8. For finite stocks and a bag in the engine (K593), import `stock.ts` from `index`: keep the `Stocks` in the game state, pass `ctx.rng` to `drawPieces`, and pass the short-bag rule of each kind of draw from the game's own `ShortBagRules` table; show `why` (or the game's words for `reason`) when `short` is above 0.
9. For e2e, set `e2eHooks` on `Draw` / `Rest` (default off); they set `window.__bag3dStats()`, `__bag3dSeek(t)` and `__bagDockFrames()` and remove only their own.

**Common mistakes:**
- Waiting for the scene before applying the draw: the engine has already drawn.
- Reading `ids` of a `fail` draw as drawn: `failed` true means nothing moved.
- Expecting 3D without WebGL, or below 30 fps for 2 s: it falls back to 2D for the session.

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

- K446: the Draw's count and hint are placed by its stylesheet (no inline positions; `--token-bag-inset`, default 16px, sets the margin). `Rest` takes `className`, `hostSized` (no inline 100% size; the host's CSS sizes the canvas) and `e2eHooks` (default off: sets `window.__bagDockFrames()`, the frames rendered so far; cleanup removes only its own). `TokenBag` still mounts `Rest` with the defaults.

## Finite supply (K373)
`supply.ts`: the engine keeps integers, the table draws the box's real pieces. `placeTokens(places, box)` gives each place (in order) the change of its number out of what the ones before it left, largest values first, at most its `cap`; what the supply or the cap cannot draw is `short` (show it as a badge; the number beside it stays exact). Also `makeChange`, `countOf`, `valueOf`, `tokenSplit` (no supply limit), `heapOf` and `heapSpot` (the supply as a heap that keeps its shape), `discStack`, `heldAndAside`. A game's counts per kind and value are its own.

## Finite stocks and a bag (K593)
`stock.ts`, engine-safe (pure, plain data, no DOM): every piece has an id (`kind#n`) and sits in exactly one place the game names. `makeStocks(counts)` builds the state from counts per place and kind; `piecesIn(s, place, kind?)` counts; `whereIs(s, id)`; `moveIds` / `returnPieces(s, ids, to)` move pieces. `gainPieces(s, from, to, n, kind?)` takes from a named stock: an empty or short stock gives what it has, no substitute, with `short`, `reason` (`empty` or `short`) and `why` (words a prompt can show). `drawPieces(s, ctx.rng, bag, to, n, rule)` draws one at a time, uniform over the bag; the rule (`ShortBag`) is the game's for that kind of draw: `drawLeft` (draw what is left), `refill` (when the bag runs out, every piece of `from` goes into the bag once, then the draw goes on; `refilled` counts them) or `fail` (fewer than `n` in the bag: nothing drawn, `failed`, state unchanged). Each call returns the new state; the old one is not changed.

```ts
import { drawPieces, gainPieces, makeStocks, piecesIn, type ShortBagRules, type StockRng } from '../kit/token-bag/index'

declare const rng: StockRng // ctx.rng in a handler
const rules = { turn: { do: 'refill', from: 'discard' }, effect: { do: 'fail' } } as const satisfies ShortBagRules
let s = makeStocks({ supply: { die: 6 }, bag: { cube: 2 }, hand: {}, discard: { cube: 3 } })
const got = gainPieces(s, 'supply', 'bag', 1, 'die') // got.reason 'empty' and got.why when the stock ran out
s = got.state
const d = drawPieces(s, rng, 'bag', 'hand', 4, rules.turn) // the bag is short: the discard goes in first
console.log(d.ids, d.refilled, piecesIn(d.state, 'hand'), d.why)
```

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
