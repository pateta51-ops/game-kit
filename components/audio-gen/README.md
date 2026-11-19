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

## GPU only

Every model runs on the graphics card (CUDA) and nowhere else (owner, 19 Nov 2026): audio made on the CPU slows the test runners on the same machine.
- No CUDA, no audio: a worker or `voice gen` exits 3 with a message. Nothing falls back to the CPU (`allowCpu` is gone).
- ACE-Step keeps its models on the card (`offload` false) and works without the 5 Hz LM (`thinking` false). `thinking: true` loads the LM on CUDA too: about 5.5 GB more VRAM, over a minute of loading on two CPU threads, and its token loop holds one core while the GPU stays under 20 %. `offload: true` moves models to the CPU between stages and breaks this rule. A VAE decode that ACE-Step would move to the CPU (under 0.5 GB of free VRAM) fails that item instead.
- Stable Audio Open and Kokoro are put on `cuda` by name.
- Two CPU threads at most (`OMP_NUM_THREADS`, `MKL_NUM_THREADS`, `torch.set_num_threads`) and the lowest priority: the pipeline starts each worker under `nice -n 19`, and `voice gen` lowers itself.
- The check before a batch is built in: after loading, the first generation prints what it used, for example `first generation: GPU at 88 % at its peak, 2983 MiB of CUDA memory, 0.9 CPU cores`, and the batch stops (exit 3) when it took no CUDA memory.

The same check by hand, while the first cue is made (loading the model comes first: under a minute of CPU work, the LM longer):

```sh
nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv -l 1   # GPU well above 0 %, memory up by the model
top -b -n 1 -o %CPU | head -12                                         # the worker: NI 19, about 100 % (one core)
```

GPU near 0 % while the worker stays far above one core: stop the run. `tools.py status` says whether the torch in each venv sees CUDA. Measured on a 16 GB RTX 5080 with the runners busy: music (2 x 20 s) GPU peak 95 %, 1.1 cores; sounds GPU peak 88 %, 1.1 cores; a voice line GPU peak 24 %, 0.5 cores. Left on the CPU: loading the weights, Kokoro's text-to-phoneme step, ffmpeg.

What each model was good for in the first game's rounds
- Stable Audio Open 1.0 (`sao`): short dry one-shots (taps, knocks, steps, bell, plate); the accepted sound effects. Gated weights: accept the licence on Hugging Face, `hf auth login`.
- ACE-Step 1.5 (`ace`): music from a prompt; its organ takes did not pass, and prompted music is worth trying only for ambience and beds.
- Written notes (`music`): the reliable route for tunes and stems; exact loops and layers that stack.
- Kokoro-82M: clear short lines; the shouted calls need `shout` and a retry voice.
- Tried and not lifted (no install here): MOSS-SoundEffect v2 was worse than Stable Audio Open for most cues; Stable Audio 3 and YuE2 were candidates only. Add an install group if a game needs them.

Prompt wording built from a sheet differs from hand-written prompts; `prompt.overrides` keeps any hand-written one.

Left out: any hosted (paid) backend. The script that makes the game's owner-facing review page itself stays in the game-sfx-review skill.

Tests: `tests/test_pure.py` (cue sheet, tail rule on a synthetic clip, loop length and MIDI, voice table, listening data, limits, the GPU-only rules with a fake torch), run through vitest by `audio-gen.test.ts`.

## Use it in 10 lines

```sh
cd kit/audio-gen
python3 audiogen/tools.py limits --config config.json   # formats and sizes the sound player expects
```
