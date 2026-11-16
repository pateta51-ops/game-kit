# reference-game

A tiny made-up card game kept in the kit as a contract test (K205): when a component's interface drifts, the game stops compiling or its tests fail. Not pulled into games; it is generated, never copied.

`reference.test.ts` makes it with `scaffold({ overlay: [template/], components: ['prompt-host', 'replay-cli', 'card-language'] })` at the checkout's HEAD (into a temp folder, `node_modules` linked, fake ports in a temp ports file) and runs the game's own `npm run check` (tests, lint, typecheck, kit check, CI check, build; about 15 s).

The game: two seats, a shuffled deck of 0..5 twice (0 is wild), hidden hands of 3. A turn: play a card (`pick`); a wild asks its worth (`amount`); then you may draw (`may`). First to 12 wins; a seat with no card ends the game on score.

What the template's tests go through:
- card-language: card effects are data (`score`, `wild`); one verb table runs them and prints their words (the pick buttons show them); `expectVerbs`, `validateEffect`.
- engine-core: rules, tasks, prompts with a kind and a seat, invariants on, a played game replayed to the same hash.
- sim-pool: 16 games on two workers (greedy and random drivers), the same hashes as `playOne` in the thread. The greedy driver reads `viewOf(state, seat)` only; a test checks that the other hand never changes its choice.
- replay-cli: goldens written and checked (`checkGoldens`), games recorded and replayed hash by hash (`recordGames`, `replayGames`).
- saves: save while a `may` prompt is open, load, the same prompt is open and answers; autosave; export and import.
- settings: the chosen seat is the one asked, the other seat answers itself; reset.
- app-frame and prompt-host (jsdom): the app at `#/play` answers pick, amount and may by clicks; `#/settings` and `#/saves` draw their screens.

Template files: `src/engine/rules.ts` (`GAME`, `VERBS`, `cardText`, `viewOf`, `greedyPicks`), `src/engine/sim.ts` (`simGame`, `specs`), `src/engine/api.ts`, `src/ui/store.ts` (settings schema, saves, a zustand game store), `src/ui/App.tsx` (routes menu, play, settings, saves), `src/main.tsx`, `tests/`. Unstyled: no look decisions.

Adding a component to the contract: list it in `components`, use it in the template, cover it in `tests/`.

## Use it in 10 lines

```ts
import { scaffold } from '../kit/scaffold/scaffold.js'
// what reference.test.ts does (run it: npx vitest run components/reference-game), then `npm run check` in the folder
const kit = 'C:/projects/game-kit'
const made = scaffold({ dir: 'C:/tmp/reference', id: 'reference', name: 'Reference', kit, ref: 'HEAD', ports: 'C:/tmp/ports.json', install: false, overlay: [`${kit}/components/reference-game/template`], components: ['prompt-host', 'replay-cli', 'card-language'] })
console.log(made.dir)
```
