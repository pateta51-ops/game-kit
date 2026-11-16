# boundary-check

Three small pure helpers from outside ideas (written new). No game types.

| Helper | Use |
|---|---|
| `boundaryFile(forbidden)` | Text for a `*.check.ts` file: one `@ts-expect-error` import per internal path. Run `tsc` on it; if a path ever becomes importable, `tsc` reports the unused directive. For "UI never touches the engine" freezes. |
| `violationList(vs)` | `{ rule, text, links?, severity? }[]` from the view: repeats dropped, errors first. The screen lists them with the links and never blocks the move. |
| `catalogueCheck(cards, id, rules)` | Each card against each `{ name, fails(card) }`; returns `id: rule: why` lines. One test loops the whole catalogue (a card with victory points must show them). |

Its own component: the three checks need no card-language, scenario or gate runner types, so they fit neither card-harness nor check-runner.

Not here: the `query` channel for derived data (needs `engine-core`) and prompt-kind `cast` for card tests (needs
`card-harness`); both have open PRs, so they are later work.

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
