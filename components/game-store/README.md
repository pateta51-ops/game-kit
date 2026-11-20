# game-store

One game store and one game object (K234): `defineGame` is what the game writes once; `createGameStore` joins engine-core step undo, prompt-host forced answers, paced-view steps, autosave and the opponent seat. Needs engine-core, prompt-host, paced-view (and sim-pool, replay-cli for `sim.ts`). Recipe: [game-store](../../docs/recipes/game-store.md).

## Rules for agents

**What it does:** One game store and one game object: engine-core step undo, forced answers, paced views, autosave and the opponent seat joined.

**You must:**
1. Write the game once with `defineGame({ rules, content, seats, start, view, ... })`; `view(state, seat)` must be the seat's own redacted view.
2. Create the store with `createGameStore(def, { seat, seed?, undo?, saves?, ... })`; React reads it with `useSyncExternalStore(store.subscribe, store.get)`.
3. Answer only through `store.answer(picks, promptId)`; a stale prompt id is dropped. A click, the forced answers and the opponent's answers are one undo step.
4. The opponent decides from the view only: `opponent(view, prompt, rng)`; use `botOpponent(bot)` so the store and the sim share one bot.
5. Mount debug edits with `store.debug`, load with `store.load(save)`, undo with `undo()` / `redo()` (mode `safe` unless `undo` says otherwise).
6. Set `openingSteps: true` to pace the setup events as steps; the default is off.
7. Use `sim.ts` (`simGameOf`, `botDriverOf`) in node only.

**Common mistakes:**
- Reading `get().state` in the opponent or the screen: only the view is allowed.
- Sending the same answer from two places: it is two undo steps.


- `defineGame({ rules, content, seats, start(seed), view(state, seat), forced?, opponent?(view, prompt), isStep?, words?, format? })`: `view` is the seat's own view (build it from card-zones `viewOf`); the opponent and the screen read only it.
- `createGameStore(def, { seat, seed?, undo?, afterGameOver?, instant?, openingSteps?, saves?, saveName? })`: `get()` gives `{ history, state, view, steps, options, rules, error }`; `subscribe(fn)` (React: `useSyncExternalStore(store.subscribe, store.get)`).
- K271 one bot for both: `opponent(view, prompt, rng)` gets a `DriverRng` keyed `<options.seed>|opponent|<prompt id>` (sim-pool's key for driver `opponent`); `botOpponent(bot)` turns a sim-pool `Bot` (opponent's `opponentBot`) into it, `botDriverOf(def, bot)` into the sim's driver: same seed, same answers.
- `answer(picks, promptId)`: a stale id is dropped; the click and the forced answers after it (`answerWithForced`, the store's seat), then the opponent's answers (`opponent(view(state, prompt.seat), prompt)`), are one undo step and one `pushSteps`; then `saves.writeAutosave` (`autosaved()` is the write).
- K297 `openingSteps: true`: `fresh(seed)` and the store's first game pace setup's events and the opening opponent answers as one `pushSteps` (base: the view of `rules.blank`, before setup; `instant` honoured). Default off: no opening steps.
- K302 `debug(action)`: an engine-core `DebugAction` (the game sets `GameRules.debug`) as its own undo step, recorded and saved like an answer (a loaded save starts a step at each one), then settled, paced (`pushSteps`) and autosaved; returns the refusal words or undefined, so debug-console mounts with `send={store.debug}`.
- `undo()`, `redo()`, `canUndo()` (engine-core `undoStep`, mode `safe` by default), `advance()`, `skip()` (paced-view), `fresh(seed)`.
- `load(save)`: `restoreSave`, then the undo steps rebuilt (`replaySteps`: an answer of the store's seat that `forced` would not give starts a step); `saved()` is the engine-core `History` for saves (`saveNamed`, `SavesScreen`).
- `sim.ts` (node only): `simGameOf(def, { drivers?, summary?, maxActions?, start? })` is sim-pool's game module (`start(spec)`: a game with settings starts from the spec's `settings` too, K356) (drivers `opponent` and `random`), `opponentDriverOf(def)`, `botDriverOf(def, bot)`, `replayEngineOf(def, describe?)`.
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
