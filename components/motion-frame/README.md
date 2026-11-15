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

The end state is the game's own screen: the player never touches game state.

## Look

None.

Tests: `motion.test.ts` (node), with the fake game in `fake/`.
