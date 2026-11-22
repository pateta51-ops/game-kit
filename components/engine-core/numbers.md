# engine-core: a number with its parts (K526, K582, opt-in)

`numberParts(base, modifiers, order, opts?)` computes one number (a stat, a cost, a cost line, a rate) and returns `{ value, base, parts, bound?, bounds?, unchanged? }`. It is pure: it stores nothing, and a game that never calls it is unchanged. `effectsOf`, `sumEffects` and `layered` are as they were; use `layered` when the value is not a number or the game needs its own `apply`.

A stat breakdown, a modifier with a floor, a cost reduction with a minimum: all are this part. What is not: see "Not this part" below.

## The modifiers

`NumberModifier`: `{ source, op, amount, when?, min?, per?, round?, of?, ref? }`, `op` one of `set`, `add`, `multiply`, `floor`, `cap`.

- Printed modifiers of the sources in force: the game gathers them (it knows which sources are in force).
- Lasting effects: `effectModifiers(s, map, kind?, filter?, cfg?)` reads them through `effectsOf` (oldest first; ended, waiting, blanked and false-`when` effects are already left out) and maps each onto none, one or several modifiers. Nothing is stored: a source that left play (`sourceLeft`), a spent "next one" (`spendEffect`) and an ended duration are gone at the next read.
- `when`: a key in `opts.conditions` (`(m) => boolean`; the game closes over its state). False: not a part. A missing key is an `EngineBugError`.
- `min`: a reduction's own minimum. It lowers to `min` at most, never lowers a value already at or below it, and never raises one. Only an add below 0 takes one (an add that counts to 0 may keep it): `min` on a raise, a set, a multiply, a floor or a cap is an `EngineBugError`.
- `per`: a key in `opts.counts`; the amount is multiplied by that count (the part shows the multiplied amount).
- `of`: the stat, cost line or cost it changes. Pass `opts.of`; a modifier naming another one is skipped and listed nowhere. A call that passes no `opts.of` skips every scoped modifier too, and lists each in `unchanged` with `why: 'scope'`: an empty list there says the call forgot nothing. A cost with several lines is one call per line; a line that comes out 0 (exactly `0`, never negative zero) is the game's to drop.
- `ref`: anything the game wants back (an effect id to spend, a clause). It is copied onto the modifier's part, unchanged entry and bound as it is; the kit never reads it. Two modifiers of one source are told apart by it.

The same modifier object given twice is two modifiers (two copies of one card sharing a printed modifier).

## The order, from a ruling

The order is data, one `NumberOrder` per kind of number. Take every field from the game's rulings; where they are silent, ask (never pick).

| The ruling says | Field |
| --- | --- |
| which operation applies before which | `steps`, for example `['set', 'multiply', 'add', 'floor']`; `increase` and `decrease` split the adds (`['increase', 'set', 'decrease', 'floor']`: raises, then "reduce to N", then reductions) |
| two "becomes N" effects on one number | `setters`: `last` (default: last in the array the game gave, not latest in time; a game whose ruling is "the newest wins" gives the setters oldest first), `lowest`, `highest` (ties: the first given) |
| "reduce to N" never raises | `setOnlyLowers: true` |
| the result must not depend on the order in which reductions with their own minimum arrived | `decreases: 'highestMin'` (highest `min` first, then the largest reduction: the lowest result any order gives). In an unsplit `add` step the reductions take that order among themselves and the raises keep their places |
| halves round up, or down | `round`; a modifier's own `round` wins; none named: no rounding. `up` is toward plus infinity and `down` toward minus infinity: -5 halved is -2 rounded up (toward zero), -3 rounded down. There is no "away from zero" |
| a number of this kind never goes below N, or above N | `floor`, `cap` (each needs its step) |

Within a step modifiers apply in the order given, except as the fields above say. A floor always holds: the `floor` step raises any value under the floor, also the base when no modifier applied. At that step the highest of the floors named by modifiers and the default holds; at the `cap` step the lowest cap. A floor between two steps is a second `floor` step: every floor, named or default, holds at each one (and may be a part twice). A product that is not whole is first cut to 15 significant digits, so 100 times 1.1 rounded up is 110, not 111; whole products are never touched. An add of 0 is taken by whichever of `increase` and `decrease` the order has. A modifier whose operation has no step in the order, or a default floor or cap without its step, is an `EngineBugError`: nothing is dropped silently.

## The parts

`parts` is `{ source, op, amount, applied, ref? }` in the order applied. `applied` is the change that part made, so `base` plus every `applied` is `value`: a set counts as the change it made, and a floor or cap that bit is a part too (its `source` is the modifier that named it, or `floor` / `cap` for the order's default) and is also listed in `bounds`. A modifier that changed nothing is never a part. With `opts.unchanged: true` they are returned in `unchanged`, each with `why`: `condition` (its condition is false), `outranked` (another setter, floor or cap won), `same` (it applied and the value stayed), `refused` (a setter that `setOnlyLowers` did not let raise the value) or `scope` (it names an `of` and the call named none). `why`, `op` and the steps may get more values later: a game that switches on them keeps a default branch.

`bounds` is every floor or cap that bit, in the order they bit, each with `holds`: whether the final value sits on that bound. A floor that lifted the base before the adds raised it further has `holds: false`; when a floor and a cap both bit, both are listed. No bite: no `bounds`. `bound` is the last entry without `holds` (kept for callers that read it); it does not say the bound still holds.

## Showing the breakdown

Show `base`, then one line per part: the source's name (the game maps `source` to words; never a rule id on screen) and `applied` with its sign; for each of `bounds` with `holds: true` say which floor or cap held (one with `holds: false` is only a line of the breakdown). `partsDirection(parts)` gives `lower`, `higher` or `mixed` for a badge, part by part: +1 and -2 is `mixed`; for the net direction compare `value` with `base`. Whether sources that changed nothing are listed is the game's choice (`unchanged`).

## Payment, `bar`, `preview`

Compute the cost once with `numberParts` and pass `value` on to the game's own payment plan, option label, can-pay check and `bar` reason, so none of them reads the printed cost. Nothing in the kit does this for the game: `numberParts` only returns the number. The standard verb pack of `card-language` reads the printed amount of a cost step and takes no modified cost yet; a game on it changes the amount in its cost steps itself before they reach the pack. `preview` needs nothing extra: it runs the same handlers.

```ts
const cost = numberParts(printed, [...printedMods, ...effectModifiers(s, toMod, 'cost')], COST_ORDER, { of: 'play' });
const canPay = have >= cost.value; // the label, the plan and the bar reason read cost.value and cost.parts too
```

## Not this part

- A stored value that is clamped after each change (a die or a track kept between 1 and 6 while it is raised and lowered over time): a floor or cap here holds only at its step, after the changes of the steps before it. From 5, +2 then -1 clamped to 6 after each change is 5; `['add', 'cap']` gives 6. Keep such a value in state and clamp it where it changes.
- A table lookup or formula in the middle (a result read from a table by the modified number, then modified again): two calls with the game's lookup between them, and two lists of parts.
- A value that is not one number (several stats set or removed together, a list): `layered`, or one call per stat after the game has picked what applies.

Prior-art cases with no test here, and why: a set that removes the unnamed stats of a multi-stat value, and a change to a stat the target lacks (a value here is one number; which stats exist is the game's gather); a switched-off source that keeps its restrictions (which sources are in force is the game's gather); a list value with granted entries (`layered`).

Tests: `numbers.test.ts`.
