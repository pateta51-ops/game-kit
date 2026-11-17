# table-panels

The panels every game writes around its table, as logic plus unstyled slots: log, opponent's turn, game over, turn banner. The game owns words, layout and look (parts carry `data-part` / `data-action` hooks only). Logic in `index.ts` (node-testable); React in `ui.tsx`.

- `logLines(events, words, { turnOf, seatOf, slots })`: `words` maps event `type` to text with `{slots}` (read from the event, or from `slots(e)`). No words, no line. `rowLines` does the same from game-log rows. `filterSeat(lines, seat|null)` (lines with no seat pass), `groupByTurn(lines)`.
- `logLines` fills words from the raw event, so keep hidden fields out of the word table, or strip them in `slots`.
- `<LogPanel lines seats? seatName? turnName? renderLine? />`: grouped by turn, scrolled to the newest, seat filter buttons when `seats` is given.
- `opponentTurn(steps, isStep, describe, viewer)`: from paced-view `Steps`: `{ done, current, left, total }`. `describe(e, viewer)` returns the text that seat may read, or `null` (hidden: shown as the `hidden` slot, never the event). `<OpponentTurnPanel turn onSkip renderStep? hidden? />` has the skip-to-end button (call paced-view `skip`).
- `gameResult(scores, { lowWins })`: `{ standings, winners, tied }` from the game's scoring function; ties share a rank. `<GameOver result breakdown? onRematch? onReview? onHome? labels? />`.
- `banner(phases, turn, seat, phaseId)`, `phaseChanged(prev, next)`; `<TurnBanner phases turn seat phase seatName? turnName? onPhase />` (`turnName(turn)` replaces the printed "Turn n") fires `onPhase` on a change, not on first show.
- Every `<button>` carries `data-kit`, so a theme can write `:where(button:not([data-kit]))` (K293).

## Use it in 10 lines

```ts
import { gameResult, logLines, banner } from '../kit/table-panels/index'

type Ev = { type: 'hit'; seat: string; turn: number; n: number }
const lines = logLines<Ev>([{ type: 'hit', seat: 'a', turn: 1, n: 2 }], { hit: '{seat} takes {n} damage' })
console.log(lines[0]?.text, gameResult({ a: 3, b: 5 }).winners, banner([{ id: 'u1', name: 'Upkeep' }], 1, 'a', 'u1').phase)
```
