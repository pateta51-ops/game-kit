# picked-state

The mark for an option the player has picked, as tokens plus one small helper.

Game passes in: for each option of one choice, whether it is picked. Spread `pickedAttrs(picked, anyPicked)` on the element (`data-picked="picked"` or `"unpicked"`; nothing before the first pick), or use `pickedStates(options, isPicked)`. Import `picked.css` once.

Rules
- Used for nothing else. "Picked", "you can act" and "this just counted" are three different marks; picked is never the colour of the other two.
- Once one option of a choice is picked, the unpicked ones of that same choice dim to `--unpicked-dim`. They stay pressable; pressing one picks it and it returns to full strength. Items outside the choice are untouched.
- The tick sits above the option it marks (`z-index: 2`, top-right, half outside); nothing covers it. Give a clipped parent `overflow: visible`.
- Text on a dimmed option must stay readable: raise `--unpicked-dim`, never drop the dimming.

Look (variables a game sets)
- `--picked` frame colour, `--picked-edge` the dark line outside it and round the tick, `--picked-width` frame width (8px; `:root[data-layout='phone']` sets 3px), `--tick` badge size (40px; phone 16px), `--tick-mark` the tick drawing, `--unpicked-dim` opacity of unpicked options (.65).

## Use it in 10 lines

```ts
import { pickedAttrs } from '../kit/picked-state/index'

const attrs = pickedAttrs(true, true) // { 'data-picked': 'picked' }; spread on the option's element
console.log(attrs)
```
