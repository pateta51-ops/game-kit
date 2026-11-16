# audio-gen

Sounds, music and voice lines for a game, made with free local models in WSL and finished by rules in code. Python 3 and ffmpeg; no paid service is called anywhere (the paid speech client is `voice`, K66). Model weights and generated audio are never committed. It knows no game: names, paths, tiers and wording are in a config. Not for the browser.

Run from `components/audio-gen` (a game pulls the folder into `kit/`): `python3 audiogen/tools.py <step>`; generation itself is `python3 audiogen.py generate --config <config> --spec <cues.json>` (`check` first). Copy `example/config.json`; `~/audio-gen` is the home of models and output.

| Step | Command |
|---|---|
| Install (each group optional) | `bash install/install.sh core sao ace kokoro midi`, then `tools.py status` says what is there |
| Cue sheet to specs | `tools.py specs --sheet cue-sheet.md --config config.json --out cues.json` (`--dry` prints). One written prompt per cue, never shortened: object, attack-body-tail, room, the "not" column, length. The config's `prompt.overrides` replaces any prompt by hand; rows with no length or tier are reported. Variations come from the sheet's `Var` column |
| Generate | `audiogen.py generate`: three candidates per cue (set `variations`), a seed per take, one manifest entry per clip (model, prompt, seed, length, loudness, licence) |
| Finish (inside generate) | a category with `tail` ends a one-shot on its own decay (below `endBelowDbfs`), fades at least `minFadeMs`, never cuts; the generator is asked `extraGenerateS` longer; leading silence is trimmed; loudness is normalised to the tier (peak rule under `peakBelowS`); webm and m4a, checked after decoding |
| Music from notes | `tools.py music --score score.json --config config.json --soundfont x.sf2 --name menu --out dir`: MIDI through fluidsynth, one stem per layer plus the full mix, each exactly `bars x beats x 60 / tempo` seconds, one gain for all so layers stack |
| Voice | `tools.py voice gen --table t.json --out dir`, then `voice finish`: one file per voice and line; `parts` (names, number words) are separate files `<group>.<id>`; per-kind filters, shout shaping, loudness |
| Listening page data | `tools.py listen --config config.json --cues cues.json --voice-stats dir/stats-voice.json --out listen.json`: clip, exact prompt, manifest facts, in the shape the game-sfx-review skill shows |
| Player limits | `tools.py limits --config config.json`: formats and sizes the sound player's check expects (400 KB a cue, 4 MB a loop) |

Config: `categories` (tier: kind, lufs, truePeak, channels, backend, fades, `tail`, peak rule, bitrates, layout), `backends` (each with its `licence`), `sheet`, `prompt`. Score and voice table: see `example/`.

What each model was good for in the first game's rounds
- Stable Audio Open 1.0 (`sao`): short dry one-shots (taps, knocks, steps, bell, plate); the accepted sound effects. Gated weights: accept the licence on Hugging Face, `hf auth login`.
- ACE-Step 1.5 (`ace`): music from a prompt; its organ takes did not pass, and prompted music is worth trying only for ambience and beds.
- Written notes (`music`): the reliable route for tunes and stems; exact loops and layers that stack.
- Kokoro-82M: clear short lines; the shouted calls need `shout` and a retry voice.
- Tried and not lifted (no install here): MOSS-SoundEffect v2 was worse than Stable Audio Open for most cues; Stable Audio 3 and YuE2 were candidates only. Add an install group if a game needs them.

Prompt wording built from a sheet differs from hand-written prompts; `prompt.overrides` keeps any hand-written one.

Left out: any hosted (paid) backend. The script that makes the game's owner-facing review page itself stays in the game-sfx-review skill.

Tests: `tests/test_pure.py` (cue sheet, tail rule on a synthetic clip, loop length and MIDI, voice table, listening data, limits), run through vitest by `audio-gen.test.ts`.

## Use it in 10 lines

```sh
cd kit/audio-gen
python3 audiogen/tools.py limits --config config.json   # formats and sizes the sound player expects
```
