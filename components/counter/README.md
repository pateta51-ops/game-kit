# counter

A resource number that counts up, bumps, shows a "+N" tag and warns when low; unstyled, with an anchor (`data-res`) that flights (token-flights) find. The game owns layout, colours and words.

- `<Counter value anchor icon? thresholds? speed? onCross? count? />`: renders `span[data-part=counter][data-res=anchor][data-level=ok|low|out]` holding `[data-part=icon]` and `[data-part=number]`. The shown number counts up (effect-library `countUp`) to `value`; the stored value is the game's. On a change: bump (1.35x, 0.92x, 1x, 300 ms) and one `span[data-part=tag][data-sign=+|-]` ("+3", "−3", readable 1.7 s) in the free space at the row's right on a wide screen, under the counter on a narrow one (<= 700 px). A press or key ends the count at once. `speed` is the player's factor (default 1); reduced motion and speed 0 or `'instant'` give the final number, no bump, no tag.
- `bumpOnChange` (default true): the counter's own bump on a change. With token-flights (K241): pass `find: counterOf` and either call `bumpCounter(el, speed)` in `onLand` with `bumpOnChange={false}`, or do neither (the counter bumps itself); never both (a double bump).
- `thresholds: { low, out? }`: count <= `out` (default 0) is `out`, <= `low` is `low`. `onCross(level, value)` fires only when the count gets worse; `crossToast(toasts, { low: { text, tone }, out: {...} })` makes one that pushes a ui-helpers toast.
- Pure (node-testable): `levelOf`, `crossed`, `tagText`, `BUMP_FRAMES`, `BUMP_MS`, `TAG_MS`, `scaledMs(ms, speed)`, `tagAt(k)`.
- DOM: `counterOf(anchor, root?)` (the on-screen element with that `data-res`), `bumpCounter(el, speed)` (a flight calls it on arrival), `showTag(el, delta, speed, row?)` (`row` spaces several tags), `rowRightOf(el)`.
- Style by `[data-part]`, `[data-level]`, `[data-sign]`; the tag is `position: fixed`, its colour and font are the game's.

## Look

Nothing is drawn but the parts above; no colour, font or word comes from the kit.

## Use it in 10 lines

```tsx
import { Counter, bumpCounter, counterOf } from '../kit/counter/index'

export const Gold = ({ gold }: { gold: number }) => (
  <Counter value={gold} anchor="seat1.gold" thresholds={{ low: 3, out: 1 }} speed={() => 1} />
)
// a flight lands on the same element and bumps it:
const el = counterOf('seat1.gold')
if (el) bumpCounter(el, 1)
```

Look file (opt-in): `looks/health-glow.css`, a dark pill on `[data-part=counter]` and a glowing `[data-part=icon]`; variable `--counter-icon` (default #ff4d5e).
