# paced-view

What the table shows while an answer's events play one step at a time. Pure, no packages, no game types: the game supplies its view type `V`, its event type `E` and its fold. Loads in node.

## Rules for agents

**What it does:** What the table shows while an answer's events play one step at a time.

**You must:**
1. Keep `Steps` in the game's store; reset it with `noSteps()` on undo, redo, load and a new game.
2. After an answer call `pushSteps(steps, before, events, isStep, instant)` where `before` is the view the answer was given on; `instant` queues nothing.
3. Show `foldView(steps, live, fold)` when it is not null, else `live`; the game clears the open question on the folded view itself.
4. Call `stepper.drive()` on every store change, and make `play` call `next` at the step's end (or `read(ms)` for a step that only waits).
5. Fold "view or base missing" into `instant()`.
6. Give `left()` the motion player's `skipAll()`; bind `press()` to pointerdown and keydown before motion-frame's `skipOnInput`.

**Common mistakes:**
- A store that notifies later than `advance` makes every step end call `left()`.
- A late `next` from a step no longer at the head does nothing: do not rely on it.


## Step queue

`Steps<V, E>` is `{ base, events, queue }`: the view before the answer, the answer's events, the steps still to play (the head is on screen). Keep it in the game's store.

- `noSteps()`: after undo, redo, load, a new game.
- `pushSteps(steps, before, events, isStep, instant = false)`: after an answer. `before` is the view the answer was given on; `isStep` says which events are shown as a step. While steps are queued the base stays and the events join. `instant` queues nothing.
- `advance(steps)`, `skip(steps)`: drop the head, drop all.

## foldView

`foldView(steps, live, fold, { shown?, later? })`: the result of the game's `fold(base, events, live, later)` for the step at the head, or null when nothing is paced (show `live`). `events` are those on the table (up to the step, or `shown(events, step)`: a piece a later beat moves may stay back), `later` those not on the table yet (after the step, or `later(e, step, events)`), for what is easier counted back from `live`. `foldBefore(steps, step, live, fold)`: the view where the step's motion starts.

The fold returns what the game wants (`V`, or `{ view, dice }`). The game clears the question on the folded view itself.

## Stepper

`createStepper({ head, advance, skip, instant, play, left?, idle? })` gives `{ drive, press, current }`. Call `drive()` on every store change.

- `play(step, next, read)`: start the step's motion and call `next` at its end, or `read(ms)` for a step that only waits to be read. A late `next` of a step no longer at the head does nothing. A `play` that throws passes the step.
- `instant()` true: the queue is skipped, nothing plays. Fold "view or base missing" into it (`instant: () => setting === 'instant' || !view || !steps.base`): the original skipped the queue then.
- `read(ms)` from a step that is no longer current does nothing.
- `left()`: the step on screen changed by something other than its own end (answer, undo, load): end its motion (`player.skipAll()`). A step's own end does not call it only because `advance` re-drives synchronously (calls `drive()` before returning); a store that notifies later makes every step end call `left()`. `idle()`: the queue is empty.
- `press()`: ends a reading step; true when it did. Bind it to pointerdown and keydown before `skipOnInput` of motion-frame, so one press does not end a beat and the reading step after it.

## questionZone

`questionZone(targets, zones, { home = 'question', alt = 'question.alt', altOk? })`: the zone name for the question band. `zones` is the layout (`{ r: [x, y, w, h] }` per zone), `targets` the zones the open question asks about. It gives `alt` when a target's rect overlaps `home` and every target is in `altOk` (the zones `alt` itself does not cover; all when left out); else `home`.

## Use it in 10 lines

```ts
import { advance, noSteps, pushSteps } from '../kit/paced-view/index'

type Ev = { type: 'draw' | 'note' }
let s = pushSteps(noSteps<string, Ev>(), 'view-before', [{ type: 'draw' }, { type: 'note' }], (e) => e.type === 'draw')
s = advance(s) // the table shows one step more
console.log(s.events.length, s.queue.length)
```
