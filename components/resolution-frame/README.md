# resolution-frame

A Resolution setting that works: on a PC the game is laid out as on a screen of the chosen size, then the whole picture is scaled to fill the browser window (letterboxed). The game runs in a same-origin `<iframe>` of that size, so every media query sees the chosen width and height. Needs settings (its `resolutionSetting` and `resolutionSize`) and the package `react`. `index.ts` draws nothing; `ui.ts` holds the framed page. A game that does not mount the frame is unchanged.

## Rules for agents

**What it does:** Lays the game out as on a screen of the player's chosen Resolution and scales that picture to the browser window, by running the same build in a same-origin iframe.

**You must:**
1. Have the `settings` schema contain a `resolutionSetting` and install the package `react`.
2. At start-up, before saves, sound or any store starts, call `shouldFrame(storedResolution(schema, key))`; render `<ResolutionFrame schema settingKey title />` on the top page, else the app. The same build loads twice and the top page must start nothing.
3. Pass the same `schema` and the same setting key to `storedResolution` and `ResolutionFrame`.
4. With offline, call `registerServiceWorker` on both paths (the framed page registers nothing by itself) and pass `<UpdateLine />` as the frame's children so the top page shows a newer build.
5. Do not set `html` or `body` margin and scrolling yourself while the frame is mounted (the frame removes them); colour the letterbox with `--res-surround`.
6. Do not expect the frame in test browsers: `shouldFrame` is false under webdriver, on phone-sized screens and for `window`; a unit test passes `{ top, webdriver, phone }` to it.

**Common mistakes:**
- Starting stores or audio before the `shouldFrame` check: they start twice, once in each document.
- Reading the stored resolution yourself: use `storedResolution`, which parses the stored JSON for any `version` and survives blocked storage.
- Scaling by device pixel ratio: `fitBox` leaves it alone on purpose (a fractional scale softens text).

## Start-up

```tsx
const res = storedResolution(schema, 'res'); // the key of the schema's resolutionSetting
root.render(shouldFrame(res) ? <ResolutionFrame schema={schema} settingKey="res" title="My Game" /> : <App />);
```

The same build is loaded twice: the top page draws only the frame, the page inside it draws the game. The check comes before anything the top page should not start (saves, sound, the game's stores).

- `shouldFrame(resolution, host?)`: true on the top page only, never under webdriver (test browsers pick sizes with the viewport), never on a phone-sized screen, never for `window`. `frameHost(phoneQuery?, win?)` reads the real page (`PHONE_QUERY` is the default query); a test passes `{ top, webdriver, phone }`.
- `fitBox(size, win)`: `{ scale, left, top }` that fits `size` into `win`, centred; a zero-size box or window gives scale 1 at 0, 0. The device pixel ratio is left alone: a fractional scale softens text.
- `storedResolution(schema, key)`: the value the settings store persisted under `schema.storageKey` (read through `readSettings`), or the default; blocked or broken storage gives the default. Settings exports no reader of its stored JSON, so this one parses it and accepts any `version`.

## Framed page (`ui.ts`)

`<ResolutionFrame schema settingKey title>{children}</ResolutionFrame>`: the iframe at the page's own path, query and route. The address bar's `#/…` route and the tab title follow the game (the title also when it changes later); a route typed in the address bar moves the game. A change of the setting inside the game (the `storage` event) resizes the frame at once; `window` fills the window unscaled. A click on the surround or a return to the tab hands the keyboard back to the game. Test id `resolution-frame`, with `data-resolution`.

With offline: the page inside the frame registers no service worker (`pageHost().framed`); the top page registers it, so call `registerServiceWorker` on both paths. Only the top page then learns of a newer build: pass offline's `<UpdateLine />` as the frame's children. Children are drawn on the top page over the top edge of the window, unscaled, outside the game (class `kit-res-over`).

## Look

`frame.css` (loaded by the frame): `--res-surround` (default `#000`) colours the letterbox. Classes: `kit-res-host`, `kit-res-frame`, `kit-res-over`. While the frame is mounted, `html` and `body` lose their margin and scrolling.

Tests: `ui.test.tsx` (jsdom).

## Use it in 10 lines

```ts
import { fitBox } from '../kit/resolution-frame/index'

console.log(fitBox({ w: 1920, h: 1080 }, { w: 1600, h: 1000 })) // { scale, left, top }: the box letterboxed in the window
```
