# phone-mode

The mechanism of a phone layout: which layout a window gets, the fit zoom of the large screens, safe-area tokens, the one bottom sheet, folds, second-tap commit, the sideways panel. The game keeps its screens, zones, sheet contents, words and look. Needs `state-machines`, `ui-helpers` and the packages `react` and `zustand`. `index.ts` draws nothing and loads in node; `ui.ts` holds the React parts.

## Rules for agents

**What it does:** The mechanism of a phone layout: layout mode, fit zoom, safe areas, the bottom sheet, dock and second tap.

**You must:**
1. Call `useViewport.getState().start(root, { ... })` once at start-up and keep the stop function; pass `fit: false` when app-frame `<Stage>` scales.
2. Select phone styles with `:root[data-layout='phone']`; a phone follows the window and a coarse pointer, not the user agent.
3. Use the viewport meta `width=device-width, initial-scale=1` without `viewport-fit=cover`, no `apple-mobile-web-app-capable`; size full-height layers with `--pm-h` (`100dvh`).
4. Keep a game test `phoneLayerCheck(files, ...).faults` equal to `[]`, reading the game's CSS.
5. All words come from the game: `Sheet` needs `title` and `onClose`; give `slideMs` / `leaveMs` / `arriveMs` from the motion setting (0 = none).
6. To close a `Sheet` from outside set `leaving` and handle `onLeft` (`onClose` is not called then).
7. Feed `createHaptics({ enabled })` from the game's Haptics setting; use `setSafeArea` in e2e tests (a browser cannot emulate a notch).
8. Use `dockWantsOpen`, `useDock(wants, dockKey(...))` and `shortPrompt` together for the prompt dock.
9. Install Playwright separately if you run the standalone screenshot script `demo/imp-shots.mjs`. The phone component does not require it.
10. Keep nested dialogs in opening order: only the last active dialog handles Escape. A Modal above a Sheet closes first; an inert leaving sheet no longer owns the keys. Custom overlays should use the shared `ui-helpers` active-overlay check.

**Common mistakes:**
- Using CSS zoom on a phone screen: only the fitted mode zooms.
- Fixed bottom layers without `top: 0; height: var(--pm-h)` leave a band under the dock on iPhone; the layer check reports them.


## Layout (`layout.ts`, `viewport.ts`)

- `layoutModeFor({ w, h, coarse, setting, autoPhone?, shortSide?, deskW?, deskH? })`: `desk` (window at least 3840x2160 or the given design size), `fitted`, `phonePortrait`, `phoneLandscape`. A phone is the setting `phone`, or `auto` with a coarse pointer and a short side of at most 500 CSS px; it follows the window, never the user agent, so a narrow desktop window is not a phone. Sideways needs a touch pointer. `layoutAttr`, `isPhone`.
- `fitZoom(w, h, dw?, dh?)`, `applyFit(el, size | null, dw?, dh?)`: CSS zoom of the app container in the fitted mode; the phone screens never use zoom.
- `useViewport` (zustand, machine `kit.viewport`): `start(root, { setting?, onSetting?, phoneScreen?, autoPhone?, shortSide?, deskW?, deskH?, fit? })` returns the stop function (`fit: false` never zooms the root: use it with app-frame `<Stage>`, the one scaler). It follows resize, rotation, the visual viewport, the pointer, `hashchange` and the game's setting; writes `data-layout` (desk | fitted | phone), `data-orient` (portrait | landscape) and `data-display` (browser | standalone) on `<html>`; zooms `root` when `needsFit(mode, hash, phoneScreen)` (fitted, or a phone upright on a location with no phone screen yet). A rotation changes nothing else, so turning back loses nothing.
- `setSafeArea(top, right, bottom, left, el?)`: sets `--sat --sar --sab --sal` for an end-to-end test (a browser test cannot emulate a notch).

Page setup the source game learned on a real iPhone: the viewport meta is `width=device-width, initial-scale=1` without `viewport-fit=cover`, and without `apple-mobile-web-app-capable` or a `black-translucent` status bar (they left a band under the dock in the Home Screen app); full-height layers use `100dvh` (`--pm-h`), and the stylesheet gives html and body `height: 100%` in the phone layout.

## Sheet, folds, second tap

- `<Sheet title onClose foot? testId? height? slideMs? closeLabel? closeText? className?>`: a full-screen layer, scrim (tap closes), the panel at the bottom up to 88% of the screen, handle, title (labels the dialog by a per-instance id), 44 px close button, scrolling body, optional foot in the thumb zone. `slideMs` 0 for no motion.
- `createSheetStore(machine, keeps?)`: a zustand store over the game's own sheet machine (its states and events): `state`, `data`, `send(event, data?)`, `sendIfCan(event)` (for a version change with nothing open). Data stays while `keeps(state)` (default: any state but the initial).
- `foldMachine(id, initial, describe)`: a folded/open table for one part (a clause line, a result panel).
- `useSecondTap(commit, resetKey?)` (machine `kit.secondTap`): `tap(id)` arms `id`, a tap on the armed one calls `commit(id)`, a tap on another re-arms; a change of `resetKey` or `disarm()` disarms. `armed` is the id the game marks. Pure step: `secondTap(armed, id)`. `useCommitTap(commit, { twoTap, resetKey?, onArm? })`: the game's flag picks one tap or two. `<Scaled w h box>`: a fixed `w` x `h` piece drawn at a `box` px width. `createHaptics({ enabled?, vibrate? })` (`haptics.ts`, navigator.vibrate, Android only): `armed() sent() refused() land(key) impact(key)`; land and impact play once per key; `later(kind, key)` returns the tick to call when the motion passes, `snap()` drops all pending ones; `enabled` is the game's Haptics setting.
- `<RotatePanel testId?>{game content}</RotatePanel>`: over every screen while `useViewport.mode` is `phoneLandscape`, the game mounted underneath; `data-no-capture` keeps it out of a bug-report screenshot.
- Decision dock (`dock.ts`, machine `kit.dock`): `dockWantsOpen(decision | null, tappable)` is false only while a tap on the board answers (one pick, no button of its own, nothing ticked, every option's `ref` in `tappable`; `boardOnly` folds, `pending` opens). `useDock(wants, dockKey(id, wants, parts?))` gives `[open, toggle]`: the player's fold or open holds until the key changes (pure: `dockState`, `dockToggle`). `pickTabs(ids, tabOf)`: the tabs a pick lights.
- `shortPrompt(table, prompt, fallback?)`: the folded dock's one line; the game's `table` is a `Record` of its prompt kinds (its words), with the helpers `bare`, `lead`, `fixPlurals` ("2 red tile(s)" to "2 red tiles", count 1 drops "(s)"; it only adds a plain "s", so the game words irregular plurals itself).
- CSS checks for the game's own test (`layerCheck.ts`, pure, the test reads the files): `phoneLayerCheck([{ file, css }], { scope?, heightVar?, fixedBase?, allow? })` returns `unsized` (fixed layers anchored to the bottom that are not `top: 0` with `height: var(--pm-h)`), `directUnits` (dvh/vh outside the variable), `guarded`, and `faults` (all of it in lines, plus "nothing was guarded" when no rule matched: expect `[]`); quotes in selectors are normalised and nested rules are read under their parent; `bottomPadding(css, selector, inset, nth?, insetVar?)` evaluates a bar's `padding-bottom` at a safe-area inset (assert it at 0 and 34).

## Imperium's phone screen (K263, `PhoneFrame.tsx`)

Source: Imperium U11/U12 (the owner's most played phone game); its proportions and behaviour are the defaults. All words come from the game; hooks are `data-part` (no ids), the CSS is structure only (`phone-frame.css`, zero specificity).
- `<PhoneFrame top banner? dock tabs dockOpen tab>` with `<PhoneArea id shown>` per tab (each scrolls on its own, hidden ones keep their place). Portrait: top bar, areas, prompt line, tab bar. Landscape (short, wide): tabs a rail on the left, the open prompt a column right (`--pm-dock-col`), folded one line under the areas. `--pm-tabs` sets the tab count (4).
- `<TabBar tabs active onTab label>`: `PhoneTab { id, label, lit?, litNote? }`; the active one is `aria-pressed`; `lit` puts a pick light on the tab (`--pm-pick*`); a tap on the active tab scrolls its area to the top. Buttons stop 18 px above the screen's edge (`--sab - 16px`).
- `<PromptLine open onToggle short counts? kicker label>{body}</PromptLine>`: folded, one line (chevron up, the short words, `counts` at the right); open, a head and the body (kept mounted, `hidden`). Pair with `dockWantsOpen`, `useDock`, `shortPrompt`.
- `<TopBar start end>` and `<PhoneMenu open onClose label>` (scrim, Escape, a press inside closes).
- Imperium's current dock behaviour: `dockWantsOpen` decides open or folded, `useDock(wants, dockKey(...))` holds the player's fold until the key changes, `pickTabs` lights the tabs; feed `open` to `PromptLine` and `PhoneFrame`.
- `<Sheet>` now also: the layer behind it is `inert` while it is open and focus returns to the opener on close; `leaveMs` (Imperium 240; default 0) slides it down before `onClose`, `inert` and `data-state="leaving"` meanwhile, at once with `slideMs` 0 or reduced motion; Escape (capture phase) closes, a swipe down on the head past `SWIPE_CLOSE_PX` (70) closes and a shorter drag springs back, focus goes into the panel, the scrim fades in, `arriveMs` (Imperium's `ARRIVE_MS` 250; default 0) ignores scrim taps just after opening, reduced motion is still. `<SheetActions actions reason? note?>` as `foot`: the primary action grows, Cancel is plain.
- K279: `<Sheet leaving onLeft closeButton>`: `leaving` (default false) lets the caller close it from outside: the same `leaveMs` slide-down and `inert`, then `onLeft` (`onClose` is not called; at once with `slideMs` 0, `leaveMs` 0 or reduced motion); `closeButton={false}` hides the close button. `<PhoneFrame testId style>`, `<PhoneMenu id>`, `SheetAction.testId` pass straight through.

## Look

`phone-mode.css` (loaded by `Sheet.tsx`) sets neutral values at zero specificity; set the variables on `:root` or an ancestor: `--pm-h`, `--pm-z`, `--pm-scrim`, `--pm-sheet-bg`, `--pm-sheet-text`, `--pm-sheet-radius`, `--pm-sheet-max` (a fraction), `--pm-handle`, `--pm-head-font`, `--pm-close-font`, `--pm-foot-border`, `--pm-rotate-bg`, `--pm-rotate-text`, `--pm-rotate-z`; safe area `--sat --sar --sab --sal` (default `env(safe-area-inset-*)`). Classes: `kit-pm-layer`, `-scrim`, `-sheet`, `-sheet-hd`, `-sheet-title`, `-x`, `-sheet-body`, `-sheet-foot`, `-rotate`. Select phone tokens with `:root[data-layout='phone']`.

Tests: `frame.test.tsx` (K263), `phone-mode.test.ts`, `dock.test.ts` (node), `ui.test.tsx` (jsdom), `haptics.test.ts`.

## Use it in 10 lines

```ts
import { fitZoom, layoutAttr, layoutModeFor } from '../kit/phone-mode/index'

const mode = layoutModeFor({ w: 390, h: 844, coarse: true, setting: 'auto' })
console.log(layoutAttr(mode), fitZoom(1920, 1080)) // 'phone'; zoom that fits the 3840x2160 desk layout
```

```tsx
import { useViewport } from '../kit/phone-mode/index'
import { Sheet } from '../kit/phone-mode/ui'

useViewport.getState().start(document.body, { fit: false }) // once at start; fit: false when a <Stage> scales
export const Help = ({ close }: { close: () => void }) => <Sheet title="Help" onClose={close}><p>Words</p></Sheet>
```
