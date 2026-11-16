# resolution-frame

A Resolution setting that works: on a PC the game is laid out as on a screen of the chosen size, then the whole picture is scaled to fill the browser window (letterboxed). The game runs in a same-origin `<iframe>` of that size, so every media query sees the chosen width and height. Needs settings (its `resolutionSetting` and `resolutionSize`) and the package `react`. `index.ts` draws nothing; `ui.ts` holds the framed page. A game that does not mount the frame is unchanged.

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
