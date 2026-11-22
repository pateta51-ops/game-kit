# dice-patterns

Dice patterns as plain data (a pair, N the same, a run, odd or even, a sum against a number, a count) compiled to the test that `dice-odds` `chance` and `dice-tray` `readRoll` take, plus the smallest set of dice that meets one (K527), on its own or only when the whole roll meets it too (K578). No packages; import from `index`.

## Rules for agents

**What it does:** Turns JSON-safe pattern data into `test(values)`, a dice-tray meaning, or the fewest dice that meet it.

**You must:**
1. Write patterns as data: `{ kind: 'same', n: 2 }` is the one way to say "a pair"; never write the test by hand when a kind here says it.
2. Run `checkPattern(data)` on patterns loaded from content and report its problems; `compile` throws them joined with `; `.
3. Pass `compile(p)` to `chance(k, test)` as it is, and `meaning(id, p, label)` to `readRoll(tray, meanings)`; dice with value 0 (not rolled) are left out of a meaning.
4. Choose the question before you call. "Do all these dice together meet it" (a pattern judged over every die on a space, in a slot or in a roll): `compile(p)(values)`, and for the dice to show, `smallest(p, values, { whole: true })`. "Is there a set of dice in this roll that meets it" (the player picks which dice to spend): `smallest(p, values)`. Never use `smallest` without `whole` to judge a whole pool: it says yes to an exact sum that only some of the dice make.
5. Say an exact size with `count` and `op: '='` inside `all` ("three the same and no fourth die": `all` of `same` 3 and `count` `=` 3), judged over the whole group.
6. Keep rolls small (about 10 dice): `smallest` tries every set of dice, fewest first.
7. Write the game's rule for what a met pattern does in the game, not here.

**Common mistakes:**
- Expecting `smallest` without `whole` to agree with `compile` on the whole roll: it judges each set alone, so it differs for every exact value and upper bound (`sum`, `spread`, `max`, `count` with `=`, `<`, `<=`). The table under "Kinds" lists them.
- Reading `smallest(p, values, { whole: true })` as "what is missing": null says only that the whole roll does not meet the pattern.
- Expecting an empty roll to meet anything: every pattern needs at least one die (`spread` two).

## Kinds

- `same`/`different`/`run`/`even`/`odd`/`count` with `n` (1 or more): n dice of one value, n different values, n values in a row (a gap breaks it), n even or odd dice, at least n dice (`count` takes an optional `op`, default `>=`: `{ kind: 'count', op: '=', n: 3 }` is exactly 3 dice).
- `atLeast` and `face` with `face` and `n`: n dice showing `face` or more; n dice showing exactly `face` (a slot that takes one named face).
- `sum` with `op` (`<`, `<=`, `=`, `>=`, `>`) and `value`; `max` and `spread` (highest minus lowest) with `value` and an optional `op` (default `=`).
- `twoPair`; `all` and `any` with `of`, a list of patterns.
- `smallest(p, values)`: indexes of the smallest non-empty set of the dice that meets `p` when judged on that set alone, or null when no set does. Tie-break: the set whose indexes come first in order (`[0, 3]` before `[1, 2]`). One rule for every kind, `all`, `any` and `sum` included: "highest die at most 3" on `[2, 3]` gives `[0]`, and on `[6, 2]` gives `[1]` although `compile` (which judges the whole roll it is given) says false.
- `smallest(p, values, { whole: true })`: the same set, but null unless all of `values` together meet `p` (what `compile(p)(values)` says). The answer is still the fewest dice that meet `p` on their own, so for an exact sum it is every die.

What `smallest` answers without `whole`, and when that differs from the check of the whole roll:

| Kind | `smallest(p, values)` | Differs from `compile(p)(values)` |
|---|---|---|
| `same`, `different`, `run`, `even`, `odd`, `atLeast`, `face`, `twoPair` | the fewest dice that make it | never: more dice cannot break it |
| `count` | n dice with `>=` or `=`; one die with `<`, `<=` | with `=`, `<`, `<=`, when the roll has more dice |
| `sum` | the fewest dice whose sum meets it | with `=`, `<`, `<=`: `= 7` on `[3, 4, 2]` gives `[0, 1]`, the roll sums to 9 |
| `max` | one die that meets it | with `=`, `<`, `<=`, when a higher die is in the roll |
| `spread` | two dice that meet it | with `=`, `<`, `<=`, when the roll is wider |
| `all` | the fewest dice that meet every part together | when a part differs |
| `any` | the smallest set of any part | when every met part differs |

Not here: a "not" kind, what a roll is missing, rolling, odds after rerolls, card sets or poker hands, dice formulas.

## Use it in 10 lines

```ts
import { checkPattern, compile, meaning, smallest, type Pattern } from '../kit/dice-patterns/index'

const pair: Pattern = { kind: 'same', n: 2 }
console.log(checkPattern({ kind: 'same', n: 0 })) // ['pattern.n: a whole number of 1 or more']
console.log(compile(pair)([1, 4, 6, 4])) // true; also chance(2, compile(pair))
console.log(smallest(pair, [1, 4, 6, 4, 2])) // [1, 3]
console.log(smallest({ kind: 'sum', op: '=', value: 7 }, [3, 4, 2], { whole: true })) // null: all three sum to 9
const big = meaning('big', { kind: 'sum', op: '>', value: 7 }, 'big roll') // for readRoll
console.log(big.test([{ value: 3 }, { value: 5 }])) // true
```
