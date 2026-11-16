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
- `speed()` is read when a beat starts: a factor (1, 0.5) or `'instant'`. Instant builds no timeline: `onEnd` fires at once, and the cues are still called, in order.
- `busy()`: a `rare` or `once` beat is playing or queued. `constant`, `often` and `each round` never set it. `pending()`, `subscribe(f)`.
- `skipAll()`: everything playing and queued jumps to its end: open verbs finish, every `onEnd` fires, cues not yet due are dropped. `skipOnInput(player, window)` calls it on any press or key.
- `onCue(cue, beatId)` at the cue's time. A verb, hook or cue that throws goes to `onProblem`; the queue goes on.
- `withReducedMotion(speed)`: `'instant'` when the system asks for reduced motion. `BeatTable<Kind>`: type for the game's event-kind to beat-names table, so a kind without an entry fails the type check.
- `withAutomationOff(speed, marker = 'KitMotion')`: `'instant'` in an automated browser (`navigator.webdriver`), unless the user agent carries `marker` or the address has `?motion=on`; a real player is untouched. Use `speed: () => withReducedMotion(withAutomationOff(setting))`. The e2e suite then runs fast and steady; a second Playwright project runs the flows again with motion on: `{ name: 'chromium-motion', use: { ...devices['Desktop Chrome'], userAgent: devices['Desktop Chrome'].userAgent + ' KitMotion' }, testMatch: /(flows|motion)\.spec\.ts$/ }`. `putMotionSpeed(speed, name = 'on')`: `<html data-motion>` (`off`, or `name`, e.g. `fast`) and `--motion-scale` (the factor, 0 when off) for the game's CSS; call it at start and when the setting changes; `bindMotionSpeed(() => speed, () => name)` calls it again when the system's reduced-motion setting changes (returns the unbind). Without a `document` it does nothing.
- Lab (`lab.ts`): `mountMotionLab(root, { specs, player })` lists every motion of the catalog as a button (name, `maxMs`, frequency); a press calls `skipAll()` and plays that one on the game's stage, so give the lab its own player: on the game's player a press would end the game's beats too. Mounting again on a root replaces its list. Mount it on a route for the owner's review (in an automated browser, with `?motion=on`); returns the unmount.

The end state is the game's own screen: the player never touches game state.

## Look
The lab is an unstyled `ul.motion-lab` of `button[data-beat]` (`data-playing` while it plays): the game styles it. Nothing else draws. Tests: `motion.test.ts` (node) and `lab.test.tsx` (jsdom), with the fake game in `fake/`.

## Review clips (`clips.ts`, `record.ts`)

For the owner's motion review: a clip of the beat on the real screen and a stills sheet to judge it without playing the video.

- `stillTimes(spec, steps = 4)`: ms from the beat's start for the stills: 0, then up to `steps` step ends (the last end excluded, spread evenly when there are more). The sixth still is the rest state: the last frame. `frameAt(frames, t)` (a frame stays until the next), `clipTimes(at, ms, fps = 30, lead = 0.4)`, `stillFrames(frames, at, times)`. Pure; tested in node.
- `recordClip({ ctx, page, waitMs }, { id, out, tmp, spec, ms, play, fps? })` (node only, import from `record`, not `index`): CDP screencast of a Playwright page, `play()` starts the beat and returns, in epoch seconds (`Date.now() / 1000` in the page, the clock of the screencast frames' timestamps; not `performance.now`), when the step begins; writes `out/<id>.webm` (needs `ffmpeg`) and `out/<id>-stills.jpg` (needs `python3` with PIL). Use a 1920-wide viewport with an even height (libvpx-vp9 with yuv420p fails on an odd one). It throws when no frame falls in the clip (a wrong clock).
- Real play, not a staged state: the game finds a seed and a line of answers that reaches the beat (its own driver), replays them at instant pace in the page, and `play` gives the last answer at normal pace. That part is the game's.
