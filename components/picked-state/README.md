# picked-state

The mark for an option the player has picked, as tokens plus one small helper.

Game passes in: for each option of one choice, whether it is picked. Spread `pickedAttrs(picked, anyPicked)` on the element (`data-picked="picked"` or `"unpicked"`; nothing before the first pick), or use `pickedStates(options, isPicked)`. `picked.css` ships no look; import one `looks/*.css` once (or write your own on `[data-picked]`).

Rules
- Used for nothing else. "Picked", "you can act" and "this just counted" are three different marks; picked is never the colour of the other two.
- Once one option of a choice is picked, the unpicked ones of that same choice dim to `--unpicked-dim`. They stay pressable; pressing one picks it and it returns to full strength. Items outside the choice are untouched.
- The tick sits above the option it marks (`z-index: 2`, top-right, half outside); nothing covers it. Give a clipped parent `overflow: visible`.
- Text on a dimmed option must stay readable: raise `--unpicked-dim`, never drop the dimming.

Looks (opt-in, each keyed only to `[data-picked]`; the kit applies none by default)
- `looks/kit-classic.css`: the former default (green frame, tick badge, unpicked dim .65; variables `--picked`, `--picked-edge`, `--picked-width`, `--tick`, `--tick-mark`, `--unpicked-dim`). A game that imported `picked.css` and wants today's look imports this file as well.
- `looks/imperium.css`: gold glow and lift; unpicked greyed and darkened.
- `looks/stcc.css`: white ring and glow; unpicked darkened.

## Use it in 10 lines

```ts
import { pickedAttrs } from '../kit/picked-state/index'

const attrs = pickedAttrs(true, true) // { 'data-picked': 'picked' }; spread on the option's element
console.log(attrs)
```
