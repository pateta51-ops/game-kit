# card-language

The card-language shell (K206): card effects as data, one typed verb table where each verb has a field check, a handler that runs on engine-core and a text generator that prints the card's words from the same step. The game writes its own verbs; the standard pack (K232, `pack.ts`) gives the common ones.

## Rules for agents

**What it does:** Card effects as data: one typed verb table where each verb has a field check, a handler on engine-core and a text generator, so the screen prints what the engine does.

**You must:**
1. Write the game's `VerbTable<G, Step, Env?>`: each `op` of the step union needs `fields`, `run` and `text`; a missing or misspelt row fails to compile, and `null` marks a verb not built (running it throws `EngineBugError`).
2. Start from `template/verbs.ts` and `template/verbs.test.ts`.
3. Wire the run: put `VerbTask<Step, Env>` in the task union, spread `{ verb: verbHandler<G>(VERBS) }` into `GameRules.handlers`, and push `ctx.then(...effectTasks(card.effect, env))`.
4. A verb that asks uses `askVerb(ctx, prompt, step, env)` and a `resume(ctx, step, env, answer)` for the answer; a verb answered without `resume` throws.
5. Use the standard `cardPack(cfg)`: spread its `verbs`, call its `happen` in timing's `cfg.happen`, and pass `{ seat }` as env (a verb run with no env throws); `choosePlayer` and `eachPlayer` need `cfg.seats`.
6. Print card words with `describeEffect`; keep rule ids in code comments, never in text.
7. Test with `expectVerbs(VERBS, examples)`: it fails on a verb without handler, text or example, an invalid example, or empty text or text holding a rule id; validate card data with `validateEffect`.
8. Keep value expressions out of bare lists of steps: only objects in a step position are read as steps.
9. For triggers, use `when` on card data and `cardTriggers(cfg)`; every `if` name must be in `tests`, and an `optional` entry needs a `table` holding `may`, or it throws at build.
10. A game on its own engine (not engine-core) uses `opTable.ts`: an `OpTable<Port, Op>` row `{ fields, run, text }` per op, `run` on the game's `EnginePort`; run ops only with `runOp`, print them only with `describeOps` (both wordings live in the row: `text`, optional `rules`), and check card data with `validateOps` in a test.
11. Decide when an effect is offered in one place (K529): `cardPack({ offer, handlers: () => RULES.handlers })`, each knob set from a ruling of the game (cite it beside the knob). Never write your own "can this resolve" test in a verb or on screen; a game's own verb calls `pack.wouldChange(s, content, steps, env)`.

**Offer policy (K529): the defaults and the knobs.** With no `offer` the pack does what it always did:
- `may` always asks. `chooseOption` offers every option. `chooseCards` caps `min` and `max` at what is there (nothing there: asks nothing, `then` runs with no cards).
- `choosePayment` bars a way that cannot be paid (`why: 'cannotPay'`, no code) and asks nothing when no way can be paid.
- `payThen` starts only when every cost step is payable, each step judged alone on the state as it is: two steps of 2 gold with 3 gold start, the second `pay` refuses, and `then` still runs. `pay` and `convert` refuse (do nothing) when not payable.

| The ruling says | Set |
| --- | --- |
| An optional effect that would change nothing is still asked | `noChange: 'ask'` (default) |
| ... is not offered | `noChange: 'skip'` |
| ... is shown but cannot be taken | `noChange: 'bar'` (yes is barred, code `noChange`, `cannotPay` or `unknown`) |
| Each part of a cost is judged alone | `cost: 'parts'` (default) |
| A cost is paid in full or not at all: resources are summed, two card-taking parts need two cards | `cost: 'whole'` (`payThen` and each `choosePayment` way; cards assigned by matching, a card may exhaust and then leave) |
| "Choose N" with fewer than N there: choose what is there | `fewer: 'cap'` (default) |
| ... the choice is not made at all | `fewer: 'exact'` (`chooseCards` below its `min` asks nothing and `then` does not run; "up to N" is `min: 0` and is never affected) |
| A choice is offered even when no option does anything | `deadChoice: 'today'` (default) |
| A choice with no option that changes anything is not offered | `deadChoice: 'skip'` (with one live option, all are offered as before) |
| ... and each option that does nothing is shown barred | `deadChoice: 'bar'` (`chooseOption`: code `noChange`, `cannotPay` or `unknown`; `choosePayment`: code `cannotPay`) |
| What nobody can know yet (hidden cards, a random draw) is offered | `unknown: 'offer'` (default) |
| ... is not offered | `unknown: 'skip'` |

The codes are engine-core's `reason` on a barred option (`bar`, read with `blocked(prompt)`, legal.md); the game turns them into words. `noChange` and `deadChoice` need `cfg.handlers` (the pack throws at build without it).

**The check.** `pack.wouldChange(s, content, steps, env)` answers `'yes' | 'no' | 'unknown'` for `env.seat`: it runs the steps on a copy of the state with the game's handlers and stops at the first change of the game (`offer.view(s)`: what counts; default the state without stack, prompt, counters, log, timing, pending moves and rng). Each prompt forks one run per answer tried (the empty answer when `min` is 0, each single option when `min` is 0 or 1, else the first `min` options). Caps: `offer.branches` answers in all (default 32), `offer.tasks` tasks per answer (default 2000); a cap hit is `unknown`, never `no`. The real state, its rng and its log are never touched. `unknown` when nothing changed before: any `ctx.rng` call (it throws before drawing), a filter over cards `env.seat` cannot see, a prompt for another seat, a cap, an `EngineBugError`. A `may` inside counts when its body changes something; the `then` of a `payThen` does not run in the check, so an "if you do" part never counts on its own (paying the cost does). Inside the check the policy verbs ask as by default and `wouldChange` answers `unknown` (no nesting). `inDryRun()` is true while it runs: a custom verb that would read hidden cards checks it.

**Common mistakes:**
- A custom verb, test, count or filter that reads cards the acting seat cannot see: the check cannot notice, so guard it with `inDryRun()`.
- Expecting `cost: 'whole'` by default: the default judges each cost step alone.
- Using `offer.view` with bookkeeping in it: leave out turn counters and logs, or every effect "changes something".
- Writing text for the screen apart from the verb's `text`: the words and the engine then differ.
- A trigger `if` rechecked at resolve: only "source still active" is rechecked there.
- A `custom` verb or `count` / filter name not in the config: throws `no custom verb` / `no count` / `no filter`.

- `VerbTable<G, Step, Env?>`: one row per `op` of the game's step union: `{ fields, run, text }`. A missing verb, a missing field check or a misspelt one fails to compile (`FieldsOf<S>`). `run(ctx, step, env)` may push tasks, `ask`, `emit`, or start a timing batch with engine-core's `would` (`timing.md`); `null` marks a verb not built yet (running it throws `EngineBugError`).
- Ask and resume (K232): a verb asks with `askVerb(ctx, prompt, step, env)` (give the prompt `kind` and `seat`); the answer comes back to the verb's `resume(ctx, step, env, answer)`, so a save in the middle of an effect resumes.
- Standard verb pack (K232): `cardPack<G, E>(cfg)` gives `verbs` (spread into the table) and `happen` (call it in timing's `cfg.happen`). Every card move is a `would` batch (one occurrence per card, kind = the verb). Words: default templates, the game overrides each (`words`, `word`). Opponents pick from their own view (hidden cards are `#index`). Verbs:
  moving `draw` `discard` `mill` `move` `putIntoPlay` `setAside` `recall` `gain` `refill` `shuffle` `search` `destroy` `attach` `detach`; looking `reveal` `lookAt` `scout` `flip` `exhaust` `ready`; asking `chooseCards` `chooseOption` `may` `chooseNumber` `chooseDestination` `choosePlayer` `choosePayment` `orderEffects`; resources `gainResource` `pay` `convert` `adjust`; structure `seq` `if` `forEach` `eachPlayer` `repeat` `count` `later` `payThen` `custom`. Fields, defaults and config: [pack.md](pack.md).
- Run: put `VerbTask<Step, Env>` in the task union, spread `{ verb: verbHandler<G>(VERBS) }` into `GameRules.handlers`, push `ctx.then(...effectTasks(card.effect, env))`.
- Words: `describeEffect(VERBS, steps, join?)`. Same data as the handler, so the screen says what the engine does. Rule ids go in code comments, never in text.
- Validate: `validateStep(VERBS, step)`, `validateEffect(VERBS, steps)`: card-harness `strictProblems` over `grammarOf(VERBS)` (unknown verb, missing, extra or misplaced key, nested steps), then the field checks. Field checks: `posInt`, `int`, `str`, `bool`, `oneOf`, `listOf`, `optional(f)`, `effectOf(() => VERBS)` for a nested effect. Only objects in a step position (the effect list, or a list in a step's field) are read as steps (K295): a value object in a field, such as `{ a: 'calc', op: 'add', l: 1, r: 1 }`, is the game's to check, so keep value expressions out of bare lists of steps.
- Test: `expectVerbs(VERBS, examples?)` throws when a verb lacks a handler, a text generator or an example, an example is invalid, or its text is empty or holds a rule id (plain-text `ruleIdFilter`: pass the game's, default `RULE_IDS`); `verbProblems` returns the list. Steps are typed to the table (`StepOf<T>`).
- Start a game: copy `template/verbs.ts` and `template/verbs.test.ts`. Printed text check: card-harness `describeCheck`. Pattern notes: `docs/patterns/card-language.md`.
- Triggers on cards (K267, `when.ts`): `when: [{ on, if?, then, optional?, once?, order?, timing? }]` on card data; `cardTriggers(cfg)` compiles a pool into engine-core's `triggersFor`, `invalid` (source no longer active: default zone `play` / `play:<seat>`) and `resolveTrigger` (pushes `then` as verb tasks; `optional` runs as the pack's `may`). After-window only (occurrences that happened), ordered as engine-core's triggers. `validateWhen(VERBS, when, { kinds, tests })` checks keys, the event kind and the steps. `if` is checked when triggers are collected; only "source still active" is rechecked at resolve. `cardTriggers` throws at build for an `if` not in `tests` or an `optional` entry without `table` holding `may`. `env(s, card, player, occurrences)` (K295) gets what triggered it (the trigger's occurrences at resolve, the one occurrence when testing `if`), so a response can name the triggering card. K296: `triggersFor` / `invalid` take the game's content and pass it as the added last parameter of `player`, `defOf`, `active`, `sources`, `env` and the `tests`.
- Held responses (K292): `timing: 'when' | 'after'` on a `when` entry is carried onto the trigger; engine-core's `cfg.held(s, t)` reads `t.timing` to keep an "after" response waiting until the game pushes `timing.triggers` at its effect end (timing.md).

## Op table (for games on their own engine)

K507, `opTable.ts`. A game that keeps its own engine (no engine-core `Ctx`) still gets one row per op, so the card's words cannot drift from what the op does:
- `EnginePort<State>`: `{ state }`; the game extends it with the few calls its ops need (draw a card, ask a prompt, log).
- `OpTable<Port, Op>`: one row per `op` of the game's op union, `{ fields, run, text }`. `fields` uses the same checks as `VerbTable` (`posInt`, `optional(f)`, `effectOf(...)`); a missing op or field check fails to compile. `run(port, op)` changes the game's state; `text(op, view)` is the short sentence, and an optional `rules(op, view)` the rule wording of the same row. `view`: `{ mode, spent, say }`; `say(op, spent?)` writes a nested op in the same mode.
- `runOp(table, port, op)` runs one op through its row (unknown op: `EngineBugError`). `describeOps(table, ops, join?, { mode?, spent? })` prints them with `describeEffect`: `mode: 'rules'` reads `rules` (else `text`), `spent` (default `amount`) names what a cost spent. A nested op's row calls `runOp` on its child ops and `view.say` for their words.
- `validateOps(table, { [card]: ops }, { metaKeys? })` (`metaKeys`: record keys it ignores, default none) returns `{ card, index, op, kind, detail }[]`, `kind` one of `not-an-op`, `unknown-op`, `missing-field`, `extra-field`, `bad-field`, `text` (the row's short or rules text throws or is empty). `[]` when every card holds.

```ts
import { posInt } from '../kit/card-language/index'
import { describeOps, runOp, validateOps, type EnginePort, type OpTable } from '../kit/card-language/opTable'
type Ex = { readonly op: 'gain'; readonly coins: number };
interface ExPort extends EnginePort<{ coins: number }> { readonly log: (s: string) => void }
const EX: OpTable<ExPort, Ex> = {
  gain: { fields: { coins: posInt }, run: (p, o) => void (p.state.coins += o.coins), text: (o) => `Gain ${String(o.coins)} coins.` },
};
const exState = { coins: 0 };
runOp(EX, { state: exState, log: () => undefined }, { op: 'gain', coins: 2 }) // exState.coins === 2
console.log(describeOps(EX, [{ op: 'gain', coins: 2 }])) // "Gain 2 coins."
console.log(validateOps(EX, { purse: [{ op: 'gain' }, { op: 'fly' }] })) // missing-field coins, unknown-op fly
```

## Use it in 10 lines

```ts
import type { GameTypes } from '../kit/engine-core/kernel'
import { describeEffect, expectVerbs, posInt, validateEffect, type VerbTable } from '../kit/card-language/index'

type Step = { readonly op: 'gain'; readonly amount: number }
const VERBS: VerbTable<GameTypes, Step> = {
  gain: { fields: { amount: posInt }, run: (ctx, s) => ctx.emit({ type: 'gained', n: s.amount } as never), text: (s) => `Gain ${String(s.amount)}.` },
}
expectVerbs(VERBS, [{ op: 'gain', amount: 1 }]) // throws when a verb has no handler or text
console.log(validateEffect(VERBS, [{ op: 'gain', amount: 0 }]), describeEffect(VERBS, [{ op: 'gain', amount: 2 }]))
import { timingHandlers } from '../kit/engine-core/timed'
import { cardPack, type PackStep } from '../kit/card-language/pack'
import { cardTriggers, validateWhen, type WhenCard } from '../kit/card-language/when'

const pack = cardPack<GameTypes>()
const POOL: Record<string, WhenCard<PackStep>> = { beta: { when: [{ on: 'discard', then: [{ op: 'gainResource', res: 'gold', amount: 1 }] }] } }
console.log(validateWhen(pack.verbs, POOL.beta?.when, { kinds: ['discard'] })) // [] (K267)
timingHandlers<GameTypes>({ happen: (ctx, o) => void pack.happen(ctx, o), ...cardTriggers<GameTypes>({ pool: POOL, player: () => 'a' }) })
```
