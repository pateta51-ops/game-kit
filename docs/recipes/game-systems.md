# Wire the game systems

Use after `kit.mjs new`, when the stub engine becomes the real game. Each row: the need, the component, the recipe with the steps, and the file of the reference game that does it. The reference game is not pulled into games: read it in the kit checkout at `components/reference-game/template/`, where each file is a `.tpl` (the names below are the generated ones, e.g. `rules.ts` is `src/engine/rules.ts.tpl`; its [README](../../components/reference-game/README.md) says what each test proves).

| Need | Component | Recipe | Reference file |
|---|---|---|---|
| The engine: state, handlers, prompts, seeded random | `engine-core` (`kernel.ts`) | [new-game](new-game.md) step 4 | `src/engine/rules.ts` (`GAME`) |
| Rounds, turns, phases, passing | `turn-flow` | [turn-flow](turn-flow.md) | `rules.ts` (`flowHandlers`, `startFlow`) |
| Card effects as data, standard verbs | `card-language` (`pack.ts`) | [card-effect](card-effect.md) | `rules.ts` (`VERBS`, `cardText`) |
| "When X, do Y" printed on a card | `card-language` (`when.ts`, `cardTriggers`) | [card-effect](card-effect.md) step 0c | `rules.ts` (Mend) |
| Damage, draws, moves that others can prevent or replace | `engine-core` (`timed.ts`: `would`, replacement) | [timing](timing.md) | `rules.ts` (`TIMING`, Ward) |
| Attacks, armor, and defeat | `combat` (`combatHappen`, `queueCombat`) | [combat](../../components/combat/README.md) | synthetic engine in `components/combat/combat.test.ts` |
| "Until end of turn" | `engine-core` `addEffect` + `turn-flow` boundaries | [turn-flow](turn-flow.md) step 5 | `rules.ts` (Rally) |
| State checks (a seat at 0 loses, hand limit) | `engine-core` `cfg.checkpoint` (`StateCheck`) | [timing](timing.md) step 6 | `rules.ts` (`CHECKS`) |
| Hands, decks, hidden zones, each seat's view | `card-zones` | [card-table](card-table.md) | `rules.ts` (`viewOf`) |
| Card and scenario data with checked ids and references | `content-pack` | [content-pipeline](content-pipeline.md) | none (the reference game's data is inline) |
| One game object, one store, undo, autosave | `game-store` | [game-store](game-store.md) | `src/engine/game.ts` (`REF`), `src/ui/store.ts` |
| An opponent that plays by player rules | `opponent` (`opponentBot`) | [ai-opponent](ai-opponent.md) | none |
| An official solo automa | `automa` | [automa](automa.md) | `src/engine/automa.ts` |
| The same bot in the store and the sim | sim-pool `Bot`, game-store `botOpponent` / `botDriverOf` | [ai-opponent](ai-opponent.md) | `game.ts`, `src/engine/sim.ts` |
| Linked scenarios | `campaign` | this page, below | `src/engine/campaign.ts`, `src/ui/store.ts` |
| Menu and new-game set-up | `screens` | [saves-settings-frame](saves-settings-frame.md) | `src/ui/App.tsx`, `store.ts` (`SPEC`) |
| Settings, saves, routes | `settings`, `saves`, `app-frame` | [saves-settings-frame](saves-settings-frame.md) | `store.ts`, `App.tsx` |
| Prompts on screen | `prompt-host` | [prompts](prompts.md) | `App.tsx` |
| Fuzz, many games, balance | `sim-pool` | [simulations](simulations.md) | `sim.ts` |

## Campaign
1. Steps as data: `Step[]` and `linear(STEPS)` for a fixed order (the graph runner for branches: [campaign README](../../components/campaign/README.md)).
2. The log is plain data beside the save: `newCampaign`, then `begin` / `end` around each scenario; write results with `record`, `addCount` (pure: each returns a new log).
3. Set-up of the next scenario reads the log (`count`, `has`), as `startOf(seed, start, log)` does in the reference game.
4. For optional dates, schedule stable between-scenario instruction IDs with `scheduleCalendarEntry`. Resolve the date with `startCalendarDay` before calling `begin` so a scenario retry keeps the resolved calendar snapshot.
5. For changing attendance or shared deck inventory, pass the box and the whole batch of edits to `changeCampaignRoster`. Use the active players and their decks from `campaignRoster(log)` at setup.
6. Test that scenario 1's result changes scenario 2's setup (the reference game's `tests/smoke.test.ts`).

What a rule says (turn order, who chooses, what a card does) is never decided here: ask the arbiter or write a "Rules question".
