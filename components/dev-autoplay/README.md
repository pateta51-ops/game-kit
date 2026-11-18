# dev-autoplay

Dev-only: `?dev=1&autoplay=<prompt kind>[*n]` plays a game-store with a sim-pool `Bot` until the open prompt is of that kind (the n-th one), then stops on that screen. Needs engine-core, game-store, sim-pool.

- `devAutoplay(store, { bot, search?, dev?, cap?, onStep?, paceMs?, over?, leave? })` → `{ stop(), status() }`; `status()` is `{ stop, steps }`, `stop` null while running, else `off` (no flag or stopped by you), `kind`, `steps`, `seat`, `over`, `refused` (the store dropped an answer) or `left`. One answer per `paceMs` (default 120; 0 = all at once in the call). `over(state)`: the game's own end (default: no open prompt). `leave(prompt)`: the board answers it itself (IR-25); the bot waits for it (`paceMs: 0` stops with `left`).
- `ui.ts`: `useDevAutoplay(store, opts)` starts it once per store (StrictMode safe) and stops on unmount.
- Flag (`readAutoplayFlag(search)`): needs `dev=1`; `autoplay=<kind>[*n]`, `steps=N` (answers made), `seat=S` (a prompt for that seat); the first reached stops it. `cap` (default 10,000) bounds a run with no `steps`.
- `dev: false` (pass `import.meta.env.DEV`) makes it a no-op in a production build. The bot sees the store's view and `legalAnswers` only; its rng is `<seed>|autoplay|<prompt id>`, so the same seed lands on the same screen. 

## Use it in 10 lines

```ts
import { createGameStore, defineGame } from '../kit/game-store/index'
import { devAutoplay } from '../kit/dev-autoplay/index'
import type { Bot } from '../kit/sim-pool/index'
import type { AnswerAction } from '../kit/engine-core/kernel'
import { CONTENT, COUNTER, type Counter, type CounterState } from '../kit/engine-core/fake/counter'

const bot: Bot<CounterState> = { name: 'dev', choose: (_v, answers, rng) => answers[rng.int(answers.length)] as AnswerAction }
const def = defineGame<Counter, CounterState, string>({ rules: COUNTER, content: CONTENT, seats: ['me'], start: (seed) => ({ options: { seed }, rules: { target: 12 } }), view: (s) => s })
const store = createGameStore(def, { seat: 'me', seed: 'demo' })
const r = devAutoplay(store, { bot, search: '?dev=1&steps=3', dev: true, paceMs: 0 }) // location.search in a browser
console.log(r.status().stop, r.status().steps, store.get().state.prompt?.kind)
```
