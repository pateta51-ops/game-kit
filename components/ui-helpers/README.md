# ui-helpers

Small screen helpers with no look and no game types. The stores are zustand vanilla stores: read them in React with
`useStore(store, selector)`. Every timer goes through an optional `timers: { set, clear }`, so tests need no real clock.

| Helper | What the game passes in |
|---|---|
| `createHoverHold(movePx = 3)` | Nothing. `bindHoverHold(hold, window)` once; call `hold.start()` when an overlay closes; a piece ignores pointer-enter while `hold.held()`. |
| `createInspect<T>({ openMs = 700, closeMs = 180, timers })` | `open(target)` on pointer-enter, `openNow(target)` on right-click, `close()` on leave, `hold()` when the pointer enters the inspector, `closeNow()` when the game changes. |
| `createToasts<Tone>({ max = 4, ms = 6000, timers })` | `push({ text, tone, title? })` returns the id. A toast with a title stays until `dismiss(id)`; the others go after `ms`. |
| `createSelection<Id>()` (for an engine-core prompt use prompt-host: its widgets and `useBoardPick` hold the picks) | `toggle({ version, promptId, max }, id)`; read with `picksFor(selection, { version, promptId })`; call `reset()` when the game store's version changes. |
| `onlyForcedAnswer(prompt, on, never?)` (for an engine-core prompt use prompt-host: `autoAnswer` and `answerWithForced`) | The prompt's `min` and `options` (`id`, `enabled`), the setting, and whether this prompt is on the game's never-list. Gives the one pick or null. |
| `probedAnswer(state, answer, apply, cost)` | A pure `apply` (null or a throw when refused) and a `cost(before, after)` that names what the player lost or learned, or null. Gives the answer or null. |
| `sheetMatching(blocks, q, read = sheetWords)` | The rules screen's blocks as `{ level?, text }` (level 1, 2... for a heading). Gives the indexes to show: blocks holding every word, their headings, and the whole section of a heading that matches. |
| `compileIconWords(file, names, letters)`, `iconizeSegments(table, text, segs, lead)` | The word-to-icon rules, the proper names inside which nothing is replaced, and the glossary matcher's segments. Gives the segments with `iconWord` ones (`code`, `style`, the words as label, the entry `id`). `withoutIconWords(text, match)` drops a word that follows its own icon. |
| `bindPromptKeys(document, { open, panel, keys?, clear?, back?, overlay? })` | 1-9 click `[data-shortcut="n"]` in the panel; Escape runs `clear`, then `back`; `keys` holds the game's own. Returns the unbind. |
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

## Use it in 10 lines

```ts
import { createToasts } from '../kit/ui-helpers/index'

const toasts = createToasts<'info' | 'warn'>({ max: 3, ms: 4000 }) // a zustand store: the game draws it
const id = toasts.getState().push({ text: 'Saved', tone: 'info' })
toasts.getState().dismiss(id)
```
