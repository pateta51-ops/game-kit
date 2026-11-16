# offline

Offline install: a Vite plugin that writes a precaching service worker into the build, the rule for registering it, and the update line. `precache.ts` runs in node (the game's `vite.config.ts`); `index.ts` draws nothing; `ui.ts` holds `UpdateLine`. Needs state-machines and the packages `react`, `zustand`. Saves and `keepStorage()` are in saves.

## Build (`precache.ts`)

`plugins: [swPrecache({ prefix, assets?, appDir?, exclude?, navTimeoutMs? })]`. After `vite build` it writes `sw.js` at the build's root: the kit's `sw.js` with the files to keep and a version hashed from their contents. `prefix` starts the cache names (one per game; activate deletes the older caches with it). With `assets` (folders of the build, e.g. the faces and the fonts), only root files, the bundler's `assetsDir` and those folders are kept; without it, every file. `exclude` takes more files out (e.g. originals). The game keeps no `public/sw.js`. `writeServiceWorker(outDir, options)` does the same on any folder.

The worker answers every stored file from the cache (query and hash ignored, paths percent-encoded once) and every navigation in its scope with the stored `index.html`. With `navTimeoutMs` (e.g. 3000) a navigation goes to the network first (`no-store`) and gets the stored `index.html` only when the network fails, answers with an error or takes longer. A newer version waits until the page sends `skipWaiting`.

## Page (`index.ts`)

`registerServiceWorker({ prod, e2e, local }, url)` in the game's start-up, e.g. with `import.meta.env.PROD`, the game's e2e flag, and `` `${import.meta.env.BASE_URL}sw.js` ``. `shouldRegister`: production on HTTPS only, never an e2e build; `local` allows http://localhost and 127.0.0.1. Never inside a frame: `pageHost()` works out `framed` (`window.self !== window.top`; a parent of another origin that refuses the look counts as framed), and the page holding the frame registers instead; a test passes its own host as the third argument. When a newer version is stored while one controls the page, `useUpdate` (zustand, machine `kit.offline.update`) goes to `ready`; it checks again whenever the page comes back to the front. `applyUpdate()` hands over and reloads (or after `RELOAD_FALLBACK_MS`). `autoApply({ safe, flush?, apply? })` (opt-in) does it without the button: it looks for a newer build at once, back online and on `pageshow`, and when one is `ready` and `safe()` is true (the game: no input half-entered) it awaits `flush` (the pending save), asks `safe` again and applies. It returns `{ check, stop }`; the game calls `check` whenever what `safe` reads changes.

The manifest, icons and iOS meta are the game's own files in its `public/` and `index.html`.

## Update line (`ui.ts`)

`<UpdateLine words? className?>`: shown only in `ready` (and `reloading`, its button disabled). `UPDATE_WORDS` holds the default words. Test ids: `update-line`, `update-reload`.

## Look

`offline.css` sets at zero specificity `--upd-gap`, `--upd-text`, `--upd-bg`, `--upd-pad`, `--upd-border`, `--upd-radius`. Classes: `kit-upd`, `kit-upd-btn`.

Tests: `precache.test.ts` (node), `ui.test.tsx` (jsdom), `offline.e2e.test.ts` (Chromium through playwright-core; skipped off CI when its browser is not installed).
