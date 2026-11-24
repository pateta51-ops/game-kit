# reuse-metrics

Local, read-only measurement of locked kit availability, static references and explicitly supplied build telemetry across game repositories.

## Rules for agents

**You must:**
1. Run from a kit checkout with TypeScript installed: `node tools/reuse-metrics/report.mjs <game-dir> [<game-dir> ...]`. Pass only game directories the owner authorizes.
2. Treat a static import or re-export (including type-only) as a reference, not proof of runtime reuse or a delivered feature. Unreferenced locked components can be CLI tools or transitive dependencies. The scan covers literal relative static imports in src and tests, not aliases, dynamic imports or scripts.
3. For actual measured build costs, optionally place a local `kit-reuse-metrics.json` at each game root. Supported nonnegative fields: inputTokens (total including cached), outputTokens, cachedInputTokens, costUsd, minutesToPlayable, failedCiRuns, ruleDefects. Use the same measurement window across compared games and report totals from actual records only. Keep unknown values absent, not zero.
4. The report contains no game names, source text or absolute paths. It may still disclose private usage and costs; keep the output and input telemetry local unless the owner expressly authorizes sharing.
5. Do not treat these metrics as a measure of time saved or avoided implementation. Compare measured outcomes against a controlled baseline before claiming a productivity gain.

The CLI returns per-game counts in argument order plus a cross-game summary, including the number of games reporting each cost metric and null for unreported totals. Errors exit 1. It makes no writes or network requests and does not execute game code. Duplicate game roots are refused.
