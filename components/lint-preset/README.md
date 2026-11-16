# lint-preset

ESLint flat-config blocks for a game's engine folder. Spread them after the game's own blocks:

```js
import { engineLint } from './kit/lint-preset/index.js';
import { PACK_PREFIXES } from './eslint.prefixes.js';
export default defineConfig(/* the game's blocks, */ ...engineLint({ callers: ['src/ui', 'scripts'], cardPrefixes: PACK_PREFIXES }));
```

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
