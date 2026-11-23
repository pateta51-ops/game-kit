# guarded-button
A two-tap commit with no dialog and no backdrop: the first tap lifts a hinged guard, the second fires. Unstyled; states `guarded`, `open`, `fired`, plus `barred` with a reason. Lifted from a game's danger button (behaviour only; the steel guard is the game's look). `index.ts` is the pure helper plus the React part.

## Rules for agents

**What it does:** `<GuardedButton onFire>` renders a button and a guard layer over it; tap one opens the guard, tap two fires `onFire` once. An open guard closes again after `timeoutMs`, on Escape, or on a tap elsewhere.

**You must:**
1. Use it for a destructive or irreversible action that needs a second tap, not a `ConfirmDialog` or a hand-built "are you sure" state.
2. Skin it only through `[data-part="guarded-button"]`, `[data-part="button"]`, `[data-part="guard"]` and their `data-state` (`guarded`, `open`, `fired`, `barred`); the game draws the guard (position it over the button, hinge it open when `open`).
3. Give a barred button `barred` and `reason`: it never opens or fires, and the reason is its `title` and `data-reason`. Never hide a barred button.
4. Pass `resetKey` (any value that changes) to re-arm it after `fired`; it stays fired until then.
5. Keep the button's `data-kit` as is.

**Common mistakes:**
- Expecting a dialog or a backdrop: there is none.
- Setting your own timer to re-close the guard: `timeoutMs` does it (default 4000, 0 = never).
- Putting text in the guard layer: `guardLabel` shows only while guarded.

## The swing
The guard is one flat plate: the root sets `perspective`, the plate turns `rotateX(-100deg)` about its top edge when open (`data-open="true"`, also while fired) and back to 0 when it re-closes, over `--guarded-button-swing-ms` (300 ms). No mesh, no WebGL. The kit has no hinge motion token, and this does not special-case reduced motion (set the variable to `0ms` in your skin). The game positions the plate over the button and may restyle it.

## Props
`onFire`, `children`, `guardLabel?`, `barred?`, `reason?`, `timeoutMs?` (4000), `swingMs?` (300; a second tap before the swing ends is ignored, so a double tap cannot fire; 0 allows it), `resetKey?`, `initial?` (`guarded`, `open`, `fired`; for a look sheet), `className?`. Pure: `guardTap(state, barred)` gives `{ state, fire }`; `guardClose(state)` closes an open guard.

## Use it in 10 lines
```ts
import { guardTap, guardClose } from '../kit/guarded-button/index'

const a = guardTap('guarded')
const b = guardTap(a.state)
const c = guardClose('open')
console.log(a.fire, b.fire, c)
```
