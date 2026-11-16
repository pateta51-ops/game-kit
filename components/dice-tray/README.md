# dice-tray

Pure logic of a dice tray and its roll window (K211), opt-in, unstyled; the game draws it (CSS, `pieces-3d`) and writes its own meanings. Import from `index`. Needs `state-machines`.

- `newTray(specs)`: dice in play, each a sides number or `{sides, kind}`; value 0 until rolled.
- `roll(tray, rng, only?)`: rolls every die not held (or only those ids) with `rng.int(sides) + 1`, in die order; pass `ctx.rng` so the roll is seeded and replayable (never `Math.random`). Returns `{tray, rolled}`.
- `toggleHold`, `hold`, `heldDice`, `adjust(tray, id, +-1)` (stays in 1..sides), `remove`, `values`.
- `readRoll(tray, meanings)`: the roll window's content: values, sum, and every `Meaning {id, test, label}` that holds.
- `rollWindow`/`step`, `winPickToken`/`winPickDie`/`winBack`/`adjustId`: the tap order token, die, then + or - as a pick state (die taps before a token are ignored).
- `toggleSelect`, `canReroll`, `rerollSelected`, `selectOne`, `setValue`: dice picked for a reroll, one die picked, a game-set value.
- `rollWith(tray, rng, {onRoll})`: optional animation hook, off unless given (1.0 has none).

Not here: dice faces, 3D (`pieces-3d`), odds (`dice-odds`), tokens and costs, the game's rules for what a roll means.

## Use it in 10 lines

```ts
import { newTray, roll, readRoll } from '../kit/dice-tray/index'

const rng = { int: (max: number) => max - 1 } // in a game: ctx.rng
const { tray } = roll(newTray([6, 6]), rng)
const r = readRoll(tray, [{ id: 'dbl', label: 'double', test: (d) => d[0]?.value === d[1]?.value }])
console.log(r.sum, r.first?.label) // 12 double
```
