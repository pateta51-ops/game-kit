# card-attachments
Cards tucked under a host card (a visible L, slide out on hover) or fanned past it, and the tokens on a card: one per token, one and "×N" past a cap, number boxes that count down. Port of Earthborne's table geometry and `Tokens.tsx` and Imperium's Garrison stack. `index.ts` is pure (loads in node); `ui.ts` adds React.


## Rules for agents

**What it does:** Lays out cards tucked under or fanned past a host card, and token rows and number boxes on a card, with pure geometry and thin React parts.

**You must:**
1. Import the geometry from `kit/card-attachments/index` (node) and the components from `kit/card-attachments/ui`.
2. Describe cards to the geometry as `{ turned?: boolean }` boxes, with one upright size `cw`, `ch` (`w`, `h` on `HostStack`) in px; the geometry never sees ids or faces.
3. Pass `HostStack` the game's own nodes: `attachments={[{ key, node, turned? }]}` bottom first; a face-down attachment is passed as its back, and `key` is only a React key.
4. Pass `ms` from the settings' speed (0 for no slide); pass `open` only for a controlled slide-out.
5. Give `TokenRow` and `NumberBox` a `render`: the token shapes, colours and fonts are the game's.
6. Put anchored tokens at fixed spots of a face in `card-parts` (`TokenLayer`), not here; draw a token row from `shownCount(...)` of `counter` when a number must bump or fly.
7. Style it yourself: the CSS is structural only; hook on `data-part` (`host-stack`, `host`, `attachment`, `token-row`, `token`, `number-box`).

**Common mistakes:**
- Putting a card id or face text in the DOM for a face-down attachment: pass the back as `node`.
- Forgetting a turned host turns what is under it (`tuckedTurned`): use `footprint` for the box, do not size it by hand.

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
