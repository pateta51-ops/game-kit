# card-hand
A hand of cards as a fan that fits any number of cards in a width, lifts the card under the pointer or focus, shows the prompt's marks, reports taps and is a drag source. Ships the fan geometry CSS (`card-hand.css`, imported by `ui.tsx`); shadows, glow, badges and colours are the game's, on `data-part` hooks.

- Cards: `view` is a card-zones `ZoneView`; a `null` card (or a zone with only a `count`) is a back through `back()`, with no id, button or mark in the DOM, so an opponent's hand uses the same part. `face(id)` is the game's card face.
- Geometry (`fan.ts`, node): `fanOf(i, n, tilt)` true arc (angle step capped at 1.5 degrees, 14 across, radius 20 card widths: the gentle arc, K311; drop = radius x (1 - cos)); strips `--step` fit the width by container query (`stepOf`); strips never move, the last card's is the whole card; hover or focus lifts a card (straightened, rises, grows) and the neighbours slide away (`spreadOf`: 1, .65, .4, .2 steps, clamped to the fan's band, `shiftOf`); a picked card stands up; `[data-part="hint"]` shows above the lifted card.
- Size tokens (CSS custom properties on the hand or above): `--hand-card-w`, `--hand-card-ratio`, `--hand-step-max`, `--hand-margin`, `--hand-lift`, `--hand-stand`, `--hand-grow`.
- Marks: `pick` (prompt-host `useBoardPick`) gives `data-mark` (`legal`, `barred`, `armed`) and picked-state's `data-picked`; the strip button's click calls `pick.tap(id)`; a barred card answers nothing. Keyboard: the strip is a button, focus lifts like hover.
- Drag: pass `drag` (drag-drop `useDragDrop`): strips carry `data-drag`, the fan `data-drop-block`, the dragged card `data-dragging` (hidden in the fan). The game draws `DragGhost`.
- Animation (Web Animations and CSS transitions, `speed` divides the times; speed 0, `'instant'` or reduced motion: none): the lift and slide (`--hand-ms`, 280 ms), new cards rise in (300 ms), a tapped legal card is noted (`noteLaunch`) and the element in play with `data-glide="<id>"` glides from there with `useGlideIn(rootRef, ids, speed)` (420 ms).
- Hooks: `data-part` hand, fan, card (`data-card`, `data-mark`, `data-picked`, `data-dragging`), strip, face, hint, back. The game's words: `label`, `cardLabel`, `hint`.
- Game behaviour (K253, all optional, additive): `stripProps(id)` the game's props on each strip (title, aria-pressed/expanded, `data-*`, className; its `onClick` and `onPointerDown` are composed, the kit's `aria-label`, `aria-disabled`, `data-drag` win); `onTap(id, {via: 'pointer'|'key', detail})` replaces `pick.tap` (call it yourself; `detail` > 1 is dropped, a key tap makes no glide note, a barred card still reaches `onTap` and the game decides; without `onTap` a double click still calls `pick.tap`); `markOf(id)` `{mark?, why?}` replaces `data-mark` and sets `data-why` and the strip title (any mark but `barred` stays selectable: dim-but-selectable); `faceEvents` lets the face take pointer events (strips stay above); `phone` + `phoneTap="all"` + `onSheet(id)`: a tap on any card opens the card sheet and answers nothing.

- Phone grid (K262, ported from Imperium `Hand.tsx` + phone.css, defaults kept: 2 columns, 12px / 16px gaps, whole cards): `layout="grid"` with optional `columns` (the game passes 3 or 5 as Imperium does for an open dock or a wide screen), `header` (the game's "Hand · 7 cards · hand size 5"; `data-part="head"`), `empty` (`data-part="empty"`), `bandHeight` (a CSS length) to cap the band so it scrolls inside (off by default, as Imperium, so outlines and glows never clip). A picked or armed card does not move in the grid (Imperium only rings the card box). The list is `data-part="grid"`, the hand `data-layout="grid"`. No fan, lift or hint; strips cover the whole card; marks, `markOf`, `stripProps`, `onTap`, `phone`/`phoneTap="all"`/`onSheet`, drag and the draw-in rise are the same; nothing animates at speed 0 or reduced motion. From STCC and Unstoppable nothing was taken (their phone hands are fan wraps without a grid).
- Every `<button>` carries `data-kit`, so a theme can write `:where(button:not([data-kit]))` (K293).

## Use it in 10 lines
```tsx
import { CardHand } from '../kit/card-hand/ui'
import { useBoardPick } from '../kit/prompt-host/ui'

export function Hand({ prompt, answer, cards }: { prompt: Parameters<typeof useBoardPick>[0]; answer: Parameters<typeof useBoardPick>[1]; cards: (string | null)[] }) {
  const pick = useBoardPick(prompt, answer, { confirm: false })
  return <CardHand view={{ cards }} pick={pick} speed={1} label="Hand" face={(id) => <b>{id}</b>} hint={() => 'Play'} />
}
```

K270: the fan rule is `:where([data-part="hand"] [data-part="fan"])`, zero specificity on purpose, so a game can override it; card-pile has its own `[data-pile-fan]` rules.

## Hover tilt (K380)

Set `hoverTilt` and import the optional look to let a hovering pointer lean the card and lift its shadow. The options default to 6° maximum rotation and 8px shadow offset. Tilt inherits the hand's animation speed unless you pass a tilt speed. Speed 0 on either option, instant hand motion, and reduced motion disable the effect. Touch and keyboard focus leave the tilt flat.

Set `--hand-tilt-perspective`, `--hand-tilt-shadow-color` or `--hand-tilt-shadow-blur` on the hand or an ancestor to tune the look.

```tsx
import { CardHand } from '../kit/card-hand/ui'
import '../kit/card-hand/looks/tilt.css'

export function LeaningHand({ cards }: { cards: string[] }) {
  return <CardHand view={{ cards }} face={(id) => <b>{id}</b>} hoverTilt={{ maxDeg: 6, lift: 8, speed: 1 }} />
}
```
