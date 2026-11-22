# clock

A clock as rules data: a marker on a row of spaces (countdown, round tracker, danger track) that steps forward or back, with thresholds that fire as it lands on or passes a space, and per-space values read from where it stands. Pure functions, no packages, nothing drawn (K530).

## Rules for agents

<!-- hooks: written by scripts/catalog.mjs from docs/catalog-notes.json; do not edit -->
**Hooks a game calls:**
- `newClock`: a marker on a track of spaces
- `step`: move the marker and get the thresholds it met
- `setTo`: place the marker without firing anything
- `stepsTo`: the steps to reach a space on the track
- `ended` + `reached`: the marker reached the end or a space
- `overrun`: the marker cannot advance, no space left
- `occurrences`: thresholds as engine events for triggers
- `valueAt`: a limit that depends on the marker space
- `checkClock`: check a track spec in a content test
<!-- /hooks -->

**What it does:** Keeps a marker on a row of spaces as JSON-safe state, steps it by the game's number, and returns the thresholds it met in order; `track` draws the same spaces.

**You must:**
1. Write the clock as a plain `ClockSpec`: `spaces` (a count or a list of ids), `start`, `direction` (`up` default: a positive step raises the index; `down`: it lowers it, a countdown), `ends` (`stop` default, or `wrap`), `thresholds`, optional `values` (one list per key, one entry per space).
2. Run `checkClock(spec)` in a content test and assert `[]`; the other calls do not validate.
3. Keep the state (`{ value, fired }`, `value` the space index) in the game state; every call returns a new one, assign it.
4. Pass the step amount already worked out (ruled quantity, modifiers): `step(spec, state, by)` takes it as given; negative steps back, 0 does nothing. A fractional amount counts as the next whole step (0.5 moves one space, 2.5 three, and `overrun` counts the same way): round it first when the rule rounds down. An amount that is not a finite number (NaN, Infinity, text, nothing) throws.
5. Act on `crossings` in the order returned (the order the marker met them; on one space, the order `thresholds` lists them); `kind` and `data` are the game's words.
6. Give each threshold the direction it fires in: default `forward` (with the positive step), `back`, or `either`.
7. Use `setTo` for placing the marker (set-up, a "move to" effect): it fires nothing; call `step` when the rule says the marker moves through spaces.
8. Turn a lose threshold into a state check, not only a crossing handler, so `setTo` and loaded saves lose too. Pick the recipe by where the lose space sits: the last space in the `direction` of a `stop` clock, "Recipe: engine-core and track" (`ended`); any other space (a marked space in the middle, the space after day N), "Recipe: a lose space that is not the last" (`onSpace` or `reached`). Never `ended` for a lose space that is not the last.
9. Pass `true` as the third argument of `occurrences` when the caller that holds the crossings (the handler that called `step`, writing the log or the screen from them) needs more than the threshold id: each occurrence then also carries `space` (the threshold's space index), `how` (`land` or `pass`), `way` (`forward` or `back`, the travel of that step) and `data` (the threshold's `data` as the game gave it; absent when the threshold has none). Without it the occurrence is `kind`, `keys.target`, `amount` only. A trigger or window sees only what the engine passes on: engine-core's `would` keeps `kind`, `keys` and `amount` and drops the rest, so a game whose trigger needs the other fields stores the list in its own state before it calls `would`.
10. A rule that loses when the marker must move and no space is left (the marker may stand on the last space; the loss is the next advance): read `overrun` on the result of that `step` and keep the loss in the game state. Never `ended` for it: `ended` is true as soon as the marker stands on the last space.
11. Work out the step that takes the marker to a space with `stepsTo(spec, state, space)`, never `target - value`: on a `down` clock that is the wrong way round.

**Common mistakes:**
- Expecting a `once` threshold to fire again after a step back: its id stays in `fired`.
- Expecting `stop` to let the marker leave the row: it stops on the end space, which counts as a land.
- Reading `ended` on a `wrap` clock: always false; read `left` (steps to the last space in the step direction). `reached` is always false there too.
- Expecting a `land` lose threshold to fire when a long step goes over its space: it does not; write `landOrPass` when the rule says reaching or passing loses.
- Expecting a lose threshold to fire on a step back: the default `direction` is `forward`; write `either` (see "A move against the clock's direction").
- Reading a refused step from the state: a step with no space left returns the same value and no crossing; `overrun` on the result is the sign.
- Reading `left` as the distance to a marked space: it measures to the row's end; `stepsTo` measures to a space.
- Expecting engine-core to keep `space`, `how`, `way` and `data`: `would` stores `kind`, `keys` and `amount` only, so a trigger or window never sees them. Act on them in the handler that called `step`, or store the list `occurrences` returned in the game state for the trigger to read. A look-up of the threshold by `keys.target` gives its `data` and `space` only, never `how` or `way`, and on a `wrap` clock one step can cross the same threshold twice.

- `newClock(spec)`: `{ value, fired: [] }`. `spaceOf(spec, state)`: the space id (or index for a count). `indexOf(spec, space)`: index or -1.
- `step(spec, state, by)`: `{ state, crossings, overrun? }`; each crossing `{ threshold, from, to, space, how: 'land' | 'pass' }` (`from`, `to` are the step's ends, `space` the threshold's, `way` is `forward` for a positive step and `back` for a negative one). The last space reached is the land, every space before it a pass. `stop`: the walk ends at the row's edge (either end). `wrap`: it goes round; a long step meets a space once per lap, for up to 1000 laps: a longer step lands where the full step lands and fires as a step of 1000 laps plus the rest, and the result says so: `cut` is the number of laps not walked (the key is absent when nothing was cut). `overrun`: how many of the steps asked did not fit on a `stop` row (the walk met the edge first); the key is absent when every step fitted, so `if (r.overrun)` reads it. A step from the end space moves nothing, returns no crossing, and its `overrun` is the whole amount.
- `setTo(spec, state, space)`: moves, fires nothing, keeps `fired`; an unknown space throws.
- `stepsTo(spec, state, space)`: the distance from the marker to that space as a step amount: positive with the clock's `direction` (`up` and `down` alike), negative against it, 0 on it; on a `wrap` clock the way forward round the row (0 to spaces - 1); an unknown space throws. `stepsTo(spec, state, space, 'back')`: on a `wrap` clock the way back round the row as a negative amount (0 to -(spaces - 1)); on a `stop` clock the same answer as without it. From a state on the row, `step(spec, state, stepsTo(spec, state, space))` lands on that space (with `'back'` too); from a state whose `value` is not a space (a start `checkClock` refuses, a hand-made state) it may not. `step` is pure, so the same call is a dry run that asks what a move would fire ("Recipe: a dry run").
- `left(spec, state)` (steps to the last space in the `direction`; to any other space, `stepsTo`), `ended(spec, state)` (`stop` only: on the end space in the `direction`).
- `onSpace(spec, state, space)`: the marker stands on that space (id or index). `reached(spec, state, space)`: it stands on that space or beyond it in the `direction` (`stop` only; an unknown space is false, and so is a state whose `value` is below 0 or past the row, as with `onSpace`; a hand-made `value` between two spaces, 1.5, is not caught: `reached` compares it as a number while `onSpace` is false).
- `valueAt(spec, state, key)`: `spec.values[key][state.value]` (a limit that depends on the marker's row).
- `occurrences(crossings, prefix = 'clock.')`: engine-core `OccurrenceInput`s (`kind` `clock.<kind>`, `keys.target` the threshold id, `amount` 1), ready for `would(ctx, occurrences(r.crossings))` so triggers and windows see them. `occurrences(crossings, prefix, true)` adds `space`, `how`, `way` and `data` to each (rule 9).
- `checkClock(spec)`: a list of problems, never a throw. It also reports a key that looks like a misspelt one (`end` for `ends`, `threshold`, `directions`, `dir`, `onec`: one letter added, dropped, changed or swapped, or the first three or more letters; a spec read from JSON has no compiler), `once` that is not `true` or `false`, an `id` or `kind` that is not text, and `values` that is not an object of lists. Other keys of the game's own (`name`, `label`) pass.

## Recipe: engine-core and track

```ts
import { ended, newClock, occurrences, step, type ClockOccurrence, type ClockSpec, type ClockState } from '../kit/clock/index'

interface Ctx { s: { clock: ClockState; over?: string } }
declare const would: (ctx: Ctx, list: ClockOccurrence[]) => void // engine-core's would
const spec: ClockSpec = { spaces: 4, start: 0, thresholds: [{ id: 'out', at: 3, on: 'land', kind: 'lose' }] }
const ctx: Ctx = { s: { clock: newClock(spec) } }
const advance = (by: number) => {
  const r = step(spec, ctx.s.clock, by); ctx.s.clock = r.state
  if (r.crossings.length) would(ctx, occurrences(r.crossings)) // triggers answer clock.lose, clock.reward, clock.trigger...
}
// the list for engine-core's checkpoint.checks
const checks = [{ name: 'clock lost', run: (ctx: Ctx) => { if (ended(spec, ctx.s.clock) && !ctx.s.over) { ctx.s.over = 'lost'; return true } return false } }]
advance(3)
console.log(checks[0]?.run(ctx), ctx.s.over) // true lost
```

```text
<Track spaces={rows of spec} index={s.clock.value} ... />                // track reads the same index; marks from thresholds
```

## Recipe: a dry run

Ask what a move to a space would fire before making it. `stepsTo` gives the amount for a clock that runs up or down; never `target - value`.

```ts
import { newClock, setTo, step, stepsTo, type ClockSpec } from '../kit/clock/index'

const spec: ClockSpec = {
  spaces: 15, start: 14, direction: 'down', ends: 'stop',
  thresholds: [{ id: 'out', at: 0, on: 'land', kind: 'lose' }, { id: 'half', at: 7, on: 'landOrPass', once: true, kind: 'trigger' }],
}
const s = setTo(spec, newClock(spec), 3)
const dry = step(spec, s, stepsTo(spec, s, 0)) // s is untouched; assign dry.state only when the move happens
console.log(stepsTo(spec, s, 0), dry.state.value, dry.crossings.map((c) => c.threshold.id), s.value) // 3 0 ['out'] 3
```

## Recipe: a lose space that is not the last

The game is lost on a space elsewhere on the row. The threshold fires on the step, from either side; the state check covers `setTo` and loaded saves.

```ts
import { newClock, onSpace, setTo, step, type ClockSpec, type ClockState } from '../kit/clock/index'

const loseSpace = 5
// landing only, from either side: a longer step goes over the space and nothing is lost
const spec: ClockSpec = { spaces: 8, start: 0, thresholds: [{ id: 'gone', at: loseSpace, on: 'land', direction: 'either', kind: 'lose' }] }
const s: { clock: ClockState; over?: string } = { clock: setTo(spec, newClock(spec), 7) }
const r = step(spec, s.clock, -2); s.clock = r.state
if (r.crossings.some((c) => c.threshold.kind === 'lose')) s.over = 'lost'
// the list for engine-core's checkpoint.checks: the state check
const checks = [{ name: 'clock lost', run: (ctx: { s: typeof s }) => { if (onSpace(spec, ctx.s.clock, loseSpace) && !ctx.s.over) { ctx.s.over = 'lost'; return true } return false } }]
const loaded: { s: typeof s } = { s: { clock: setTo(spec, newClock(spec), loseSpace) } } // a loaded save: no step, no crossing
console.log(s.over, checks[0]?.run(loaded), loaded.s.over) // lost true lost
```

Reaching or passing loses: `on: 'landOrPass'` and no `direction` (so `forward`) in the threshold, and `reached(spec, ctx.s.clock, loseSpace)` in the check:

```ts
import { newClock, reached, setTo, step, type ClockSpec, type ClockState } from '../kit/clock/index'

const loseSpace = 5
const spec: ClockSpec = { spaces: 8, start: 3, thresholds: [{ id: 'gone', at: loseSpace, on: 'landOrPass', kind: 'lose' }] }
const check = (clock: ClockState) => reached(spec, clock, loseSpace)
const over = step(spec, newClock(spec), 4) // goes over the space: lost
const back = step(spec, over.state, -3) // moves back before it: nothing fires, no longer reached
console.log(over.crossings.map((c) => c.threshold.kind + ':' + c.how), check(over.state), back.crossings.length, check(back.state), check(setTo(spec, newClock(spec), 6))) // ['lose:pass'] true 0 false true
```

A lose space that differs per scenario: build the spec from the scenario's data and keep `loseSpace` beside it.

### A move against the clock's direction

A negative step walks against the `direction`. At each space it meets, only thresholds whose `direction` is `back` or `either` fire (as `land` or `pass`, like any step, with `way: 'back'`); a threshold left at the default `forward` stays silent, also when the marker ends on its space. The state checks do not look at travel: `onSpace` is true whenever the marker stands on the space, and `reached` whenever it stands on it or beyond it.

- Landing loses (`onSpace`): write `direction: 'either'`, as above. Without it a step back onto the lose space returns no lose crossing while the check loses, and no lose occurrence reaches a trigger, the log or the screen.
- Reaching or passing loses (`reached`): keep `forward`. A marker beyond the space had already reached it before it moved back, and once it stands before the space `reached` is false, so a move back never newly reaches the space; `either` would fire the loss as the marker moves away through it.

## When not to use

Tokens counted without a cap (a pile that only grows or shrinks, with no fixed row of spaces) are not a clock: keep a counter in the game state.

## Use it in 10 lines

```ts
import { checkClock, ended, newClock, step, valueAt, type ClockSpec } from '../kit/clock/index'

const spec: ClockSpec = {
  spaces: 15, start: 14, direction: 'down', ends: 'stop',
  thresholds: [{ id: 'out', at: 0, on: 'land', kind: 'lose' }, { id: 'half', at: 7, on: 'landOrPass', once: true, kind: 'trigger' }],
  values: { limit: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4] },
}
const r = step(spec, newClock(spec), 8)
console.log(checkClock(spec), r.crossings.map((c) => c.threshold.id), valueAt(spec, r.state, 'limit'), ended(spec, r.state)) // [] ['half'] 2 false
```
