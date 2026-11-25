# boundary-check

Four small pure helpers from outside ideas (written new). No game types.

## Rules for agents

**What it does:** Four small pure helpers: a type-check file that proves forbidden imports stay forbidden, a violation list for screens, a card catalogue check, and a release-ladder check for kit imports.

**You must:**
1. Write the output of `boundaryFile(forbidden)` to a `*.check.ts` file and run `tsc` over it; each path must stay unimportable, or `tsc` reports the unused `@ts-expect-error`.
2. Run `catalogueCheck(cards, id, rules)` from one test that loops the whole catalogue; a rule's `fails(card)` returns a reason string, or null when the card is fine.
3. Pass `releaseCheck(release, files)` the game's release (`1.0` to `1.3`) and its source files as path-to-text; loop `src/` through it in a game test.
4. Show `violationList(vs)` on the screen with its links, and never block the move because of it.
5. Keep all types of your own cards in the game; the helpers carry none.

**Common mistakes:**
- An unknown release string: `releaseCheck` / `releaseForbidden` throw `unknown release`, listing the valid ones.
- Importing motion-frame, effect-library, pieces-3d-verbs, sound-player or voice in a 1.0 game: the release check lists each such import.

| Helper | Use |
|---|---|
| `boundaryFile(forbidden)` | Text for a `*.check.ts` file: one `@ts-expect-error` import per internal path. Run `tsc` on it; if a path ever becomes importable, `tsc` reports the unused directive. For "UI never touches the engine" freezes. |
| `violationList(vs)` | `{ rule, text, links?, severity? }[]` from the view: repeats dropped, errors first. The screen lists them with the links and never blocks the move. |
| `catalogueCheck(cards, id, rules)` | Each card against each `{ name, fails(card) }`; returns `id: rule: why` lines. One test loops the whole catalogue (a card with victory points must show them). |
| `releaseCheck(release, files)` | K238: the game's `release` (`1.0` to `1.3`, the release ladder) and its source files (path to text); lists each import of a kit component that comes later (1.0: motion-frame, effect-library, pieces-3d-verbs, sound-player, voice). `releaseForbidden(release)` names them. A game test loops its `src/` through it. |

Its own component: the three checks need no card-language, scenario or gate runner types, so they fit neither card-harness nor check-runner.

Use [engine-core](../engine-core/README.md) for the derived-data `query` channel and [card-harness](../card-harness/README.md) for `Scenario.cast` in card tests.

## Use it in 10 lines

```ts
import { catalogueCheck, violationList } from '../kit/boundary-check/index'

type Card = { id: string; vp?: number; shownVp?: boolean }
const lines = catalogueCheck<Card>(
  [{ id: 'c1', vp: 2, shownVp: false }],
  (c) => c.id,
  [{ name: 'vp-shown', fails: (c) => (c.vp && !c.shownVp ? 'victory points not shown' : null) }],
)
console.log(lines, violationList([{ rule: 'R1', text: 'Not enough gold', severity: 'error' }]))
```
