# app-frame

Hash routes, the screen of the address bar with an error boundary and lazy loading, and start-up. The game keeps its screens, its route machine, its crash screen and its words. Needs `state-machines` and the packages `react` and `react-dom`. `index.ts` draws nothing and loads in node; `ui.ts` holds the React parts.

## Routes (`routes.ts`)

- `parseHash(hash, names, home)`: `#/name/part/part?query` gives `{ name, parts, query }` (parts decoded; a bad escape stays as written). No hash, `#/` and a name not in `names` are `home`.
- `routeHref(name, home, parts?, query?)`: `#/` for home, else `#/name/parts`. `navigate(href)` sets the hash; `replaceRoute(href)` goes without a history entry.
- `follow(machine, from, event, home, query?, go?)`: a move the code makes on its own (a redirect, the step after a flow), checked against the game's route machine (`defineMachine` from state-machines, states = route names); an edge the table lacks throws in dev and tests.

## Frame (`ui.ts`)

- `<AppFrame routes home useRouteFromState? fallback? loading? onError? words?>`: `routes` maps each name to `{ screen?, load?, title? }`; `screen` is a component (gets `route`); `load` is `() => import(...)` of `{ default: screen }`, defined once outside render, loaded on demand. Retry after a failed `load` imports again; a `React.lazy` passed as `screen` cannot (React keeps its failed import). Each route draws in its own `ErrorBoundary` (keyed by route, so coming back draws afresh) and a `Suspense`. `useRouteFromState(route)` is the game's hook: it returns the route the game state wants, or null to stay; when it differs, the frame replaces the hash. The tab title is the route's `title`; a new route scrolls to the top.
- Without `fallback`, a failed screen shows the `kit-af-crash` alert (the words, the error message, Try again, Home). `fallback(error, retry, route)` draws the game's own. `words` overrides `FRAME_WORDS` (`loading`, `failed`, `retry`, `home`).
- `useRoute(names, home)`: the route, re-read on `hashchange`. `ErrorBoundary` `{ fallback(error, retry), onError? }` for any part.
- `startApp(app, { root?, before?, hook? })`: finds the root element (default `#root`, throws when missing), puts `hook.api` on `window[hook.name]` (the game passes it only in dev or end-to-end builds), runs `before(root)`, renders in StrictMode; returns the React root.

## Look

`frame.css` (loaded by the frame) sets neutral values at zero specificity: `--af-pad`, `--af-text`, `--af-font`, `--af-crash-bg`, `--af-crash-border`, `--af-radius`, `--af-error-opacity`, `--af-btn-text`, `--af-btn-bg`, `--af-btn-border`. Classes: `kit-af-loading`, `kit-af-crash`, `kit-af-error`, `kit-af-btn`.

Tests: `routes.test.ts` (node), `ui.test.tsx` (jsdom).
