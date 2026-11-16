# reference-game

A tiny made-up card game kept in the kit as a contract test (K205): when a component's interface drifts, the game stops compiling or its tests fail. Not pulled into games; it is generated, never copied.

`reference.test.ts` makes it with `scaffold({ overlay: [template/], components: [...] })` (prompt-host, replay-cli, card-language, card-zones, game-store, table-panels, opponent, paced-view) at the checkout's HEAD (into a temp folder, `node_modules` linked, fake ports in a temp ports file) and runs the game's own `npm run check` (tests, lint, typecheck, kit check, CI check, build; about 15 s).

The game (K234: one `defineGame` object, `REF`): two seats, a shuffled deck of 0..5 twice (0 is wild) in card-zones, hidden hands of 3. A turn: play a card (`pick`) to the discard; a wild asks its worth (`amount`, an asking verb with `resume`); then you may draw (the pack's `may` and `draw`). First to 12 wins; a seat with no card ends the game on score.

What the template's tests go through:
- game-store: a whole game through `createGameStore(REF)`, the other seat answered by `REF.opponent` from its own view; one undo per click; save in the middle of a card effect (the pack's `may`), load, same prompt, same undo steps; autosave, export and import; no hidden card id in either seat's view at any state (card-zones `hiddenFrom`, opponent `viewLeaks`).
- card-language: game verbs `score` and `wild` beside `cardPack` verbs; `expectVerbs`, `validateEffect`, printed words.
- sim-pool and replay-cli from the same object (`game-store/sim.ts`): 16 games on two workers equal to the thread; goldens and recorded games replayed hash by hash.
- settings, app-frame, prompt-host, table-panels (jsdom): `#/play` answers pick, amount and may by clicks, Undo, the log panel, game over; `#/settings` and `#/saves`.

Template files: `src/engine/rules.ts` (`REF`, `GAME`, `VERBS`, `cardText`, `viewOf`, `greedyPicks`), `src/engine/sim.ts` (`simGame`, `specs`), `src/engine/api.ts`, `src/ui/store.ts` (settings schema, saves, the game store), `src/ui/App.tsx` (routes menu, play, settings, saves), `src/main.tsx`, `tests/`. Unstyled: no look decisions.

Adding a component to the contract: list it in `components`, use it in the template, cover it in `tests/`.

## Use it in 10 lines

```ts
import { scaffold } from '../kit/scaffold/scaffold.js'
// what reference.test.ts does (run it: npx vitest run components/reference-game), then `npm run check` in the folder
const kit = 'C:/projects/game-kit'
const made = scaffold({ dir: 'C:/tmp/reference', id: 'reference', name: 'Reference', kit, ref: 'HEAD', ports: 'C:/tmp/ports.json', install: false, overlay: [`${kit}/components/reference-game/template`], components: ['prompt-host', 'replay-cli', 'card-language', 'card-zones', 'game-store', 'table-panels', 'opponent', 'paced-view'] })
console.log(made.dir)
```
