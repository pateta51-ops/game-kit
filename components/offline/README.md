# offline

Offline install: a Vite plugin that writes a precaching service worker into the build, the rule for registering it, and the update line. `precache.ts` runs in node (the game's `vite.config.ts`); `index.ts` draws nothing; `ui.ts` holds `UpdateLine`. Needs state-machines and the packages `react`, `zustand`. Saves and `keepStorage()` are in saves.

## Rules for agents

**What it does:** A Vite plugin that writes a precaching service worker, the rule for registering it, and the update line.

**You must:**
1. Add `swPrecache({ prefix, assets?, ... })` to `vite.config.ts` plugins; `prefix` is unique per game. Keep no `public/sw.js`.
2. Register once at start-up with `registerServiceWorker({ prod, e2e, local }, url)`, url `${BASE_URL}sw.js`: it registers only in production on HTTPS (or local when allowed), never in an e2e build, never inside a frame.
3. List the faces and fonts folders in `assets` and do not also call card-parts `fillImageCache` (art would be stored twice).
4. Import `buildInfoPlugin` from `../kit/offline/buildInfo.ts` in `vite.config.ts` only (node, not `index.ts`) to write `build.json`; it is never precached.
5. For `autoApply` and `watchBuild` give a `safe()` that is false while input is half-entered, a `flush` that awaits the pending save, and call the returned `check` when what `safe` reads changes.
6. Mount `<UpdateLine words>` with the game's own words; it shows only when a newer version is ready.
7. The manifest, icons and iOS meta are the game's own files.

**Common mistakes:**
- Importing `buildInfo.ts` from page code pulls node code into the bundle.
- A `safe` that always returns true applies an update while input is half-entered and loses it.


## Build (`precache.ts`)

`plugins: [swPrecache({ prefix, assets?, appDir?, exclude?, navTimeoutMs? })]`. After `vite build` it writes `sw.js` at the build's root: the kit's `sw.js` with the files to keep and a version hashed from their contents. `prefix` starts the cache names (one per game; activate deletes the older caches with it). With `assets` (folders of the build, e.g. the faces and the fonts), only root files, the bundler's `assetsDir` and those folders are kept; without it, every file. `exclude` takes more files out (e.g. originals). Card faces in `assets` are precached here: do not also call card-parts `fillImageCache` (art stored twice). The game keeps no `public/sw.js`. `writeServiceWorker(outDir, options)` does the same on any folder.

The worker answers every stored file from the cache (query and hash ignored, paths percent-encoded once) and every navigation in its scope with the stored `index.html`. With `navTimeoutMs` (e.g. 3000) a navigation goes to the network first (`no-store`) and gets the stored `index.html` only when the network fails, answers with an error or takes longer. A newer version waits until the page sends `skipWaiting`.

## Page (`index.ts`)

`registerServiceWorker({ prod, e2e, local }, url)` in the game's start-up, e.g. with `import.meta.env.PROD`, the game's e2e flag, and `` `${import.meta.env.BASE_URL}sw.js` ``. `shouldRegister`: production on HTTPS only, never an e2e build; `local` allows http://localhost and 127.0.0.1. Never inside a frame: `pageHost()` works out `framed` (`window.self !== window.top`; a parent of another origin that refuses the look counts as framed), and the page holding the frame registers instead; a test passes its own host as the third argument. When a newer version is stored while one controls the page, `useUpdate` (zustand, machine `kit.offline.update`) goes to `ready`; it checks again whenever the page comes back to the front. `applyUpdate()` hands over and reloads (or after `RELOAD_FALLBACK_MS`). `autoApply({ safe, flush?, apply? })` (opt-in) does it without the button: it looks for a newer build at once, back online and on `pageshow`, and when one is `ready` and `safe()` is true (the game: no input half-entered) it awaits `flush` (the pending save), asks `safe` again and applies. It returns `{ check, stop }`; the game calls `check` whenever what `safe` reads changes.

The manifest, icons and iOS meta are the game's own files in its `public/` and `index.html`.

## New build check (`fresh.ts`)

`watchBuild({ build, safe, flush?, url? })` (the game passes its build id, e.g. a commit): fetches `build.json` (`{ "build": "<id>" }`, written by `buildInfoPlugin()` in `vite.config.ts` (`import { buildInfoPlugin } from '../kit/offline/buildInfo.ts'`, node only, not in `index.ts`; node: `{ build: id ?? git short sha, commit }`, `unknown` outside git; `writeBuildInfo(outDir)` does it on any folder); `no-store`) at start, back online, on `pageshow` and when the page returns to the front. A different id, `safe()` true, `flush` awaited and `safe()` true again: it reloads once. The id it reloaded for is kept in sessionStorage, so a reload that lands on the same old build is not repeated. Returns `{ check, stop }`; call `check` when what `safe` reads changes. A failed fetch or a throwing `flush` does nothing; `stop()` also cancels a run in flight. `build.json` is never precached. `buildStamp(define)` returns the first 7 characters of the build's commit (the game's define) or `unknown`, for display. Test seams: `fetch`, `reload`, `store`.

## Two-build server (`twoBuilds.ts`, node, tests only)

`serveTwoBuilds(dir, { port?, mark?, precache? })`: serves the build in `dir` as A and a copy as B (index.html gets `mark`, sw.js rewritten with `precache`), on one origin; `GET /__build/a` or `/__build/b` switches what later requests get. Returns `{ url, a, b, close }`.

## Update line (`ui.ts`)

`<UpdateLine words? className?>`: shown only in `ready` (and `reloading`, its button disabled). `UPDATE_WORDS` holds the default words. Test ids: `update-line`, `update-reload`.

## Look

`offline.css` sets at zero specificity `--upd-gap`, `--upd-text`, `--upd-bg`, `--upd-pad`, `--upd-border`, `--upd-radius`. Classes: `kit-upd`, `kit-upd-btn`.

Tests: `precache.test.ts` (node), `ui.test.tsx` (jsdom), `offline.e2e.test.ts` (Chromium through playwright-core; skipped off CI when its browser is not installed).

## Use it in 10 lines

```ts
import { shouldRegister } from '../kit/offline/index'

// the Vite plugin writes the service worker; the page registers it only where it may:
declare const env: Parameters<typeof shouldRegister>[0]
console.log(shouldRegister(env, { hostname: 'localhost', protocol: 'http:' }, true))
```

```tsx
import { UpdateLine } from '../kit/offline/ui'

export const Top = () => <UpdateLine words={{ line: 'A new version is ready' }} />
```

```ts
import { buildStamp, watchBuild } from '../kit/offline/index'

declare const __BUILD__: string | undefined
export const stamp = buildStamp(__BUILD__)
export const stop = watchBuild({ build: stamp, safe: () => true, flush: () => Promise.resolve() }).stop
```
