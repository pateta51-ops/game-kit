# player-board

A mat with named zones from a layout: each zone fits its cards (largest size, two rows when that allows larger cards, a fan below the readable minimum), and is a motion anchor. Needs `card-zones`, `board-layout`; package `react`.

- The game owns the layout (where zones sit) and the look; the kit owns how a zone lays out its cards. Zones come from a board-layout `ZoneLayout` (`zones[id].r = [x, y, w, h]`), cards from a card-zones `ZoneView` (`null` = a back).
- `planBoard(zones, cards, { card, footprint?, gap, pad, minWidth, align })` (pure, `index.ts`) returns per zone `placed` (a rect per card, board design pixels, `overlap` under the left neighbour), `scale`, `rows`, `fan`. `fitZone`, `layRow`, `handSink` are exported too.
- `footprint(id, zone, index)` is an assembly's size at scale 1 (default the card): wrap `footprint(host, attachments, cw, ch)` from `card-attachments` for a host with tucked cards, e.g. `footprint: (id) => footprint({}, tuckedUnder(id).map(() => ({})), 276, 386)`.
- `<PlayerBoard>` (`ui.ts`) draws the mat image, zone divs (`data-zone`, `data-place`, `data-count`, `data-rows`, `data-fan`) and a slot per card that `slot(info)` fills. Sizes are design pixels times `rem` (default 1/32 rem), so a table scale grows everything.
- Structural CSS only; hooks `data-part`: `player-board mat zone slot`.

## Use it in 10 lines

```tsx
import { PlayerBoard } from '../kit/player-board/ui'
import { planBoard } from '../kit/player-board/index'

const layout = { w: 1600, h: 900, zones: { play: { r: [40, 40, 1000, 400] }, discard: { r: [1100, 40, 300, 400] } } }
const views = { play: { count: 2, cards: ['a', 'b'] }, discard: { count: 1, cards: [null] } }
const plan = planBoard({ play: layout.zones.play.r }, { play: views.play.cards }, { card: { w: 276, h: 386 } })
export const Board = () => (
  <PlayerBoard layout={layout} views={views} mat="/mat.png" card={{ w: 276, h: 386 }}
    slot={({ id }) => (id ? <img src={`/cards/${id}.png`} alt={id} /> : <div className="back" />)} />
)
export const rowsInPlay = plan.play!.rows
```
