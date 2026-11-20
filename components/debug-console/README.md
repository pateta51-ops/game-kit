# debug-console

A console line for the engine-core debug edits (K100). Needs `engine-core`. Tests: `console.test.tsx`.

## Rules for agents

**What it does:** A one-line console for engine-core debug edits (`set`, `force`, `close` and the game's own verbs).

**You must:**
1. Mount it only in dev builds (or behind a key); the game decides where.
2. The game opts in: `GameRules.debug` must exist (`{}` gives the kernel verbs) and the action type is `AnswerAction | DebugAction`.
3. Pass `verbs={debugVerbs(rules)}`; with a game-store use `send={store.debug}` (its own undo step, saved and replayed, then settled and autosaved).
4. `send` must return the refusal words or nothing; the console marks refusals.
5. Name positional tokens per verb with `params` (`{ summon: ['card'] }`); quote text with spaces (`to="hand zone"`).
6. Set the `--dbg-*` variables for the look; `debug.css` is imported by the component.

**Common mistakes:**
- Sending the action around the store: the edit is not recorded, so undo and load lose it; use `store.debug`.
- Leaving the console in a production build.


- `parseDebug(line, verbs, params?)` -> `DebugAction` or `{ error }`. `verbs` is `debugVerbs(game)`. Syntax (slash optional): `/set path.to.number value [min] [max]` (numeric path parts are indexes), `/force n [n ...] [name=roll]`, `/close`, `/<game verb> key=value ...`; `params` names positional tokens per verb (`{ summon: ['card'] }` makes `/summon 9` mean `card=9`). Values read as JSON when they parse, else as text; quote text with spaces (`to="hand zone"`).
- `<DebugConsole verbs params? send className? />` (`ui.ts`): one input; Enter parses and calls `send(action)`, which applies it through the game's store (so it is recorded like an answer) and returns the refusal words or nothing; the last 50 lines show above the input, refusals marked; Up recalls the last command.
- K302 on a store-driven game: `send={store.debug}` (game-store `debug`: its own undo step, saved and replayed like an answer, then settled, paced and autosaved); the mount block below.
- The game decides where it is mounted (dev builds, a key) and which verbs it adds (summon, move, status).

## Look

`debug.css`: `--dbg-bg`, `--dbg-text`, `--dbg-error`, `--dbg-font`, `--dbg-z`.

## Use it in 10 lines

```ts
import { parseDebug } from '../kit/debug-console/index'

// a console line becomes an engine-core DebugAction, or { error }
console.log(parseDebug('set counter 5', ['set', 'force', 'close']))
```

```tsx
import { DebugConsole } from '../kit/debug-console/ui'
import { createGameStore, defineGame } from '../kit/game-store/index'
import { debugVerbs, type AnswerAction, type DebugAction, type GameRules } from '../kit/engine-core/index'
import { CONTENT, COUNTER, type Counter, type CounterState } from '../kit/engine-core/fake/counter'

type Dbg = Omit<Counter, 'action'> & { readonly action: AnswerAction | DebugAction } // the game opts in (engine-core debug.md)
const rules = { ...COUNTER, debug: {} } as unknown as GameRules<Dbg> // {}: the kernel verbs set, force, close
const store = createGameStore(defineGame<Dbg, CounterState, string>({ rules, content: CONTENT, seats: ['me'], start: (seed) => ({ options: { seed }, rules: { target: 12 } }), view: (s) => s }), { seat: 'me', seed: 'demo' })
export const Dev = () => <DebugConsole verbs={debugVerbs(rules)} send={store.debug} />
```
