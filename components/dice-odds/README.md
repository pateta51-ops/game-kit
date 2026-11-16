# dice-odds

Exact dice probabilities (K24), opt-in. No packages; import from `index`.

- `outcomes(k, {sides = 6, extraSides})`: every multiset of k dice (`dice` ascending) with its multinomial probability `p` (sums to 1). With `extraSides`, each also pairs with every face `extra` of one more die of that size.
- `chance(k, test, spec)`: sum of `p` where `test(dice, extra)` holds, e.g. `chance(3, d => d.includes(6))`.
- The outcome lists are cached in module state, so each worker thread builds each (k, sides) once.

Not here: rerolls, keep-best rules and the game's own success tests; the game writes `test`.

## Use it in 10 lines

```ts
import { chance } from '../kit/dice-odds/index'

// chance that at least one of 3 six-sided dice shows a 6
console.log(chance(3, (dice) => dice.includes(6)))
```
