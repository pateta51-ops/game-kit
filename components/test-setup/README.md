# test-setup

Game-free helpers for a game's vitest runs: jsdom stubs, UI fixtures (fake pack and fake art), and real-data suite setup. Lifted from Unstoppable's `setup-dom.ts` and `ui/testing`, Earthborne's `realdataSetup.ts` and STCC's `realPack.ts`. A separate component from `e2e-helpers`, which is Playwright-only; this one runs in vitest. No React, no game types.

## Rules for agents

**What it does:** Game-free helpers for a game's vitest runs: jsdom stubs, UI fixtures (fake pack and art) and a once-per-run real-data setup.

**You must:**
1. List `setup-dom.ts` in the jsdom project's `setupFiles`; it installs stubs only when missing, so a game's own stub is kept.
2. For element sizes or a `matchMedia` answer call `installDomStubs({ size, matches })` in a test and call the function it returns in `afterEach`.
3. Use `fakePack` and `fakeArt` instead of private content in UI tests, and map `FakeCard` onto the game's own type.
4. Make `realDataSetup({ name, dir, build, requireInCI? })` the default export of a vitest `globalSetup` file; Node only. Change `version` whenever `build` changes, since the cache is keyed on the folder and every input file's path, size and mtime plus `version`.
5. Read the result with `loadRealData<T>(name, dir)` using the same `name` and `dir`; it is `null` after a skip, so write `describe.skipIf(!data)`.
6. Set `requireInCI` to fail a CI run whose `dir` is missing; otherwise it warns and skips.

**Common mistakes:**
- Using `loadRealData` with a different `dir` than the setup: it finds no cache and returns null.
- Using this for Playwright: it is for vitest; `e2e-helpers` is the Playwright one.

- `setup-dom.ts`: list it in the jsdom project's `setupFiles`. Installs, only when missing (a game's own stub is kept): `scrollIntoView`/`scrollTo`/`scrollBy` (elements and window), `matchMedia`, `ResizeObserver`, `IntersectionObserver`, `requestAnimationFrame`/`cancelAnimationFrame`. For element sizes or a `matchMedia` answer call `installDomStubs({ size: { width, height }, matches })` in a test or the game's own setup file: it replaces the size and `matchMedia` stubs of an earlier call (also of the setup file) and returns a function that restores every original (call it in `afterEach`).
- `fixtures.ts`: `fakeArt(label, w?, h?)` (SVG data URL, colour from the label) and `fakePack({ count?, kinds?, id?, overrides? })` (invented cards `fx-1`..). The game maps `FakeCard` onto its own type.
- `realData.ts` (Node only): `realDataSetup({ name, dir, build, requireInCI? })` is the default export of a vitest `globalSetup` file. It builds once into `<tmp>/kit-realdata/<name>-<dir hash>.json`, keys the cache on the resolved `dir` and a hash of every input file's path, size and mtime plus `version` (change it when the build changes), writes atomically, and warns and skips when `dir` is missing (fails under `CI` with `requireInCI`). Tests read it with `loadRealData<T>(name, dir)`, which is `null` after a skip: use `describe.skipIf(!data)`.

## Use it in 10 lines

```ts
import { fakePack, installDomStubs } from '../kit/test-setup/index';
import { loadRealData, realDataSetup } from '../kit/test-setup/realData';

const undo = installDomStubs({ matches: true }); // takes effect even after setup-dom.ts
undo(); // restores every original
const arts = fakePack({ count: 4 }).cards.map((c) => c.art); // render these without the private pack
// the default export of the game's globalSetup file:
export default realDataSetup({ name: 'pack', dir: 'content/private', build: () => ({ cards: arts.length }) });
export const real = loadRealData<{ cards: number }>('pack', 'content/private'); // in a test: describe.skipIf(!real)(...)
```
