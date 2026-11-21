# dice-patterns

Dice patterns as plain data (a pair, N the same, a run, odd or even, a sum against a number, a count) compiled to the test that `dice-odds` `chance` and `dice-tray` `readRoll` take, plus the smallest set of dice that meets one (K527). No packages; import from `index`.

## Rules for agents

**What it does:** Turns JSON-safe pattern data into `test(values)`, a dice-tray meaning, or the fewest dice that meet it.

**You must:**
1. Write patterns as data: `{ kind: 'same', n: 2 }` is the one way to say "a pair"; never write the test by hand when a kind here says it.
2. Run `checkPattern(data)` on patterns loaded from content and report its problems; `compile` throws them joined with `; `.
3. Pass `compile(p)` to `chance(k, test)` as it is, and `meaning(id, p, label)` to `readRoll(tray, meanings)`; dice with value 0 (not rolled) are left out of a meaning.
4. Keep rolls small (about 10 dice): `smallest` tries every set of dice, fewest first.
5. Write the game's rule for what a met pattern does in the game, not here.

**Common mistakes:**
- Expecting `smallest` to drop dice from a sum: a sum reads every die, so `{ kind: 'sum' }` returns all indexes.
- Expecting an empty roll to meet anything: every pattern needs at least one die (`spread` two).

## Kinds

- `same`/`different`/`run`/`even`/`odd`/`count` with `n` (1 or more): n dice of one value, n different values, n values in a row (a gap breaks it), n even or odd dice, at least n dice.
- `atLeast` and `face` with `face` and `n`: n dice showing `face` or more; n dice showing exactly `face` (a slot that takes one named face).
- `sum` with `op` (`<`, `<=`, `=`, `>=`, `>`) and `value`; `max` and `spread` (highest minus lowest) with `value` and an optional `op` (default `=`).
- `twoPair`; `all` and `any` with `of`, a list of patterns.
- `smallest(p, values)`: indexes of the fewest dice that meet `p`, or null when the whole roll does not. Tie-break: the set whose indexes come first in order (`[0, 3]` before `[1, 2]`). `all` first tries the union of each part's set; `any` takes the smallest set of its met parts (the first on a tie).

Not here: rolling, odds after rerolls, card sets or poker hands, dice formulas.

## Use it in 10 lines

```ts
import { checkPattern, compile, meaning, smallest, type Pattern } from '../kit/dice-patterns/index'

const pair: Pattern = { kind: 'same', n: 2 }
console.log(checkPattern({ kind: 'same', n: 0 })) // ['pattern.n: a whole number of 1 or more']
console.log(compile(pair)([1, 4, 6, 4])) // true; also chance(2, compile(pair))
console.log(smallest(pair, [1, 4, 6, 4, 2])) // [1, 3]
const big = meaning('big', { kind: 'sum', op: '>', value: 7 }, 'big roll') // for readRoll
console.log(big.test([{ value: 3 }, { value: 5 }])) // true
```
