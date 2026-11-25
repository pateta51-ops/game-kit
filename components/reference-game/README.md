# reference-game

A small made-up card game kept in the kit as a contract test (K205, K276): when a component's interface drifts, the game stops compiling or its tests fail. Not pulled into games; it is generated, never copied.

## Rules for agents

**What it does:** A small made-up game kept as the kit's contract test.

**You must:**
1. Never pull or copy it into a game: it is generated into a temp folder by `reference.test.ts`.
2. For changes in game-kit, use the hosted PR check on the PR head as described in [AGENTS.md](../../AGENTS.md). For a game integration use that game’s check workflow.
3. When a component's interface changes, fix the template under `template/` so the generated game compiles and its `npm run check` passes.
4. To add a component to the contract list it in `components`, use it in the template, cover it in `tests/`.
5. Keep it unstyled: no look decisions in the template.

**Common mistakes:**
- Changing a component's interface and leaving `template/` as it was: the generated game no longer compiles and the kit's check fails.
- Using it as the start of a game: a game starts with `node kit.mjs new`.
- Running it on local Windows.


`reference.test.ts` makes it with `scaffold({ overlay: [template/], components: [...] })` (prompt-host, replay-cli, card-language, card-zones, game-store, table-panels, opponent, paced-view, turn-flow, automa, campaign) at the checkout's HEAD (into a temp folder, `node_modules` linked, fake ports in a temp ports file) and runs the game's own `npm run check` (tests, lint, typecheck, kit check, CI check, build).

The game (K276, replaces the K234 toy; one `defineGame` object, `REF`): two seats with life, a shuffled deck of 20 in card-zones, hidden hands of 3. A turn (turn-flow) is phases draw (you may draw 2: the pack's `may` and `draw`), main (play a card: `pick`) and end (strike 1). Jab and Blow hit 2 and 3 (a `would` damage batch); Rally: until end of turn your hits deal 2 more (a duration); Ward stays in play: if you would take damage, instead discard it (a replacement); Mend stays in play: when you take damage, you may heal 1 (a `when` trigger). State checks after each action: a seat at 0 life loses, a hand over 4 sheds its last card. The other seat is the automa (a priority table, a mode deck flipped each of its turns, tiers easy / normal / hard). After the last round the higher life wins. A campaign of two scenarios: winning the first gives the player 3 more life in the second. Menu and set-up (screens): seats human or automa, scenario, difficulty.

What the template's tests go through:
- game-store: a whole game through `createGameStore(REF)`, the automa seat answered by `REF.opponent` from its own view; one undo per click; save in the middle of a card effect (the pack's `may`), load, same prompt, same undo steps; autosave, export and import; no hidden card id in either seat's view at any state.
- engine systems on arranged states: turn-flow phases and seat order; the Mend trigger asks and heals; the Ward replacement; Rally ends at the turn boundary; the life and hand state checks.
- automa: the same `Bot` object answers in the store (`botOpponent`) and in sim-pool (`botDriverOf`), its deck flips and reshuffles, `automaLines`.
- campaign: scenario 1's result in the log (`logAfter`, `end`, `begin`) changes scenario 2's life; set-up: seats, scenario and difficulty start the game.
- card-language: game verbs `hit`, `heal`, `boost` beside `cardPack` verbs; `expectVerbs`, `validateEffect`, `validateWhen`, printed words.
- sim-pool and replay-cli from the same object (`game-store/sim.ts`, drivers `opponent`, `random`, `automa`): 15 games on two workers equal to the thread; goldens, view digests and recorded games.
- app-frame, screens, prompt-host, table-panels, settings, saves (jsdom): `#/play` answers may and pick by clicks, Undo, the log; `#/setup` starts the chosen game; the menu starts a campaign; `#/settings` and `#/saves`.

Template files: `src/engine/rules.ts` (`GAME`, `VERBS`, `TIMING`, `CHECKS`, `CONTENT`, `cardText`, `viewOf`), `automa.ts` (`AUTOMA`, `TIERS`, `BOTS`), `campaign.ts` (`STEPS`, `startOf`, `logAfter`), `game.ts` (`REF`), `sim.ts`, `api.ts`; `src/ui/store.ts` (settings, saves, set-up spec, campaign, the game store), `src/ui/App.tsx` (routes menu, setup, play, settings, saves), `src/main.tsx`, `tests/`. Unstyled: no look decisions.

Adding a component to the contract: list it in `components`, use it in the template, cover it in `tests/`.

## Use it in 10 lines

```ts
import { scaffold } from '../kit/scaffold/scaffold.js'
// what reference.test.ts does (run it: npx vitest run components/reference-game), then `npm run check` in the folder
const kit = 'C:/projects/game-kit'
const made = scaffold({ dir: 'C:/tmp/reference', id: 'reference', name: 'Reference', kit, ref: 'HEAD', ports: 'C:/tmp/ports.json', install: false, overlay: [`${kit}/components/reference-game/template`], components: ['prompt-host', 'replay-cli', 'card-language', 'card-zones', 'game-store', 'table-panels', 'opponent', 'paced-view', 'turn-flow', 'automa', 'campaign'] })
console.log(made.dir)
```
