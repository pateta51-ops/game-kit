# engine-core: a number with its parts (K526, opt-in)

`numberParts(base, modifiers, order, opts?)` computes one number (a stat, a cost, a cost line, a rate) and returns `{ value, base, parts, bound?, unchanged? }`. It is pure: it stores nothing, and a game that never calls it is unchanged. `effectsOf`, `sumEffects` and `layered` are as they were; use `layered` when the value is not a number or the game needs its own `apply`.

## The modifiers

`NumberModifier`: `{ source, op, amount, when?, min?, per?, round?, of? }`, `op` one of `set`, `add`, `multiply`, `floor`, `cap`.

- Printed modifiers of the sources in force: the game gathers them (it knows which sources are in force).
- Lasting effects: `effectModifiers(s, map, kind?, filter?, cfg?)` reads them through `effectsOf` (oldest first; ended, waiting, blanked and false-`when` effects are already left out) and maps each onto none, one or several modifiers. Nothing is stored: a source that left play (`sourceLeft`), a spent "next one" (`spendEffect`) and an ended duration are gone at the next read.
- `when`: a key in `opts.conditions` (`(m) => boolean`; the game closes over its state). False: not a part. A missing key is an `EngineBugError`.
- `min`: a reduction's own minimum. It lowers to `min` at most, never lowers a value already at or below it, and never raises one.
- `per`: a key in `opts.counts`; the amount is multiplied by that count (the part shows the multiplied amount).
- `of`: the stat, cost line or cost it changes. Pass `opts.of`; a modifier naming another one is skipped and listed nowhere. A cost with several lines is one call per line; a line that comes out 0 is the game's to drop.

## The order, from a ruling

The order is data, one `NumberOrder` per kind of number. Take every field from the game's rulings; where they are silent, ask (never pick).

| The ruling says | Field |
| --- | --- |
| which operation applies before which | `steps`, for example `['set', 'multiply', 'add', 'floor']`; `increase` and `decrease` split the adds (`['increase', 'set', 'decrease', 'floor']`: raises, then "reduce to N", then reductions) |
| two "becomes N" effects on one number | `setters`: `last` (default, the order the modifiers were given), `lowest`, `highest` |
| "reduce to N" never raises | `setOnlyLowers: true` |
| the result must not depend on the order in which reductions with their own minimum arrived | `decreases: 'highestMin'` (highest `min` first, then the largest reduction: the lowest result any order gives) |
| halves round up, or down | `round`; a modifier's own `round` wins; none named: no rounding |
| a number of this kind never goes below N, or above N | `floor`, `cap` (each needs its step) |

Within a step modifiers apply in the order given, except as the fields above say. A floor always holds: the `floor` step raises any value under the floor, also the base when no modifier applied. At that step the highest of the floors named by modifiers and the default holds; at the `cap` step the lowest cap. A floor between two steps is a second `floor` step: every floor, named or default, holds at each one (and may be a part twice). An add of 0 is taken by whichever of `increase` and `decrease` the order has. A modifier whose operation has no step in the order, or a default floor or cap without its step, is an `EngineBugError`: nothing is dropped silently.

## The parts

`parts` is `{ source, op, amount, applied }` in the order applied. `applied` is the change that part made, so `base` plus every `applied` is `value`: a set counts as the change it made, and a floor or cap that bit is a part too (its `source` is the modifier that named it, or `floor` / `cap` for the order's default) and is also returned as `bound`. A modifier that changed nothing is never a part. With `opts.unchanged: true` they are returned in `unchanged`, each with `why`: `condition` (its condition is false), `outranked` (another setter, floor or cap won) or `same` (it applied and the value stayed).

## Showing the breakdown

Show `base`, then one line per part: the source's name (the game maps `source` to words; never a rule id on screen) and `applied` with its sign; for `bound` say which floor or cap held. `partsDirection(parts)` gives `lower`, `higher` or `mixed` for a badge. Whether sources that changed nothing are listed is the game's choice (`unchanged`).

## Payment, `bar`, `preview`

Compute the cost once with `numberParts` and pass `value` on: the payment plan, the option label, the can-pay check and the `bar` reason all read that value, never the printed cost. A raised cost then disables the option and the offered plan pays the raised amount. `preview` needs nothing extra: it runs the same handlers.

```ts
const cost = numberParts(printed, [...printedMods, ...effectModifiers(s, toMod, 'cost')], COST_ORDER, { of: 'play' });
const canPay = have >= cost.value; // the label, the plan and the bar reason read cost.value and cost.parts too
```

Tests: `numbers.test.ts`.
