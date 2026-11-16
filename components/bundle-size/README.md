# bundle-size

The size gate for a vite build: gzips `index.html` and what it loads at once, and fails over the game's limits.

```
tsx kit/bundle-size/check-bundle-size.ts --initial-budget 2097152 --chunk-limit 512000 [--dir dist] [--json report.json]
```

Without `--dir` it builds into `.cache/size-build` first. Exit codes: 0 within the limits, 1 over, 2 no build or bad usage.

| Flag | In `--config` JSON / `Limits` | What it does |
|---|---|---|
| `--initial-budget <bytes>` | `initialBudget` | the first download, gzipped |
| `--chunk-limit <bytes>` | `chunkLimit` | any one script chunk, before gzip |
| `--asset-limit <bytes>` | `assetLimit` | any image, font or audio file in the build that the first download does not hold |
| `--base <path or auto>` | `base` | the app's base path in the addresses (`/game/assets/x.js`); `auto` finds it |
| `--follow true` | `follow` | also counts static imports of the scripts, `url(...)` of the stylesheets, icon and manifest links |
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
