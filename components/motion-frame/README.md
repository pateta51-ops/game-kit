# motion-frame
Plays motion specs in the director's format (one JSON per beat: `actors`, `steps` of `{t, dur, actor, do, to?}`, `sound` of `{t, cue}`, `maxMs`, `frequency`, `stage`). It knows no game and draws nothing: verbs draw. Loads in node; no packages.
## Timeline (`timeline.ts`, pure)
- `stageFromLayout(layout, live?)`: a `Stage` (zone id to `[x, y, w, h]`) from a layout JSON; `live` is the game's resolver, asked first (live and dynamic targets). A game may pass any function as a stage.
- `buildTimeline(spec, stage, factor = 1)`: `{ id, ms, actors, calls, cues }`. A call is `{ t, dur, actor, zone, verb, from, to?, value?, step }` with times multiplied by `factor`, sorted by time. An actor's `at` and a move's `to` are centres: the rectangle has the actor's `w`, `h` (the zone's size without them). `from` is where the actor is after its earlier moves; a step whose actor is a zone id has `zone: true`. A number as `to` is `value`. `step` is the spec's step (`ease`, `label`, `pulse`, `then`).
- `validateSpec(spec, stage, verbs)` and `validateSpecs(specs, stages, verbs)`: lines of problems (unknown verb, actor or zone that does not resolve, no `maxMs` or last step after it, a cue after the last step's end, a point `at` without `w` and `h`, bad shape; a spec without `stage` uses `stages.default`). Call it from the game's check with the registry or a list of verb names.
## Player (`player.ts`)
`createVerbs()` is the registry the effect library and the game fill: `register(name, (call, run) => finish?)`. `run` is `{ id, timeline, context }`; the returned `finish` is called once, at the call's end or on a skip.
`createMotionPlayer({ specs, stages, verbs, speed, context, onCue?, onBeatStart?, onBeatEnd?, onProblem? })`:
- `play(beat, { onEnd? })`: a beat name, or a spec the game built from a template. Beats play in order, one at a time; with `parallel: true` a beat starts at once beside the one playing, outside the queue (for `constant` beats of one answer that overlap). `skipAll`, `pending()` and `busy()` count it.
- `play(beat, { commit?, data? })`: commit applies the game's next state once, in queue order.
  `onBeatStart` sees `run.data` before commit, including when a queued commit is snapped.
- `swap: { select?, stagger?, dur?, ease?, enter?, leave?, maxStagger? }` measures before commit
  and polls a frame after it. Use unique `data-motion-key` values. The optional selector limits the elements measured.
  `whenReady` and `awaitRects` poll the committed board. A swap's started run gets its full timeline after redraw.
  Defaults: 420 ms, 70 ms stagger capped at eight intervals, fade entries and shrinking exit ghosts.
  With `enter: 'from'`, `data-motion-from` is a source selector. `leave: 'none'` drops exit ghosts.
  Arrivals carry `data-motion-landing` until they land. Skip, hurry and instant speed snap commits and clear flights.
- A spec's `pan` is the target passed to the optional `pan(scale, signal)` session factory's
  `ensure(target)` method. It runs before rect polling, the start hook and commit.
  Panned beats use the ordered queue. One session spans the queue, and its async
  `back()` returns the view when the queue drains. A factory may return null off phone.
  Pointer, touch, wheel and key input abort the signal and leave the view where it is.
  A held beat keeps the session open. `hurry()` and `skipAll()` cancel it.
  Each ensure and return times out after `panTimeoutMs` (default 2000 ms).
  Instant and reduced beats start no pan.
  Custom adapters should stop any movement when the signal aborts.
- `scrollPan({ scroller, tabs?, activeTab?, inView? })` makes a session factory.
  Pass a selector as the target and return the current scroll container from `scroller`.
  For tabbed views, supply the destination button via `tabs(selector)` and the
  current button via `activeTab()`. Buttons should stay mounted during the session.
  The default checks the scroller bounds. Pans ease over 350 ms times the motion scale.
- `withViewTransition(apply, speed, { onCardStart, id, signal })` uses the browser transition when enabled. K402: `onCardStart(0, id)` is called once when the flight takes off (at once under instant); an aborted `signal` skips the transition to its end state with no start.
  Supply a synchronous DOM update (React can wrap it in `flushSync`) or return the redraw promise.
  Import `view-transition.css` to use the durations set by `putMotionSpeed`.
  Mark a clipping panel with `data-vt-clip` to exclude its partially visible inline-named elements.
  The helper is independent of the board swap.
- `speed()` is read when a beat starts: a factor (1, 0.5) or `'instant'`. Instant builds no timeline: `onEnd` fires at once, and the cues are still called, in order.
- `busy()`: a `rare` or `once` beat is playing or queued. `constant`, `often` and `each round` never set it. A pan return counts in both `busy()` and `pending()`. `subscribe(f)`.
- `skipAll()`: everything playing and queued jumps to its end: open verbs finish, every `onEnd` fires, cues not yet due are dropped. `skipOnInput(player, window)` calls it on any press or key.
- `onCue(cue, beatId)` at the cue's time. A verb, hook or cue that throws goes to `onProblem`; the queue goes on.
- `withReducedMotion(speed)`: `'instant'` when the system asks for reduced motion. `BeatTable<Kind>`: type for the game's event-kind to beat-names table, so a kind without an entry fails the type check.
- `withAutomationOff(speed, marker = 'KitMotion')`: `'instant'` in an automated browser (`navigator.webdriver`), unless the user agent carries `marker` or the address has `?motion=on`; a real player is untouched. Use `speed: () => withReducedMotion(withAutomationOff(setting))`. The e2e suite then runs fast and steady; a second Playwright project runs the flows again with motion on: `{ name: 'chromium-motion', use: { ...devices['Desktop Chrome'], userAgent: devices['Desktop Chrome'].userAgent + ' KitMotion' }, testMatch: /(flows|motion)\.spec\.ts$/ }`. `putMotionSpeed(speed, name = 'on')`: `<html data-motion>` (`off`, or `name`, e.g. `fast`) and `--motion-scale` (the factor, 0 when off) for the game's CSS; call it at start and when the setting changes; `bindMotionSpeed(() => speed, () => name)` calls it again when the system's reduced-motion setting changes (returns the unbind). Without a `document` it does nothing.
- Opt-in pacing (K142): a step with `read: true` is a hold for reading, timed by `pace(factor)` (default `max(1, factor)`: Slow lengthens it, Quick does not shorten it). With `reduced: () => boolean` a reduced-motion player plays the spec's `reduced` variant (`{ steps, sound?, maxMs? }`: the information held still) at factor 1, instant without one. A spec with `whenVisible: true` waits at the head of the queue while `visible()` is false; call `visibilityChanged()` when it turns true.
- `whenReady: true` waits for the actor, step and target zones the beat uses.
  `awaitRects: ['tray']` waits for the listed zones. Use both to wait for all of them.
  The player polls its stage on `frame(callback)` (default `requestAnimationFrame`).
  A custom scheduler can return a cancel function. After 60 frames the player reports
  missing zones to `onProblem` and tries to play. Instant speed skips the wait.
- `holdUntil: 'press'` holds the queue after the beat ends, until `player.release()`.
  `releaseOnInput(player, window)` wires pointer and key presses and returns the unbind.
  Use a beat id to let the next matching beat through the hold and resume when it ends.
  `autoContinueMs` sets a delay on its own or a fallback for either hold, scaled
  by the beat's speed; without it a hold lasts until `release()` or `skipAll()`. Instant beats open no hold. Read `held()` for the hold state.
  `skipAll()` cancels waits and holds, for example on undo, load or leaving the screen.
- Stand-ins and soft skips (K437, all opt-in): `play(beat, { keepUntilReleased: true })` keeps the verbs of the steps that last to the beat's end (an enlarged card, a row light, a flicker) until the beat's hold ends (`release()`, `autoContinueMs`, the named beat, a skip); without a hold they finish at the beat's end as before. `skipAll({ finishStep: true })` and `hurry({ finishStep: true })` let the steps in progress play to their end (a grown card shrinks back), then end the beat as `skipped`; later steps and cues never start, queued beats snap at once; a second plain skip snaps it. `hurryOnInput(player, target, { pointerOnly: true, finishStep: true })` listens to pointer presses only (capture phase) and passes `finishStep`. `readFollowsSpeed: true` on the player scales `read` holds with the speed (halved at Fast); a `pace` given wins.
- Big beats (K143): `play(beat, { gate: { before, after } })` opens `gate()` (`{ beat, before, after, leaving, place? }`, `leaving` from the first `leave: true` step) while it plays or waits; `afterGate(f)` runs `f` once it closes; input is never held. `hurry()` (`hurryOnInput(player, target)`) is `skipAll` except beats whose spec says `hurry: 'keep'`. `playRun(beats, opts)` plays several beats under one stage: each its `places` variant (`lone`, `first`, `middle`, `last`), `run.place` is `{ at, k, of }` for a "2 of 3" chip, `onEnd` after the last. `onEnded(how)` beside `onEnd` says `done` or `skipped`. `validateSpec` checks the variants.
- Lab (`lab.ts`): `mountMotionLab(root, { specs, player })` lists every motion of the catalog as a button (name, `maxMs`, frequency); a press calls `skipAll()` and plays that one on the game's stage, so give the lab its own player: on the game's player a press would end the game's beats too. Mounting again on a root replaces its list. Mount it on a route for the owner's review (in an automated browser, with `?motion=on`); returns the unmount.
The end state is the game's own screen: the player never touches game state.
## Look
Open `components/motion-frame/fake/lab.html` through Vite to try the fake queue.
Open `components/motion-frame/fake/pan.html` for the phone pan lab.
Open `components/motion-frame/fake/swap.html` for the board swap lab.
Choose the piece beat, draw the tray, then press to let the roll play.
The lab is an unstyled `ul.motion-lab` of `button[data-beat]` (`data-playing` while it plays): the game styles it. Nothing else draws. Tests: `motion.test.ts` (node) and `lab.test.tsx` (jsdom), with the fake game in `fake/`.
## Review clips (`clips.ts`, `record.ts`)
For the owner's motion review: a clip of the beat on the real screen and a stills sheet to judge it without playing the video.
- `stillTimes(spec, steps = 4)`: ms from the beat's start for the stills: 0, then up to `steps` step ends (the last end excluded, spread evenly when there are more). The sixth still is the rest state: the last frame. `frameAt(frames, t)` (a frame stays until the next), `clipTimes(at, ms, fps = 30, lead = 0.4)`, `stillFrames(frames, at, times)`. Pure; tested in node.
- `recordClip({ ctx, page, waitMs }, { id, out, tmp, spec, ms, play, fps? })` (node only, import from `record`, not `index`): CDP screencast of a Playwright page, `play()` starts the beat and returns, in epoch seconds (`Date.now() / 1000` in the page, the clock of the screencast frames' timestamps; not `performance.now`), when the step begins; writes `out/<id>.webm` (needs `ffmpeg`) and `out/<id>-stills.jpg` (needs `python3` with PIL). Use a 1920-wide viewport with an even height (libvpx-vp9 with yuv420p fails on an odd one). It throws when no frame falls in the clip (a wrong clock).
- Real play, not a staged state: the game finds a seed and a line of answers that reaches the beat (its own driver), replays them at instant pace in the page, and `play` gives the last answer at normal pace. That part is the game's.

## Use it in 10 lines

```ts
import { placeOf } from '../kit/motion-frame/index'

console.log(placeOf(1, 3)) // 'first': card 1 of 3 is the first of the row (lone | first | middle | last; the beat's place, not a fan position)
```

```ts
import { hurryOnInput, type MotionPlayer } from '../kit/motion-frame/index'

declare const player: MotionPlayer // made with readFollowsSpeed: true, so read holds halve at Fast
player.play('bot-reveal', { keepUntilReleased: true }) // its row light stays lit through the beat's hold
const unbind = hurryOnInput(player, window, { pointerOnly: true, finishStep: true }) // a tap lets the step in progress finish
unbind()
```

```tsx
import { mountMotionLab, type MotionLabOptions } from '../kit/motion-frame/index'

declare const lab: MotionLabOptions // the catalog's specs and a player of its own
const stop = mountMotionLab(document.body, lab) // one button per motion; call stop() to unmount
```
