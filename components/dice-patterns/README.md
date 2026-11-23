# dice-patterns

Dice patterns as plain data (a pair, N the same, a run, odd or even, a sum against a number, a count) compiled to the test that `dice-odds` `chance` and `dice-tray` `readRoll` take, plus the smallest set of dice that meets one (K527) and what a roll lacks to meet one, as data (K725), on its own or only when the whole roll meets it too (K578). No packages; import from `index`.

## Rules for agents

<!-- hooks: written by scripts/catalog.mjs from docs/catalog-notes.json; do not edit -->
**Hooks a game calls:**
- `compile`: test a dice pattern, a pair, a run or a sum, on the dice
- `meaning`: a pattern as a dice tray meaning
- `smallest`: the fewest dice that meet a pattern
- `checkPattern`: check pattern data from content
- `missing`: what a dice roll lacks to meet a pattern, as data
<!-- /hooks -->

**What it does:** Turns JSON-safe pattern data into `test(values)`, a dice-tray meaning, or the fewest dice that meet it.

**You must:**
1. Write patterns as data: `{ kind: 'same', n: 2 }` is the one way to say "a pair"; never write the test by hand when a kind here says it.
2. Run `checkPattern(data)` on patterns loaded from content and report its problems; `compile` throws them joined with `; `.
3. Pass `compile(p)` to `chance(k, test)` as it is, and `meaning(id, p, label)` to `readRoll(tray, meanings)`; "not rolled" is the tray's notion: only `meaning` leaves dice out, and it leaves out every die of value 0 or less (0 is the tray's "not rolled"). So `meaning` misjudges dice whose real faces include 0 or less (`spread` `=` 2 on `[0, 3, 5]` is met for `meaning`, not for `compile`; `sum` `=` 3 on `[-1, 3]` the same): such a game judges with `compile`. `compile` and `smallest` judge every value they are given, and a zero or negative face is a value like any other, so take the unrolled dice out yourself before you call them (`same` 2 on `[0, 0, 4, 4]` gives `[0, 1]`).
4. Choose the question before you call. "Do all these dice together meet it" (a pattern judged over every die on a space, in a slot or in a roll): `compile(p)(values)`, and for the dice to show, `smallest(p, values, { whole: true })`. "Is there a set of dice in this roll that meets it" (the player picks which dice to spend): `smallest(p, values)`. Never use `smallest` without `whole` to judge a whole pool: it says yes to an exact sum that only some of the dice make.
5. Say an exact size with `count` and `op: '='` inside `all` ("three the same and no fourth die": `all` of `same` 3 and `count` `=` 3), judged over the whole group.
6. Read `all` as conditions that are each judged on the roll by itself; nothing ties them to the same dice. `all` of `even` 2 and `different` 2 is met by `[2, 2, 3]`. It means "two even dice, not equal" only on a group of exactly two dice (add `count` `=` 2, or pass only the two dice). "n dice that are even and all different" inside a bigger roll is not a pattern here yet: write it in the game.
7. Keep rolls small (about 10 dice): `smallest` tries every set of dice, fewest first.
8. Word what `missing` returns in the game (it is data: counts, faces, gaps, never words); an empty list means nothing is missing.
9. Write the game's rule for what a met pattern does in the game, not here.

**Common mistakes:**
- Expecting `smallest` without `whole` to agree with `compile` on the whole roll: it judges each set alone, so it differs for every exact value and upper bound (`sum`, `spread`, `max`, `count` with `=`, `<`, `<=`). The table under "Kinds" lists them.
- Expecting `smallest` to light every die that counts: it gives the fewest. `sum` `>=` 10 on `[1, 6, 5, 4]` gives `[1, 2]`, with or without `whole`; a game whose sum reads every die lights them all itself.
- Reading `smallest(p, values, { whole: true })` as "what is missing": null says only that the whole roll does not meet the pattern; ask `missing`.
- Expecting an empty roll to meet anything: every pattern needs at least one die (`spread` two).

## Kinds

- `same`/`different`/`run`/`even`/`odd`/`count` with `n` (1 or more): n dice of one value, n different values, n values in a row (a gap breaks it), n even or odd dice, at least n dice (`count` takes an optional `op`, default `>=`: `{ kind: 'count', op: '=', n: 3 }` is exactly 3 dice).
- `atLeast` and `face` with `face` and `n`: n dice showing `face` or more; n dice showing exactly `face` (a slot that takes one named face).
- `sum` with `op` (`<`, `<=`, `=`, `>=`, `>`) and `value`; `max` and `spread` (highest minus lowest) with `value` and an optional `op` (default `=`).
- `twoPair`; `all` and `any` with `of`, a list of patterns.
- `smallest(p, values)`: indexes of the smallest non-empty set of the dice that meets `p` when judged on that set alone, or null when no set does. Tie-break: the set whose indexes come first in order (`[0, 3]` before `[1, 2]`). One rule for every kind, `all`, `any` and `sum` included: "highest die at most 3" on `[2, 3]` gives `[0]`, and on `[6, 2]` gives `[1]` although `compile` (which judges the whole roll it is given) says false.
- `smallest(p, values, { whole: true })`: the same set, but null unless all of `values` together meet `p` (what `compile(p)(values)` says). The answer is still the fewest dice that meet `p` on their own, so for an exact sum of faces above 0 it is every die. Inside `any` only the parts that the whole roll meets are read: `any` of `sum` `=` 7 and `same` 2 on `[3, 4, 2, 2]` gives the pair `[2, 3]`, not the 3 and the 4.

What `smallest` answers without `whole`, and when that differs from the check of the whole roll:

| Kind | `smallest(p, values)` | Differs from `compile(p)(values)` |
|---|---|---|
| `same`, `different`, `run`, `even`, `odd`, `atLeast`, `face`, `twoPair` | the fewest dice that make it | never: more dice cannot break it |
| `count` | n dice with `>=` or `=`; n + 1 dice with `>`; one die with `<`, `<=` (`<` 1 is never met: no set is empty) | with `=`, `<`, `<=`, when the roll has more dice |
| `sum` | the fewest dice whose sum meets it | with `=`, `<`, `<=`: `= 7` on `[3, 4, 2]` gives `[0, 1]`, the roll sums to 9 |
| `max` | one die that meets it | with `=`, `<`, `<=`, when a higher die is in the roll |
| `spread` | two dice that meet it | with `=`, `<`, `<=`, when the roll is wider |
| `all` | the fewest dice that meet every part together | when a part differs |
| `any` | the smallest set of any part | when every met part differs |

- `missing(p, values, { whole? })`: a list of `Lack`, empty when nothing is missing (`whole`: judged on every die together, as `compile`; without it, also empty when some set of the dice meets `p`, as `smallest`). Throws like `compile`. One `Lack` per unmet leaf, in pattern order; `all` gives the lacks of its unmet parts, `any` one `{ kind: 'any', of }` with a list of lacks per alternative (empty when a part is met). Leaves: `same`, `different`, `even`, `odd`, `atLeast`, `face`, `twoPair`: `{ kind, have, need }` (`need` more dice, for `twoPair` the fewest dice to add; `face`: the pattern's face, for `same` the commonest value, lowest on a tie, absent on no dice); `run`: `{ kind, have (longest run), need, gaps }`, the values missing from the window of n values, starting at a rolled value, with fewest gaps (lowest on a tie; `gaps` empty with no dice); `count`, `sum`, `max`, `spread`: `{ kind, op, value, have, by, dir, dice }`, the roll's number, how far it is from meeting `op value` (`dir` `'up'` it must rise, `'down'` fall), and `dice` more dice needed before it can be judged (1 for none at all, 2 for a `spread`). An `all` whose parts are each met by the roll but not by one set gives nothing at that `all`.

Not here: a "not" kind, conditions tied to the same dice, rolling, odds after rerolls, card sets or poker hands, dice formulas.

## Use it in 10 lines

```ts
import { checkPattern, compile, meaning, missing, smallest, type Pattern } from '../kit/dice-patterns/index'

const pair: Pattern = { kind: 'same', n: 2 }
console.log(checkPattern({ kind: 'same', n: 0 })) // ['pattern.n: a whole number of 1 or more']
console.log(compile(pair)([1, 4, 6, 4])) // true; also chance(2, compile(pair))
console.log(smallest(pair, [1, 4, 6, 4, 2])) // [1, 3]
console.log(smallest({ kind: 'sum', op: '=', value: 7 }, [3, 4, 2], { whole: true })) // null: all three sum to 9
console.log(missing({ kind: 'odd', n: 2 }, [3])) // [{ kind: 'odd', have: 1, need: 1 }]
const big = meaning('big', { kind: 'sum', op: '>', value: 7 }, 'big roll') // for readRoll
console.log(big.test([{ value: 3 }, { value: 5 }])) // true
```
