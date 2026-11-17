# card-hand
A hand of cards as a fan that fits any number of cards in a width, lifts the card under the pointer or focus, shows the prompt's marks, reports taps and is a drag source. Ships the fan geometry CSS (`card-hand.css`, imported by `ui.tsx`); shadows, glow, badges and colours are the game's, on `data-part` hooks.

- Cards: `view` is a card-zones `ZoneView`; a `null` card (or a zone with only a `count`) is a back through `back()`, with no id, button or mark in the DOM, so an opponent's hand uses the same part. `face(id)` is the game's card face.
- Geometry (`fan.ts`, node): `fanOf(i, n, tilt)` true arc (angle step capped at 8 degrees, 32 across, drop = radius x (1 - cos), radius in card widths); strips `--step` fit the width by container query (`stepOf`); strips never move, the last card's is the whole card; hover or focus lifts a card (straightened, rises, grows) and the neighbours slide away (`spreadOf`: 1, .65, .4, .2 steps, clamped to the fan's band, `shiftOf`); a picked card stands up; `[data-part="hint"]` shows above the lifted card.
- Size tokens (CSS custom properties on the hand or above): `--hand-card-w`, `--hand-card-ratio`, `--hand-step-max`, `--hand-margin`, `--hand-lift`, `--hand-stand`, `--hand-grow`.
- Marks: `pick` (prompt-host `useBoardPick`) gives `data-mark` (`legal`, `barred`, `armed`) and picked-state's `data-picked`; the strip button's click calls `pick.tap(id)`; a barred card answers nothing. Keyboard: the strip is a button, focus lifts like hover.
- Drag: pass `drag` (drag-drop `useDragDrop`): strips carry `data-drag`, the fan `data-drop-block`, the dragged card `data-dragging` (hidden in the fan). The game draws `DragGhost`.
- Animation (Web Animations and CSS transitions, `speed` divides the times; speed 0, `'instant'` or reduced motion: none): the lift and slide (`--hand-ms`, 280 ms), new cards rise in (300 ms), a tapped legal card is noted (`noteLaunch`) and the element in play with `data-glide="<id>"` glides from there with `useGlideIn(rootRef, ids, speed)` (420 ms).
- Hooks: `data-part` hand, fan, card (`data-card`, `data-mark`, `data-picked`, `data-dragging`), strip, face, hint, back. The game's words: `label`, `cardLabel`, `hint`.
- Game behaviour (K253, all optional, additive): `stripProps(id)` the game's props on each strip (title, aria-pressed/expanded, `data-*`, className; its `onClick` and `onPointerDown` are composed, the kit's `aria-label`, `aria-disabled`, `data-drag` win); `onTap(id, {via: 'pointer'|'key', detail})` replaces `pick.tap` (call it yourself; `detail` > 1 is dropped, a key tap makes no glide note, a barred card still reaches `onTap` and the game decides; without `onTap` a double click still calls `pick.tap`); `markOf(id)` `{mark?, why?}` replaces `data-mark` and sets `data-why` and the strip title (any mark but `barred` stays selectable: dim-but-selectable); `faceEvents` lets the face take pointer events (strips stay above); `phone` + `phoneTap="all"` + `onSheet(id)`: a tap on any card opens the card sheet and answers nothing.

## Use it in 10 lines
```tsx
import { CardHand } from '../kit/card-hand/ui'
import { useBoardPick } from '../kit/prompt-host/ui'

export function Hand({ prompt, answer, cards }: { prompt: Parameters<typeof useBoardPick>[0]; answer: Parameters<typeof useBoardPick>[1]; cards: (string | null)[] }) {
  const pick = useBoardPick(prompt, answer, { confirm: false })
  return <CardHand view={{ cards }} pick={pick} speed={1} label="Hand" face={(id) => <b>{id}</b>} hint={() => 'Play'} />
}
```
