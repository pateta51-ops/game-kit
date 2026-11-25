# bundle-size

The size gate for a vite build: gzips `index.html` and what it loads at once, and fails over the game's limits.

## Rules for agents

<!-- hooks: written by scripts/catalog.mjs from docs/catalog-notes.json; do not edit -->
**Hooks a game calls:**
- `measureBuild` + `run`: check a media cap for images, fonts and audio, including the first download; follow imports for initial accounting
<!-- /hooks -->

**What it does:** The size gate for a vite build: gzips `index.html` and what it loads at once, and fails when the game's limits are exceeded.

**You must:**
1. Run `vite build` first (or omit `--dir` so it builds into `.cache/size-build`); a missing build exits 2 with `no build`.
2. Pass at least one limit, in bytes: `--initial-budget` (gzipped first download), `--chunk-limit` (one script chunk before gzip) or `--asset-limit`; a limit left out is not checked, and none at all is a usage error (exit 2).
3. Keep the game's limits in its own script as `Limits` and pass them as the defaults of `run`, so a test can import the same `BUDGET` and call `measureBuild(dir, BUDGET)`.
4. Set `base` to the app's base path, or `auto`, when the app is not served from `/`; otherwise assets are not found.
5. Add `follow: true` to count static imports, stylesheet `url(...)` and icon or manifest links. `assetLimit` applies once to every media file in the build, including files counted in the initial download; enabling `follow` does not relax that cap.
6. Read exit codes: 0 within limits, 1 over, 2 no build or bad usage.

**Common mistakes:**
- A `gzipLevel` outside the whole numbers 0 to 9: it throws.
- Stale or partial `dist`: it throws when `index.html` names a file the build lacks.

```
node kit/bundle-size/check-bundle-size.ts --initial-budget 2097152 --chunk-limit 512000 [--dir dist] [--json report.json]
```

Without `--dir` it builds into `.cache/size-build` first. Exit codes: 0 within the limits, 1 over, 2 no build or bad usage.

| Flag | In `--config` JSON / `Limits` | What it does |
|---|---|---|
| `--initial-budget <bytes>` | `initialBudget` | the first download, gzipped |
| `--chunk-limit <bytes>` | `chunkLimit` | any one script chunk, before gzip |
| `--asset-limit <bytes>` | `assetLimit` | any image, font or audio file in the build, whether loaded initially or later |
| `--base <path or auto>` | `base` | the app's base path in the addresses (`/game/assets/x.js`); `auto` finds it |
| `--follow true` | `follow` | also counts static imports of the scripts, `url(...)` of the stylesheets (not `data:`, `#x` or the encoded `%23x`), icon and manifest links |
| `--gzip-level <0-9>` | `gzipLevel` | the gzip level (zlib's default when left out) |

A limit left out is not checked; at least one of the three is required.

## A budget a test can import

The game keeps its limits in its own script and passes them as the defaults of `run` (flags and `--config` override them):

```ts
import { run, type Limits } from '../kit/bundle-size/check-bundle-size';
export const BUDGET: Limits = { initialBudget: 2 * 1024 * 1024, chunkLimit: 500 * 1024, base: 'auto' };
// under the game's own "run as a script" guard:
process.exitCode = run(process.argv.slice(2), undefined, BUDGET);
```

A test imports `BUDGET` from that script and calls `measureBuild(dir, BUDGET)`.

## Use it in 10 lines

```ts
import { measureBuild, type Limits } from '../kit/bundle-size/check-bundle-size'

export const BUDGET: Limits = { initialBudget: 2 * 1024 * 1024, chunkLimit: 500 * 1024, base: 'auto' }
// in a test, after `vite build`: the report lists what is over
console.log(measureBuild('dist', BUDGET))
```
