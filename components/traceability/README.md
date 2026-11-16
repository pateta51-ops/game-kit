# traceability

Rule-citation gate. The game passes a `trace.config.json` (any subset of the options; `trace.config.example.json` shows the base ones) and runs `tsx kit/traceability/check-traceability.ts [--config path] [--strict] [--release] [--quiet] [--warn]`. Defaults are Jarl's check.

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
| `skipInsideSkippedDescribe` (false), `ignoreTemplateSubstitutions` (false) | Tests inside a `describe.skip`/`xdescribe` count for none; a template title with `${…}` counts for none. | EBR |
| `testFilePattern` (`''`) | A regexp the file names under `testDirs` must match (`\.(test\|spec)\.tsx?$`); empty reads every `.ts(x)`. | EBR |
| `staleFails` (true) | false: a pending id the plan does not define is reported, not failed. | STCC |
| `rulePendingInlineOnly` (false) | Phase mode: a rule waits only by `pending: <phase>` on its own line in the rules section; bare `pending:` lines then count for scenario rows only. | EBR |
| `unlistedCountsDeferred` (false) | Phase mode: deferred ids also need their family in the phase table. | EBR |

Imperium's check is strict without a flag: its npm script passes `--strict`.

Not covered:
- EBR parses test files with TypeScript; the kit scans text, so a call written inside a string or after code on a commented line can be read differently.
- EBR's missing-family check reads only the bold list ids of the rules section; with `unlistedCountsDeferred` the kit also reads table rows and `extraRuleHeadings`.
- EBR prints the ids named only by rejected titles; the kit does not.
- EBR defines scenario rows with any digit count but finds them in titles with 2 or 3 digits; `scenarioDigits` is one count for both (`2,3`).
- The kit's id match refuses a letter, digit or dash before the id; the games' `\b` allows a dash (`X-SET-01` names `SET-01` there).
- Unstoppable and Imperium need the dot in `## 3.`; the kit also accepts `## 3 Rules`.
- The report wording differs from every game's.
