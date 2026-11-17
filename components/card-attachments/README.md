# card-attachments
Cards tucked under a host card (a visible L, slide out on hover) or fanned past it, and the tokens on a card: one per token, one and "×N" past a cap, number boxes that count down. Port of Earthborne's table geometry and `Tokens.tsx` and Imperium's Garrison stack. `index.ts` is pure (loads in node); `ui.ts` adds React.

## The game passes
- Cards as `{ turned?: boolean }` boxes (an exhausted card is turned) and one upright size `cw`, `ch` in px. The geometry never sees a card's id or face.
- `<HostStack host attachments={[{ key, node, turned? }]} w h mode? side? open? onRead? ms? />`: the game's own nodes. A face-down attachment is passed as its back; only `key` is a React key, never in the DOM. `onRead(index, key)`: a tap (the phone sheet). `ms` 0 for no slide (the settings' speed).
- `<TokenRow count render={(i) => <MyToken />} times? max? kind? />` and `<NumberBox value dir? zero? render? />`: the token shapes, colours and fonts are the game's (`render`).
- Anchored tokens at fixed spots of a face stay `card-parts` (`TokenLayer`, `placeTokens`); this is the in-flow row and box. A token that arrives flies with `token-flights`, a number that bumps is `counter`: draw `<TokenRow>` from `shownCount(...)` and put `data-place` on it.

## Pure (node)
`footprint(host, attachments, cw, ch)` is the box of a host with its tucked cards (a turned host turns what is under it); `tuckSpots`, `tuckOffset`, `outSpots(host, atts, cw, ch, side)`, `outSpan`, `outSide(hostX, host, atts, cw, ch, zone)` (right unless only the left has room), `tuckedTurned`, `TUCK` (14 % right, 15 % down per card). `fanSpots` and `fanFootprint(n, cw, ch, { step, dir })` for a stack peeking out above, below or beside the host. `tokenRow(n, max = 5)`, `changedDir(now, printed, higherIsBad = true)` (`good`/`bad`), `countDown(threshold, placed)` (`{ value, zero }`).

## Look
Structural CSS only (absolute spots, a slide transition). `cls(part)` gives class names (default `kc-<part>`); `data-part` is `host-stack` (`data-mode`, `data-open`, `data-count`), `host`, `attachment` (`data-index`, `data-turned`), `token-row`, `token`, `token-times`, `number-box` (`data-dir`, `data-zero`).

## Use it in 10 lines
```ts
import { countDown, footprint, outSpots, tokenRow } from '../kit/card-attachments/index'

const host = { turned: false }
const under = [{ turned: false }, { turned: true }]
console.log(footprint(host, under, 276, 386)) // the host and both cards tucked under it
console.log(outSpots(host, under, 276, 386, 'right')) // where they lie slid out
console.log(tokenRow(7)) // { tokens: 1, times: 7 }: one token and "×7"
console.log(countDown(3, 1)) // { value: 2, zero: false }
```

```tsx
import { HostStack, TokenRow } from '../kit/card-attachments/ui'

export const Mission = () => <HostStack host={<b>host</b>} attachments={[{ key: 'a', node: <i>back</i> }]} w={276} h={386} />
export const Harm = () => <TokenRow kind="harm" count={7} render={() => <span>*</span>} />
```
