# reuse-metrics

Local, read-only measurement of locked kit availability, static references and explicitly supplied build telemetry across game repositories.

## Rules for agents

**You must:**
1. Run from a kit checkout with TypeScript installed: `node tools/reuse-metrics/report.mjs <game-dir> [<game-dir> ...]`. Pass only game directories the owner authorizes.
2. Use the lock for installed availability. Use static reference lists to inspect literal relative imports and re-exports in `src/` and `tests/`. The legacy `production*` fields describe static application source, and `runtimeAdoption` is operator-reported. Use [versioned component observations](../kit-context/README.md#versioned-component-observations) when you have receipt-bound gameplay execution evidence. CLI tools, transitive dependencies, aliases, dynamic imports and scripts can escape static reference counts. Test sources live under the game's `tests/` directory or a `__tests__` directory in the scan, or have a basename containing `.test.` or `.spec.`. The checkout's parent directories have no effect.
3. Supply optional build telemetry in a local `kit-reuse-metrics.json` at the game root. Record the revisions, measurement window, protocol, classification and provenance described below. Give each project and observation a stable opaque ID before comparing submissions from multiple checkouts. Reuse the same IDs when copying an observation. Omit unknown values and review the identity status before treating totals as independent observations.
4. The report contains no game names, source text or absolute paths. It may still disclose private usage and costs; keep the output and input telemetry local unless the owner expressly authorizes sharing.
5. Use a controlled baseline for savings. Treat the reported differences as the outcome of the supplied comparison. Claims about what caused the difference require independent evidence.
6. For record-traced development observations, declare the task protocol before handing off work, retain authorized source records outside the public repository, then run `node tools/reuse-metrics/observations.mjs <observation.json> [...]`. Use only the three normalized formats below. The importer checks actual bytes and derivations; it does not authenticate a provider, source revision, preparation timestamp or reviewer identity. Do not relabel a hand-entered quantity as a normalized usage export.
7. Record the playable milestone and quality result independently of efficiency, with a reviewer identity distinct from the worker. Use `--baseline <observation.json>` only with one current observation and a genuinely compatible task. Missing usage, review or comparison evidence stays missing. Keep coding-agent development usage separate from LLM gameplay usage.
8. For a fresh single-turn Codex CLI 0.166.0 run using the OpenAI provider, retain both `exec --json` output and the exact local rollout. Reconcile them with `codex-cli.mjs` before creating the usage record. Keep both originals and their hashes private.

## Measurement input

The file is optional. An omitted file or an empty object produces a static scan with missing telemetry. This synthetic example shows the format.

```json
{
  "identity": {
    "projectId": "project-7c81",
    "observationId": "observation-e512"
  },
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

- Optional `identity` records a stable `projectId` and a globally unique `observationId`. Assign a new observation ID to each independent measurement, even for one project with the same revisions or collection window. IDs are case-sensitive and use the same label syntax as provenance. Keep identifiers opaque. Avoid names, directory paths, credentials, and other private information. Omit the whole identity object when either identifier is unknown.
- `sourceRevision` is the full Git SHA of the game source measured. `kitRevision` must equal the kit lock's full commit SHA. The source SHA and provenance labels come from the operator's records. The tool validates their format and the kit lock match.
- `window` records the shared UTC collection period `[start, end)` and the protocol used. Use the same protocol label only when the work scope, measurement method, and inclusion rules match. Protocol and provenance labels contain letters, digits, dots, underscores or hyphens. Keep the underlying records local and avoid sensitive labels.
- Supported metric keys are `inputTokens` (total including cached), `outputTokens`, `cachedInputTokens`, `costUsd`, `minutesToPlayable`, `failedCiRuns`, and `ruleDefects`. Use `measured` for directly recorded values, `estimated` for approximations, and `inferred` for values derived indirectly from other evidence. `provenance` labels the source record or derivation for each quantity. Values are nonnegative and finite, and counters must be safe integers.
- Optional `baseline` uses the same `sourceRevision`, `kitRevision`, `window` and `metrics` fields. Use `kitRevision: "none"` for a measured baseline without a kit. The start, end and protocol must match before the report computes any savings. It subtracts the current value from the baseline for metrics that both directly measured. An absent baseline, incompatible window, or absence of measured pairs has an explicit comparison status and no savings. A negative difference indicates an increase.
- Optional `runtimeAdoption` maps an installed component to the provenance label of an observed runtime record from the same revisions and window. An absent map reports unknown adoption. Static `*RuntimeReferenced` lists use imports or exports that may execute at runtime. `*TypeOnlyReferenced` lists cover components with exclusively type syntax in that scan. Neither list measures execution.

## Report and migration

The CLI prints per-game reports in argument order and a cross-game summary. The `evidence` field identifies static references and operator-reported runtime evidence. The legacy `gamesWithRuntimeObservations` and `componentsObservedAcrossGames` totals count submissions with operator-reported runtime data. Current totals group measured, estimated and inferred values separately, with `reportedGames` and `sum` per group and a `missingGames` count per metric. `sum: null` means that group has no reported values. A nonfinite aggregate or a counter total beyond the safe integer range exits with an error identifying the metric and group. Cross-game totals sum submitted quantities. Comparable savings are evaluated within each measured pair.

The existing `games`, `reportedGames`, and component counts are submission counts. One project can contribute distinct observations, each of which contributes to the submission totals. `summary.identity` counts identified projects and observations separately and lists each runtime-observed component once per identified project. `status: "unverified"` lists the 1-based inputs with measurements lacking identity in `unidentifiedMeasurementInputs`. Their values remain in the submission totals. `status: "identified"` means every submitted measurement supplied an explicit identity. Static scans without measurements remain valid and produce `status: "no-measurements"` when all inputs are static.

The CLI rejects the same canonical directory, including symlink aliases. For separate roots with the same observation ID, matching claims produce a duplicate error and differing project, revision, window, provenance, metric, baseline, or runtime claims produce a conflict error. Both identify the affected inputs without writing a report or totals. Similar source files, revisions, measurements, or windows alone leave identity unverified.

**Breaking change.** Replace flat numeric telemetry input with the measurement object above. Wrap each supported value in `{ "kind": "measured", "value": 100, "provenance": "record-label" }` using the recorded classification and provenance. Omit historical entries with missing evidence. Consumers of `telemetry.<metric>` now read its `kind` and, when present, `value` and `provenance`. Consumers of `summary.telemetry.<metric>` select a classification group, for example `.measured.sum`.

The CLI exits 1 on errors, rejects duplicate game directories, and produces no report when validation fails. It reads local files without executing game code or making network requests.

## Record-traced observations

`report.mjs` retains its existing format and behavior. Its `provenance` is an operator-supplied label, including when `kind` is `measured`. The additional `observations.mjs` CLI reads a manifest plus local source files and computes supported quantities itself. It never accepts a hand-entered `measured` metric. It prints one JSON report after every input passes, exits 1 with no report on failure, and makes no writes or network requests.

```sh
node tools/reuse-metrics/observations.mjs private/observation.json
node tools/reuse-metrics/observations.mjs private/observation.json --baseline private/baseline.json
```

### Protocol and manifest

Before work starts, preserve a JSON protocol with exactly these fields:

| Field | Contract |
| --- | --- |
| `version`, `countingMethod` | `1`, `"normalized-records-v1"` |
| `id` | Opaque protocol label; reuse only for the same declared scope, endpoints and methods |
| `identity` | `{ projectId, observationId }`, both opaque labels |
| `preparedAt`, `start` | UTC ISO timestamps; preparation cannot follow the task start |
| `workerId` | Opaque identity of the worker |
| `scope` | Nonempty description of the bounded task, included activities and exclusions |
| `playable` | Nonempty declaration of the meaningful action/response or milestone that ends time-to-playable |
| `quality` | Nonempty declaration of the independent acceptance and defect review |

The fixed counting method below defines CI attempts and interventions. Preserve the actual handoff and review records as well: matching a declared timestamp is not proof that the protocol existed then. The protocol should describe coding-agent development, including interruptions according to the declared scope; gameplay model usage belongs to a separate observation.

After collection closes, the manifest has `version: 1`, `identity`, full `sourceRevision`, full `kitRevision` (or `"none"` for a no-kit baseline), `window: { start, end }`, `protocol: { file, sha256 }`, and `records: [{ file, sha256 }, ...]`. Start must equal the protocol start, and end must follow it. Hash the exact UTF-8 file bytes with SHA-256, including any whitespace. References are relative to the manifest directory, cannot traverse parents, and must resolve to regular files without symlinks or hard-link aliases. Each source is limited to 10 MiB; at most 10,000 source records are accepted. Unknown fields and record versions fail. Timestamps use UTC ISO form such as `2026-01-01T10:00:00.000Z` or `2026-01-01T10:00:00Z`.

An optional manifest `metrics` object accepts the existing seven metric names with `{ kind: "estimated" | "inferred", value, provenance }`. It preserves those classifications as `evidenceStatus: "operator-reported"`. It rejects `measured` and any manual value conflicting with an automatically derived measurement. Omit unknown quantities. An empty `records` array is valid and produces an unmeasured observation when no estimates or inferences exist.

### Supported source records

Only these three normalized JSON formats are implemented. A provider export needs an explicit local conversion to this contract; no provider format or generic mapping is automatically recognized. Keep the original authorized export and conversion record locally so the normalization can be audited. A manually invented normalized file is not evidence of actual usage.

### Convert a Codex CLI export

```sh
node tools/reuse-metrics/codex-cli.mjs private/exec.jsonl private/rollout.jsonl
```

The tested adapter pairs the exact CLI thread with the single completed rollout turn, checks the chronology and deduplicates provider response identities. It checks cumulative counts against per-response usage and reconciles them with the CLI's completion totals. It reports the model, reasoning setting, successful completion timestamp, digests of both input files, recorded provider-response and tool-call counts, and observed token fields. Cached tokens are included in total input and also reported separately. Absent fields remain missing. The adapter does not determine cost. Failed, interrupted, resumed or incompatible sessions are outside this conversion contract. Retain their raw records and report partial capture separately.

Copy the returned `usage` to a `normalized-records-v1` usage record's `values`, and use the returned `at` and `inputIncludesCached` fields. Add the associated trial identity, verified revisions, window and protocol digest before importing. Successful reconciliation checks consistency between local files. Validate that the runner captured the whole trial and that its source and protocol match before using the results.

Every record includes `version: 1`, globally unique opaque `recordId`, `kind`, the same `identity`, `sourceRevision`, `kitRevision`, `window`, and `protocolSha256` as the manifest. These associations are checked against the supplied manifest and protocol, not against a remote service or a Git checkout. Source files with duplicate IDs or hashes fail, including across observations and the optional baseline. Distinct observations require distinct globally unique observation IDs; copied observations retain their original IDs.

| `kind` | Additional fields | Derivation |
| --- | --- | --- |
| `usage` | `at` within `[start, end)`; `values` with any of `inputTokens`, `outputTokens`, `cachedInputTokens`, `costUsd`; `inputIncludesCached: true` whenever input is present | Sum each quantity only when every supplied usage record contains it. Missing fields produce a missing total for that quantity. Cached input requires total input and cannot exceed it. Token counters are nonnegative safe integers; cost is finite and nonnegative. |
| `development-log` | `ciAttempts: [{ runId, attempt, conclusion, at }]`; `interventions: [{ id, at }]` | Count unique `(runId, attempt)` pairs. Attempts are positive safe integers and conclusions are `success`, `failure`, `cancelled` or `skipped`. `failedCiRuns` counts only failures; supplemental CI attempts count all supplied attempts. Count unique intervention IDs. All timestamps are inside `[start, end)`. Duplicated attempts or interventions fail. |
| `endpoint-review` | `at` within `[start, end]`; `reviewerId`; `playable: { status, at? }`; `quality`; `ruleDefects: [id, ...]` | Supply one final review. Statuses are `accepted`, `rejected` or `not-assessed`; reviewer differs from worker. Accepted playable status requires a milestone time inside the window and no later than the review. Only accepted playable **and** accepted quality produce wall-clock minutes from start to milestone. Unique recorded defect IDs produce the observed defect count. |

For `normalized-records-v1`, a CI attempt means one hosted run ID plus its attempt number for the declared source, and an intervention means one discrete additional read, clarification or correction required by the worker exercise. Preserve those event records while collecting them. An explicitly supplied empty development log records zero attempts/interventions; absence of a log means unknown. An accepted final review with an empty findings list records zero observed defects, not proof of universal correctness. The importer does not execute or independently verify the review's acceptance commands.

### Results and comparison limits

Every derived number has `kind: "measured"`, `evidenceStatus: "record-traced"`, and a trace listing the source record IDs, actual SHA-256 digests and counting method. The report includes the protocol digest and compatibility fingerprint. This establishes a reproducible calculation from the supplied bytes, not provider authenticity, completeness, source revision authenticity or human independence. It distinguishes this trace from the legacy `provenance` label. Raw source text and file paths are omitted.

`telemetry` retains measured/estimated/inferred/missing classifications. `supplemental` reports CI attempts and interventions with the same trace shape. `outcome` reports the independent review separately. `legacyTelemetry` projects a kit-pinned observation into the existing `kit-reuse-metrics.json` format, suitable for the same game's matching kit lock; retain the full observation report because the projection omits traces. For a no-kit observation it is `null`. Legacy comparison rules still apply if a projection is fed to the older report; use this importer for comparisons of separate task windows.

The optional baseline must have the same protocol ID, fixed counting method, scope, playable declaration and quality declaration. Each observation must have an accepted independent endpoint. Compatible pairs can have different task windows and revisions. Only pairs of record-traced quantities yield `baseline - current` differences; estimates and inferences never yield trusted differences. The full observations retain review results and defect counts for inspection. `missing-baseline`, `incompatible-protocol`, `unaccepted-outcome` and `no-record-traced-pairs` produce no differences. Compatibility is established only for the supplied declarations; it does not prove experimental control or comparable task difficulty. `causalSavings` always remains `not-established`: one task, or one supplied pair, is not causal proof. Wall time is not active effort.
