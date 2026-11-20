# sound-player

A Web Audio player driven by one table of data. It knows no game. No packages.

## Rules for agents

**What it does:** plays a game's sounds, voice and music from one data table through Web Audio, with volume buses, ducking and caps; it never cuts a cue, it fades it.

**You must:**
1. Build the player once: `createSoundPlayer({ table, base, volumes, onVolumes })`. Put every sound, voice file (`voiceCues(table)` spread into `cues`) and music layer in the table; a game plays names from it and never makes its own `AudioContext` or `Audio`.
2. Pass the saved `volumes` and store what `onVolumes` gives: music, sounds, voice and muted come from settings. Call `setVolumes` from the settings screen.
3. Nothing sounds before a first tap or key on `target`: call `unlock()` from the game's own first gesture if it has one, and do not rely on a sound at load (a cue asked for before the tap is dropped).
4. Every cue has a `tier` (`quiet`, `normal`, `loud`); loud cues duck the music, voice-bus cues duck it too. Give music tracks `bus: 'music'` and play them with `playTrack`.
5. Stop a cue only with `stopCues(ms, cue)` (150 ms fade at least); never expect a hard stop, and never use `lengthMs` as a stop time.
6. In tests pass `silent: true` (no audio context, every call is safe) or `context` with `fakeContext.ts`.
7. Run `checkSoundFiles(table, dir, options)` from `check.ts` in the game's checks (node only, import it by path): it fails on a missing file, a bad format, a cue file over 400 kB or a loop over 4 MB. Files come from audio-gen (`tools.py limits` prints the same limits).
8. Use `onEnd(how)` (`ended`, `faded`, `dropped`) to chain: a cue that is not played (before the tap, hidden page, no file, over the cap) still calls it once.

**Common mistakes:**
- Playing a cue at start-up before the first tap and wondering why nothing sounds.
- A cue name not in the table, or a file that fails to load: the cue is silent and the console says so once; use `canPlay(cue)` to ask.
- Layers of different lengths in `music`: they must be loops of equal length.
- Calling `play` for the same cue twice within 40 ms: it plays once.

**A cue is never cut.** It plays to the end of its file. When it must stop early (a skip, the cap, `stopCues`) its gain fades to zero over 150 ms or more, and only then does its source stop. A mute, a hidden page and a volume change fade the same way and stop nothing. `lengthMs` in the table is information, never a stop time.

## The table (`SoundTable`)
- `cues`: name to `{ files, tier: 'quiet' | 'normal' | 'loud', gainDb?, bus?: 'sounds' | 'voice' | 'music', duckDb?, max?, lengthMs? }`. `files` are the variations; none, or none that load: the cue is silent and the console says so once.
- A cue may have `synth`: voices as data, played when it has no file or none that loads (so `files: []` and `synth` is a cue with no sound file, and a whole table can be made that way). A voice is `{ kind: 'tone', wave = 'sine', from, to = from, at = 0, dur, gain }` (Hz, seconds, gain 0 to 1 under the tier's level; the pitch glides) or `{ kind: 'noise', band, q = 1, at = 0, dur, gain }` (the same noise every run, band-passed). 5 ms attack, exponential fade; a voice that cannot be made is skipped. Caps, ducking, `times`, fades and `onEnd` work as for a file. `check.ts` asks no file of such a cue.
- `tierDb` (default quiet -12, normal -6, loud 0), `maxPerCue` (3), `maxVoices` (12), `lateMs` (200), `duck: { loudDb = 8, voiceDb = 8, ambience = false }`.
- `music`: `{ bpm, beatsPerBar = 4, fadeMs = 2000, holdMs = 0, layers: name to file, states: name to { layer: gain 0..1 }, once?: state name to file }`. Layers are loops of equal length. A state in `once` plays that file one time on the music bus when it starts (layers it does not name fall silent) and fades it over `fadeMs` when the state is left. `interludes?: [once state names]`: entering one from a `once` track still playing shelves that track and where it stopped; going back to it resumes there, any other state drops the shelf (layers keep one clock and need none).
- `ambience`: name to file. `ambienceSeamMs`: the loop's last part is crossfaded into its head (`seamLoop(ctx, buffer, ms)`), so any recording loops without a tick. Music by folder (`musicChain.ts`, pure): `musicTracks(paths-to-urls, slot, scopes)` returns `battle`, `battle-2`... from the first folder in `scopes` (most specific first) that has the slot, never `_pending/`; `pickTrack(tracks, last)` never repeats; `untitledTracks(paths, titles)` for a test.

## `createSoundPlayer({ table, base?, volumes?, onVolumes?, silent?, target?, document?, context?, fetch?, random? })`
- Nothing sounds before the first tap or key on `target` (default `window`); `unlock()` is the same thing for a game's own handler. A state or ambience asked for earlier starts then; a cue asked for earlier is dropped. A context suspended later (a phone lock, a call) resumes on the next tap or when the page is seen again.
- `play(cue, { times?, delayMs?, pitch?, onEnd? })`: `pitch` is in semitones (0 or none: as recorded; 12: an octave up; negative: down). A file plays at rate `2^(pitch/12)` (higher is also shorter, and `times` repeats follow the shortened length); a synth cue's tone frequencies and noise bands are scaled, its length is unchanged. A value that is not a number is ignored. Step it in the game, e.g. `pitch: 2 * points` for a rising chime.  `onEnd(how)` is called exactly once: `'ended'`, `'faded'` or `'dropped'` (not played: before the first tap, hidden, no file, over the cap, or a file that never loads, after `lateMs` + 2 s). `canPlay(cue)`: false when the cue is not in the table or none of its files decoded. A variation is picked at random each time; the last one played is excluded only when the cue has three or more files (two files may repeat, XD-54). `times` plays it that many times back to back, as one voice. The same cue within 40 ms plays once. Over `max` for its name the oldest of that name fades out; over `maxVoices` the oldest cue of the quietest tier, not above the new one's, fades out, and with none the new cue is dropped. All cues are decoded after the first tap, in table order; `preload([cues])` decodes a list first. A cue asked for before it is decoded plays when decoded if that takes `lateMs` or less past its start time, else it is dropped.
- `stopCues(ms?, cue?)`: fades all cues, or one name. `count()`: cues playing. `setState(name | null)`: on the first call all layers start together, silent, on one clock, and the state fades in. Later states fade in on the next bar line after the current state has sounded for `holdMs`; a new call before that bar replaces the waiting state. `setAmbience(name | null, gain = 1)`: one loop, crossfaded over `fadeMs`, off the bar.
- Ducking: the music (and the ambience when `duck.ambience`) drops by `loudDb` while a `loud` cue plays and by `voiceDb` while a `voice` bus cue plays; a cue's own `duckDb` replaces both (0: none). The deepest one playing counts. `duck(db?)` does the same until the function it returns is called.
- `setVolumes({ music?, sounds?, voice?, muted? })`, `volumes()`: `onVolumes` gets the whole set after each change; the game stores it and passes it back as `volumes`.
- Silent while the page is hidden. `silent: true` (tests): no audio context, every call is safe. With motion-frame: `onCue: (cue) => sound.play(cue)`.
- `playTrack(cue, { fadeInMs = 0, loop?, take?, onEnd? })` (K173): a whole track, a cue with `bus: 'music'`. Cues on the music bus are decoded on first play (or by `preload`), not after the first tap. Fade out with `stopCues(ms, cue)`. Crossfade: `stopCues(2000, 'menu'); playTrack('game', { fadeInMs: 2000 })`. `take` (K213) plays that file index; none or out of range: a random one, as before.
- Preload a subset, free memory (K213): `autoPreload` (option) decides what is decoded after the first tap, `preloadAll(filter?)` decodes more later, `release(filter)` drops the decoded audio of matching cues and returns how many (playing cues go on; a released cue loads again when played). A `filter` is `{ buses?, cues? }` (both given: both match; no bus means `sounds`) or `(cue, def) => boolean`. E.g. voice off: `autoPreload: { buses: ['sounds'] }`; leaving a level: `release({ cues: [...] })`.

## Playback options
- `voicePolicy: 'priority'` uses cue `priority` (1 highest, 3 lowest, default 2)
  at the global cap. It fades the lowest eligible priority, earliest start first.
  Priorities 1 and 2 may steal their own priority. The default policy uses tiers.
- `dedupeMs` sets the scheduled-start duplicate window (default 40, 0 disables it).
- `duck: { timing: 'scheduled' }` ducks from the cue's scheduled start, with a
  40 ms attack and 450 ms release. It includes `playTrack` music. The default
  starts the duck when the cue is queued.
- `pickPlaylistTrack(tracks, seed, position)` rotates from a seed-based offset.
  Pass a zero-based game position to get the same track after reload.

## Events to cues (`events.ts`, optional)
- `cuesFor(events, plan)`: the events of one action as `{ cue, count }[]`. `plan`: `{ cueOf(event): cue | null, rank?: cue names, the most important first, max = 3, hides?: { cue: [cues it hides] }, alone?: [cues that sound alone] }`. Like events are one cue with a count; only the `max` best ranked stay, in the order they first happened.
- `createEventSounds({ plan, play(hit, delayMs), ready?, gapMs = 130 (or a function), repeatMs = 120, windowMs = 1000, maxPerWindow = 6, maxLagMs = 1000, now? })` returns `playEvents(events)` and `playCue(cue, count?)`. Cues follow one another `gapMs` apart, and the spacing runs on into the next action; the same cue within `repeatMs`, a start over `maxPerWindow` in `windowMs` and a start more than `maxLagMs` late are dropped, but an `alone` cue never. With the player: `play: (h, delayMs) => sound.play(h.cue, { times: Math.min(h.count, 3), delayMs })`. Several cues of one action are already in sequence, a gap apart (never longer than `gapMs`, so a long cue is overlapped, not waited for). `createTrailSounds({ onNew(actions), same? })`: `feed(trail)` after each state change gives `onNew` only the actions added to the action trail. The first feed (load, resume), an undo and a rewritten trail are silent; `reset()` makes the next feed silent. `resolveCue([own, family, generic], sound.canPlay)`: the first cue that can play, else null.

For a store with `lastEvents`, call `playEvents(next.lastEvents)` when the array
changes and is nonempty.

## Check (`check.ts`, node only: import it by path, not from `index`)
`checkSoundFiles(table, dir, { missing?, formats?, maxCueBytes?, maxLoopBytes? })` returns lines of problems: a cue, `layer:<name>`, `once:<name>` or `ambience:<name>` whose files are not all in `dir` and that is not in `missing`; a `missing` entry that has its files or is not in the table; a file not in `formats` (.ogg .opus .webm .mp3 .m4a), empty, or over the size (400 kB a cue file, 4 MB a loop); a state naming an unknown layer. `checkFrontSilence(table, dir, { maxMs = 60, threshold = 0.02, decode? })`: cue files that start silent too long (wav read here; other formats need `decode`). `trimMp3(bytes, front, back)` (index): cuts whole frames, no re-encode, drops ID3 and Xing. Tests: `cues2.test.ts`, `sound.test.ts`, `synth.test.ts`, `events.test.ts` (node) on `fakeContext.ts`, which a game's tests may use too.

## Look
None.

## Use it in 10 lines

```ts
import { createSoundPlayer } from '../kit/sound-player/index'

const player = createSoundPlayer({
  base: '/audio/',
  table: { cues: { click: { files: ['click.mp3'], tier: 'quiet' } } },
})
await player.unlock() // call from a user gesture first
player.play('click')
```
