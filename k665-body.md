K665: card-harness `restrictionProblems` finds restrictions nested anywhere in a record's effect tree (before, only top-level keys were read). README rule 34 names what is walked.

The failing test is in its own first commit (4 of 6 failed before the fix: `if -> pay -> pay { optional }`, `eachPlayer effects[]`, an `upgraded` branch, a nested restriction needing a `why`).

Guarded lines, each deleted/reverted in turn with a test failing:
- the per-node loop in the "no printed source" check (`for (const n of all(r))`): "a nested restriction with no printed words" fails
- the printed-word check reading nested nodes (`all(r).some(... val(n[k]) === v)`): the three nested tests fail
- the lasting-duration check reading nested nodes (`!all(r).some((n) => n[dk] !== undefined)`): "a lasting record may carry its duration in a nested step" fails

Existing tests are unchanged. Top-level and missing-at-every-depth cases still behave as before.

Departures: none
