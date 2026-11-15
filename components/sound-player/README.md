# sound-player

A Web Audio player driven by one table of data. It knows no game. No packages.

**A cue is never cut.** It plays to the end of its file. When it must stop early (a skip, the cap, `stopCues`) its gain fades to zero over 150 ms or more, and only then does its source stop. A mute, a hidden page and a volume change fade the same way and stop nothing. `lengthMs` in the table is information, never a stop time.

## The table (`SoundTable`)

- `cues`: name to `{ files, tier: 'quiet' | 'normal' | 'loud', gainDb?, bus?: 'sounds' | 'voice' | 'music', duckDb?, max?, lengthMs? }`. `files` are the variations; none, or none that load: the cue is silent and the console says so once.
- `tierDb` (default quiet -12, normal -6, loud 0), `maxPerCue` (3), `maxVoices` (12), `lateMs` (200), `duck: { loudDb = 8, voiceDb = 8, ambience = false }`.
- `music`: `{ bpm, beatsPerBar = 4, fadeMs = 2000, holdMs = 0, layers: name to file, states: name to { layer: gain 0..1 }, once?: state name to file }`. Layers are loops of equal length. A state in `once` plays that file one time on the music bus when it starts (layers it does not name fall silent) and fades it over `fadeMs` when the state is left.
- `ambience`: name to file.

## `createSoundPlayer({ table, base?, volumes?, onVolumes?, silent?, target?, document?, context?, fetch?, random? })`

- Nothing sounds before the first tap or key on `target` (default `window`); `unlock()` is the same thing for a game's own handler. A state or ambience asked for earlier starts then; a cue asked for earlier is dropped. A context suspended later (a phone lock, a call) resumes on the next tap or when the page is seen again.
- `play(cue, { times?, delayMs?, onEnd? })`: `onEnd(how)` is called exactly once: `'ended'`, `'faded'` or `'dropped'` (not played: before the first tap, hidden, no file, over the cap, or a file that never loads, after `lateMs` + 2 s). `canPlay(cue)`: false when the cue is not in the table or none of its files decoded. A variation that is not the last one played. `times` plays it that many times back to back, as one voice. The same cue within 40 ms plays once. Over `max` for its name the oldest of that name fades out; over `maxVoices` the oldest cue of the quietest tier, not above the new one's, fades out, and with none the new cue is dropped.
- All cues are decoded after the first tap, in table order; `preload([cues])` decodes a list first. A cue asked for before it is decoded plays when decoded if that takes `lateMs` or less past its start time, else it is dropped.
- `stopCues(ms?, cue?)`: fades all cues, or one name. `count()`: cues playing.
- `setState(name | null)`: on the first call all layers start together, silent, on one clock, and the state fades in. Later states fade in on the next bar line after the current state has sounded for `holdMs`; a new call before that bar replaces the waiting state.
- `setAmbience(name | null, gain = 1)`: one loop, crossfaded over `fadeMs`, off the bar.
- Ducking: the music (and the ambience when `duck.ambience`) drops by `loudDb` while a `loud` cue plays and by `voiceDb` while a `voice` bus cue plays; a cue's own `duckDb` replaces both (0: none). The deepest one playing counts. `duck(db?)` does the same until the function it returns is called.
- `setVolumes({ music?, sounds?, voice?, muted? })`, `volumes()`: `onVolumes` gets the whole set after each change; the game stores it and passes it back as `volumes`.
- Silent while the page is hidden. `silent: true` (tests): no audio context, every call is safe.
- With motion-frame: `onCue: (cue) => sound.play(cue)`.

## Check (`check.ts`, node only: import it by path, not from `index`)

`checkSoundFiles(table, dir, { missing?, formats?, maxCueBytes?, maxLoopBytes? })` returns lines of problems: a cue, `layer:<name>`, `once:<name>` or `ambience:<name>` whose files are not all in `dir` and that is not in `missing`; a `missing` entry that has its files or is not in the table; a file not in `formats` (.ogg .opus .webm .mp3 .m4a), empty, or over the size (400 kB a cue file, 4 MB a loop); a state naming an unknown layer.

## Look

None.

Tests: `sound.test.ts` (node) on `fakeContext.ts`, which a game's tests may use too.
