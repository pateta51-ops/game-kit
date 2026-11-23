# table-panels

The panels every game writes around its table, as logic plus unstyled slots: log, opponent's turn, game over, turn banner. The game owns words, layout and look (parts carry `data-part` / `data-action` hooks only). Logic in `index.ts` (node-testable); React in `ui.tsx`.

## Rules for agents

**What it does:** The panels around a table (log, opponent's turn, game over, turn banner) as node-testable logic plus unstyled React slots.

**You must:**
1. Import logic from `index` and the React panels from `ui`; the component needs `game-log` and `paced-view`.
2. Pass the game's words to `logLines(events, words, { turnOf, seatOf, slots })`; an event type without words gives no line.
3. Keep hidden fields out of the word table or strip them in `slots`: words are filled from the raw event.
4. For `opponentTurn`, make `describe(e, viewer)` return null for anything the viewer may not read; null shows the `hidden` slot, never the event. Wire the skip button to paced-view `skip`.
5. Give `gameResult(scores, { lowWins })` the game's own scoring; ties share a rank.
6. For a solo or reasoned end use `title`, `reason`, `standings={false}` and `<GameOverActions>` instead of the winner line.
7. Supply `turnName`, `phaseName`, `seatName` for any wording; `TurnBanner` fires `onPhase` on a change, not on first show.
8. For a log with the newest line first pass `order="newest-first"` (it stays scrolled to the top, turns and lines reversed, grouping and seat filter unchanged); for a fixed-height box with no half-cut line pass `wholeLines`: true measures every turn heading and entry, so entries that wrap to different heights are never half cut (the box snaps down to the last whole one; the oldest that do not fit scroll out of view); a number is a fixed line height in px and snaps to whole lines (1070 px, 29 px lines: 36 lines, 1044 px). Both are opt-in, the defaults are unchanged.
9. Style by `data-part` / `data-action`; every `<button>` carries `data-kit`, so theme resets use `:where(button:not([data-kit]))`.

**Common mistakes:**
- Expecting default English words in the log: no words, no line.
- Describing an opponent's hidden event in `describe`: it leaks to the viewer.

- `logLines(events, words, { turnOf, seatOf, slots })`: `words` maps event `type` to text with `{slots}` (read from the event, or from `slots(e)`). No words, no line. `rowLines` does the same from game-log rows. `filterSeat(lines, seat|null)` (lines with no seat pass), `groupByTurn(lines)`.
- `logLines` fills words from the raw event, so keep hidden fields out of the word table, or strip them in `slots`.
- `<LogPanel lines seats? seatName? turnName? renderLine? />`: grouped by turn, scrolled to the newest (`order` `'newest-first' | 'oldest-first'`, `wholeLines` boolean or line px; `wholeLinesHeight(boxPx, linePx)` is the sum; `wholeEntriesHeight(boxPx, entries, fromEnd?)` the mixed-height fit), seat filter buttons when `seats` is given.
- `opponentTurn(steps, isStep, describe, viewer)`: from paced-view `Steps`: `{ done, current, left, total }`. `describe(e, viewer)` returns the text that seat may read, or `null` (hidden: shown as the `hidden` slot, never the event). `<OpponentTurnPanel turn onSkip renderStep? hidden? />` has the skip-to-end button (call paced-view `skip`).
- `gameResult(scores, { lowWins })`: `{ standings, winners, tied }` from the game's scoring function; ties share a rank. `<GameOver result breakdown? onRematch? onReview? onHome? labels? />`. Solo or reasoned end (K301): `title` (ReactNode) replaces "Winner: seat", `reason` shows under it, `standings={false}` or an empty list hides the list, a standing's `score` is optional, `actions={false}` plus `<GameOverActions onRematch? onReview? onHome? labels? />` places the buttons elsewhere.
- `banner(phases, turn, seat, phaseId)`, `phaseChanged(prev, next)`; `<TurnBanner phases turn seat phase seatName? turnName? phaseName? onPhase />` (`turnName(turn)` replaces the printed "Turn n"; `phaseName(banner)` replaces the phase words, `null` drops the phase span) fires `onPhase` on a change, not on first show.
- Every `<button>` carries `data-kit`, so a theme can write `:where(button:not([data-kit]))` (K293).

## Use it in 10 lines

```ts
import { gameResult, logLines, banner } from '../kit/table-panels/index'

type Ev = { type: 'hit'; seat: string; turn: number; n: number }
const lines = logLines<Ev>([{ type: 'hit', seat: 'a', turn: 1, n: 2 }], { hit: '{seat} takes {n} damage' })
console.log(lines[0]?.text, gameResult({ a: 3, b: 5 }).winners, banner([{ id: 'u1', name: 'Upkeep' }], 1, 'a', 'u1').phase)
```
