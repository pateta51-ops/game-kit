# Coverage table

Compare source-bound Vitest line and branch coverage by component using retained successful GameKit workflow evidence.

## Rules for agents

1. Use the GameKit checkout commands in the [coverage evidence recipe](../../docs/recipes/agent-workflow.md#coverage-evidence). For a candidate with a hosted run, select the newest eligible successful retained main ancestor with `scripts/coverage-baseline.mjs`. Verify the run, attempt, archive digest and raw payload before using the result.
2. Read the observed before and after scopes and the like-for-like rows separately. The observed rows use all reported files at each pin. Compare only files with identical tracked source bytes and equal positive denominators for the relevant metric. Read the JSON report for the scope and exclusion lists. An omitted source is absent from the instrumented summary even when it exists in Git.
3. Keep missing or incompatible evidence unknown. The comparator binds all tracked root and nested `tsconfig.json` files. Configs with unsupported syntax, `extends` or project `references` leave the comparison unknown because their effective transform settings are unresolved. A loss in a partially comparable subset is still visible, while a flat subset cannot speak for excluded files. Coverage is informative and has no blocking threshold. Inspect the independent rule and acceptance tests when evaluating correctness.
4. Replay historical archives with a repository that has both Git objects. Verify the candidate workflow run and archive against GitHub metadata, then independently extract the two named members. Run the existing comparator against those candidate bytes and the selected baseline directory. It validates the embedded reporter against each original Git tree even if the current comparison code has changed.

From the checkout root, supply the following module on standard input to `node --input-type=module - <candidate-dir> <baseline-dir>`.

```js
import { readFileSync } from 'node:fs';
import { compareCoverage } from './scripts/coverage-compare.mjs';

const candidate = process.argv[2];
const baseline = process.argv[3];
const payload = JSON.parse(readFileSync(candidate + '/coverage-evidence.json', 'utf8'));
const summary = readFileSync(candidate + '/coverage-summary.json');
const report = compareCoverage(process.cwd(), payload, summary, baseline);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.baseline.status === 'verified' ? 0 : 1;
```

## Retained main-run replay

Both runs completed successfully at attempt 1 and the full check jobs executed `npm ci`. The exact lock pins Vitest and `@vitest/coverage-v8` to 5.1.0. Both captures record Node 22.23.5 and reporter version 2 SHA-256 `433cfc833a4f2ed756e5b7bcc3f3fedbe3e132cfb24e23954923287d0f81f45f`. The comparator verified both clean source bindings, both trees, the configuration and dependency hashes, and all 699 measured source files per revision. It also matched the pinned TypeScript transform configuration, workflow, Node selection file and DOM setup. [Baseline workflow](https://github.com/pateta51-ops/game-kit/actions/runs/45885874469) · [Candidate workflow](https://github.com/pateta51-ops/game-kit/actions/runs/45889441212)

| Role | Commit | Git tree | Archive ID |
| --- | --- | --- | --- |
| Baseline | `6bfd53e687534fd89bbad9a3484df90c34e21f30` | `4462b31e47eeacd44cd96beffebe7349a4846f7d` | `15150406564` |
| Candidate | `18d67aee7e56805ff5d54f10a5e3e20a45784412` | `5125f11955e20a1d5b09e84e3d72b2d25e3714d9` | `15151048528` |

| Role | Archive SHA-256 | Raw summary SHA-256 |
| --- | --- | --- |
| Baseline | `247e18e9537d9a062e17fec0a901bd340afa8f7b2a64082f6135837d14f1133c` | `ffdb4fe179c75e4305a4bcb942ce0c96add1098b6cb369e2448b0b2fb5e5641b` |
| Candidate | `cd8f1d9a5a07ae342c37dc6c8d340e8635fa3856e8e161ce9c4304fbf9b066cc` | `ce91a9ca9b2b9e5d5c6cc58b2b86c99128654f7abeaec91b7c7c7738ecd50b5b` |

| Component | Observed files before → after | Observed lines before → after | Observed branches before → after | Comparable files lines / branches | Comparable covered-count and pp deltas lines / branches |
| --- | ---: | --- | --- | ---: | --- |
| engine-core | 53 → 53 | 1783/1833 (97.27%) → same | 1775/1935 (91.73%) → same | 47 / 44 | 0, 0 / 0, 0 |
| game-store | 5 → 5 | 133/210 (63.33%) → same | 133/225 (59.11%) → same | 5 / 5 | 0, 0 / 0, 0 |
| sim-pool | 33 → 33 | 1179/1249 (94.40%) → same | 1222/1437 (85.04%) → same | 30 / 28 | 0, 0 / 0, 0 |
| card-language | 10 → 10 | 1600/1686 (94.90%) → same | 2235/2678 (83.46%) → same | 10 / 9 | 0, 0 / 0, 0 |
| card-harness | 29 → 29 | 1501/1562 (96.09%) → same | 1742/1962 (88.79%) → same | 26 / 26 | 0, 0 / 0, 0 |
| scaffold | 0 → 0 | Unavailable | Unavailable | 0 / 0 | Unknown |
| dice-patterns | 2 → 2 | 157/160 (98.13%) → 163/166 (98.19%) | 251/270 (92.96%) → 257/276 (93.12%) | 1 / 1 | 0, 0 / 0, 0 |
| target-arrow | 5 → 5 | 305/326 (93.56%) → same | 155/194 (79.90%) → 154/194 (79.38%) | 3 / 3 | 0, 0 / −1, −0.5155 |

There were no additions or removals in the measured scope. The five measured critical components have flat comparable counts. Files with zero denominators for a metric are excluded for that metric. The two tracked scaffold declarations were absent from both summaries, and the scaffold JavaScript is outside the configured scope. The changed dice-patterns source accounts for the observed gain and is excluded from the stable subset.

The target-arrow branch loss is on unchanged `components/target-arrow/TargetArrow.tsx`. It is visible in both comparisons. One pair establishes a measured count difference without establishing its cause or a change in rule correctness.

The first PR run with changed reporter bytes will be incompatible with captures from the old reporter under the established policy. The retained pair establishes the positive case while the next compatible successful main capture becomes available.
