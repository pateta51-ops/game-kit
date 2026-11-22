# clock

A clock as rules data: a marker on a row of spaces (countdown, round tracker, danger track) that steps forward or back, with thresholds that fire as it lands on or passes a space, and per-space values read from where it stands. Pure functions, no packages, nothing drawn (K530).

## Rules for agents

**What it does:** Keeps a marker on a row of spaces as JSON-safe state, steps it by the game's number, and returns the thresholds it met in order; `track` draws the same spaces.

**You must:**
1. Write the clock as a plain `ClockSpec`: `spaces` (a count or a list of ids), `start`, `direction` (`up` default: a positive step raises the index; `down`: it lowers it, a countdown), `ends` (`stop` default, or `wrap`), `thresholds`, optional `values` (one list per key, one entry per space).
2. Run `checkClock(spec)` in a content test and assert `[]`; the other calls do not validate.
3. Keep the state (`{ value, fired }`, `value` the space index) in the game state; every call returns a new one, assign it.
4. Pass the step amount already worked out (ruled quantity, modifiers): `step(spec, state, by)` takes it as given; negative steps back, 0 does nothing.
5. Act on `crossings` in the order returned (the order the marker met them; on one space, the order `thresholds` lists them); `kind` and `data` are the game's words.
6. Give each threshold the direction it fires in: default `forward` (with the positive step), `back`, or `either`.
7. Use `setTo` for placing the marker (set-up, a "move to" effect): it fires nothing; call `step` when the rule says the marker moves through spaces.
8. Turn a lose threshold into a state check, not only a crossing handler, so `setTo` and loaded saves lose too. Pick the recipe by where the lose space sits: the last space in the `direction` of a `stop` clock, "Recipe: engine-core and track" (`ended`); any other space (a marked space in the middle, the space after day N), "Recipe: a lose space that is not the last" (`onSpace` or `reached`). Never `ended` for a lose space that is not the last.
9. Pass `true` as the third argument of `occurrences` when a reader (a trigger, the screen, the log) needs more than the threshold id: each occurrence then also carries `space` (the threshold's space index), `how` (`land` or `pass`), `way` (`forward` or `back`, the travel of that step) and `data` (the threshold's `data` as the game gave it; absent when the threshold has none). Without it the occurrence is `kind`, `keys.target`, `amount` only.

**Common mistakes:**
- Expecting a `once` threshold to fire again after a step back: its id stays in `fired`.
- Expecting `stop` to let the marker leave the row: it stops on the end space, which counts as a land.
- Reading `ended` on a `wrap` clock: always false; read `left` (steps to the last space in the step direction). `reached` is always false there too.
- Expecting a `land` lose threshold to fire when a long step goes over its space: it does not; write `landOrPass` when the rule says reaching or passing loses.
- Expecting a lose threshold to fire on a step back: the default `direction` is `forward`; write `either`.
- Expecting engine-core to keep `space`, `how`, `way` and `data`: `would` stores `kind`, `keys` and `amount` only; a reader inside a trigger or window reads them from the list `occurrences` returned (same order) or looks the threshold up by `keys.target`.

- `newClock(spec)`: `{ value, fired: [] }`. `spaceOf(spec, state)`: the space id (or index for a count). `indexOf(spec, space)`: index or -1.
- `step(spec, state, by)`: `{ state, crossings }`; each crossing `{ threshold, from, to, space, how: 'land' | 'pass' }` (`from`, `to` are the step's ends, `space` the threshold's, `way` is `forward` for a positive step and `back` for a negative one). The last space reached is the land, every space before it a pass. `stop`: the walk ends at the row's edge (either end). `wrap`: it goes round; a long step meets a space once per lap.
- `setTo(spec, state, space)`: moves, fires nothing, keeps `fired`; an unknown space throws. `step(spec, s, target - s.value)` is pure and can be called as a dry run to ask what would fire.
- `left(spec, state)`, `ended(spec, state)` (`stop` only: on the end space in the `direction`).
- `onSpace(spec, state, space)`: the marker stands on that space (id or index). `reached(spec, state, space)`: it stands on that space or beyond it in the `direction` (`stop` only; an unknown space is false).
- `valueAt(spec, state, key)`: `spec.values[key][state.value]` (a limit that depends on the marker's row).
- `occurrences(crossings, prefix = 'clock.')`: engine-core `OccurrenceInput`s (`kind` `clock.<kind>`, `keys.target` the threshold id, `amount` 1), ready for `would(ctx, occurrences(r.crossings))` so triggers and windows see them. `occurrences(crossings, prefix, true)` adds `space`, `how`, `way` and `data` to each (rule 9).
- `checkClock(spec)`: a list of problems, never a throw.

## Recipe: engine-core and track

```text
const r = step(spec, s.clock, by); s.clock = r.state
if (r.crossings.length) would(ctx, occurrences(r.crossings))          // triggers answer clock.reward, clock.trigger...
checkpoint.checks: [{ name: 'clock lost', run: (ctx) => { if (ended(spec, ctx.s.clock) && !ctx.s.over) { ctx.s.over = 'lost'; return true } } }]
<Track spaces={rows of spec} index={s.clock.value} ... />                // track reads the same index; marks from thresholds
```

## Recipe: a lose space that is not the last

The game is lost on a space elsewhere on the row. The threshold fires on the step; the state check covers `setTo` and loaded saves.

```text
thresholds: [{ id: 'gone', at: loseSpace, on: 'land', kind: 'lose' }]      // landing only: a longer step goes over it and nothing is lost
const r = step(spec, s.clock, by); s.clock = r.state
if (r.crossings.some((c) => c.threshold.kind === 'lose')) s.over = 'lost'
checkpoint.checks: [{ name: 'clock lost', run: (ctx) => { if (onSpace(spec, ctx.s.clock, loseSpace) && !ctx.s.over) { ctx.s.over = 'lost'; return true } } }]
```

Reaching or passing loses: `on: 'landOrPass'` in the threshold and `reached(spec, ctx.s.clock, loseSpace)` in the check. A lose space that differs per scenario: build the spec from the scenario's data and keep `loseSpace` beside it.

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
