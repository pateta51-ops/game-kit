# coverage-report

Which card-language constructs (verbs, triggers, conditions: any string a card names) a game's pack uses and lacks, and which cards use one the game has no handler for: a pure function, a CLI and an unstyled page.

## Rules for agents

**What it does:** Which card-language constructs (verbs, triggers, conditions) a pack uses and lacks, and which cards use one the game has no handler for.

**You must:**
1. Call `coverageReport({ cards, id, universe, handlers })`; the default `constructsOf` collects strings under the keys `op` and `on` (any nesting), so pass your own `constructsOf` if constructs live elsewhere.
2. Build `universe` from the language registry (`Object.keys(VERBS).map((k) => 'op:' + k)`) and `handlers` from what the game runs; a used construct outside `handlers` is `unhandled` (omit `handlers` to skip).
3. In the CLI the module must default-export the input: `node kit/coverage-report/cli.ts <module> [--json] [--strict]`; use `--strict` in the check chain to exit 1 on an unhandled construct.
4. Draw the page with `CoverageReportView` from `ui`; it is unstyled, so style `data-construct` and `data-handled`.

**Common mistakes:**
- Running the CLI with no module: it prints usage and exits 2.
- Omitting `universe`: nothing is reported `unused`.


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
