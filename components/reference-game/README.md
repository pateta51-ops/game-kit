# reference-game

Generated compatibility references for a card game and a solo tactical game. The generated project's own check catches kit API and gameplay regressions.

## Rules for agents

**What it does:** Runs original gameplay fixtures through interfaces used by games built from the kit.

**You must:**
1. Never pull or copy it into a game: its maintained reference tests generate disposable consumers through scaffold.
2. For changes in game-kit, use the hosted PR check on the PR head as described in [AGENTS.md](../../AGENTS.md). For a game integration use that game’s check workflow.
3. When a component's interface changes, fix its canonical scaffold overlay or the tests under `template/` so the generated game compiles and its `npm run check` passes.
4. To add a component to the contract list it in `components`, use it in the template, cover it in `tests/`.
5. Keep reference fixtures small and unstyled. Exercise kit APIs through real gameplay and test the generated project.
6. Keep the five printed clause expectations independent of executable effects. Observe delayed Ward replacement and Mend healing at their actual resolution; an immediate play marker is not evidence of either. Keep content mutation outcomes separate from isolated consumer source controls.
7. Run the paired-world acceptance through the real consumer command. Preserve the deciding hand, all public zones/history and physical inventory while varying only unseen deck/opponent-hand allocation. Do not claim stateful-policy history coverage from these pure-policy comparisons.
8. Generate courier rules from the canonical `scaffold/courier` overlay before this component's template. Keep the node-only simulation adapter outside the engine directory; do not add a second courier rule implementation here.
9. Generate card engine, content configuration, store, UI and executable acceptance from `scaffold/reference-cards` before this component's tests. Executable card assemblies use that same overlay with supplied data and setup; do not fork a second card reducer or store here.
10. Keep the expedition's geometry and combat policy explicit in `expedition/docs/EXPEDITION_RULES.md.tpl`. Its two configurations share one game definition for manual UI, live store and simulation. Report health actually lost, preserve input state on refused transitions, and keep browser evidence separate from engine/jsdom evidence. Resolve setup controls by their associated labels in mounted tests; select options must not become part of an exact control label.
11. Keep the four-card continuation's roster, empty draw pile, opponent policy and retry snapshot rules explicit in `campaign-continuation/README.md` and its rule document. Use the existing campaign allocation/calendar APIs and canonical card handlers; do not claim general narrative generation or canonical automa-policy parity.

**Common mistakes:**
- Changing a component's interface and leaving `template/` as it was: the generated game no longer compiles and the kit's check fails.
- Using it as the start of a game: a game starts with `node kit.mjs new`.
- Running it on local Windows.
- Treating a loader failure, a mutation error, an exempt clause or a check that did not run as passing semantic evidence.


`reference.test.ts` makes it with `scaffold({ overlay: [scaffold/courier/, scaffold/reference-cards/, template/], components: [...] })` (prompt-host, replay-cli, card-language, card-zones, game-store, table-panels, opponent, paced-view, turn-flow, automa, campaign, grid-map, content-pack, traceability) at the checkout's HEAD (into a temp folder, `node_modules` linked, fake ports in a temp ports file) and runs the game's own `npm run check` (tests, lint, typecheck, kit check, CI check, build). Card-harness is included through the declared dependency closure.

The game (K276, replaces the K234 toy; one `defineGame` object, `REF`): two seats with life, a shuffled deck of 20 in card-zones, hidden hands of 3. A turn (turn-flow) is phases draw (you may draw 2: the pack's `may` and `draw`), main (play a card: `pick`) and end (strike 1). Jab and Blow hit 2 and 3 (a `would` damage batch); Rally: until end of turn your hits deal 2 more (a duration); Ward stays in play: if you would take damage, instead discard it (a replacement); Mend stays in play: when you take damage, you may heal 1 (a `when` trigger). State checks after each action: a seat at 0 life loses, a hand over 4 sheds its last card. The other seat is the automa (a priority table, a mode deck flipped each of its turns, tiers easy / normal / hard). After the last round the higher life wins. A campaign of two scenarios: winning the first gives the player 3 more life in the second. Menu and set-up (screens): seats human or automa, scenario, difficulty.

What the template's tests go through:
- game-store: a whole game through `createGameStore(REF)`, the automa seat answered by `REF.opponent` from its own view; one undo per click; save in the middle of a card effect (the pack's `may`), load, same prompt, same undo steps; autosave, export and import; no hidden card id in either seat's view at any state.
- engine systems on arranged states: turn-flow phases and seat order; the Mend trigger asks and heals; the Ward replacement; Rally ends at the turn boundary; the life and hand state checks.
- automa: the same `Bot` object answers in the store (`botOpponent`) and in sim-pool (`botDriverOf`), its deck flips and reshuffles, `automaLines`.
- campaign: scenario 1's result in the log (`logAfter`, `end`, `begin`) changes scenario 2's life; set-up: seats, scenario and difficulty start the game.
- card-language: game verbs `hit`, `heal`, `boost` beside `cardPack` verbs; `expectVerbs`, `validateEffect`, `validateWhen`, printed words.
- content-pack, card-harness and traceability: real validated records flow through `referenceRules(content)`, the actual play handler and timing system; clause probes, amount mutations and independently authored rule assertions run through `tests/acceptance.ts`. An additional supported hit card enters the same acceptance function without another handler or test family.
- sim-pool and replay-cli from the same object (`game-store/sim.ts`, drivers `opponent`, `random`, `automa`): 15 games on two workers equal to the thread; goldens, view digests and recorded games.
- app-frame, screens, prompt-host, table-panels, settings, saves (jsdom): `#/play` answers may and pick by clicks, Undo, the log; `#/setup` starts the chosen game; the menu starts a campaign; `#/settings` and `#/saves`.

The solo tactical reference (K747, `src/engine/courier.ts`, `src/courier-sim.ts` and `tests/tactical.test.ts`) uses the same configurable factory as the scaffold's courier assembly. Its default configuration routes a courier through a walled grid. Grid-map supplies legal neighbours and shortest-path first steps. The engine asks and validates moves, game-store's simulation adapter drives the same prompt through sim-pool from the courier's public view, and a saved mid-delivery prompt restores and resumes through the engine. Both references run in the same generated project's test and type gates.

Canonical card templates in `scaffold/reference-cards/`: `src/engine/rules.ts` (`GAME`, `referenceRules`, `VERBS`, `TIMING`, `CHECKS`, `BASE_CARDS`, `loadContent`, `CONTENT`, `CARD_PROBE`, `cardText`, `viewOf`), `card-config.ts` (records, independently authored printed clauses, setup), `automa.ts` (`AUTOMA`, `TIERS`, `BOTS`), `campaign.ts` (`STEPS`, `startOf`, `logAfter`), `game.ts` (`REF`), `sim.ts`, `api.ts`; `src/ui/store.ts` (settings, saves, set-up spec, campaign, the game store), `src/ui/App.tsx` (routes menu, setup, play, settings, saves), and executable acceptance under `tests/`. The reference-specific `template/` supplies its entrypoint and broader compatibility tests. Unstyled: no look decisions.

Adding a component to the contract: list it in `components`, use it in the template, cover it in `tests/`.

## Bounded executable acceptance

In the generated project, run `node tests/acceptance.ts`. The same entrypoint is invoked by `tests/evidence.test.ts`, so the generated project's ordinary test/check path executes it. Exit 0 means that this bounded reference's acceptance passed; it does not certify every printed clause or any external game.

`loadContent(records)` parses JSON through content-pack, validates record IDs/shapes, immediate effects and declared triggers, and constructs physical instances. `CONTENT` is the default loaded pack. Existing `GAME`/`CONTENT` callers retain the default rules. For another validated pack use `referenceRules(content)` so both play handlers and card-trigger timing consume that pack. The optional `triggerCap` limit is passed to the existing timing system. The zod import has an explicit, local lint allowance for synchronous schema validation; the engine import preset is otherwise unchanged.

`PRINTED` in `tests/acceptance.ts` imports the independently authored inventory from `src/engine/card-config.ts`, including literal printed text and the expected Jab/Blow damage amounts and Rally/Ward/Mend families. Expected values are never read from the executable `effect` records. A reviewer must check that inventory against the reference rules above. These are the covered clauses:

| Clause | Independent expectation | Runtime and rule evidence |
| --- | --- | --- |
| Jab (`jab.1`, `JAB-01`) | Deal 2 damage. | Actual play action; life delta between clause begin/end; emitted damage; amount +1 mutant rejected. |
| Blow (`blow.1`, `BLOW-01`) | Deal 3 damage. | The same family and production action path with its independent amount; amount +1 mutant rejected. |
| Rally (`rally.1`, `RALLY-01`) | Your hits gain 2 until end of turn. | Owned boost observation; the actual end strike, other seat, later own strike and expiry assertions; amount and isolated owner/duration mutants. |
| Ward (`ward.1`, `WARD-01`) | Damage to its controller is replaced by discarding that Ward. | Actually play the card, resolve incoming damage, observe its physical discard once and next damage; hand/discard/wrong-owner controls; stay, owner/zone/discard mutants. |
| Mend (`mend.1`, `MEND-01`) | After its controller takes damage, offer heal 1. | Accepted and declined choices, correct owner and exactly one heal per damage; inactive-zone controls; amount/optionality/duplicate/owner mutants. |
| Play legality (`PLAY-01`) | A card outside the acting hand cannot be selected. | Passing legal play plus a required rejected action; the assertion runner compares the complete observed state and requires no events on refusal. |

The probe notes begin, dispatch and end only outside dry runs. Immediate damage deltas exclude the routine end-of-turn hit. Ward observations surround the actual replacement; Mend observations surround the accepted heal. Declining Mend records an attempt without dispatch. Named settled boundaries require the declared seat's actual draw prompt and pending `may` task. The independent rule assertions also inspect the full authoritative state, life, card locations, effect expiry and emitted behavior. Strict K592 physical-instance invariants run for ordinary engine actions too: every instance from the loaded pack must occur exactly once across zones. Life may cross zero during legal damage and is not constrained to be nonnegative.

The CLI controls below intentionally fail with exit 1; the test expects that failure and its diagnostic. They are evidence that a bad consumer result is rejected, not alternate passing profiles.

| Control | Failure demonstrated |
| --- | --- |
| `--wrong-amount` | Loader-valid Jab hit 4 reaches the real handler and contradicts the independent printed delta. |
| `--missing-content` | Jab is missing while the printed inventory still requires it. |
| `--missing-evidence` | Blow has no required executable rule-evidence binding. |
| `--missing-refusal` | Play legality lacks its required rejected-action control. |
| `--surviving-mutant` | An intentionally equivalent label-only mutant survives and fails the mutation gate. Normal acceptance includes eight semantic content mutants across all five clauses. |
| `--duplicate-instance` | The same physical card occurs in two actual engine zones. |
| `--trigger-cap` | Actual Mend in play exhausts an explicitly zero trigger budget when the opponent is hit. |
| `--invalid-content` | A negative hit is rejected before the suite can run. |
| `--invalid-mutant` | A negative-hit mutant is classified invalid, never counted as a kill. |
| `--error-mutant` | A loader-valid renamed card cannot be resolved by the fixture; that execution error is not counted as a kill. |

The report has no exempt clauses in this bounded inventory. `runCardSuite` observes real resolutions and refusals; `runRuleAssertions` supplies separately authored state/event expectations. The existing mutation runner replays those rule cases over changed loaded records, preserving killed, survived, invalid and error outcomes. Five isolated source controls in `tests/evidence.test.ts` change the game-owned Rally duration/owner or Ward owner/zone/discard behavior and require the actual consumer command to fail. They are separate source controls, not content mutation kill credit. Only a single immediate hit, the existing Rally boost, Ward replacement and optional single-heal Mend shape are supported. Additional effect/trigger shapes fail explicitly instead of being accepted merely because they carry a known family label. If runtime or mutation evidence fails, final independent rule evidence is `null` (not run), not passing.

## Paired hidden-world acceptance

`simGame.reshuffleHidden` redistributes the unseen deck and the opposite hand with the checker's dedicated shuffle RNG. It preserves all physical instances and hidden-zone sizes, the deciding hand, public zones, prompts, pending work, prior public events and game RNG. This reference never returns a revealed card to a hidden zone; therefore no previously revealed identity is lost from the preserved public zones. These are consistent hidden worlds for the declared rules, not a claim to enumerate all possibilities or reconstruct an alternative setup seed.

The same `node tests/acceptance.ts` command executes sim-pool with `hidden: true` over twelve games using the registered opponent, random and automa policies. Its report requires completed games, both deciding seats, meaningful hidden-card-definition variation and the `pick`, draw `may`, and healing `may` shapes. The checker compares ordered legal-answer payloads and pure decisions at matched RNG positions. An occasional identical random sample is allowed; a whole run with no relevant variation fails. The policies use no choice memory across calls; this evidence does not certify future stateful policies without paired histories.

The command exits 1 for `--hidden-policy`, `--hidden-answers`, `--hidden-no-variation`, `--hidden-missing`, `--hidden-truncated`, `--hidden-error` and `--hidden-empty`. These controls exercise a hidden-dependent policy, hidden-dependent answer payloads, uninformative/missing redistribution, incomplete runs, alternate callback errors and an unexecuted decision set. Diagnostics retain seed, driver, and the checker's decision step. The previous view-only smoke is named as a redaction check; it does not stand in for this execution.

Generated card assemblies replace the canonical `card-config.ts` with their supplied records, printed inventory and setup. `CONTENT`, `REF`, the live store and `simGame` all read that same configuration; the configured level also selects the registered automa driver. Calling `acceptance` directly with a different record/inventory argument only runs its content and rule evidence: `hiddenStatus` is `not-run-custom-content` and `hidden` is `null`. Such an ad hoc content check never receives the module's default hidden-world evidence.

## Compatibility matrix and next increments

This is the executable contract map, not a record of a particular CI run. The exact head's check output supplies the execution result.

| Components / entrypoints | Behaviors and configurations | Executed check path |
| --- | --- | --- |
| content-pack `loadText`; card-language verbs; game-owned `referenceRules` over engine-core | Default 20-card pack, an altered valid amount, altered Mend trigger, additional supported hit record | `tests/evidence.test.ts` and its actual `node tests/acceptance.ts` subprocesses |
| card-harness K760/K561; traceability K744; engine-core K592 | Five printed clause groups; play/refusal; semantic mutants; invalid/error/survived controls; physical-instance and cap failures | Same acceptance entrypoint, included by the generated test/check path |
| sim-pool paired-world checker and game-owned `reshuffleHidden` | Same-observation hidden redistribution, matched-seed legal answers/choices, complete traces and failure controls | `tests/acceptance.ts` through `tests/evidence.test.ts` |
| game-store, turn-flow, card-zones, automa, campaign, sim-pool, replay-cli | Two-seat cards, may/pick prompts, triggers/replacements/durations, save/load/undo, worker/thread determinism, replay, hidden views, difficulty and campaign | `tests/smoke.test.ts` |
| app-frame, screens, prompt-host, table-panels, settings, saves | Click-driven menu/setup/play/settings/saves and undo | `tests/ui.test.tsx` |
| grid-map, engine-core, game-store `simGameOf`, sim-pool | Solo courier: walls/legal movement, shortest-path driver, mid-delivery save restore and completion | `tests/tactical.test.ts` |

Subsequent reference increments remain separate: dice placement needs explicit placement/lock/refusal rules; bag-builder needs draw/refill/return and instance-conservation contracts; narrative campaign needs branch and saved progression rules; presentation stress needs overlapping prompt/animation/input and cancellation contracts. They are not prerequisites for this card/tactical increment and are not claimed as covered by it.

## Expedition combat and exploration

`expedition.test.ts` generates a separate small consumer from `expedition/`, pulling combat, growing-map, board-model and the shared engine/store/simulation dependencies at the checkout's exact HEAD. Run `npx vitest run components/reference-game/expedition.test.ts` in the kit checkout. The generated consumer's own `npm run check` runs its rules, source controls, rendered action controls, lint, types, installation and build checks.

The original contract is in `expedition/docs/EXPEDITION_RULES.md.tpl`: each legal move, adjacent attack or frontier exploration costs one point. Fixed armor reduces damage; the game emits actual health lost and removes the guard once. A seeded physical tile deck grows a straight route through one-space passages and two-space galleries. The final tile's far endpoint is the exit; entering it on the last point wins before exhaustion. Invalid moves, attacks and placement preserve the authoritative input including tile order, markers, RNG and points. The public view excludes hidden tile order and RNG. This solo pilot is not an opponent.

Both layouts use `createExpedition`, one `defineGame` object, game-store and its simulation adapter. Independent expectations require an eight-action route to c4 and a twelve-action route to c7. `node tests/expedition-acceptance.ts` executes four seeds per layout, damage/refusal checks, pending exploration save/replay, physical-instance invariants, repeated seeded outcomes and actual live-store/simulation history/view equality. Shorter budgets lose. `tests/expedition.test.ts` runs isolated wrong-damage, invalid-join and retained-tile source controls; all must be rejected.

The generated manual UI exposes both routes. Its jsdom test plays actual controls to each exit. `npm run test:e2e` additionally requires native Chromium and plays both routes; the maintained browser control disconnects an action button and requires a failure. A missing browser stays skipped/not-run locally and is never credited as browser acceptance. These fixtures prove only their declared bounded geometry and combat policy.

## Four-card campaign continuation

The [continuation reference](campaign-continuation/README.md) adds an original two-scenario variant through the existing campaign, card and game-store APIs. Arrival reaches a real terminal result before crossing. Calendar work applies stock, a required rest/press choice and readiness in order; unresolved choices preserve the full input save. Absence retains allocated cards, retirement releases them once, and batched Ward/Mend exchange respects the physical box. The two configurations change decks, copy counts and starting-life bonuses.

Active players receive their four allocated copies as starting hands, the shared draw pile is empty, and a declared public-view rule-based opponent supplies automated answers. This differs from the canonical shuffled-deck setup. Save/restore/retry verifies the selected variant/configuration, actual engine history, current allocation and scenario-start snapshots while preserving game-owned journal fields. Run `npx vitest run components/reference-game/campaign-continuation/campaign-continuation.test.ts` for fresh generated consumers, source failure controls and types/lint/kit verification. The real generated command is `node tests/campaign-acceptance.ts`; it does not claim a browser campaign screen or universal campaign generation.

## Use it in 10 lines

```ts
import { scaffold } from '../kit/scaffold/scaffold.js'
// what reference.test.ts does (run it: npx vitest run components/reference-game), then `npm run check` in the folder
const kit = process.cwd()
const made = scaffold({ dir: 'tmp/reference', id: 'reference', name: 'Reference', kit, ref: 'HEAD', ports: 'tmp/ports.json', install: false, overlay: [`${kit}/components/scaffold/courier`, `${kit}/components/scaffold/reference-cards`, `${kit}/components/reference-game/template`], components: ['prompt-host', 'replay-cli', 'card-language', 'card-zones', 'game-store', 'table-panels', 'opponent', 'paced-view', 'turn-flow', 'automa', 'campaign', 'grid-map', 'content-pack', 'traceability'] })
console.log(made.dir)
```
