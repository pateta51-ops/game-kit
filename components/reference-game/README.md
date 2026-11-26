# reference-game

Generated compatibility references for a card game and a solo tactical game. The generated project's own check catches kit API and gameplay regressions.

## Rules for agents

**What it does:** Runs original gameplay fixtures through interfaces used by games built from the kit.

**You must:**
1. Never pull or copy it into a game: it is generated into a temp folder by `reference.test.ts`.
2. For changes in game-kit, use the hosted PR check on the PR head as described in [AGENTS.md](../../AGENTS.md). For a game integration use that game’s check workflow.
3. When a component's interface changes, fix the template under `template/` so the generated game compiles and its `npm run check` passes.
4. To add a component to the contract list it in `components`, use it in the template, cover it in `tests/`.
5. Keep reference fixtures small and unstyled. Exercise kit APIs through real gameplay and test the generated project.
6. Keep printed expectations independent of executable effects. The runtime acceptance scope is currently Jab/Blow; Rally, Ward and Mend remain explicitly exempt from that scope even though ordinary gameplay tests exercise them.
7. Generate courier rules from the canonical `scaffold/courier` overlay before this component's template. Keep the node-only simulation adapter outside the engine directory; do not add a second courier rule implementation here.

**Common mistakes:**
- Changing a component's interface and leaving `template/` as it was: the generated game no longer compiles and the kit's check fails.
- Using it as the start of a game: a game starts with `node kit.mjs new`.
- Running it on local Windows.
- Treating a loader failure, a mutation error, an exempt clause or a check that did not run as passing semantic evidence.


`reference.test.ts` makes it with `scaffold({ overlay: [scaffold/courier/, template/], components: [...] })` (prompt-host, replay-cli, card-language, card-zones, game-store, table-panels, opponent, paced-view, turn-flow, automa, campaign, grid-map, content-pack, traceability) at the checkout's HEAD (into a temp folder, `node_modules` linked, fake ports in a temp ports file) and runs the game's own `npm run check` (tests, lint, typecheck, kit check, CI check, build). Card-harness is included through the declared dependency closure.

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

Template files: `src/engine/rules.ts` (`GAME`, `referenceRules`, `VERBS`, `TIMING`, `CHECKS`, `BASE_CARDS`, `loadContent`, `CONTENT`, `CARD_PROBE`, `cardText`, `viewOf`), `automa.ts` (`AUTOMA`, `TIERS`, `BOTS`), `campaign.ts` (`STEPS`, `startOf`, `logAfter`), `game.ts` (`REF`), `sim.ts`, `api.ts`; `src/ui/store.ts` (settings, saves, set-up spec, campaign, the game store), `src/ui/App.tsx` (routes menu, setup, play, settings, saves), `src/main.tsx`, `tests/`. Unstyled: no look decisions.

Adding a component to the contract: list it in `components`, use it in the template, cover it in `tests/`.

## Bounded executable acceptance

In the generated project, run `node tests/acceptance.ts`. The same entrypoint is invoked by `tests/evidence.test.ts`, so the generated project's ordinary test/check path executes it. Exit 0 means that this bounded reference's acceptance passed; it does not certify every printed clause or any external game.

`loadContent(records)` parses JSON through content-pack, validates record IDs/shapes, immediate effects and declared triggers, and constructs physical instances. `CONTENT` is the default loaded pack. Existing `GAME`/`CONTENT` callers retain the default rules. For another validated pack use `referenceRules(content)` so both play handlers and card-trigger timing consume that pack. The optional `triggerCap` limit is passed to the existing timing system. The zod import has an explicit, local lint allowance for synchronous schema validation; the engine import preset is otherwise unchanged.

`PRINTED` in `tests/acceptance.ts` is an independently authored inventory, including literal printed text and the expected Jab/Blow damage amounts. Expected values are never read from the executable `effect` records. A reviewer must check that inventory against the reference rules above. These are the two covered clauses:

| Clause | Independent expectation | Runtime and rule evidence |
| --- | --- | --- |
| Jab (`jab.1`, `JAB-01`) | Deal 2 damage. | Actual play action; life delta between clause begin/end; emitted damage; amount +1 mutant rejected. |
| Blow (`blow.1`, `BLOW-01`) | Deal 3 damage. | The same family and production action path with its independent amount; amount +1 mutant rejected. |
| Play legality (`PLAY-01`) | A card outside the acting hand cannot be selected. | Passing legal play plus a required rejected action; the assertion runner compares the complete observed state and requires no events on refusal. |

The probe notes begin, dispatch and end only outside dry runs. The clause delta excludes the routine end-of-turn hit. The named settled boundary requires the next seat's actual draw prompt and pending `may` task. Strict K592 physical-instance invariants run for ordinary engine actions too: every instance from the loaded pack must occur exactly once across zones. Life may cross zero during legal damage and is not constrained to be nonnegative.

The CLI controls below intentionally fail with exit 1; the test expects that failure and its diagnostic. They are evidence that a bad consumer result is rejected, not alternate passing profiles.

| Control | Failure demonstrated |
| --- | --- |
| `--wrong-amount` | Loader-valid Jab hit 4 reaches the real handler and contradicts the independent printed delta. |
| `--missing-content` | Jab is missing while the printed inventory still requires it. |
| `--missing-evidence` | Blow has no required executable rule-evidence binding. |
| `--missing-refusal` | Play legality lacks its required rejected-action control. |
| `--surviving-mutant` | An intentionally equivalent label-only mutant survives and fails the mutation gate. Normal acceptance uses amount-changing semantic mutants. |
| `--duplicate-instance` | The same physical card occurs in two actual engine zones. |
| `--trigger-cap` | Actual Mend in play exhausts an explicitly zero trigger budget when the opponent is hit. |
| `--invalid-content` | A negative hit is rejected before the suite can run. |
| `--invalid-mutant` | A negative-hit mutant is classified invalid, never counted as a kill. |
| `--error-mutant` | A loader-valid renamed card cannot be resolved by the fixture; that execution error is not counted as a kill. |

The report lists Rally's duration/boost, Ward's replacement/discard and Mend's optional trigger/refusal as remaining, with narrow explanations. They need separate independent runtime oracles and meaningful mutants before those exemptions can be removed. Their existing gameplay tests and the Mend factory/cap regressions do not close that work. Unsupported nonexempt shapes fail explicitly. If runtime evidence fails, independent rule assertions are reported as `null` (not run), not as passing.

## Compatibility matrix and next increments

This is the executable contract map, not a record of a particular CI run. The exact head's check output supplies the execution result.

| Components / entrypoints | Behaviors and configurations | Executed check path |
| --- | --- | --- |
| content-pack `loadText`; card-language verbs; game-owned `referenceRules` over engine-core | Default 20-card pack, an altered valid amount, altered Mend trigger, additional supported hit record | `tests/evidence.test.ts` and its actual `node tests/acceptance.ts` subprocesses |
| card-harness K760/K561; traceability K744; engine-core K592 | Two printed damage clauses; play/refusal; semantic mutants; invalid/error/survived controls; physical-instance and cap failures | Same acceptance entrypoint, included by the generated test/check path |
| game-store, turn-flow, card-zones, automa, campaign, sim-pool, replay-cli | Two-seat cards, may/pick prompts, triggers/replacements/durations, save/load/undo, worker/thread determinism, replay, hidden views, difficulty and campaign | `tests/smoke.test.ts` |
| app-frame, screens, prompt-host, table-panels, settings, saves | Click-driven menu/setup/play/settings/saves and undo | `tests/ui.test.tsx` |
| grid-map, engine-core, game-store `simGameOf`, sim-pool | Solo courier: walls/legal movement, shortest-path driver, mid-delivery save restore and completion | `tests/tactical.test.ts` |

Subsequent reference increments remain separate: dice placement needs explicit placement/lock/refusal rules; bag-builder needs draw/refill/return and instance-conservation contracts; narrative campaign needs branch and saved progression rules; presentation stress needs overlapping prompt/animation/input and cancellation contracts. They are not prerequisites for this card/tactical increment and are not claimed as covered by it.

## Use it in 10 lines

```ts
import { scaffold } from '../kit/scaffold/scaffold.js'
// what reference.test.ts does (run it: npx vitest run components/reference-game), then `npm run check` in the folder
const kit = 'C:/projects/game-kit'
const made = scaffold({ dir: 'C:/tmp/reference', id: 'reference', name: 'Reference', kit, ref: 'HEAD', ports: 'C:/tmp/ports.json', install: false, overlay: [`${kit}/components/scaffold/courier`, `${kit}/components/reference-game/template`], components: ['prompt-host', 'replay-cli', 'card-language', 'card-zones', 'game-store', 'table-panels', 'opponent', 'paced-view', 'turn-flow', 'automa', 'campaign', 'grid-map', 'content-pack', 'traceability'] })
console.log(made.dir)
```
