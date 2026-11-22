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
21. A game test, count, filter or custom verb that reads cards the acting seat cannot see calls `cannotKnow()` first (K583; exported by `pack.ts`): inside the check the answer is then `unknown`, in the real run the call does nothing.
22. A cost a card or rule changes (a tax, a discount) goes in `cardPack({ due })` (K583), never into rewritten steps: the can-pay check, the payment, the check and the bar reason then read one number. Print the cost with `describeEffect(VERBS, pack.costed(s, steps, env))`.
23. Test card data with `offer: { strict: true }` (K583): a misspelt test, count, filter or custom verb name then throws from the check; without it the check answers `unknown` and a "not offered" test can pass for the wrong reason.

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
| A cost is paid in full or not at all: resources are summed, two card-taking parts need two cards | `cost: 'whole'` (`payThen` and each `choosePayment` way; cards assigned by matching; two exhausts, or two readies, need two cards, and a card may exhaust and then leave. The cost is then paid one step at a time: a pick offers only the cards that leave the rest of the cost payable, hidden cards excepted, and a step that cannot pay when it is reached stops the cost, so `then` does not run) |
| "Choose N" with fewer than N there: choose what is there | `fewer: 'cap'` (default) |
| ... the choice is not made at all | `fewer: 'exact'` (`chooseCards` below its `min` asks nothing and `then` does not run; "up to N" is `min: 0` and is never affected) |
| A choice is offered even when no option does anything | `deadChoice: 'today'` (default) |
| A choice with no option that changes anything is not offered | `deadChoice: 'skip'` (with one live option, all are offered as before) |
| ... and each option that does nothing is shown barred | `deadChoice: 'bar'` (`chooseOption`: code `noChange`, `cannotPay` or `unknown`; `choosePayment`: code `cannotPay`) |
| What nobody can know yet (hidden cards, a random draw) is offered | `unknown: 'offer'` (default) |
| ... is not offered | `unknown: 'skip'` |
| A paid effect is able when its cost can be paid, whatever the effect then does | `paid: 'cost'` (default: the check judges `payThen` on its cost alone and does not run `then`) |
| A paid effect is offered only if the effect does something | `paid: 'effect'` (K583. In the check a payable cost is able even when paying shows no change; the cost is paid on the copy, `then` runs, and only what `then` changes counts. With `noChange` or `deadChoice` set, a paid option whose effect does nothing is then not offered or barred `noChange`, and so is a payable `choosePayment` way) |

The codes are engine-core's `reason` on a barred option (`bar`, read with `blocked(prompt)`, legal.md); the game turns them into words. `noChange` and `deadChoice` need `cfg.handlers` (the pack throws at build without it). `paid` and `strict` only change the check, so they do nothing until `noChange`, `deadChoice` or the game's own `wouldChange` call uses it.

**The check.** `pack.wouldChange(s, content, steps, env)` answers `'yes' | 'no' | 'unknown'` for `env.seat`: it runs the steps on a copy of the state with the game's handlers and stops at the first change of the game (`offer.view(s)`: what counts; default the state without stack, prompt, counters, log, timing, pending moves and rng). A `later` step counts as a change by default, because the waiting effect is in `state.later`; a game whose ruling says a delayed effect alone is no change passes a `view` that leaves `later` out, such as `view: ({ zones, res, marks }) => ({ zones, res, marks })`. Each prompt forks one run per answer tried. The quick answers come first (the empty answer when `min` is 0, each single option when `min` is 0 or 1, else the first `min` options); then, with the budget left, every other legal answer (K579): each set of `min` to `max` enabled options, every order when the order matters (`ordered` on the prompt, `scout`, `orderEffects`), each option answered alone (`alone`), and every answer of the prompts under those. `no` means every one of those answers was tried and none changed the game; answers left untried when the budget ends are `unknown`. Not tried: the order of the picks inside one pick set of a prompt that is not ordered (a set is answered once, in option order). An effect that reads the order picked ("put them on the bottom in the order chosen") can so answer `no` wrongly: such a game verb asks with `ordered: true` on its prompt. Caps: `offer.branches` answers in all (default 32), `offer.tasks` tasks per answer (default 2000); a cap hit is `unknown`, never `no`. A game whose cards choose among many cards raises `branches` ("choose 2 of 9" is 36 pick sets). The real state, its rng and its log are never touched. `unknown` when nothing changed before: any `ctx.rng` call (it throws before drawing), a filter over cards `env.seat` cannot see, a prompt for another seat, a cap, an `EngineBugError`. A `may` inside counts when its body changes something; under `paid: 'cost'` (default) the `then` of a `payThen` does not run in the check, so an "if you do" part never counts on its own (paying the cost does); under `paid: 'effect'` it runs and only its changes count. Inside the check the policy verbs ask as by default and `wouldChange` answers `unknown` (no nesting). `inDryRun()` is true while it runs.

**The check, K583.**
- The reason: `pack.judge(s, content, steps, env)` answers `{ answer, reason?, error? }`; `wouldChange` is its `answer`. With `unknown`, `reason` is the first that applies of `error` (a handler threw; `error` holds what it threw), `hidden` (cards the seat cannot see), `otherSeat` (a prompt of another seat), `random` (a `ctx.rng` call), `budget` (`branches` or `tasks` ran out), `nested`. So a game tells "the budget ran out" from "nobody can know"; `offer.unknown` still treats them alike.
- Game over: an effect that sets `state.result` is a `yes` under every `view`, also one that leaves `result` out.
- Errors: whatever a handler throws in a branch the check tries (also an answer no screen would send: an option answered alone, a pick set of mixed options) is `unknown` with the reason `error`, never a throw into the real action; a change before the throw is a `yes`. An `EngineBugError` (a misspelt test, count, filter or custom verb name in card data) is `unknown` too, as before: read it from `judge`, or set `offer: { strict: true }` in tests, which throws every such error from the check.
- Hidden information: `cannotKnow()` (rule 21) is how game code says so. A card picked blind (`#index`) stays unknown to the game in the check: a game test, count, filter or custom verb that would run with such a card in `env.cards` is `unknown`, whatever the hidden cards are (the pack's own verbs still move it: a blind discard is a `yes`). `cardTriggers` does not fire, in the check, a trigger whose source card the judged seat cannot see, so the answer does not tell what another seat holds; a game that collects triggers itself filters by `dryRunSeat()` (the judged seat, null outside the check).
- In the check `lookAt` of a card the seat already sees, and `reveal` of a card in a zone all see, change nothing (the real run records them as before).
- The bar reason reads a cost inside a `seq` or a `may` too: `cannotPay`, not `noChange`.
- `payThen` leaves a game's own env field named `owed` alone under `cost: 'parts'`; under `cost: 'whole'` the field is the pack's and `then` runs without it.

**A modified cost (K583).** `cardPack({ due: (s, step, env, printed) => number })` gives the amount a `pay` or `convert` step asks for now (default the printed amount; `printed` is the step's `amount`, `X` already read). The can-pay check, the whole-cost sum, the payment itself, `wouldChange` and the bar reason all read it. `pack.costed(s, steps, env)` returns the steps with those amounts, nested ones too (the same object when nothing differs): print it with `describeEffect` for a label. Printed 3 with a +1 tax and 3 held: the `choosePayment` way is barred with `cannotPay`, the label says 4, and with 4 held exactly 4 leaves. Compute the amount with engine-core's `numberParts` (numbers.md). Not covered: the number of cards a card-taking cost step asks for (`count`); a game changes that in its own step.

**Two rules questions the defaults hide: stated choices (K579, K583).** Ask the game's arbiter, then set the knob; each is pinned by a test in `offer.test.ts` and `k583.test.ts`.
- Under `cost: 'parts'` (default) a `pay` step that refuses does not stop the effect: a cost of two steps of 2 gold with 3 gold pays 2, the second step refuses, and `then` runs. A ruling that an unpaid cost gives nothing: set `cost: 'whole'`.
- Under `paid: 'cost'` (default) a paid option whose effect does nothing is offered: paying the cost changes the game, so the check answers `yes`. A ruling that it is not offered: set `paid: 'effect'`.

**Prior-art cases the policy does not decide** (of the 37 cases of the K529 study; each of the others has a test). They do not apply to this part because the rule lives elsewhere:
- Case 6, a "have N" cost part after a spend, judged over payment plans: the pack has no payment plans. It is a game's `custom` step: its `payable` sees the state as it is, not the state after the earlier parts (under `cost: 'whole'` it is judged again when reached, and a failure there stops the cost with the earlier parts paid). Pinned by a test.
- Case 21, an option that resolves only in part barred in favour of one that resolves in full: the check has no "in part" answer, so no option is barred for it. Pinned by a test.
- Case 25, "attempt A, otherwise B": a game's verb that calls `wouldChange` on A (tested with such a verb).
- Case 26, whether a play that changes nothing is legal: the game's rule; it reads `wouldChange`. A "nothing will happen, use anyway?" confirm is the game's prompt.
- Case 27, a mandatory cost among other steps that blocks the whole play: a bare `pay` step refuses and the rest runs; the game puts the cost in a `payThen` or checks it before the play. Pinned by a test.
- Case 30, a replacement offered once: engine-core's timing, not the offer policy.
- Case 31, where the card being played is during the check: the state the game passes (tested).
- Case 32, steps another seat does: a prompt of another seat is `unknown` (reason `otherSeat`); "each player" is a `yes` when any seat can do it without a choice. No knob judges it for the acting seat only. Pinned by a test.
- Case 37, `X` read before a step sets it: it is 0, so the effect is not able; the pack does not refuse the text. Pinned by a test.

Case 29 (a cost a card in play changes) is `cfg.due`.

**Common mistakes:**
- Reading `no` from `wouldChange` as "not searched": `no` is only given when every pick set was tried (not every order of the picks inside a set, unless the prompt is ordered); a small `branches` gives `unknown` more often, and `unknown: 'offer'` (default) then offers the effect.
- A custom verb, test, count or filter that reads cards the acting seat cannot see: the check cannot notice, so call `cannotKnow()` before the read (skipping the read under `inDryRun()` instead gives a wrong `no`).
- Reading `unknown` as "hidden": ask `pack.judge` for the reason; `error` is a bug in card data or a handler, `budget` wants a larger `branches`.
- Rewriting cost steps to change a cost: use `cfg.due`, or the label, the check and the payment drift apart.
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
import { cardPack, cannotKnow, type PackStep } from '../kit/card-language/pack'
import { cardTriggers, validateWhen, type WhenCard } from '../kit/card-language/when'

const pack = cardPack<GameTypes>()
const POOL: Record<string, WhenCard<PackStep>> = { beta: { when: [{ on: 'discard', then: [{ op: 'gainResource', res: 'gold', amount: 1 }] }] } }
console.log(validateWhen(pack.verbs, POOL.beta?.when, { kinds: ['discard'] })) // [] (K267)
timingHandlers<GameTypes>({ happen: (ctx, o) => void pack.happen(ctx, o), ...cardTriggers<GameTypes>({ pool: POOL, player: () => 'a' }) })
// K583: a +1 tax on gold costs reaches the payment, the check and the label; a test that reads hidden cards says so.
const taxed = cardPack<GameTypes>({ due: (_s, step, _env, printed) => (step.op === 'pay' && step.res === 'gold' ? printed + 1 : printed), tests: { topIsRed: () => (cannotKnow(), false) } })
console.log(describeEffect(taxed.verbs, taxed.costed({} as GameTypes['state'], [{ op: 'pay', res: 'gold', amount: 3 }], { seat: 'a' }))) // "Pay 4 gold."
```
