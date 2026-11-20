# voice

A line player on the sound player's `voice` bus. It knows no game: the lines are data and the game supplies the gate. Needs `sound-player` (its `play` `onEnd`). No packages.

## Rules for agents

**What it does:** plays a game's spoken lines (recorded files) on the sound player's voice bus, one line at a time, never cutting one.

**You must:**
1. Build the sound table with `voiceCues(table)` (and the extra files that only `pieces` use) spread into the player's `cues`: the voice plays each file as a cue named by `voiceCue(file)`, and `createVoice` finds nothing to play without them.
2. Pass the sound player as `player` to `createVoice({ table, player })`; hand `enabled` and `volume` from settings (`setEnabled`, `setVolume`).
3. Declare every line in `lines` (`files`, `busy: 'drop' | 'wait'`, `limit`); every part used in `play(id, { parts })` must be in `parts`, or the whole line is silent.
4. Use `limit.once` or `limit.every` for a line that must not repeat, and keep `counts()` in the saved game and give it back with `reset(counts)` on load.
5. Give `mayPlay(id)` for what the game decides (a phase, a screen); it is asked before each line starts, a waiting one too.
6. Run `checkVoiceFiles(table, dir)` (node only) in the game's checks: it fails on a missing file, a bad format or size, or a line with no file.
7. Paid speech (`speech.ts`) is for build scripts only, never in the browser bundle: set the `cap`, put the key in the environment variable named by `keyEnv`, and keep one spender per ledger folder.

**Common mistakes:**
- Calling `player.stopCues` to cut a line: the voice never cuts; it only waits or does not start.
- Expecting a line to repeat: the same spoken text twice in a row is not played, and a `once` line plays once per game.
- A busy voice: a line with the default `busy: 'drop'` is dropped, not queued.
- Forgetting `reset(counts)` on load, so `once` lines play again after a reload.

**A line is never cut.** It plays out; it only waits or is not started. The voice never calls `stopCues`.

## `VoiceTable`

- `lines`: id to `{ files, busy?: 'drop' | 'wait', limit?: { once?, every? }, gapMs? }`. `files` play back to back as one line. `busy`: when another line plays, drop this one (default) or queue it. `once`: one time per game; `every: n`: the 1st, (n+1)th... ask plays, the others are skipped.
- `parts`: name to file, for lines assembled at play time (all parts must exist): `voice.play('rolled', { parts: ['seven'] })` plays the line's files, then those parts.
- `voiceCues(table)` gives the entries for the sound table's `cues` (one voice-bus cue per file, named `voiceCue(file)`); `voiceCues(table, extraFiles)` adds files that only `pieces` use; spread them in, so the sound player decodes and ducks them.

## `createVoice({ table, player, mayPlay?, gapMs = 80, maxWaiting = 8, fileTimeoutMs = 20000, enabled?, volume?, counts? })`

- `player`: the sound player (`play` with `onEnd(how)`, `setVolumes`, `canPlay`). A file that is faded or dropped ends its line: the next file does not start.
- `play(id, { parts?, pieces?, gapsMs? })`: `pieces` replaces the line's `files` with the given files, in order, as one line of that id; `gapsMs[i]` is the silence after piece i (default the line's gap); every rule below holds, and an unknown or refused piece makes the line silent. Then: true when started or waiting. A line with an unknown part, or a file `canPlay` refuses, is wholly silent. A line counts for `once` / `every` when it starts (or when its own `every` skips it), not when the gate, never-twice or a busy voice drops it. One line at a time. The same spoken text (line id plus its filled parts or pieces) is never played twice in a row (also for a waiting one that meets itself); the same line with other parts plays. `mayPlay(id)` is asked before each line starts, a waiting one too; false drops it.
- `setEnabled(on)` (off drops the queue), `setVolume(v)` (the voice bus), `clearWaiting()`, `playing()`, `waiting()`.
- `counts()` / `reset(counts?)`: the limit counts, saved with the game; `reset` also forgets the last line.
- `fileTimeoutMs` only frees the queue when the player never reports an end; it stops no sound.

## Check (`check.ts`, node only)

`checkVoiceFiles(table, dir, options?)`: the sound player's file check on every file (missing, format, size; `missing` lists file paths), and a line with no file.

## Paid speech (`speech.ts`, node only, build scripts only)

`createSpeechClient({ dir, cap, keyEnv, send, estimate, id?, meta?, ext?, retries = 5, timeoutMs = 120000, sleep?, env?, append?, write? })`: `synth(request)` gives `{ file, paid }`; also `id`, `file`, `spent()`. The game writes `send(request, key, signal)` (the one HTTP call; returns `{ status, audio?, cost?, body? }`) and `estimate(request)`; the request shape is the game's, and all of it that shapes the sound belongs in it (the clip id is its hash). A clip already in `dir` costs nothing; identical requests in flight share one, and only the first caller gets `paid` (the others 0). The key comes only from the variable named `keyEnv` and is struck from ledger lines and errors. Before every attempt, retries too, the sum of `dir/ledger.jsonl` (failed attempts count, at the estimate) plus requests in flight plus this estimate must not pass `cap`, or it is refused. A failed ledger write, or a damaged ledger, stops every further request; so does a paid clip that cannot be stored (the ledger says `stored: false`). One spender per ledger: the first paid request takes `dir/ledger.lock` and a second client or process is refused until `close()` or exit (delete a lock left by a killed run). `ledgerCredits(file, ids?)`, `mapLimit(items, n, fn)`.

Look: None.
Tests: `voice.test.ts`, `speech.test.ts` (node), with the sound player's `fakeContext.ts` for the end-to-end case.

## Use it in 10 lines

```ts
import { createVoice, type VoicePlayer } from '../kit/voice/index'

declare const player: VoicePlayer // the sound player, or any object with play and setVolumes
const voice = createVoice({ table: { lines: { greet: { files: ['greet-1.mp3', 'greet-2.mp3'] } } }, player })
voice.play('greet')
```
