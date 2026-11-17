# app-icons

Opaque home-screen icons and a web manifest from a game's own SVG/PNG mark. Requires `playwright-core` and its installed Chromium; `PW_CHROMIUM_PATH` overrides the executable.

## Use it in 10 lines

```js
import { buildIcons } from './app-icons.mjs';
console.log(await buildIcons({ mark: 'logo.svg', out: 'public/app-icons',
  name: 'My Game', shortName: 'Game', background: '#173329', width: 0.8,
  html: 'index.html' }));
```

CLI: `node kit/app-icons/app-icons.mjs --mark logo.svg --out public/app-icons --name "My Game" --background '#173329' --width 0.8 --html index.html`.

Writes icon-180.png, icon-192.png, icon-512.png, icon-512-maskable.png and manifest.webmanifest. Prints the exact head tags; `--html` replaces existing tags idempotently. `--path` is the relative URL directory (default `app-icons`). Keep the output in that public directory.

`--short-name` defaults to name. `--background-image` covers the tile over the required background colour. `--x` / `--y` nudge the mark as fractions of the tile. Width is a tile fraction; tall marks are fitted. Maskable marks, including their nudge, fit the central 80% diameter circle. Output is opaque even with translucent inputs.

`--manifest-root` (`manifestRoot: true`) writes the manifest one folder up, at the public root, with `start_url` and `scope` `./` and icon paths under `--path`; the head tag then points at `manifest.webmanifest`. Use it when an offline cache or test expects `/manifest.webmanifest`. Negative nudges work as `--x -0.1` or `--x=-0.1`. A bad colour or a mark without an intrinsic size (an SVG with only a viewBox) fails before anything is written.

By default the manifest lives beside the icons: its `../` start URL and scope resolve to the app root under any base URL (equivalent to `./` in a root manifest).
