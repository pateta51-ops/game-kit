# card-pile

A pile on the table: a stack at rest (top card, edges of the cards beneath, empty slot), an animated fan to look through it, picks from it, and a grid in phone-mode's sheet. Needs `card-zones`, `prompt-host`, `picked-state`, `phone-mode`, `motion-frame`; packages `react`, `react-dom`.

- Cards come from a card-zones `ZoneView` (`{ count, cards }`, a `null` is a back; a hidden id never reaches the DOM). `browse={false}` for a deck nobody may look through. The faces are yours: `face(id, { where, top })` and `back({ where, top })`, `where` is `top | edge | fan | grid`.
- Anchor: the pile root carries `data-pile="<testId>"` (what deck-motions finds); the open fan carries `data-pile-fan` instead.
- Click: the cards leave the pile one after another along a curve into a fan and gather back in reverse. `speed` scales the times (`1` normal, `0` none; prefers-reduced-motion is none too). The board greys behind a modal backdrop; focus moves into the fan and returns to the pile's button, Tab cycles, Escape and a backdrop click gather (not while the cards still fly). `show="[data-testid=decision]"` keeps that element lit through a hole in the backdrop.
- Picks: `pick={{ marks, tap }}` from `useBoardPick`. Cards the prompt names carry `data-mark` (`legal`, `armed`, `barred`) and picked-state's `data-picked`; the rest `data-dim`. A click on a named card calls `tap`; the fan closes once the prompt no longer names its cards. The pile root has `data-picking` and `data-named` (count).
- Game behaviour (K254, all optional, additive): `markOf(id)` `{mark?, why?}` over the prompt marks (any word; `dim` stays selectable, only `barred` is disabled; `data-mark`, `data-why`, title; the face gets `info.mark` and `info.why` for badges); `onTap(id, {via, detail})` replaces `pick.tap` (fan and grid; `detail` > 1 dropped); `cardProps(id, where)` the game props on each fan-hit and grid-card (data-testid, className, title, aria-*; `onClick`, `onFocus`, `onBlur` composed); `onPreview(id or null, where, el)` hover or focus on the top card, a fanned card or a grid card, null on leave (the game draws the large preview); `previewOn` (K270) `'hover'` (default: focus never previews) or `'hover-focus'` (focus too, never on the focus return after the fan closes); `badge(named)` drawn as `data-part="pick-badge"` over the stack while the prompt names cards; the backdrop has `data-holes` (1 when `show` is lit through).
- Phone: `phone` opens a grid in `Sheet` (top first, `words.top` on the top card); a named card taps `pick`, another asks `onDetail(id)`.
- `hitTitle` (K283, default true): `false` drops the native `title` on the stack button, for a game that draws its own tooltip; the aria-label stays.
- Look: structural CSS only (`card-pile.css`, zero specificity), sizes from `--kp-card-w`, `--kp-card-h`, `--kp-step`, `--kp-u`, `--kp-z`, `--kp-grid-cols`. Style the `data-part` hooks: `pile stack stack-card stack-hit fan backdrop fan-cards fan-card fan-turn fan-lift fan-hit grid grid-cell grid-card grid-top`. English defaults for `words` are placeholders.
- `index.ts` (fan geometry `fanPlaces`, `flight`, the pure `step` machine) loads in node; `ui.ts` holds the React parts.
- Every `<button>` carries `data-kit`, so a theme can write `:where(button:not([data-kit]))` (K293).

## Use it in 10 lines

```tsx
import { Pile } from '../kit/card-pile/ui'
import type { ZoneView } from '../kit/card-zones/index'

export const Discard = ({ view, pick }: { view: ZoneView; pick: Parameters<typeof Pile>[0]['pick'] }) => (
  <Pile label="Discard" view={view} pick={pick} speed={1} show="[data-testid=decision]"
    face={(id) => <img src={`/cards/${id}.png`} alt={id} />} back={() => <div className="back" />} />
)
```
