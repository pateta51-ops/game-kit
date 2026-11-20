# token-flights
Tokens that moved between two views fly from where they were to where they are, and a ledger keeps each token in one place at a time. Port of Unstoppable's `flights.ts`, `flightLedger.ts` and `TokenFlights.tsx`. `index.ts` is pure (loads in node); `ui.ts` adds React.

## Rules for agents

**What it does:** Tokens that moved between two views fly from where they were to where they are, and a ledger keeps each token drawn in one place at a time; 3D object flights are in `three.ts`.

**You must:**
1. Pass `placement` (place key to token values), `supplyOf(key)` (the supply a place draws from; undefined for a place that never flies) and `render(move)` (`{ src, size, clip? }` in px, or null to skip).
2. Give every place, supplies included, a `data-place="<key>"` (or `data-res`), or pass `find(key)`.
3. Create one `createFlightLedger()` per table, not a global, and draw rows with `shownTokens`, `shownCounts` or `shownCount`; numbers beside tokens stay final.
4. Pass `speed` (0 none), `undoNo` (change it on undo, redo or load), `enabled` and `reduced()`; each settles to the final state at once with nothing in the ledger.
5. If you pass `hold(move, launch)`, it runs for every move: filter which ones wait and always call `launch`.
6. Import `index` for pure parts and `ui` for React; for 3D import `three` (a game dependency) and use `flyObject3d` with a preset of your own or `WARP_FLIGHTS_3D`; there is no default preset.
7. Use `isSoftwareGl()` to keep 2D tokens on CPU WebGL.

**Common mistakes:**
- A place that left the view: its tokens are taken back unseen, with no flight.
- A `hold` that does not call `launch`: tokens never take off.

## The game passes
- `placement`: `Record<placeKey, number[]>`, the token values each place draws now (`{ credits: [3, 1], 'threat:a': [5] }`). Keys are the game's strings.
- `supplyOf(key)`: the supply a place draws from and gives back to (`credits` -> `bank`), or undefined for a place that never flies. A supply is a place too: give it a `data-place`. `Move.kind` is that supply key.
- `render(move)`: `{ src, size, clip? }` in px (`clip` is a CSS clip-path, die-cut, that moves with the token), or null to skip the flight.
- `find(key)` (optional): the element of a place; default `[data-place="<key>"]`, else `[data-res="<key>"]` (the counter part).
- `speed`: the settings' factor (1 normal, 2 slow, 0 none). `undoNo`: changes on undo, redo or load. `enabled`: the game's own switch. `reduced()`: default `prefers-reduced-motion`. Each of these settles: the final state at once, nothing in the ledger.
- `onLand(move)` bumps a counter when a token lands (also when cut short). `hold(move, launch)` keeps a token before take-off until the game calls `launch` (a targeting strike); default at once. It runs for every move: a game filters which moves wait and must always call `launch`.

## The ledger
`createFlightLedger()` per table (not a global); `useFlightLedger(ledger)` follows it. Draw with `shownTokens(tokens, key, ledger)` (a row), `shownCounts(counts, key, ledger)` (a supply heap), `shownCount(n, key, ledger, max?)` (discs): a token is drawn on its old spot until take-off and on its new spot only after landing. Numbers beside tokens stay final.

## Look and rules
Unstyled but for the layer's structure (absolute, page coordinates, `pointer-events: none`); `data-part="token-flights"` and `data-part="token-flight"`. 700 ms eased arc, 1.15 scale mid-way, 110 ms stagger, 24 in the air at most (`flightMs`, `staggerMs`, `maxFlying`); at most 5 tokens of one value per place (`MAX_PER_CHANGE`). A place that left the view takes its tokens back unseen. **3D tokens** (`three.ts`, needs three.js; `index.ts` holds the pure parts): `flight3dPose(preset, { mode, from, to }, t)` gives the pose of a `draw`, `flick` or `discard` flight in screen px (centre, radius, lift, tilt `rx`, spin `rz`, the flick's trail); `flight3dMs` its length with the settle. `flyObject3d(object, flight, { preset, toWorld, onFrame, speed })` moves any Object3D of the caller's scene on animation frames (speed 0 lands at once; `cancel` lands it); `tableMapper(camera, size)` maps screen px onto the table plane z = 0. No default preset: `WARP_FLIGHTS_3D` is Warp's Edge's approved mock (draw 760 ms + 300 settle, 260 stagger; flick 520 + 80; discard 560, 70 stagger). `endRect(el)`: an element's rect once its running animations end (where a token lands). `isSoftwareGl(gl?)`: CPU WebGL (SwiftShader, llvmpipe, WARP) or none, to keep 2D tokens. The 2D arc above is unchanged. Not here: cards flying (Imperium's `FlightLayer` hides a card's destination; follow-up) and drawn motion specs (`motion-frame`).

## Use it in 10 lines
```ts
import { createFlightLedger, movesBetween, shownTokens } from '../kit/token-flights/index'

const supplyOf = (place: string) => (place === 'credits' ? 'bank' : undefined)
const moves = movesBetween({ credits: [1] }, { credits: [3, 1] }, supplyOf)
console.log(moves) // one move: a 3 from 'bank' to 'credits'
const ledger = createFlightLedger()
ledger.book(moves[0]!)
console.log(shownTokens([3, 1], 'credits', ledger.get())) // [1]: the 3 is still in the air
ledger.land(moves[0]!)
console.log(shownTokens([3, 1], 'credits', ledger.get())) // [3, 1]

// 3D: a coin (any three.js Object3D in the game's own scene) flicked on Warp's timings
import { Mesh, PerspectiveCamera } from 'three'
import { WARP_FLIGHTS_3D, endRect, flyObject3d, isSoftwareGl, tableMapper } from '../kit/token-flights/three'
const camera = new PerspectiveCamera(24, 16 / 9, 50, 50000)
const coin = new Mesh()
const spot = document.querySelector<HTMLElement>('[data-place="credits"]')!
const to = endRect(spot)
if (!isSoftwareGl()) void flyObject3d(coin, { mode: 'flick', from: { x: 40, y: 600, radius: 18 }, to: { x: to.left + to.width / 2, y: to.top + to.height / 2, radius: to.width / 2 } },
  { preset: WARP_FLIGHTS_3D, toWorld: tableMapper(camera, () => ({ width: innerWidth, height: innerHeight })), onFrame: () => { /* renderer.render(scene, camera) */ } }).done
```

```tsx
import { TokenFlights, createFlightLedger } from '../kit/token-flights/ui'

const ledger = createFlightLedger()
export const Flights = ({ credits }: { credits: number[] }) => (
  <TokenFlights placement={{ credits }} supplyOf={(p) => (p === 'credits' ? 'bank' : undefined)} ledger={ledger} speed={1} render={() => ({ src: '/coin.png', size: 24 })} />
)
```
