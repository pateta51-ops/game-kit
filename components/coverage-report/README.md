# coverage-report

Which card-language constructs (verbs, triggers, conditions: any string a card names) a game's pack uses and lacks, and which cards use one the game has no handler for: a pure function, a CLI and an unstyled page.

- `coverageReport({ cards, id?, constructsOf?, universe?, handlers? })` returns `{ used, unused, unhandled, empty }`. A construct is a string such as `op:gain`. `constructsOf` is the game's walk of one card; default `walkConstructs(card, keys)` collects every string under the keys `op` and `on` (any nesting).
- `universe`: the language's registry (for card-language, `Object.keys(VERBS).map((k) => 'op:' + k)`); constructs no card uses are `unused`. `handlers`: constructs the game runs; a used one outside it is `unhandled` (omit to skip).
- CLI: `node kit/coverage-report/cli.ts <module> [--json] [--strict]`; the module default-exports the input; `--strict` exits 1 on an unhandled construct. `runCli(input, argv)` is the same as a function.
- Page: `CoverageReportView` from `ui.ts` (React, no styling; `data-construct`, `data-handled` on rows).

## Use it in 10 lines

```ts
import { coverageReport, formatReport, runCli } from '../kit/coverage-report/index'
import { CoverageReportView } from '../kit/coverage-report/ui'

const input = {
  cards: [{ id: 'a', effect: [{ op: 'gain' }] }, { id: 'b', effect: [{ op: 'warp' }] }],
  id: (c: { id: string }) => c.id,
  universe: ['op:gain', 'op:warp', 'op:draw'],
  handlers: ['op:gain'],
}
const report = coverageReport(input) // unhandled: op:warp on card b; unused: op:draw
console.log(formatReport(report), CoverageReportView({ report }))
process.exitCode = runCli(input, ['--strict']) // 1
```
