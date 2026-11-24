# cheat-options

Dev cheats a game declares as data at set-up (more starting units, more actions each round), applied only as recorded engine-core debug edits, gated by `allowCheats`, with a `cheated` mark.

## Rules for agents

<!-- hooks: written by scripts/catalog.mjs from docs/catalog-notes.json; do not edit -->
**Hooks a game calls:**
- `CheatDef` + `cheatActions`: cheats as data, applied as debug edits
- `cheatFields` + `cheatsFrom`: the set-up form fields
- `cheatedOf` + `cheatProblem`: the cheated mark and the set-up check
<!-- /hooks -->

**What it does:** Turns the cheats chosen at set-up into engine-core kernel `set` debug edits, once at set-up or at every round start, so history, undo, saves and replay keep them; marks the game `cheated`.

**You must:**
1. Declare each cheat as a `CheatDef` (`id`, `label`, `kind` `number` or `toggle`, `when` `setup` or `round`, `edits`: `{ path, op?: 'add' | 'set', by?, min?, max? }`); never change state for a cheat in the game's own code.
2. Keep `allowCheats` and `cheats` (`{ [id]: number | boolean }`) in the game's options; opt in to debug edits (`GameRules.debug`, `{}` is enough).
3. Pass `cheats: { defs, choice?, round? }` to game-store `defineGame`: the store applies the due edits after `fresh` and after each answer whose round changed, joined to that undo step. `round` defaults to `state.flow.round` (turn-flow); `choice` defaults to the options.
4. Refuse a bad choice at set-up with `cheatProblem(defs, choice)` (throw engine-core `GameSetupError` with it).
5. Build the set-up fields with `cheatFields(defs, allowCheats)` in screens `SetupSpec.extra` (none when off) and read them back with `cheatsFrom(defs, setup)`.
6. Show the mark from game-store `get().cheated` (or the view's third argument `{ cheated }`) and table-panels `<GameOver cheated />`.
7. In a sim or a test without the store, play `cheatActions(defs, choice, state, when)` yourself through `applyAction`.

**Common mistakes:**
- `cheated` is true for any debug edit, a debug-console edit included: that is intended.
- A round cheat needs a number from `round(state)`: a game without turn-flow passes `round`.

`cheatActions` reads the current value at each path (`add`: value plus the chosen number times `by`; `set`: the number times `by`; a toggle on counts as 1) and tags each edit `args.cheat` with its id; edits on one path add up. A loaded save replays the recorded edits and applies nothing again; the cheat edits it holds join the step before them. `GameOver cheated` renders `<p data-part="game-over-cheated">` with `labels.cheated` (default "Cheats on") or the node you pass.

## Use it in 10 lines

```ts
import { cheatActions, cheatedOf, cheatFields, cheatProblem, type CheatDef } from '../kit/cheat-options/index'

const defs: CheatDef[] = [
  { id: 'extraUnits', label: 'Extra starting units', kind: 'number', when: 'setup', edits: [{ path: ['units'] }], max: 3 },
  { id: 'extraActions', label: 'Extra actions', kind: 'number', when: 'round', edits: [{ path: ['actions'] }] },
]
const choice = { allowCheats: true, cheats: { extraActions: 1 } }
console.log(cheatProblem(defs, choice), cheatFields(defs, choice.allowCheats).length)
const edits = cheatActions(defs, choice, { units: 3, actions: 3 }, 'round') // [{ kind: 'debug', verb: 'set', args: { path: ['actions'], value: 4, cheat: 'extraActions' } }]
console.log(cheatedOf(edits))
```
