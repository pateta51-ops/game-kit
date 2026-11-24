# card-language

The card-language shell (K206): card effects as data, one typed verb table where each verb has a field check, a handler that runs on engine-core and a text generator that prints the card's words from the same step. The game writes its own verbs; the standard pack (K232, `pack.ts`) gives the common ones.

## Rules for agents

<!-- hooks: written by scripts/catalog.mjs from docs/catalog-notes.json; do not edit -->
**Hooks a game calls:**
- `cardPack` + `offer`: offer an effect only if it does something, each knob set from a ruling
- `wouldChange`: ask whether an effect would change the game: yes, no or unknown
- `resolves`: how much of an effect would happen: in full, in part or nothing
- `judge`: the reason an effect is not offered
- `due`: a cost a card changes, a tax or a discount
- `describeEffect`: print card text from the same data the engine runs
- `askVerb` + `resume`: a verb that asks the player and goes on with the answer
- `cardTriggers` + `when`: card triggers, when this happens do that, from card data
- `cannotKnow`: say a read looks at cards the seat cannot see
- `then` + `moved`: act on the cards a step just moved, draw 2 then discard 1 of them
- `expectVerbs`: test that every verb has a handler, text and an example
<!-- /hooks -->

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
22. A cost a card or rule changes (a tax, a discount) goes in `cardPack({ due })` (K583), never into rewritten steps: the can-pay check, the payment, the check and the bar reason then read one number. Print the cost with `describeEffect(VERBS, pack.costed(s, steps, env))`. `due` returns a whole number, 0 or more (anything else throws `EngineBugError`: floor a discount yourself), and is not called for an amount written `X`.
23. Test card data with `offer: { strict: true }` (K583): a misspelt test, count, filter or custom verb name then throws from the check; without it the check answers `unknown` and a "not offered" test can pass for the wrong reason.
24. To show how much of an effect would happen (in full, in part, nothing) or why it is not offered, read `pack.resolves(s, content, steps, env)` (K597) and `pack.judge(s, content, steps, env, { why: true })` (K605); never write a second dry run. A custom verb (`cfg.custom`) or a row of the game's table that reads no card the seat just saw may say `viewSafe: true`, so `resolves` runs it after a draw on the guarded view (below) instead of answering `unknown`; never set it on code that reads a fact about a card kept without its id. A mark the game keeps for some cards only (only even cards, only cards with a gem) shows which kind of card came, and K598's barring then shows it to the player: mark every card that comes into view, by its id (recipe under "How much resolves"). A ruling the reasons cannot express goes in `offer.decide` (it may return its own reason); barred options show the reasons with `offer.barReason: 'why'`. `prefer: 'full'` grades each option with `pack.grade` (its whole step tree, K598): call `grade` to decide or explain which options a full one bars, and `resolves` only to show a per-step answer (its parts are top-level steps). The two can disagree on a nested option: `[seq [gain, a false if]]` is `full` for `resolves` (the seq changed the game) and `part` for `grade`. A ruling that a false condition or a declined `may` still counts as full sets `offer.fullIgnores`.
25. To act on the cards a step just moved ("draw 2, then discard 1 of them"), put the later steps in the mover's `then` and pick with `from: 'moved'` (K658); never re-find them by position in a zone or by a game flag.

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
| ... and each option that does nothing is shown barred | `deadChoice: 'bar'` (`chooseOption`: code `noChange`, `cannotPay` or `unknown`; `choosePayment`: code `cannotPay`; K660, `chooseNumber`: each number is checked with X that number, a dead one barred `cannotPay` or `noChange`, none live: not offered, under `skip` too) |
| What nobody can know yet (hidden cards, a random draw) is offered | `unknown: 'offer'` (default) |
| ... is not offered | `unknown: 'skip'` |
| Every option of a choice may be taken, whatever part of it resolves | `prefer: 'any'` (default) |
| An option that resolves in full bars those that do not | `prefer: 'full'` (K598, `chooseOption` only. Each option still enabled after every other bar is graded by `pack.grade(s, content, steps, env)`, the asking seat's view: like `resolves`, but over the option's whole step tree, so a step inside a `seq`, `may`, `if`, `payThen` or a nested choice that does not resolve counts as it does written flat (`[seq [gain, a false if]]` is `part`, as `[gain, a false if]` is), and a declined `may` gives the reason `declined`. When one is `full` (an empty option, "keep it", and winning the game count) each one graded `part` is barred with code `partial` and each one graded `none` with code `none`; with no `full` one but a `part` one, each `none` one is barred with code `none`, and every other stays open (with `barReason: 'why'` its skipped steps' reasons, comma-joined, in `missing`). Every option `none`: the choice is not offered. `unknown` is never barred and never bars. Prefer never leaves a choice with nothing enabled. A `repeat` of the choice may take the same option twice, each pick judged when it opens; "choose 2 different" (distinct picks) is not covered. `chooseCards`, `may` and `choosePlayer` are not covered) |
| ... and some skips do not count against full (a false condition, a declined may) | `fullIgnores: ['condition', 'declined']` (K598, with `prefer: 'full'`: the `SkipReason`s listed do not count against full when an option is graded, so a part whose every skip is one of them counts as resolved, also when it changed nothing (a lone false `if`); default `[]`, every skip counts. With `deadChoice: 'bar'` an option that changes nothing, such as a lone false `if`, is barred `noChange` before `prefer` grades it, so it is never graded full: a game that grades like such a source does not combine `fullIgnores` with `deadChoice: 'bar'` (pinned by a test). Recipe below) |
| ... and a forced choice is not offered only when nothing resolves | `forcedSkip: 'nothing'` (default) |
| ... and a choice handed to another seat is not offered when no option may be full | `forcedSkip: 'noFull'` (another seat's: `env.actor`, the seat the effect began with, set by `choosePlayer` (also for its `cfg.noPlayer` seat) and `eachPlayer` under this setting only, or by the game, is not `env.seat`; an `unknown` option may be full, so the choice is asked. Each pick of a repeated choice is judged alone, so a second pick with no full option is skipped too) |
| A paid effect is able when its cost can be paid, whatever the effect then does | `paid: 'cost'` (default: the check judges `payThen` on its cost alone and does not run `then`) |
| A paid effect is offered only if the effect does something | `paid: 'effect'` (K583. In the check a payable cost is able even when paying shows no change; the cost is paid on the copy, `then` runs, and only what `then` changes counts. With `noChange` or `deadChoice` set, a paid option whose effect does nothing is then not offered or barred `noChange`, and so is a payable `choosePayment` way) |

The codes are engine-core's `reason` on a barred option (`bar`, read with `blocked(prompt)`, legal.md); the game turns them into words. `noChange`, `deadChoice` and `prefer: 'full'` need `cfg.handlers` (the pack throws at build without it). `paid` and `strict` only change the check, so they do nothing until `noChange`, `deadChoice` or the game's own `wouldChange` call uses it.

**The check.** `pack.wouldChange(s, content, steps, env)` answers `'yes' | 'no' | 'unknown'` for `env.seat`: it runs the steps on a copy of the state with the game's handlers and stops at the first change of the game (`offer.view(s)`: what counts; default the state without stack, prompt, counters, log, timing, pending moves and rng; K657: a resource at 0 counts as none, so gaining 0 of a resource the seat never held is no change, in `wouldChange`, `judge`, `resolves` and `grade`, also under a game `view`, which now gets `res` with every 0 entry removed, and `res: {}` where the state had no `res`; the real run still writes the 0. Only the pack's own resource store, `s.res`, is read this way: a game with `cfg.res` that writes a 0 into its own state still counts that write as a change). A `later` step counts as a change by default, because the waiting effect is in `state.later`; a game whose ruling says a delayed effect alone is no change passes a `view` that leaves `later` out, such as `view: ({ zones, res, marks }) => ({ zones, res, marks })`. Each prompt forks one run per answer tried. The quick answers come first (the empty answer when `min` is 0, each single option when `min` is 0 or 1, else the first `min` options); then, with the budget left, every other legal answer (K579): each set of `min` to `max` enabled options, every order when the order matters (`ordered` on the prompt, `scout`, `orderEffects`), each option answered alone (`alone`), and every answer of the prompts under those. `no` means every one of those answers was tried and none changed the game; answers left untried when the budget ends are `unknown`. Not tried: the order of the picks inside one pick set of a prompt that is not ordered (a set is answered once, in option order). An effect that reads the order picked ("put them on the bottom in the order chosen") can so answer `no` wrongly: such a game verb asks with `ordered: true` on its prompt. Caps: `offer.branches` answers in all (default 32), `offer.tasks` tasks per answer (default 2000); a cap hit is `unknown`, never `no`. A game whose cards choose among many cards raises `branches` ("choose 2 of 9" is 36 pick sets). The real state, its rng and its log are never touched. `unknown` when nothing changed before: any `ctx.rng` call (it throws before drawing), a filter over cards `env.seat` cannot see, a prompt for another seat, a cap, an `EngineBugError`. A `may` inside counts when its body changes something; under `paid: 'cost'` (default) the `then` of a `payThen` does not run in the check, so an "if you do" part never counts on its own (paying the cost does); under `paid: 'effect'` it runs and only its changes count. Inside the check the policy verbs ask as by default and `wouldChange` answers `unknown` (no nesting). `inDryRun()` is true while it runs.

**The check, K583.**
- The reason: `pack.judge(s, content, steps, env)` answers `{ answer, reason?, error? }`; `wouldChange` is its `answer`. With `unknown`, `reason` is the first that applies of `error` (a handler threw; `error` holds what it threw), `hidden` (cards the seat cannot see), `otherSeat` (a prompt of another seat), `random` (a `ctx.rng` call), `budget` (`branches` or `tasks` ran out), `nested`. So a game tells "the budget ran out" from "nobody can know"; `offer.unknown` still treats them alike.
- Game over: an effect that sets `state.result` is a `yes` under every `view`, also one that leaves `result` out.
- Errors: whatever a handler throws in a branch the check tries (also an answer no screen would send: an option answered alone, a pick set of mixed options) is `unknown` with the reason `error`, never a throw into the real action; a change before the throw is a `yes`. An `EngineBugError` (a misspelt test, count, filter or custom verb name in card data) is `unknown` too, as before: read it from `judge`, or set `offer: { strict: true }` in tests, which throws every such error from the check.
- Hidden information: `cannotKnow()` (rule 21) is how game code says so. A card picked blind (`#index`) stays unknown to the game in the check: a game test, count, filter or custom verb that would run with such a card in `env.cards` is `unknown`, whatever the hidden cards are (the pack's own verbs still move it: a blind discard is a `yes`). `cardTriggers` does not fire, in the check, a trigger whose source card the judged seat cannot see, so the answer does not tell what another seat holds; a game that collects triggers itself filters by `dryRunSeat()` (the judged seat, null outside the check). Under `paid: 'effect'` a cost that shows the judged seat a card it did not see (a mill, a draw, a blind discard to an open zone) is paid on the copy, but from the moment the card is shown (inside the cost too) no game code runs in that branch: the answer is `unknown` (`hidden`) when what follows reaches a game verb (a row of the game's table that is not the pack's own), a task kind of the game's (any but `verb` and engine-core's `timing.*`), a test, count, filter or custom verb (`run`, `resume`, `payable`), `cfg.due`, `cfg.res`, `cfg.seats` and `cfg.noPlayer` (`choosePlayer`, `eachPlayer`) or `cfg.reshuffle`. The pack's own verbs, whose reading the kit sees, stay judged (`mill, then gain` is `yes`), and a cost that shows nothing is judged as before, so an offer never tells the card before the cost is paid. Not guarded (they run on every move): timing's callbacks (`happen`, replacements, triggers), `moved`, `prompt` and `word`; one of them that reads a hidden card calls `cannotKnow()`.
- K641: an option over a card the seat cannot see (`#index`) carries `unseen: true`, so engine-core's `onlyOne` / `askOrTake` and prompt-host's `autoAnswer` (the reference game's "answer obvious choices") never take a lone hidden card for the player.
- In the check an empty `marks` record is the same game as none (`ready` when no card was ever marked is a `no`), and a shuffle of fewer than two cards (a `shuffle`, or a `search` that finds nothing to offer) draws nothing and is a `no`.
- In the check `lookAt` of a card the seat already sees, and `reveal` of a card in a zone all see, change nothing (the real run records them as before).
- The bar reason reads a cost inside a `seq` or a `may` too: `cannotPay`, not `noChange`.
- `payThen` leaves a game's own env field named `owed` alone under `cost: 'parts'`; under `cost: 'whole'` the field is the pack's and `then` runs without it.

**How much resolves, and why not (K597, K605).**
- `pack.resolves(s, content, steps, env)` answers a `ResolveCheck` for `env.seat`: `answer` is `full` (some line of play resolves every part), `part` (some line resolves a part, none resolves all), `none` (no line resolves any) or `unknown`; `skipped` lists the steps the best line does not resolve in full, each `{ step, reason }` (the step's index in `steps`). A part is a top-level step, except that a top-level `payThen` is two parts, its cost and its `then`: pay 1 gold, then a false condition, is `part` with the reason `condition` (as `judge` under `paid: 'effect'` says `no`). A part resolves when the game (`offer.view`) changed while it ran, or it ended the game; the parts after the one that ended the game do not count against `full` (`[win, gain]` is `full` like `[win]`, and lists step 1 in `skipped` with the reason `gameOver`, for information: a `full` answer lists only such steps). A part resolves unless it resolved only in part: a step that did some but less than its number (`short`: discard 3 with 2 in hand, draw 3 from a deck of 2 when the game has no reshuffle, refill short of its size, choose 3 of 2, +2 up to a cap 1 away; a step that did nothing at all is not short, it changed nothing), or a cost whose cost or effect changed nothing (below). Such a part makes the effect `part` at most, with that reason. A line that stops inside a step keeps the parts that ended before it (the cost of a top-level `payThen` stopped in its effect), not what the open step changed so far: the rest of that step could undo it. It is the same search as `wouldChange` (the same caps, the same `unknown` reasons), but each line runs to its end instead of stopping at the first change. `unknown` only when the known part does not fix the answer: a line that met hidden cards, a random draw, another seat's prompt or an error may still resolve the parts from where it stopped (`[gain, a false if, a hidden search]` is `part`, `[nothing, a hidden search]` is `unknown`), and the steps it did not reach carry its reason. The check never looks past such a point, so it can answer `unknown` where every hidden world would give the same answer.
- Costs at any depth: a cost and its effect are two parts wherever the cost is (a `payThen` inside a `may`, a `seq` or an option, a `choosePayment` way). At top level a `payThen` counts as two parts; deeper, the step holding it resolves in full only when both changed the game, else it is `part` with the effect's reason (`condition` when its `if` is false), `noChange` (a cost that changed nothing) or `cannotPay` (a cost judged as a whole that stopped part paid). So `may[pay 1: if rich, gain]` is `part`, `condition`, as `judge` under `paid: 'effect'` says `no`, `condition`.
- Under every `paid` setting `resolves` pays the cost on the copy and runs `then` (it asks what happens, not whether it is offered).
- Hidden cards: the answer is the seat's own and never depends on a card it has not seen. A card is new when it comes into the seat's view during the line (a draw, a mill, a look, another seat's card moved to an open zone) and the seat did not see it when the line began. Once one is new, tests, counts, filters, `payable`, `due`, `res.get`, `seats`, `noPlayer` and `reshuffle` get a read-only view of the state that stops the line (`hidden`) on any read of an object whose own keys or values hold a new card (a mark keyed by it, a hand holding it, a log line naming it): a keyed read (also of a key that is not there), `in`, `hasOwnProperty`, `Object.hasOwn`, a descriptor or a key listing, and a write by a `viewSafe` verb or row (set, delete, define); reading an array's `length` passes, and an object holding no new card reads as before. An id counts as a whole token (the string, or bounded by characters that are not letters, digits, `_` or `-`: `p1` and `draw 12` do not hold the card `1`, `draw 1` does); an array's indexes are not ids. The line also stops when `env.cards` or `env.source` holds a new card, or a filter would be asked about one. Custom verbs (`run`, `resume`), game rows of the table and game task kinds keep the hard stop: after a new card they do not run, unless the verb or row says `viewSafe: true`: then it runs with `ctx.s` the same guarded view, its writes going to the state (only in `resolves`; game task kinds keep the hard stop). So `[draw, if the drawn card is even: gain]` stays `unknown`, `hidden`, whatever the deck order, while `[draw, if gold is 2: gain]` and, with `cfg.res`, `[draw, gain 1 gold]` are answered. Not seen by the view: a fact about a card kept without its id (a `moved` callback that stores "the last card was red"); a test that reads such a field calls `cannotKnow()`. Outside `resolves` (in `wouldChange` and `judge`) the guard is as before.
- The branch cap (`offer.branches`, default 32, shared with `wouldChange`): `resolves` runs every line to its end, so it needs more answers than `wouldChange`, which stops at the first change. An answer found before the cap is returned (a line that resolves every part is `full`); a cap hit otherwise is `unknown` with the reason `budget`, and each step no tried line resolved carries `budget`. Raise `branches` for effects with many choices.
- Granularity: top-level parts only. A `chooseOption` whose chosen option resolves part of itself counts as resolved, and so does a `seq` that changed the game (`[seq [gain, a false if]]` is `full` here, `part` for `pack.grade`): use `resolves` for a per-step answer on screen, `grade` for what `prefer` bars; to grade an option over its whole step tree, call `pack.grade` on its steps (`prefer: 'full'` does, with `offer.fullIgnores`, K598).
- `SkipReason`, read when the step begins, on the state as it is: `condition` (an `if` test false, no `else`), `cannotPay` (`pay`, `convert`, `payThen`, `choosePayment` that cannot be paid), `emptyZone` (the zone a card step reads is empty), `noTarget` (no card there it may take, no chosen or source card), `noChange` (none of these); `short` (a step that did less than its number, read as it runs); `gameOver` (the game ended before the step; it does not count against `full`). Nested steps (`seq`, `may`, an `if` branch, a `chooseCards` body, a paid `then`) give the first reason of their steps; a `chooseOption` gives the first reason of its options that is not `noChange`. The `then` of a top-level `payThen` whose cost stopped part paid (`cost: 'whole'`) is `cannotPay`. An `unknown` answer lists the steps of a line that stopped (with its reason), never of a closed line such as a declined `may`. Besides these: `hidden`, `error` (with `error`), `otherSeat`, `random`, `budget`, `nested` from the run.
- `pack.judge(s, content, steps, env, { why: true })` adds the reason to a `no` (the first `SkipReason` of the steps); without `why` a `no` is `{ answer: 'no' }` as before. `wouldChange` is unchanged (pinned by a test recorded from the code before K597).
- `offer.decide(s, steps, env, check)` (K605): the game decides the answer; it gets the check (a `no` with its reason) and what it returns is the answer of `judge`, `wouldChange` and every knob that reads it. Unset: nothing changes. It is game code in the check: it runs as the check of `env.seat` (a `cannotKnow()` in it gives `unknown`, `hidden`), it is not called when the check met a hidden card (`unknown`, `hidden` stays), and a throw is `unknown` with the reason `error` (with `strict`, it throws). It may return the game's own reason (any string, e.g. `{ answer: 'no', reason: 'shielded' }`).
- The reason on a barred option (`noChange: 'bar'`, `deadChoice: 'bar'`): `offer.barReason: 'why'` gives the reason `judge(..., { why: true })` gives (`condition`, `emptyZone`...); with `decide` set the reason it returns is used under either setting. Unset and no `decide`: `cannotPay` or `noChange` as before.

```ts
const r = pack.resolves(state, content, [DRAW, { op: 'gain', from: 'aside' }], { seat: 'a' });
if (r.answer === 'part') for (const k of r.skipped) out.push(`step ${String(k.step)} skipped: ${k.reason}`);
const why = pack.judge(state, content, [{ op: 'if', test: 'rich', then: [GAIN] }], { seat: 'a' }, { why: true });
out.push(`${why.answer} ${String(why.reason)}`);
// out: ['step 1 skipped: emptyZone', 'no condition'] (run by k597.test.ts)
```

**A mark the game keeps for some cards only shows the card.** The view stops on an object that holds a new card; it cannot see a write that did not happen. A `moved` that marks only even cards leaves the marks empty when an odd card is drawn, so a test reading them is answered (`full`) for an odd card and `unknown` for an even one, and under K598 a `full` option bars its siblings only in the world where the card was odd: the bar tells the player the card. Mark every card that comes into view, keyed by its id, with the fact as the value, never only the cards that match; or keep a count or flag without the id and call `cannotKnow()` in every test that reads it; never `viewSafe` on a reader of it.

```ts
const moved = (ctx: Ctx<G>, m: Moved): void => void (draftOf(ctx).got = { ...ctx.s.got, [m.card]: m.card.endsWith('2') ? 1 : 0 });
// a test reading got after a draw is unknown (hidden) for every card; marking only the even ones is full for d1, unknown for d2 (run by k597.test.ts)
```

**A modified cost (K583).** `cardPack({ due: (s, step, env, printed) => number })` gives the amount a `pay` or `convert` step asks for now (default the printed amount; `printed` is the step's `amount`). The can-pay check, the whole-cost sum, the payment itself, `wouldChange` and the bar reason all read it. One number: `payThen` reads every amount of its cost when the cost starts, before anything is paid, and pays exactly those (the read steps carry a pack-owned step field, not an env key, so a game env field never turns `due` off, and a `pay` that a game verb makes while the cost is paid is read like any other). `due` gets the env of the seat that pays: a step under `choosePlayer`, `eachPlayer`, `forEach`, `chooseCards`, `count`, `chooseNumber`, `later` or a look's `then` (a verb that changes the env) is not read at the cost's start but when it is paid, with that env (the label from `costed` reads such a step with the env of the seat the cost starts in, so when another seat pays it can differ from what is paid: print it after the choice, or show the printed amount there), so a `due` that reads what the cost itself changes (gold held, a card the cost exhausts) cannot leave a cost half paid. `due` sees one step, not the other parts of the cost: a discount usable once, or a reduction shared over the parts, is the game's to split (it knows `step` and the state before the cost). The result must be a whole number of 0 or more, else `EngineBugError` (in the real run; `unknown` with the reason `error` in the check); 0 pays nothing and prints as 0. An amount written `X` is the number the effect itself computed (`count`, `chooseNumber`, the env's `n`): `due` is not called for it and the label keeps X; put the change into that number. `pack.costed(s, steps, env)` returns the steps with those amounts, nested ones too (the same object when nothing differs): print it with `describeEffect` for a label. Printed 3 with a +1 tax and 3 held: the `choosePayment` way is barred with `cannotPay`, the label says 4, and with 4 held exactly 4 leaves. Compute the amount with engine-core's `numberParts` (numbers.md). Not covered: the number of cards a card-taking cost step asks for (`count`); a game changes that in its own step.

**Prefer the option that resolves in full (K598).**

```ts
const offer: OfferPolicy<S> = { prefer: 'full', barReason: 'why' };
const p = offerGame(cardPack<G>, { offer }).play([{ op: 'chooseOption', options: [[GAIN, RICH], [DRAW]] }], [], undefined, true).s.prompt;
const out = blocked(p).map((b) => `${b.id} ${b.reason} ${String(b.missing)}`);
// out: ['0 partial condition'] (run by k598.test.ts)
```

A game whose ruling counts a false `if` and a declined or any `may` as resolved in full lists those reasons:

```ts
const offer: OfferPolicy<S> = { prefer: 'full', fullIgnores: ['condition', 'declined'] };
const options = [[{ op: 'may', then: [RICH] }], [GAIN, RICH], [{ op: 'draw', count: 3 }]] as PackStep[][];
const p = offerGame(cardPack<G>, { offer }).play([{ op: 'chooseOption', options }], [], undefined, true).s.prompt;
const out = blocked(p).map((b) => `${b.id} ${b.reason}`);
// out: ['2 partial']: the may and the false if are full, the short draw is not (run by k598.test.ts)
```

**Two rules questions the defaults hide: stated choices (K579, K583).** Ask the game's arbiter, then set the knob; each is pinned by a test in `offer.test.ts` and `k583.test.ts`.
- Under `cost: 'parts'` (default) a `pay` step that refuses does not stop the effect: a cost of two steps of 2 gold with 3 gold pays 2, the second step refuses, and `then` runs. A ruling that an unpaid cost gives nothing: set `cost: 'whole'`.
- Under `paid: 'cost'` (default) a paid option whose effect does nothing is offered: paying the cost changes the game, so the check answers `yes`. A ruling that it is not offered: set `paid: 'effect'`.

**Prior-art cases the policy does not decide** (of the 37 cases of the K529 study; each of the others has a test). They do not apply to this part because the rule lives elsewhere:
- Case 6, a "have N" cost part after a spend, judged over payment plans: the pack has no payment plans. It is a game's `custom` step: its `payable` sees the state as it is, not the state after the earlier parts (under `cost: 'whole'` it is judged again when reached, and a failure there stops the cost with the earlier parts paid). Pinned by a test.
- Case 21, an option that resolves only in part barred in favour of one that resolves in full: by default no option is barred for it (pinned by a test); a ruling that it is: `prefer: 'full'` (K598).
- Case 25, "attempt A, otherwise B": a game's verb that calls `wouldChange` on A (tested with such a verb).
- Case 26, whether a play that changes nothing is legal: the game's rule; it reads `wouldChange`. A "nothing will happen, use anyway?" confirm is the game's prompt.
- Case 27, a mandatory cost among other steps that blocks the whole play: a bare `pay` step refuses and the rest runs; the game puts the cost in a `payThen` or checks it before the play. Pinned by a test.
- Case 30, a replacement offered once: engine-core's timing, not the offer policy.
- Case 31, where the card being played is during the check: the state the game passes (tested).
- Case 32, steps another seat does: a prompt of another seat is `unknown` (reason `otherSeat`); "each player" is a `yes` when any seat can do it without a choice. No knob judges it for the acting seat only. Pinned by a test.
- Case 37, `X` read before a step sets it: it is 0, so the effect is not able; the pack does not refuse the text. Pinned by a test.

Case 29 (a cost a card in play changes) is `cfg.due`.

**Older engines' cases (K654, `k654.test.ts`): stated choices and their recipes.**
- A draw from an empty deck whose reshuffle zone is empty makes no `reshuffle` occurrence ("draw 3" with both empty: no event). A ruling that each draw attempt is an event: draw one at a time (`repeat` of `draw`) and, when both zones are empty (a test), run a custom verb that starts its own `would` occurrence; triggers on that kind fire once per attempt.
- `chooseNumber` offers every number from `min` to `max` by default, also ones whose cost cannot then be paid: set `max: 'X'` after a `count` of what can be paid, or (K660) `deadChoice: 'bar'`, which bars each number that changes nothing.
- "Draw N if able" (never reshuffles): `repeat` N times an `if` on a game test "the deck is not empty" around a one-card `draw`.
- "Draw 2, then discard 1 of them" (K658): a mover's `then` runs once its cards moved, with `env.moved` the cards that moved; a pick there names them with `from: 'moved'`: `{ op: 'draw', count: 2, then: [{ op: 'discard', cards: 'pick', from: 'moved', count: 1 }] }` offers only the two drawn (run by `k657.test.ts`). A moved card the picking seat cannot see is offered blind (`#i`, `unseen`), and in the check a test, count, filter or custom verb that runs with a card in `env.moved` that came into view is `unknown` (`hidden`), as for `env.cards`. A zone named `moved` is shadowed by it.

For substitutable resource costs (K590), follow the [payment contract and executable example](payment.md). Use `paymentPlans` to generate options and revalidate the selected spend at action time. Use `preferredPayment` with an explicit game-owned policy and surface budget errors separately from unaffordability.

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

## Substitutable resource payment plans (K590)

See [payment.md](payment.md) for the public shapes, solver limits and an executable engine example.
