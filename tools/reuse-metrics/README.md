# reuse-metrics

Local, read-only measurement of locked kit availability, static references and explicitly supplied build telemetry across game repositories.

## Rules for agents

**You must:**
1. Run from a kit checkout with TypeScript installed: `node tools/reuse-metrics/report.mjs <game-dir> [<game-dir> ...]`. Pass only game directories the owner authorizes.
2. Use the lock for installed availability. Use static reference lists to inspect literal relative imports and re-exports in `src/` and `tests/`. Referring to a component by value and observing its execution are separate measurements. CLI tools, transitive dependencies, aliases, dynamic imports and scripts can escape static reference counts.
3. Supply optional build telemetry in a local `kit-reuse-metrics.json` at the game root. Record the revisions, measurement window, protocol, classification and provenance described below. Omit unknown values.
4. The report contains no game names, source text or absolute paths. It may still disclose private usage and costs; keep the output and input telemetry local unless the owner expressly authorizes sharing.
5. Use a controlled baseline for savings. Treat the reported differences as the outcome of the supplied comparison. Claims about what caused the difference require independent evidence.

## Measurement input

The file is optional. An omitted file or an empty object produces a static scan with missing telemetry. This synthetic example shows the format.

```json
{
  "sourceRevision": "2222222222222222222222222222222222222222",
  "kitRevision": "1111111111111111111111111111111111111111",
  "window": {
    "start": "2026-01-01T00:00:00Z",
    "end": "2026-01-02T00:00:00Z",
    "protocol": "synthetic-playable-task"
  },
  "metrics": {
    "inputTokens": { "kind": "measured", "value": 100, "provenance": "synthetic-usage-record" }
  },
  "runtimeAdoption": { "engine-core": "synthetic-runtime-trace" }
}
```

- `sourceRevision` is the full Git SHA of the game source measured. `kitRevision` must equal the kit lock's full commit SHA. The source SHA and provenance labels come from the operator's records. The tool validates their format and the kit lock match.
- `window` records the shared UTC collection period `[start, end)` and the protocol used. Use the same protocol label only when the work scope, measurement method, and inclusion rules match. Protocol and provenance labels contain letters, digits, dots, underscores or hyphens. Keep the underlying records local and avoid sensitive labels.
- Supported metric keys are `inputTokens` (total including cached), `outputTokens`, `cachedInputTokens`, `costUsd`, `minutesToPlayable`, `failedCiRuns`, and `ruleDefects`. Use `measured` for directly recorded values, `estimated` for approximations, and `inferred` for values derived indirectly from other evidence. `provenance` labels the source record or derivation for each quantity. Values are nonnegative and finite, and counters must be safe integers.
- Optional `baseline` uses the same `sourceRevision`, `kitRevision`, `window` and `metrics` fields. Use `kitRevision: "none"` for a measured baseline without a kit. The start, end and protocol must match before the report computes any savings. It subtracts the current value from the baseline for metrics that both directly measured. An absent baseline, incompatible window, or absence of measured pairs has an explicit comparison status and no savings. A negative difference indicates an increase.
- Optional `runtimeAdoption` maps an installed component to the provenance label of an observed runtime record from the same revisions and window. An absent map reports unknown adoption. Static `*RuntimeReferenced` lists use imports or exports that may execute at runtime. `*TypeOnlyReferenced` lists cover components with exclusively type syntax in that scan. Neither list measures execution.

## Report and migration

The CLI prints per-game reports in argument order and a cross-game summary. Runtime observations are counted separately from static references, with the number of games supplying runtime observations shown as `gamesWithRuntimeObservations`. Current totals group measured, estimated and inferred values separately, with `reportedGames` and `sum` per group and a `missingGames` count per metric. `sum: null` means that group has no reported values. A nonfinite aggregate or a counter total beyond the safe integer range exits with an error identifying the metric and group. Cross-game totals sum submitted quantities. Comparable savings are evaluated within each measured pair.

**Breaking change.** Replace flat numeric telemetry input with the measurement object above. Wrap each supported value in `{ "kind": "measured", "value": 100, "provenance": "record-label" }` using the recorded classification and provenance. Omit historical entries with missing evidence. Consumers of `telemetry.<metric>` now read its `kind` and, when present, `value` and `provenance`. Consumers of `summary.telemetry.<metric>` select a classification group, for example `.measured.sum`.

The CLI exits 1 on errors, rejects duplicate game directories, and produces no report when validation fails. It reads local files without executing game code or making network requests.
