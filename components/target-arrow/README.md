# target-arrow
A curved arrow from the card that asks for a target to the pointer; it snaps to a legal target (card or the prompt panel's button), collapses into the chosen one, then the hit (flash and shake on damage targets, a glow otherwise); token flights wait for the hit. Port of Unstoppable's `arrow.ts`, `strike.ts` and `TargetArrow.tsx`. `index.ts` is pure (loads in node); `ui.ts` adds React.

## The game passes
- `prompt`: the open prompt (`{ id, options: [{ id, disabled? }] }`) when it asks for a target, else null. Which prompts are target prompts is the game's predicate.
- `strikes`: `createStrikes()`, one per table. The game calls `strikes.announce({ prompt, ids, auto })` for every answer to a target prompt (the player's and the board's own) just before it dispatches, while the targets are still on the page; it drops Back/forfeit itself. `auto` is true for the board's own answers.
- `source(prompt)`: the element the arrow starts from (the asking card, else a fallback anchor).
- `board(prompt, optionId)` (default `[data-target-id="<id>"]`) and `panel(prompt, optionId)` (default `[data-option="<id>"], [data-option-id="<id>"]`, what prompt-host and drag-drop mark): the places a pointer can aim at; the aimed one gets `data-arrow-aim="true"` (the game styles it).
- `damage(prompt)`: true for a hit (flash + shake), else a glow. `onHit(el, damage)` lets the game add its own effect (effect-library shake/glow, a sound).
- `speed` (1, 2, 0 none), `enabled` (the game's switch), `undoNo` (a change cancels the strike), `reduced()` (default `prefers-reduced-motion`), `finePointer()` (default `(pointer: fine)`).
- Token flights: `<TokenFlights hold={strikes.hold} />` sets tokens off at the hit; a strike that never ends lets go after 3 s.

## Look and rules
Structural styles only (a fixed, click-through layer; `aria-hidden`). Parts: `data-part="target-arrow"` (`data-state` hidden/follow/strike, `data-snapped`, `data-motion`), `target-arrow-edge`, `target-arrow-body`, `target-arrow-head` (the game sets stroke, fill, width), `target-hit` (colour from `--target-arrow-hit`). Times at speed 1: grow 220 ms, stay 90, collapse 150, hit 420 (`STRIKE_MS`). A mouse choice while the arrow follows collapses at once; a key or board answer grows a quick arrow first. Speed 0 or reduced motion: no moving parts; touch: no arrow, only the hit; a modal dialog hides it. The pointer move re-renders nothing. Not here: prompt kinds, bosses, threats, the prompt panel (prompt-host `useBoardPick` gives marks and taps; this only draws).

## Use it in 10 lines
```ts
import { createStrikes, curveOf, strikePlan, untilHit } from '../kit/target-arrow/index'

const strikes = createStrikes()
let launched = 0
const no = strikes.beginHold()
strikes.hold({}, () => { launched += 1 }) // a token flight waits
console.log(launched) // 0
strikes.endHold(no) // the hit
console.log(launched, curveOf({ x: 0, y: 0 }, { x: 100, y: 0 }).c.y < 0) // 1 true
console.log(untilHit(strikePlan({ factor: 1, arrow: true, aimed: false })!)) // 460
```

```tsx
import { TargetArrow, createStrikes } from '../kit/target-arrow/ui'

const strikes = createStrikes<{ id: string; options: { id: string }[] }>()
export const Arrow = ({ prompt }: { prompt: { id: string; options: { id: string }[] } | null }) => (
  <TargetArrow prompt={prompt} strikes={strikes} speed={1} source={() => document.querySelector<HTMLElement>('[data-source]')} />
)
```
