# ui-helpers

Small screen helpers with no look and no game types. The stores are zustand vanilla stores: read them in React with
`useStore(store, selector)`. Every timer goes through an optional `timers: { set, clear }`, so tests need no real clock.

## Rules for agents

<!-- hooks: written by scripts/catalog.mjs from docs/catalog-notes.json; do not edit -->
**Hooks a game calls:**
- `bindPromptKeys` + `bindPlayKeys`: background keyboard shortcuts and prompt keys that pause under a dialog
- `activeOverlay`: find the active overlay keyboard owner
<!-- /hooks -->

**What it does:** Small screen helpers with no look and no game types: hover hold, inspect, toasts, selection, forced-answer and probe helpers, sheet search, icon words, prompt and play keys, and link tooltips.

**You must:**
1. Import from `../kit/ui-helpers/index`; read the zustand stores in React with `useStore(store, selector)`.
2. Pass the optional `timers: { set, clear }` where tests need no real clock.
3. Call `bindHoverHold(hold, window)` once; call `hold.start()` when an overlay closes; pieces ignore pointer-enter while `hold.held()`.
4. Call `selection.reset()` when the game store's version changes; picks of another version or prompt are ignored anyway.
5. For an engine-core prompt use prompt-host (`useBoardPick`, `autoAnswer`) instead of `createSelection` and `onlyForcedAnswer`.
6. Keep every bind's returned unbind and call it on teardown (`bindPromptKeys`, `bindPlayKeys`, `bindLinkTooltip`).
7. In `bindPlayKeys`, do not map the reserved keys 1-9, Enter, Escape, `?` or arrows in `board`: it throws. Pass `paused: () => help.getState().open` to `bindPromptKeys` so Escape closes help first.
8. Keep the game's own words, keys, never-list, cost function and icon table out of the helpers: the game passes them in.
9. Give custom overlays a dialog role or pass their selector as `overlay`. Only active overlays suppress board shortcuts: hidden, inert, aria-hidden and CSS-hidden ancestors are ignored. Use `activeOverlay` for other keyboard owners so they follow the same rule.

**Common mistakes:**
- Searching rule ids with `sheetMatching`: it only sees printed words by design.
- Wiring tooltips per link: one `bindLinkTooltip` call on a container is enough.

| Helper | What the game passes in |
|---|---|
| `createHoverHold(movePx = 3)` | Nothing. `bindHoverHold(hold, window)` once; call `hold.start()` when an overlay closes; a piece ignores pointer-enter while `hold.held()`. |
| `createInspect<T>({ openMs = 700, closeMs = 180, timers })` | `open(target)` on pointer-enter, `openNow(target)` on right-click, `close()` on leave, `hold()` when the pointer enters the inspector, `closeNow()` when the game changes. |
| `createToasts<Tone>({ max = 4, ms = 6000, timers })` | `push({ text, tone, title? })` returns the id. A toast with a title stays until `dismiss(id)`; the others go after `ms`. |
| `createSelection<Id>()` (for an engine-core prompt use prompt-host: its widgets and `useBoardPick` hold the picks) | `toggle({ version, promptId, max }, id)`; read with `picksFor(selection, { version, promptId })`; call `reset()` when the game store's version changes. |
| `onlyForcedAnswer(prompt, on, never?)` (for an engine-core prompt use prompt-host: `autoAnswer` and `answerWithForced`) | The prompt's `min` and `options` (`id`, `enabled`), the setting, and whether this prompt is on the game's never-list. Gives the one pick or null; null when that lone option is `unseen` (the player has not seen what it is, K641). |
| `probedAnswer(state, answer, apply, cost)` | A pure `apply` (null or a throw when refused) and a `cost(before, after)` that names what the player lost or learned, or null. Gives the answer or null. |
| `sheetMatching(blocks, q, read = sheetWords)` | The rules screen's blocks as `{ level?, text }` (level 1, 2... for a heading). Gives the indexes to show: blocks holding every word, their headings, and the whole section of a heading that matches. |
| `compileIconWords(file, names, letters)`, `iconizeSegments(table, text, segs, lead)` | The word-to-icon rules, the proper names inside which nothing is replaced, and the glossary matcher's segments. Gives the segments with `iconWord` ones (`code`, `style`, the words as label, the entry `id`). `withoutIconWords(text, match)` drops a word that follows its own icon. |
| `bindPromptKeys(document, { open, panel, keys?, clear?, back?, overlay? })` | 1-9 click `[data-shortcut="n"]` in the panel; Escape runs `clear`, then `back`; `keys` holds the game's own. Returns the unbind. |
| `activeOverlay(root, selector?)`, `isActiveElement(element)` | The last active matching overlay in document order (default: dialog or alertdialog), or null; the shared visibility check. DOM roots use `querySelectorAll`; an abstract root with only `querySelector` checks its one result. |
| `bindLinkTooltip(root, { selector, read, open, close, restMs = 250, graceMs = 300, timers })` | One call on any container (log, prompt, rulings, tutorial text), no per-link wiring: `read(link)` gives the card id, `open(id, link)` floats the tooltip. Rest delay only for the first open; touch ignored; a press hides it until the pointer leaves the link. Returns the unbind. Glossary links keep their click popover; this is the hover preview. |

```ts
const picks = createSelection<string>();
gameStore.subscribe((next, prev) => {
  if (next.version !== prev.version) picks.getState().reset();
});
```

The selection ignores picks of another version or prompt even before `reset()` runs, so a returning prompt id starts
empty. `onlyForcedAnswer` is the screen side of the engine-core test that every auto-answered prompt has one legal answer.

The sheet search never searches or returns a rule id: a block is only its level and its printed words. Not here: the drawing (toast list, inspector panel, rules screen, icons), the game's never-list, its cost function, its
icon table, its keys and its texts.

## Keyboard play

`bindPlayKeys(document, { enabled?, panel?, confirm = '[data-confirm]', list = '[data-key-list]', item?, board?, help?, overlay? })`: Enter clicks the panel's confirm control (not when a button has focus); arrows move focus through the items of a list the game marks `data-key-list` (wrapping); `board` maps `event.key` to an action (false = did nothing); `?` opens the `help` store (`createShortcutHelp()`), Escape closes it. Ignored while typing, with a modifier, under an active dialog, with `enabled` false, and on key repeat. A closed always-mounted dialog does not block shortcuts. Custom `overlay` selectors use the same visibility rules. `board` throws on reserved keys: 1-9, Enter, Escape, `?` and the arrows. Beside `bindPromptKeys`, pass it `paused: () => help.getState().open` so Escape closes the help first in either bind order. Returns the unbind. `shortcutHelpElement(document, rows, title)` builds an unstyled dialog of `{ keys, what }` rows, or draw the store yourself. Play convenience only; keys and labels are the game's.

```ts
import { bindPlayKeys, createShortcutHelp } from '../kit/ui-helpers/index'

declare function endPhase(): boolean
const help = createShortcutHelp() // the game draws it while help.getState().open
const unbind = bindPlayKeys(document, { panel: () => document.querySelector('#prompt'), board: { e: () => endPhase() }, help })
unbind()
```

## Use it in 10 lines

```ts
import { createToasts } from '../kit/ui-helpers/index'

const toasts = createToasts<'info' | 'warn'>({ max: 3, ms: 4000 }) // a zustand store: the game draws it
const id = toasts.getState().push({ text: 'Saved', tone: 'info' })
toasts.getState().dismiss(id)
```
