# card-pile

A pile on the table: a stack at rest (top card, edges of the cards beneath, empty slot), an animated fan to look through it, picks from it, and a grid in phone-mode's sheet. Needs `card-zones`, `prompt-host`, `picked-state`, `phone-mode`, `motion-frame`; packages `react`, `react-dom`.

- Cards come from a card-zones `ZoneView` (`{ count, cards }`, a `null` is a back; a hidden id never reaches the DOM). `browse={false}` for a deck nobody may look through. The faces are yours: `face(id, { where, top })` and `back({ where, top })`, `where` is `top | edge | fan | grid`.
- Click: the cards leave the pile one after another along a curve into a fan and gather back in reverse. `speed` scales the times (`1` normal, `0` none; prefers-reduced-motion is none too). The board greys behind a modal backdrop; focus moves into the fan and returns to the pile's button, Tab cycles, Escape and a backdrop click gather (not while the cards still fly). `show="[data-testid=decision]"` keeps that element lit through a hole in the backdrop.
- Picks: `pick={{ marks, tap }}` from `useBoardPick`. Cards the prompt names carry `data-mark` (`legal`, `armed`, `barred`) and picked-state's `data-picked`; the rest `data-dim`. A click on a named card calls `tap`; the fan closes once the prompt no longer names its cards. The pile root has `data-picking` and `data-named` (count).
- Phone: `phone` opens a grid in `Sheet` (top first, `words.top` on the top card); a named card taps `pick`, another asks `onDetail(id)`.
- Look: structural CSS only (`card-pile.css`, zero specificity), sizes from `--kp-card-w`, `--kp-card-h`, `--kp-step`, `--kp-u`, `--kp-z`, `--kp-grid-cols`. Style the `data-part` hooks: `pile stack stack-card stack-hit fan backdrop fan-cards fan-card fan-turn fan-lift fan-hit grid grid-cell grid-card grid-top`. English defaults for `words` are placeholders.
- `index.ts` (fan geometry `fanPlaces`, `flight`, the pure `step` machine) loads in node; `ui.ts` holds the React parts.

## Use it in 10 lines

```tsx
import { Pile } from '../kit/card-pile/ui'
import type { ZoneView } from '../kit/card-zones/index'

export const Discard = ({ view, pick }: { view: ZoneView; pick: Parameters<typeof Pile>[0]['pick'] }) => (
  <Pile label="Discard" view={view} pick={pick} speed={1} show="[data-testid=decision]"
    face={(id) => <img src={`/cards/${id}.png`} alt={id} />} back={() => <div className="back" />} />
)
```
