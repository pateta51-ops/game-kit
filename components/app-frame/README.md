# app-frame

Hash routes, the screen of the address bar with an error boundary and lazy loading, and start-up. The game keeps its screens, its route machine, its crash screen and its words. Needs `state-machines` and the packages `react` and `react-dom`. `index.ts` draws nothing and loads in node; `ui.ts` holds the React parts.

## Rules for agents

**What it does:** Hash routing, a frame that draws each route in an error boundary with lazy loading, a fixed-size scaled stage, a crash screen and the start-up call.

**You must:**
1. Import `kit/app-frame/index` for the route functions (loads in node) and `kit/app-frame/ui` for the React parts; the frame loads its own `frame.css`.
2. Pass `AppFrame` a `routes` map and `home`; a hash whose name is not in `routes` is read as `home`.
3. Define each `load: () => import(...)` once, outside render, and return `{ default: Screen }`; do not pass a `React.lazy` as `screen` (a failed import cannot be retried).
4. Start the app with `startApp(app, { root, before, hook })`: the root element must exist (default `#root`) or it throws; pass `hook` only in dev or end-to-end builds.
5. For the game's own moves (redirects, the step after a flow) call `follow(machine, from, event, home)` with a route machine from `state-machines`; an edge the table lacks throws.
6. When you use `<Stage>`, start phone-mode's viewport with `fit: false`, or the two scalers multiply.
7. Put a `CrashScreen` in `fallback` and give it `getSave` so the player can download the save; word it through `words`.
8. Place children of `Stage` with `zone(...)` from `board-layout`, not fixed pixel offsets.

**Common mistakes:**
- Calling `window.location.hash = ...` for your own moves instead of `follow` / `navigate`: the route machine is bypassed.
- A `getSave` that never settles: the crash screen only waits `timeoutMs` (10 s), then shows the failed words.
- Expecting a phone layout to come from `Stage`: it only scales; a flowing phone layout stays in the game.

## Routes (`routes.ts`)

- `parseHash(hash, names, home)`: `#/name/part/part?query` gives `{ name, parts, query }` (parts decoded; a bad escape stays as written). No hash, `#/` and a name not in `names` are `home`.
- `routeHref(name, home, parts?, query?)`: `#/` for home, else `#/name/parts`. `navigate(href)` sets the hash; `replaceRoute(href)` goes without a history entry.
- `follow(machine, from, event, home, query?, go?)`: a move the code makes on its own (a redirect, the step after a flow), checked against the game's route machine (`defineMachine` from state-machines, states = route names); an edge the table lacks throws in dev and tests.

## Frame (`ui.ts`)

- `<AppFrame routes home useRouteFromState? fallback? loading? onError? words?>`: `routes` maps each name to `{ screen?, load?, title? }`; `screen` is a component (gets `route`); `load` is `() => import(...)` of `{ default: screen }`, defined once outside render, loaded on demand. Retry after a failed `load` imports again; a `React.lazy` passed as `screen` cannot (React keeps its failed import). Each route draws in its own `ErrorBoundary` (keyed by route, so coming back draws afresh) and a `Suspense`. `useRouteFromState(route)` is the game's hook: it returns the route the game state wants, or null to stay; when it differs, the frame replaces the hash. The tab title is the route's `title`; a new route scrolls to the top.
- Without `fallback`, a failed screen shows the `kit-af-crash` alert (the words, the error message, Try again, Home). `fallback(error, retry, route)` draws the game's own. `words` overrides `FRAME_WORDS` (`loading`, `failed`, `retry`, `home`).
- `<CrashScreen error getSave? fileName? retry? reload? download? words? timeoutMs?>`: a crash screen to return from `fallback`: the words, `errorWords(error)` (first line, 200 characters), the children, then Download the save, Reload the page and (with `retry`) Try again. `getSave()` returns the save as a string, bytes or a Blob, now or as a promise, or null for none; it is downloaded as `fileName` (default `save.json`) by `downloadSave` (the address is freed 10 s later), or by the game's `download(data, fileName)`. A `getSave` or download that throws, rejects or takes over `timeoutMs` (10 s) only shows the failed words; the button works again. `words` overrides `CRASH_WORDS`. Test ids: `crash`, `crash-error`, `crash-export`, `crash-reload`, `crash-retry`, `crash-export-state` (`data-state` busy, saved, none, failed).
- `useRoute(names, home)`: the route, re-read on `hashchange`. `ErrorBoundary` `{ fallback(error, retry), onError? }` for any part.
- `<Stage layout={{ w, h }} heads? head? className?>`: a fixed-size stage (e.g. 3840 x 2160) scaled to fit the window, top-left aligned, in a fixed full-window `kit-stage-viewport`; children place themselves with `zone` from `board-layout`. `heads` names the game's fixed heads once, each `{ rect: [x, y, w, h], node }` (e.g. `menu`: logo and Home button; `flow`: Home button alone); `head` picks one for the screen, drawn in `kit-stage-head` (`data-head`) above the children. `useStageScale(w, h)` is the scale alone. A phone layout that flows instead of scaling stays in the game. With `<Stage>` start phone-mode's viewport with `fit: false`, or the two scalers multiply (0.5 x 0.5).
- `startApp(app, { root?, before?, hook? })`: finds the root element (default `#root`, throws when missing), puts `hook.api` on `window[hook.name]` (the game passes it only in dev or end-to-end builds), runs `before(root)`, renders in StrictMode; returns the React root.

## Look

`frame.css` (loaded by the frame) sets neutral values at zero specificity: `--af-pad`, `--af-text`, `--af-font`, `--af-crash-bg`, `--af-crash-border`, `--af-radius`, `--af-error-opacity`, `--af-btn-text`, `--af-btn-bg`, `--af-btn-border`. Classes: `kit-af-loading`, `kit-af-crash`, `kit-af-error`, `kit-af-btn`, `kit-af-export` (the export's result line).

Tests: `routes.test.ts` (node), `ui.test.tsx`, `crash.test.tsx`, `stage.test.tsx` (jsdom).

## Use it in 10 lines

```ts
import { parseHash, routeHref } from '../kit/app-frame/index'

const names = ['menu', 'play', 'settings']
const route = parseHash('#/play/seed-7?debug=1', names, 'menu')
// { name: 'play', parts: ['seed-7'], query: ... }
const href = routeHref('play', 'menu', ['seed-7']) // '#/play/seed-7'
console.log(route.name, href)
```

```tsx
import { AppFrame } from '../kit/app-frame/ui'

const Menu = () => <p>Menu</p>
export const App = () => <AppFrame<'menu' | 'play'> routes={{ menu: { screen: Menu, title: 'Menu' }, play: { load: () => Promise.resolve({ default: Menu }) } }} home="menu" />
```
