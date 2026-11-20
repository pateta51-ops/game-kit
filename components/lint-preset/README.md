# lint-preset

ESLint flat-config blocks for a game's engine folder. Spread them after the game's own blocks:

```js
import { engineLint } from './kit/lint-preset/index.js';
import { PACK_PREFIXES } from './eslint.prefixes.js';
export default defineConfig(/* the game's blocks, */ ...engineLint({ callers: ['src/ui', 'scripts'], cardPrefixes: PACK_PREFIXES }));
```

## Rules for agents

**What it does:** ESLint blocks that keep the engine folder pure, copy-on-write and free of card ids, and make callers reach the engine through its api file only.

**You must:**
1. Spread `...engineLint({ ... })` into the flat config after the game's own blocks.
2. Pass `callers` with every folder that imports the engine (default only `src/ui`; `scripts` and the like are not checked unless listed), and `engine` / `api` when they are not `src/engine` / `api`.
3. Keep engine imports relative; name any package in `allowImports` by exact name. No dynamic `import()`, no `ui` folder.
4. Take randomness from `ctx.rng` only: `Math.random`, `Date`, `performance`, timers, `window`, `fetch` and the other globals are errors in the engine folder.
5. Pass `cardPrefixes` from the pack registry and keep a game test `expect(prefixDrift(PACK_PREFIXES, registryPrefixes)).toEqual([])`.
6. Run the engine tests with engine-core `setCowChecks(true)`: the lint does not see writes through an alias.
7. To add your own `no-restricted-*` block for engine files, build it from `cowSelectors(cow)` and `cardIdSelectors(prefixes)`.

**Common mistakes:**
- A later block that sets `no-restricted-globals`, `-properties`, `-syntax` or `-imports` for the same files replaces the preset's rule: the checks silently stop.
- `const t = s.turn; t.n = 1` passes the lint and writes shared state.


`engineLint(options)`, all optional:

- `engine` (`'src/engine'`), `api` (`'api'`): the engine folder, and the one file of it that `callers` may import.
- `callers` (`['src/ui']`): folders that reach the engine through the api file only.
- `pure` (`[]`): more folders under the purity and copy-on-write rules (no import rule).
- `allowImports` (`[]`): packages the engine may import, by exact name (`'immer'`); otherwise relative files only. No dynamic `import()`.
- `forbidImports` (`['ui']`): folder names no engine import path may contain.
- `cow`: `{ state: ['s', 'ctx.s'], owned: [], inPlace: [engine-core's rng helpers], depth: 3 }`, or `false` for none. `state` names the shared state (`x` or `a.b`), `owned` the members an action may change in place (`'stack'`), `inPlace` the functions that change their argument.
- `cardPrefixes` (`[]`): strings starting `<prefix>:<digit>` are refused in the engine, and in the `cardFiles` globs.
- Purity: `Date`, `performance`, `Math.random`, `window`, `document`, `fetch`, `navigator`, timers, `console`, storage, `crypto`, `process`, `Intl`, `globalThis`.
- Copy on write: a direct write below the top level of the state (`s.a.b = 1`, `s.a.n++`, `delete s.a.b`, `s.list.push(x)`, `Object.assign(s.a, y)`, `shuffleInPlace(s.rng, xs)`). Aliases (`const t = s.turn; t.n = 1`) are not seen: run the tests with engine-core's `setCowChecks(true)`.

The blocks set `no-restricted-globals`, `-properties`, `-syntax` and `-imports`. A later block that sets one of them for the same files replaces it; build such a block from `cowSelectors(cow)` and `cardIdSelectors(prefixes)`.

Keep the prefix list level with the pack registry in a game test:

```ts
expect(prefixDrift(PACK_PREFIXES, PACKS.map((p) => p.prefix))).toEqual([]);
```

## Use it in 10 lines

```js
import { engineLint } from './kit/lint-preset/index.js';
import { PACK_PREFIXES } from './eslint.prefixes.js';
export default defineConfig(...engineLint({ callers: ['src/ui', 'scripts'], cardPrefixes: PACK_PREFIXES }));
```
