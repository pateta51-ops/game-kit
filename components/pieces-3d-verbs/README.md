# pieces-3d-verbs

The animation verbs of `pieces-3d` (release 1.1: VFX). A 1.0 game draws dice and balls with `pieces-3d` alone and never pulls this, effect-library or motion-frame.

- `registerPieceVerbs(verbs, { ballLook?, perTurn? })` after `registerEffects`: on a die (with `p3-gl`) `shake` tumbles and `flip` turns the first die out and the next in (actor class `fx-two` holds both faces; `data-fx-flipped` at half way); on a ball `move` rolls and `settle` rocks back. Any other actor gets the library's verb. `dice3d()`: true while the WebGL dice layer is on.
- `copyPieces(ballLook)`: layer option `onActor` that repaints a clone's ball and copies its other canvases.
- K235, breaking: these moved out of `pieces-3d`; import them from `../kit/pieces-3d-verbs/index`.

Tests: `pieces3d-verbs.e2e.test.ts` (Chromium: the demo of `pieces-3d` and the verbs; skipped off CI without a browser).

## Use it in 10 lines

```ts
import { registerPieceVerbs } from '../kit/pieces-3d-verbs/index'

console.log(typeof registerPieceVerbs) // function: call it with the verb registry after registerEffects
```
