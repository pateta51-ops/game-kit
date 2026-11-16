# traceability

Rule-citation gate. The game passes a `trace.config.json` (any subset of the options; `trace.config.example.json` shows the base ones) and runs `node kit/traceability/check-traceability.ts [--config path] [--strict] [--release] [--quiet] [--warn]`. Defaults are Jarl's check. Test titles are read with a TypeScript parse (the game's `typescript` package): the first argument of an `it`, `test` or `describe` call, so a call inside a string or a comment, or on another object (`helper.it(`), holds no title.

| Option (default) | What it does | Games that set it |
|---|---|---|
| `families`, `idTail` (`\d{2,3}`) | An id is a family (a regexp piece), a dash and the tail. `\d{2}` for two digits; `[A-Z0-9]+(?:-[A-Z0-9]+)*` with family `[A-Z][A-Z0-9]*` for word suffixes and one digit (`KW-FAST`, `SET-7`). A sub-letter in a title (`LVL-01a`) always names its id. | Unstoppable, EBR (generic); Imperium, STCC, Warp's (`\d{2}`) |
| `idsAtLineStart` (false) | Only the bold id that opens a list item, or the first cell of a table row, defines a rule. | Unstoppable, EBR |
| `deferredPrefixes` ([]), `deferred` ({}) | Ids never required. | Unstoppable `P2-`, EBR `CPN-`; Imperium's list |
| `extraRuleHeadings` ([]) | Headings outside the rules section whose ids are rules too. | EBR (`#### 4.4.8 Invariants`) |
| `countDescribe` (false) | `describe` titles count. | Unstoppable, Imperium, STCC, Warp's, Rome |
| `countSkipped` (false) | `.skip`, `.todo`, `.fails` titles count. | the same five |
| `hollowTitlePrefixes` ([]) | Titles starting with one of these count for none. | EBR (`TODAY`) |
| `maxIdsPerTitle` (6) | Titles with more ids count for none; 0 is no cap. | 0: the same five |
| `requireComment` (true) | false: a test title alone covers an id. | Unstoppable, Imperium, STCC, EBR |
| `reportUnknown` (true) | false: an undefined id in a title is not a finding. | Unstoppable, Imperium, STCC, Warp's, EBR |
| `scenarioPrefix` (`SC`), `scenarioDigits` (`3`) | `''` turns the scenario check off; digits is the `\d{…}` count (`2`, `1,`). | off: Unstoppable, Imperium, STCC, Warp's, Rome; `2,3`: EBR |
| `scenarios` (`once`) | `once`: at most one title per scenario, missing ones are fine. `required`: at least one title each, unless its row (or a `pending: <phase>` line under its heading) waits for a phase not yet merged. | EBR |
| `pending` | The pending file (id to batch); `--release` fails while it is not empty. | STCC, Warp's, Rome, Jarl |
| `phaseTable` (`''`), `progress`, `phaseDone`, `strictFromPhase` | Phase mode: a family is due once the phase listing it in the table under this heading (phase in column 1, families in column 3) matches `phaseDone` in the progress file; a rule line with `pending: <phase>` waits for that phase; a family in no row is a finding; strict once `strictFromPhase` is merged. | EBR |
| `strictIdEnd` (false) | true: nothing may follow the id, so `R-05a` does not name `R-05`. | EBR |
| `skipInsideSkippedDescribe` (false), `ignoreTemplateSubstitutions` (false) | Tests inside a `describe.skip`/`xdescribe` count for none; a title built with `${…}` or `+` counts for none (by default it counts as written, a `+` title by its first string). | EBR |
| `rejectTemplateTitles` (false) | K183: a test title written as a template literal with `${` counts for none and is reported as a hollow title (the id in it is not covered). | EBR |
| `citeFiles` (`[]`) | Folders: every non-test source file under them must cite at least one rule id of the plan in a comment, else one finding lists the files (fails in strict mode); the folders are read even when outside `sourceDirs`. | Under Falling Skies (`src/engine/phases`, `rules`, `abilities`) |
| `testFilePattern` (`''`) | A regexp the file names under `testDirs` must match (`\.(test\|spec)\.tsx?$`); empty reads every `.ts(x)`. | EBR |
| `staleFails` (true) | false: a pending id the plan does not define is reported, not failed. | STCC |
| `rulePendingInlineOnly` (false) | Phase mode: a rule waits only by `pending: <phase>` on its own line in the rules section; bare `pending:` lines then count for scenario rows only. | EBR |
| `unlistedCountsDeferred` (false) | Phase mode: deferred ids also need their family in the phase table. | EBR |
| `idPattern` (`''`) | The whole id regexp, as the game's plan gives it; `families` and `idTail` are then not read. Its own `\b` decides what may stand before an id: after a dash yes (`X-SET-01` defines `SET-01`), after an underscore no. | STCC, Imperium |
| `headingDot` (false) | true: only `## 3.` with the dot opens or closes a section. | STCC, Imperium, Unstoppable |
| `countsLine` (false) | Prints `counts: n rules defined; n in implemented families (…); n cited or pending; n of n scenarios tested or pending.` | EBR |
| `rejectedTitles` (false) | Prints the ids named only by titles that count for none, each with why (skip or todo, expected failure, too many ids). | EBR |
| `scenarioReport` (false) | The missing-scenario line gives the count and `(pending: <phase>, which is merged)` beside a row whose phase has merged. | EBR |

Imperium's check is strict without a flag: its npm script passes `--strict`.

Not covered:
- EBR's missing-family check reads only the bold list ids of the rules section; with `unlistedCountsDeferred` the kit also reads table rows and `extraRuleHeadings`.
- EBR defines scenario rows with any digit count but finds them in titles with 2 or 3 digits; `scenarioDigits` is one count for both (`2,3`).
- STCC and Imperium scan test files as text: an id in a fixture string or a title after `helper.it(` counts there and not here; a title after `` it.each`…` `` counts here and not there.
- The report wording differs from every game's.

## Use it in 10 lines

```sh
node kit/traceability/check-traceability.ts --config trace.config.json   # test titles must cite rule ids
```
