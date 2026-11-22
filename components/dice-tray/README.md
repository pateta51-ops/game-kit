# dice-tray

Pure logic of a dice tray and its roll window (K211), opt-in, unstyled; the game draws it (CSS, `pieces-3d`) and writes its own meanings. Import from `index`. Needs `state-machines`.

## Rules for agents

<!-- hooks: written by scripts/catalog.mjs from docs/catalog-notes.json; do not edit -->
**Hooks a game calls:**
- `newTray`: dice in play
- `roll`: roll every die not held, with the seeded rng
- `toggleHold` + `hold`: keep a die out of the next roll
- `readRoll`: what the roll means: values, sum and every meaning that holds
- `adjust` + `setValue`: change a die value by one or set it
- `rerollSelected` + `canReroll`: reroll the picked dice
- `rollWindow` + `step`: the roll window tap order: token, die, then plus or minus
- `rollWith` + `onRoll`: animate a roll
<!-- /hooks -->

**What it does:** Pure logic of a dice tray and its roll window: dice, holds, rolls, meanings and the tap order. The game draws it.

**You must:**
1. Pass `ctx.rng` (anything with `int(sides)`) to `roll`; never `Math.random`, so the roll is seeded and replayable.
2. Create with `newTray(specs)` (a sides number or `{ sides, kind }`); a value of 0 means not rolled.
3. Treat the tray as immutable: every function returns a new tray (`roll` returns `{ tray, rolled }`).
4. Use `readRoll(tray, meanings)` with your own `Meaning { id, test, label }` list; the kit has no game meanings.
5. Drive the roll window with `rollWindow`/`step` and the pick helpers in order: token, die, then + or -; die taps before a token are ignored.
6. To force a roll in a test give it a `name` and override that name; never swap `ctx.rng`.
7. Animate through `rollWith(tray, rng, { onRoll })`; it is off unless given.

**Common mistakes:**
- Expecting `roll` to roll held dice: it skips them unless named in `only`.
- Drawing faces or 3D here: use `pieces-3d`.


- `newTray(specs)`: dice in play, each a sides number or `{sides, kind}`; value 0 until rolled.
- `roll(tray, rng, only?, name?)`: rolls every die not held (or only those ids) with `rng.int(sides) + 1`, in die order; pass `ctx.rng` so the roll is seeded and replayable (never `Math.random`). Returns `{tray, rolled}`.
- `name` (also on `rollWith(tray, rng, hook?, only?, name?)` and `rerollSelected(tray, rng, sel, name?)`) is passed to every `rng.int(sides, name)`; in a test `setRngOverrides({ attack: ... })` (engine-core `random.md`) forces that one named roll, one call per die in die order (the override returns the 0-based face), e.g. "attack" to [6,2] and "defense" to [3]. No name: unchanged (K692).
- `toggleHold`, `hold`, `heldDice`, `adjust(tray, id, +-1)` (stays in 1..sides), `remove`, `values`.
- `readRoll(tray, meanings)`: the roll window's content: values, sum, and every `Meaning {id, test, label}` that holds.
- `rollWindow`/`step`, `winPickToken`/`winPickDie`/`winBack`/`adjustId`: the tap order token, die, then + or - as a pick state (die taps before a token are ignored).
- `toggleSelect`, `canReroll`, `rerollSelected`, `selectOne`, `setValue`: dice picked for a reroll, one die picked, a game-set value.
- `rollWith(tray, rng, {onRoll})`: optional animation hook, off unless given (1.0 has none).

Not here: dice faces, 3D (`pieces-3d`), odds (`dice-odds`), tokens and costs, the game's rules for what a roll means.

Meanings written as data (a pair, a run, a sum over a number): `dice-patterns` `meaning(id, pattern, label)` gives the `Meaning` `readRoll` takes.

## Use it in 10 lines

```ts
import { newTray, roll, readRoll } from '../kit/dice-tray/index'

const rng = { int: (max: number) => max - 1 } // in a game: ctx.rng
const { tray } = roll(newTray([6, 6]), rng)
const r = readRoll(tray, [{ id: 'dbl', label: 'double', test: (d) => d[0]?.value === d[1]?.value }])
console.log(r.sum, r.first?.label) // 12 double
```
