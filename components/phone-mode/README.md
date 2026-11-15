# phone-mode

The mechanism of a phone layout: which layout a window gets, the fit zoom of the large screens, safe-area tokens, the one bottom sheet, folds, second-tap commit, the sideways panel. The game keeps its screens, zones, sheet contents, words and look. Needs `state-machines` and the packages `react` and `zustand`. `index.ts` draws nothing and loads in node; `ui.ts` holds the React parts.

## Layout (`layout.ts`, `viewport.ts`)

- `layoutModeFor({ w, h, coarse, setting, autoPhone?, shortSide?, deskW?, deskH? })`: `desk` (window at least 3840x2160 or the given design size), `fitted`, `phonePortrait`, `phoneLandscape`. A phone is the setting `phone`, or `auto` with a coarse pointer and a short side of at most 500 CSS px; it follows the window, never the user agent, so a narrow desktop window is not a phone. Sideways needs a touch pointer. `layoutAttr`, `isPhone`.
- `fitZoom(w, h, dw?, dh?)`, `applyFit(el, size | null, dw?, dh?)`: CSS zoom of the app container in the fitted mode; the phone screens never use zoom.
- `useViewport` (zustand, machine `kit.viewport`): `start(root, { setting?, onSetting?, phoneScreen?, autoPhone?, shortSide?, deskW?, deskH? })` returns the stop function. It follows resize, rotation, the visual viewport, the pointer, `hashchange` and the game's setting; writes `data-layout` (desk | fitted | phone), `data-orient` (portrait | landscape) and `data-display` (browser | standalone) on `<html>`; zooms `root` when `needsFit(mode, hash, phoneScreen)` (fitted, or a phone upright on a location with no phone screen yet). A rotation changes nothing else, so turning back loses nothing.
- `setSafeArea(top, right, bottom, left, el?)`: sets `--sat --sar --sab --sal` for an end-to-end test (a browser test cannot emulate a notch).

Page setup the source game learned on a real iPhone: the viewport meta is `width=device-width, initial-scale=1` without `viewport-fit=cover`, and without `apple-mobile-web-app-capable` or a `black-translucent` status bar (they left a band under the dock in the Home Screen app); full-height layers use `100dvh` (`--pm-h`), and the stylesheet gives html and body `height: 100%` in the phone layout.

## Sheet, folds, second tap

- `<Sheet title onClose foot? testId? height? slideMs? closeLabel? closeText? className?>`: a full-screen layer, scrim (tap closes), the panel at the bottom up to 88% of the screen, handle, title (labels the dialog by a per-instance id), 44 px close button, scrolling body, optional foot in the thumb zone. `slideMs` 0 for no motion.
- `createSheetStore(machine, keeps?)`: a zustand store over the game's own sheet machine (its states and events): `state`, `data`, `send(event, data?)`, `sendIfCan(event)` (for a version change with nothing open). Data stays while `keeps(state)` (default: any state but the initial).
- `foldMachine(id, initial, describe)`: a folded/open table for one part (a clause line, a result panel).
- `useSecondTap(commit, resetKey?)` (machine `kit.secondTap`): `tap(id)` arms `id`, a tap on the armed one calls `commit(id)`, a tap on another re-arms; a change of `resetKey` or `disarm()` disarms. `armed` is the id the game marks. Pure step: `secondTap(armed, id)`.
- `<RotatePanel testId?>{game content}</RotatePanel>`: over every screen while `useViewport.mode` is `phoneLandscape`, the game mounted underneath; `data-no-capture` keeps it out of a bug-report screenshot.

## Look

`phone-mode.css` (loaded by `Sheet.tsx`) sets neutral values at zero specificity; set the variables on `:root` or an ancestor: `--pm-h`, `--pm-z`, `--pm-scrim`, `--pm-sheet-bg`, `--pm-sheet-text`, `--pm-sheet-radius`, `--pm-sheet-max` (a fraction), `--pm-handle`, `--pm-head-font`, `--pm-close-font`, `--pm-foot-border`, `--pm-rotate-bg`, `--pm-rotate-text`, `--pm-rotate-z`; safe area `--sat --sar --sab --sal` (default `env(safe-area-inset-*)`). Classes: `kit-pm-layer`, `-scrim`, `-sheet`, `-sheet-hd`, `-sheet-title`, `-x`, `-sheet-body`, `-sheet-foot`, `-rotate`. Select phone tokens with `:root[data-layout='phone']`.

Tests: `phone-mode.test.ts` (node), `ui.test.tsx` (jsdom).
