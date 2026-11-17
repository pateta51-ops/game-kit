# token-flights
Tokens that moved between two views fly from where they were to where they are, and a ledger keeps each token in one place at a time. Port of Unstoppable's `flights.ts`, `flightLedger.ts` and `TokenFlights.tsx`. `index.ts` is pure (loads in node); `ui.ts` adds React.

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
Unstyled but for the layer's structure (absolute, page coordinates, `pointer-events: none`); `data-part="token-flights"` and `data-part="token-flight"`. 700 ms eased arc, 1.15 scale mid-way, 110 ms stagger, 24 in the air at most (`flightMs`, `staggerMs`, `maxFlying`); at most 5 tokens of one value per place (`MAX_PER_CHANGE`). A place that left the view takes its tokens back unseen. Not here: cards flying (Imperium's `FlightLayer` hides a card's destination; follow-up) and drawn motion specs (`motion-frame`).

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
```

```tsx
import { TokenFlights, createFlightLedger } from '../kit/token-flights/ui'

const ledger = createFlightLedger()
export const Flights = ({ credits }: { credits: number[] }) => (
  <TokenFlights placement={{ credits }} supplyOf={(p) => (p === 'credits' ? 'bank' : undefined)} ledger={ledger} speed={1} render={() => ({ src: '/coin.png', size: 24 })} />
)
```
