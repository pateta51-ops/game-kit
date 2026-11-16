# card-language

The card-language shell (K206): card effects as data, one typed verb table where each verb has a field check, a handler that runs on engine-core and a text generator that prints the card's words from the same step. The game writes every verb; the kit holds none.

- `VerbTable<G, Step, Env?>`: one row per `op` of the game's step union: `{ fields, run, text }`. A missing verb, a missing field check or a misspelt one fails to compile (`FieldsOf<S>`). `run(ctx, step, env)` may push tasks, `ask`, `emit`, or start a timing batch with engine-core's `would` (`timing.md`); `null` marks a verb not built yet (running it throws `EngineBugError`).
- Run: put `VerbTask<Step, Env>` in the task union, spread `{ verb: verbHandler<G>(VERBS) }` into `GameRules.handlers`, push `ctx.then(...effectTasks(card.effect, env))`.
- Words: `describeEffect(VERBS, steps, join?)`. Same data as the handler, so the screen says what the engine does. Rule ids go in code comments, never in text.
- Validate: `validateStep(VERBS, step)`, `validateEffect(VERBS, steps)`: card-harness `strictProblems` over `grammarOf(VERBS)` (unknown verb, missing, extra or misplaced key, nested steps), then the field checks. Field checks: `posInt`, `int`, `str`, `bool`, `oneOf`, `listOf`, `optional(f)`, `effectOf(() => VERBS)` for a nested effect.
- Test: `expectVerbs(VERBS, examples?)` throws when a verb lacks a handler, a text generator or an example, an example is invalid, or its text is empty or holds a rule id (plain-text `ruleIdFilter`: pass the game's, default `RULE_IDS`); `verbProblems` returns the list. Steps are typed to the table (`StepOf<T>`).
- Start a game: copy `template/verbs.ts` and `template/verbs.test.ts`. Printed text check: card-harness `describeCheck`. Pattern notes: `docs/patterns/card-language.md`.

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
```
