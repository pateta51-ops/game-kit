# card-language

The card-language shell (K206): card effects as data, one typed verb table where each verb has a field check, a handler that runs on engine-core and a text generator that prints the card's words from the same step. The game writes its own verbs; the standard pack (K232, `pack.ts`) gives the common ones.

- `VerbTable<G, Step, Env?>`: one row per `op` of the game's step union: `{ fields, run, text }`. A missing verb, a missing field check or a misspelt one fails to compile (`FieldsOf<S>`). `run(ctx, step, env)` may push tasks, `ask`, `emit`, or start a timing batch with engine-core's `would` (`timing.md`); `null` marks a verb not built yet (running it throws `EngineBugError`).
- Ask and resume (K232): a verb asks with `askVerb(ctx, prompt, step, env)` (give the prompt `kind` and `seat`); the answer comes back to the verb's `resume(ctx, step, env, answer)`, so a save in the middle of an effect resumes.
- Standard verb pack (K232): `cardPack<G, E>(cfg)` gives `verbs` (spread into the table) and `happen` (call it in timing's `cfg.happen`). Every card move is a `would` batch (one occurrence per card, kind = the verb). Words: default templates, the game overrides each (`words`, `word`). Opponents pick from their own view (hidden cards are `#index`). Verbs:
  moving `draw` `discard` `mill` `move` `putIntoPlay` `setAside` `recall` `gain` `refill` `shuffle` `search` `destroy` `attach` `detach`; looking `reveal` `lookAt` `scout` `flip` `exhaust` `ready`; asking `chooseCards` `chooseOption` `may` `chooseNumber` `chooseDestination` `choosePlayer` `choosePayment` `orderEffects`; resources `gainResource` `pay` `convert` `adjust`; structure `seq` `if` `forEach` `eachPlayer` `repeat` `count` `later` `payThen` `custom`. Fields, defaults and config: [pack.md](pack.md).
- Run: put `VerbTask<Step, Env>` in the task union, spread `{ verb: verbHandler<G>(VERBS) }` into `GameRules.handlers`, push `ctx.then(...effectTasks(card.effect, env))`.
- Words: `describeEffect(VERBS, steps, join?)`. Same data as the handler, so the screen says what the engine does. Rule ids go in code comments, never in text.
- Validate: `validateStep(VERBS, step)`, `validateEffect(VERBS, steps)`: card-harness `strictProblems` over `grammarOf(VERBS)` (unknown verb, missing, extra or misplaced key, nested steps), then the field checks. Field checks: `posInt`, `int`, `str`, `bool`, `oneOf`, `listOf`, `optional(f)`, `effectOf(() => VERBS)` for a nested effect.
- Test: `expectVerbs(VERBS, examples?)` throws when a verb lacks a handler, a text generator or an example, an example is invalid, or its text is empty or holds a rule id (plain-text `ruleIdFilter`: pass the game's, default `RULE_IDS`); `verbProblems` returns the list. Steps are typed to the table (`StepOf<T>`).
- Start a game: copy `template/verbs.ts` and `template/verbs.test.ts`. Printed text check: card-harness `describeCheck`. Pattern notes: `docs/patterns/card-language.md`.
- Triggers on cards (K267, `when.ts`): `when: [{ on, if?, then, optional?, once?, order? }]` on card data; `cardTriggers(cfg)` compiles a pool into engine-core's `triggersFor`, `invalid` (source no longer active: default zone `play` / `play:<seat>`) and `resolveTrigger` (pushes `then` as verb tasks; `optional` runs as the pack's `may`). After-window only (occurrences that happened), ordered as engine-core's triggers. `validateWhen(VERBS, when, { kinds, tests })` checks keys, the event kind and the steps. `if` is checked when triggers are collected; only "source still active" is rechecked at resolve. `cardTriggers` throws at build for an `if` not in `tests` or an `optional` entry without `table` holding `may`.

## Use it in 10 lines

```ts
import type { GameTypes } from '../kit/engine-core/index'
import { describeEffect, expectVerbs, posInt, validateEffect, type VerbTable } from '../kit/card-language/index'

type Step = { readonly op: 'gain'; readonly amount: number }
const VERBS: VerbTable<GameTypes, Step> = {
  gain: { fields: { amount: posInt }, run: (ctx, s) => ctx.emit({ type: 'gained', n: s.amount } as never), text: (s) => `Gain ${String(s.amount)}.` },
}
expectVerbs(VERBS, [{ op: 'gain', amount: 1 }]) // throws when a verb has no handler or text
console.log(validateEffect(VERBS, [{ op: 'gain', amount: 0 }]), describeEffect(VERBS, [{ op: 'gain', amount: 2 }]))
import { timingHandlers } from '../kit/engine-core/index'
import { cardPack, type PackStep } from '../kit/card-language/pack'
import { cardTriggers, validateWhen, type WhenCard } from '../kit/card-language/when'

const pack = cardPack<GameTypes>()
const POOL: Record<string, WhenCard<PackStep>> = { beta: { when: [{ on: 'discard', then: [{ op: 'gainResource', res: 'gold', amount: 1 }] }] } }
console.log(validateWhen(pack.verbs, POOL.beta?.when, { kinds: ['discard'] })) // [] (K267)
timingHandlers<GameTypes>({ happen: (ctx, o) => void pack.happen(ctx, o), ...cardTriggers<GameTypes>({ pool: POOL, player: () => 'a' }) })
```
