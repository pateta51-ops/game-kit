# opponent

A rule-based opponent (K103, K115). Pure data and functions; the engine never imports it. The game supplies the view, the candidates, the advice and the handlers.

- **Redacted view**: `redact(state, seat, view)` returns `Redacted<V>`; every opponent function takes only that type. `viewLeaks(view, secrets, { numbers?, keys? })` lists hidden ids found in a view: an exact value or a whole word inside a string (`card:42` holds `42`, `c10` does not hold `c1`); `numbers` are exact secret numbers the game marks; `keys` are key names the view must not hold (`['rng']`), listed as `key:rng` (a test expects none).
- **Pick an index**: `pick(opponent, view, candidates, { rand, timing?, step?, prompt? })` returns a `DecisionRecord` whose `index` is the legal option taken. A `Candidate` is `{ key, card?, verbs?, pass? }`; `key` is stable across prompts. Order: one option (`only-option`), the plan, the best `play`, a `pass`, else the best of the rest (`forced`). `rand` is sim-pool's `DriverRng` or anything with `int` and `chance`.
- **Fixed pipeline** (`judge`): advice `cannotUse`, `when` against the timing, `needs` (via `count`), `nonStacking` (via `inPlay`), runaway guard (after `runawayFree` uses of a card, goes on with chance `runawayDecay^n`), then each verb's handler (`judge`, then `cost`; a refused sub-effect is `drawback`), then `advice.priority` and the opponent's `score`. `prune` passes drop keys before the choice.
- **Handlers per effect verb**: `handlers: { verb: { judge?, cost? } | 'always' | 'never' }`; `judge` returns a score or a `Verdict { reason, score?, lines? }`. Conformance test: `handlerProblems(verbs, handlers)` empty.
- **Reasons**: `REASONS` maps each code to `play`, `later` or `never`. Tests assert the reason, not the move.
- **Advice** (closed hint vocabulary, data beside the effect records): `when`, `needs [{ count, op, n }]`, `curse`, `nonStacking`, `discard`, `priority`, `keep`, `cannotUse`. `adviceProblems(table)` flags unknown keys and types; `discardOrder(cards, advice)`.
- **Cannot-use report**: `cannotUseReport(cards, advice, handlers, records?)`: cards with `cannotUse`, verbs with no handler or `never`, `missing-logic` counts from records.
- **Profiles as data**: `loadProfile(defaults, data, name)` throws on an unknown key or type; `PIPELINE` holds the keys the pipeline reads.
- **Memory** (plain JSON, saved with the opponent): `newMemory`, `remember`, `recalls`, `forget`, `forgetTurn(m, keep)` (uses, plan and the other sets cleared), `setPlan(m, [{ match, note? }])`. A plan step goes through `judge`; one that fails drops only that step, one that matches no option drops the plan; both show as `planMiss`.
- **Evaluator**: `evaluate(view, terms, weights)` → `{ total, lines }`, one explain line per term; `fidelityProblems(state, copy, terms)` lists the lines that differ.
- **Look-ahead**: `lookAhead(state, { moves, apply, score, key? }, { depth = 3, nodes = 5000 })` → `{ best, score, nodes, cut }`; the same move again without gain is cut; results cached by `key`.
- **Decision record from the log**: `decisionLines(record)` (plain lines for a table or golden), `decisionPart(record)` (a game-log `ref('decision', id)` the game resolves to its stored record), `decisionsAt(records, step)`.
- **sim-pool**: `opponentDriver(opponent, { view, candidates(view, answers), timing? }, keep?)` is a `Driver` (K222: `view(state, seat)` gets the open prompt's `seat`; `redact` takes a string or number seat); candidates line up with the answers; records carry `prompt` (from `state.prompt.id`) and `step` (game's `step(state)`, else the choice count); `reasons()` is the last record's lines.

Not here: the learned opponent (`learned-opponent`: a model scores the moves, cheaper to build when you have game records) and the sim-pool tuner (`tune`: it fits the weights this one uses, offline). See `docs/recipes/ai-opponent.md`. Also not here: alpha-beta over the other side's moves, hidden-card sampling, trained evaluators.

## Use it in 10 lines

```ts
import { evaluate, lookAhead } from '../kit/opponent/index'

type View = { gold: number; cards: number }
const terms = { gold: (v: View) => v.gold, cards: (v: View) => v.cards * 2 }
console.log(evaluate({ gold: 3, cards: 2 }, terms, { gold: 1.5 }).lines) // one explain line per term
const best = lookAhead(0, { moves: (n) => (n < 3 ? ['inc', 'stay'] : []), apply: (n, m) => (m === 'inc' ? n + 1 : n), score: (n) => n })
console.log(best.best, best.score) // depth 3, node cap 5000 by default
```
