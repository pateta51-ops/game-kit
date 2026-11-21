# dice-odds

Exact dice probabilities (K24), opt-in. No packages; import from `index`.

## Rules for agents

**What it does:** Exact dice probabilities for k dice of any size, with an optional extra die.

**You must:**
1. Import from `kit/dice-odds/index` (no packages needed).
2. Write the success `test(dice, extra)` yourself; `chance(k, test, { sides, extraSides })` sums the probability of the outcomes where it holds. `dice` is ascending.
3. Pass the same `sides`/`extraSides` to every call that should agree; the default is six sides.
4. Keep k small: the outcome list holds every multiset of k dice (cached once per k and sides).

**Common mistakes:**
- Expecting rerolls or keep-best rules: write them in `test` or in the game.


- `outcomes(k, {sides = 6, extraSides})`: every multiset of k dice (`dice` ascending) with its multinomial probability `p` (sums to 1). With `extraSides`, each also pairs with every face `extra` of one more die of that size.
- `chance(k, test, spec)`: sum of `p` where `test(dice, extra)` holds, e.g. `chance(3, d => d.includes(6))`.
- The outcome lists are cached in module state, so each worker thread builds each (k, sides) once.

Not here: rerolls, keep-best rules and the game's own success tests; the game writes `test`.

A success test written as data (a pair, a run, a sum over a number): `dice-patterns` `compile(pattern)` gives the `test` `chance` takes.

## Use it in 10 lines

```ts
import { chance } from '../kit/dice-odds/index'

// chance that at least one of 3 six-sided dice shows a 6
console.log(chance(3, (dice) => dice.includes(6)))
```
