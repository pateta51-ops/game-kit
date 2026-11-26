# Test card clauses with semantic mutations

Import `runClauseMutations`, `contentGate` and the spec types from `kit/card-harness`. The [complete example](mutation-example.ts) plays a synthetic card through `createGame` and `applyAction` from `engine-core`. Run both modes from the kit checkout with Node 22.18 or later.

```sh
node components/card-harness/mutation-example.ts
node components/card-harness/mutation-example.ts --controls
```

The first command exits 0. The unchanged spec rows catch an award of three points instead of two and a condition that fires too early. The second command adds an equivalent condition that survives, an invalid record rejected by schema validation, a valid record that causes an engine overflow, and a printed clause with no test or mutant. Its content gate exits 1. Both runs report the justified exemption for the display-only clause. The [tests](mutation-example.test.ts) execute these same commands and assert their exit codes and diagnostics.

## Wire a game's validation

1. Start with the printed clause catalogue. Pass all of its IDs in `requiredLines`, including clauses with no implementation record. The runner also inventories each record's `line` or `lines`, or the result of `game.lineOf(record)`. Each record needs at least one ID. Repeating an ID in one record or in `requiredLines` is an error. Several records may own one clause.
2. Use the same `SpecGame<R, L, A, E, S>` and `SpecRow<L, A, E>` as `cardSpecs`. Each row supplies `{ line, layout, act, expect }` and may have a `name`. In `game.play(layout, act, records, lenient)`, build a fresh game from the supplied records and apply the action. Use `game.check(result, expectation)` to return a failure message or `undefined`. Let engine errors propagate so the runner can report them. Keep inputs structured-cloneable.
3. For each executable clause choose semantic changes to its amounts, conditions, costs, order or targets. Each `ClauseMutation<R>` supplies `{ id, line, recordIndex, mutate }`. The index points to an original record that owns the line. The callback gets a fresh copy of that record and returns a replacement or `null` to remove it. Keep the original expectations for every run. Give a clause an `exempt: { [line]: reason }` entry only when mutation is inappropriate. An exemption needs a known ID, a specific reason, and zero rows or mutants.
4. Call `runClauseMutations(game, rows, mutations, { validate, requiredLines, exempt })`. `validate` returns schema problems for a record collection. The original records and all baseline expectations must pass. Inspect `results` for per-mutant status and details, `missing` for clauses without executable rows or mutants, and `exempted` for accepted reasons. Convert each `problems` entry to a `contentGate` pack issue with `severity: 'error'`, and exit nonzero on `gate.failed` or a thrown error. A test kills a mutant by observing a failed expectation. Invalid mutants and engine errors fail the gate.

The game owns the semantic operators, expected observations and exemption reasons. Have the rules arbiter verify those choices against the printed clauses.
