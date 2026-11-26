Replay recorded actions on a game's own table using its engine and view.

## Rules for agents

**What it does:** Rebuilds a recording in isolation, exposes each state and view, and controls action playback. The game supplies its own table, theme, engine, recording parser and turn or phase boundaries.

**You must:**
1. Import `createReplay` from `index.ts`; use `fromSave` in `save.ts` for engine-core saves. Import the latter from the same kit copy as the game engine.
2. Validate a game-specific file before passing its actions. Give `start` a fresh state built from its recorded seed and options, `apply` the actual engine action, and `view` the intended seat's redacted view. Do not pass the live store or its autosaves.
3. Use plain structured-cloneable data for actions, annotations, states, views and events. Do not use shared memory. Engines and presentation callbacks must be deterministic. The player rebuilds the whole recording and evaluates all presentation callbacks at load time. Failures during an action name that action. Memory grows with the total size of cached states, views, events and annotations.
4. Supply `boundary` for the game's turn or phase definition. A true result marks the endpoint after that action. Changes inside one action cannot be separate navigation positions. An action is one recorded engine input; events are outputs of that action; a turn can contain any number of actions. Navigation positions are counts of applied actions; `actionIndex` on `ReplayError` is zero based, and the message uses one based numbering.
5. For pacing, supply `isStep` and fold `get().steps` with paced-view's `foldView` using a table view object. Each step wraps its payload as `{ event, index }` so repeated events remain distinct. Capture that snapshot's `completeStep` for animation callbacks. `advance()` advances the current step immediately. Automatic playback and manual `next()` wait for the queue to empty. Use `skip()` to discard pending steps, or seek to clear them and pause.
6. Annotations correspond to action indexes and are untrusted context, not confirmed findings. The player never decides whether a reported result or a model's BUG claim is correct; the engine determines the replayed state.
7. At the last action, `ended` becomes true and playback stops. Final events can remain queued for completion or skip. At that position `play()` and `next()` return false. Seek or step back before playing again. Unsubscribe and call `dispose()` on unmount.

`fromSave(game, content, raw, view, format?, presentation?)` uses `restoreSave` for version, content and seal checks before playback. It accepts an object, so parse JSON with error handling first. Rejected actions report their index in the migrated log. A bad seal or incompatible content is a file-level error. The presentation options are `boundary`, `isStep`, and `visibleEvent`. The save adapter uses the default 1000 ms base interval. A game-specific adapter owns its own schema and any equivalent integrity or content-version checks; recordings lacking these cannot prove compatibility.

`createReplay(adapter, { actions, annotations? }, intervalMs?)` returns `get`, `subscribe`, `play`, `pause`, `setSpeed`, `next`, `previous`, `seek`, `previousBoundary`, `nextBoundary`, `advance`, `skip` and `dispose`. Speed is a positive multiplier; the default interval is 1000 ms. Boundaries include the start and end. `get()` supplies a stable snapshot until the next change, including `index`, `length`, `state`, `view`, `events`, `annotation`, `steps`, `playing`, `speed` and `ended`. The snapshot is privileged because it includes full engine state. `visibleEvent` filters events before they reach either `events` or `steps` (the default includes every event). `isStep` only selects which visible events are paced. Pass only the redacted view and approved events to the existing table. Include annotations only when appropriate for that audience. Controls and screen layout remain game-owned. No live store or persistence is called.

## Use it in 10 lines

```ts
import { createReplay } from '../kit/visual-replay/index'
const p = createReplay({ start: () => ({ n: 0 }), apply: (s, a: number) => ({ state: { n: s.n + a }, events: [a] }), view: (s) => s.n }, { actions: [1, 2] })
p.next()
console.log(p.get().view) // 1
p.previous()
p.dispose()
```
