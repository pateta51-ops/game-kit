# game-store

One game store and one game object (K234): `defineGame` is what the game writes once; `createGameStore` joins engine-core step undo, prompt-host forced answers, paced-view steps, autosave and the opponent seat. Needs engine-core, prompt-host, paced-view (and sim-pool, replay-cli for `sim.ts`). Recipe: [game-store](../../docs/recipes/game-store.md).

- `defineGame({ rules, content, seats, start(seed), view(state, seat), forced?, opponent?(view, prompt), isStep?, words?, format? })`: `view` is the seat's own view (build it from card-zones `viewOf`); the opponent and the screen read only it.
- `createGameStore(def, { seat, seed?, undo?, afterGameOver?, instant?, saves?, saveName? })`: `get()` gives `{ history, state, view, steps, options, rules, error }`; `subscribe(fn)` (React: `useSyncExternalStore(store.subscribe, store.get)`).
- K271 one bot for both: `opponent(view, prompt, rng)` gets a `DriverRng` keyed `<options.seed>|opponent|<prompt id>` (sim-pool's key for driver `opponent`); `botOpponent(bot)` turns a sim-pool `Bot` (opponent's `opponentBot`) into it, `botDriverOf(def, bot)` into the sim's driver: same seed, same answers.
- `answer(picks, promptId)`: a stale id is dropped; the click and the forced answers after it (`answerWithForced`, the store's seat), then the opponent's answers (`opponent(view(state, prompt.seat), prompt)`), are one undo step and one `pushSteps`; then `saves.writeAutosave` (`autosaved()` is the write).
- `undo()`, `redo()`, `canUndo()` (engine-core `undoStep`, mode `safe` by default), `advance()`, `skip()` (paced-view), `fresh(seed)`.
- `load(save)`: `restoreSave`, then the undo steps rebuilt (`replaySteps`: an answer of the store's seat that `forced` would not give starts a step); `saved()` is the engine-core `History` for saves (`saveNamed`, `SavesScreen`).
- `sim.ts` (node only): `simGameOf(def, { drivers?, summary?, maxActions? })` is sim-pool's game module (drivers `opponent` and `random`), `opponentDriverOf(def)`, `botDriverOf(def, bot)`, `replayEngineOf(def, describe?)`.
- Proof: `store.test.ts`; the reference game plays a whole game, undo, save mid-effect and a view-leak check through it.

## Use it in 10 lines

```ts
import { createGameStore, defineGame } from '../kit/game-store/index'
import { CONTENT, COUNTER, type Counter, type CounterState } from '../kit/engine-core/fake/counter'

const def = defineGame<Counter, CounterState, string>({ rules: COUNTER, content: CONTENT, seats: ['me'], start: (seed) => ({ options: { seed }, rules: { target: 12 } }), view: (s) => s })
const store = createGameStore(def, { seat: 'me', seed: 'demo', undo: 'free' })
const p = store.get().state.prompt
if (p !== null) store.answer(['add'], p.id) // one click: one undo step, its events paced once
console.log(store.get().history.steps.length, store.undo())
```

One bot for the store and the sim (K271):

```ts
import { botOpponent, defineGame } from '../kit/game-store/index'
import { botDriverOf, simGameOf } from '../kit/game-store/sim'
import type { Bot } from '../kit/sim-pool/index'
import type { AnswerAction } from '../kit/engine-core/kernel'
import { CONTENT, COUNTER, type Counter, type CounterState } from '../kit/engine-core/fake/counter'

const bot: Bot<CounterState> = { name: 'opponent', choose: (_view, answers, rng) => answers[rng.int(answers.length)] as AnswerAction }
const def = defineGame<Counter, CounterState, string>({ rules: COUNTER, content: CONTENT, seats: ['me'], start: (seed) => ({ options: { seed }, rules: { target: 12 } }), view: (s) => s, opponent: botOpponent(bot) })
const sim = simGameOf(def, { drivers: { opponent: botDriverOf(def, bot) } }) // same seed: same answers as the store
console.log(sim.rules === def.rules)
```
