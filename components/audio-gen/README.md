# audio-gen

Sounds, music and voice lines for a game, made with free local models in WSL and finished by rules in code. Python 3 and ffmpeg; no paid service is called anywhere (the paid speech client is `voice`, K66). Model weights and generated audio are never committed. It knows no game: names, paths, tiers and wording are in a config. Not for the browser.

## Rules for agents

**What it does:** makes sounds, music and voice lines with free local models in WSL (GPU only) and finishes them by rules in code; it writes a manifest the sound player's check reads.

**You must:**
1. Run it in WSL from the folder (`kit/audio-gen`): `bash install/install.sh <groups>` once, `python3 audiogen/tools.py status`, then `python3 audiogen.py check --config c.json --spec cues.json` before every `generate`. Copy `example/config.json`; every backend a category or cue names (`sa3` for sounds, `yue2` for music by default) must be in the config's `backends`.
2. GPU only: no CUDA means exit 3 and no audio. Never add a CPU fallback or offload (the one exception is YuE2's own `offloadAr`, set by `auto`). Never edit `kit/`, never commit model weights or generated audio, never call a paid service.
3. YuE2 (music) runs only through the heavy queue: install it first (`tools/heavy-queue/install-wsl.sh`); with no `heavy`, `check` and `generate` skip YuE2. Each cue is one job holding every slot, in a memory cap (`memGiB`, default 16, from a 20 GB WSL). Keep `queue` on, start nothing else heavy beside it, and never start `yue2_worker.py` by hand. A take killed by the cap is a failed take that names the cap: raise `memGiB` only from a measured peak, never by turning the cap off.
4. Write each music cue's `prompt` by hand in `cues.json` (or `prompt.overrides`): it is YuE2's style text and nothing else. `tools.py specs` builds sound-effect prompts (object, attack-body-tail, "no music, no voice", "N seconds") and must not make a music cue's prompt. The model gets only the prompt and the seed: lyrics are always `[Instrumental]`.
5. A YuE2 style is one comma-separated line, in the shape of the 7th Inning Stretch styles that passed the vocal gate: an era or genre and "soundtrack" anchor, a few mood words (calm, relaxed, unhurried), the speed as a word (upbeat, gentle mid-tempo, fast), three to six named instruments with a role each (bright square or saw lead, slap or driving bass, punchy drums with fill detail, organ stabs), optionally "major key", then "loopable, instrumental". The proven sample is one game (1990s-console chiptune): a synthetic timbre may be part of why it passes, so do not take the shape as a guarantee for other genres. Example: `early-1990s 16-bit console baseball game soundtrack, calm, relaxed, unhurried, gentle mid-tempo, soft square lead, gentle slap bass, quiet drums with hi-hat and rim click, sparse ballpark organ stabs, major key, steady and unobtrusive, loopable, instrumental`.
6. Keep a YuE2 style free of words that invite a voice (vocal, voice, sing, singable, choir, wordless choir, chant, hum, lament, song, lyrics): likely, not proven, the cause when every seed fails. Also likely: a lone sustained solo line (bowed strings, flute, a solo synth melody) and near-silent, very sparse or drone-only styles, because the gate measures vocal as a share of the mix. A bpm, a note name with a mode, bars, seconds or a "no ..." clause written inside the style text: no passing evidence (the 7th Inning Stretch styles had none; other games' passing cues carried a bpm, a key and "no vocals"), so do not rely on them. What the code does prove: the worker sends the model only the style prompt, lyrics, cot and the seed; the cue's `tempo`, `key` and `beatsPerBar` fields never reach the model.
7. For a music cue the length comes from `length` (or `tempo` and `bars`, which give the cut length of a loop): YuE2 writes its own 40 s or more and the pipeline cuts it; the cue's tempo, key and length fields are never sent to the model. A loop is cut and seamed, not made on the bar grid: for exact bars use `tools.py music`. The 7th Inning Stretch run made four candidates per cue and kept the passing ones: the kit's `tries` (seeds per cue, default 6) and `keep` (passing takes kept) do this, so give a cue more `tries` before changing a style that fails a few seeds.
8. Read the vocal gate result; never loosen it to make a take pass. A take passes at demucs vocal/mix of -25 dB or lower with at most 3 % of its 0.5 s windows above -14 dB. A cue that fails all `tries` (6, each a new seed) is kept as its lowest-vocal take with `extra.failedGate` true: listen to it, or change the style and run again.
9. Sounds (`sa3`) are made at the cue's length + 2 s and at least 7 s, then cut. A take that is noise, hiss or clipped is made again; a cue whose real sound trips the test (a short bright metallic clink) sets `options.gate` to `{ flatness, high, peak }` (limits 0.4, 0.2, 0.999) or `false`; the log names the failed test and its value. Per cue `options.tries` sets the retries.
10. Stable Audio 3 weights are gated: accept the licence and run `hf auth login`. A config naming type `acestep` or `stable-audio-open` fails `check`: those backends were removed on the owner's order 20 Nov 2026; use yue2 for music, sa3 for sounds.

**Common mistakes:**
- A cue sheet's generated prompt used for a music cue: it ends "no music, no voice" and gives seconds, so YuE2 gets a sound-effect prompt.
- Naming a choir, a voice or singing (or, likely, a lone sustained solo line) in a YuE2 style: seeds then tend to fail the vocal gate and the batch ends with `failedGate` takes.
- Believing the cue's `tempo`, `key` or `bars` steer the model: they do not reach it (they only set the cut length of a loop).
- Running YuE2 with `queue: false` or beside other heavy jobs: the WSL VM can go down (two runs did).
- Taking a `failedGate` take into the game without listening to it.
- Expecting a model to run on the CPU when CUDA is missing: it exits 3.

Run from `components/audio-gen` (a game pulls the folder into `kit/`): `python3 audiogen/tools.py <step>`; generation itself is `python3 audiogen.py generate --config <config> --spec <cues.json>` (`check` first). Copy `example/config.json`; `~/audio-gen` is the home of models and output.

| Step | Command |
|---|---|
| Install (each group optional) | `bash install/install.sh core sa3 yue2 kokoro midi`, then `tools.py status` says what is there |
| Cue sheet to specs | `tools.py specs --sheet cue-sheet.md --config config.json --out cues.json` (`--dry` prints). One written prompt per cue, never shortened: object, attack-body-tail, room, the "not" column, length. The config's `prompt.overrides` replaces any prompt by hand; rows with no length or tier are reported. Variations come from the sheet's `Var` column |
| Generate | `audiogen.py generate`: three candidates per cue (set `variations`), a seed per take, one manifest entry per clip (model, prompt, seed, length, loudness, licence) |
| Finish (inside generate) | a category with `tail` ends a one-shot on its own decay (below `endBelowDbfs`), fades at least `minFadeMs`, never cuts; the generator is asked `extraGenerateS` longer; leading silence is trimmed; loudness is normalised to the tier (peak rule under `peakBelowS`); webm and m4a, checked after decoding |
| Music from notes | `tools.py music --score score.json --config config.json --soundfont x.sf2 --name menu --out dir`: MIDI through fluidsynth, one stem per layer plus the full mix, each exactly `bars x beats x 60 / tempo` seconds, one gain for all so layers stack |
| Voice | `tools.py voice gen --table t.json --out dir`, then `voice finish`: one file per voice and line; `parts` (names, number words) are separate files `<group>.<id>`; per-kind filters, shout shaping, loudness |
| Listening page data | `tools.py listen --config config.json --cues cues.json --voice-stats dir/stats-voice.json --out listen.json`: clip, exact prompt, manifest facts, in the shape the game-sfx-review skill shows |
| Player limits | `tools.py limits --config config.json`: formats and sizes the sound player's check expects (400 KB a cue, 4 MB a loop) |

Config: `categories` (tier: kind, lufs, truePeak, channels, backend, fades, `tail`, peak rule, bitrates, layout), `backends` (each with its `licence`), `sheet`, `prompt`. Score and voice table: see `example/`.

## Backends and defaults

A category or cue with no `backend` gets the default of its kind (`spec.DEFAULTS`): sounds `sa3`, music `yue2`; those names must be in the config's `backends` (copy them from `example/config.json`). Every other backend is picked by its config name (`backend` on a category or cue, or `--backend`).

| Name in the example | Type | Model | Licence |
|---|---|---|---|
| `sa3` (sounds, default) | `stable-audio-3` | Stable Audio 3 Small SFX (`small-sfx`, hf stabilityai/stable-audio-3-small-sfx), venv-sa3; 8 steps, cfg 1; every cue is made at its length + 2 s and at least 7 s, then cut (the 7 s minimum is a 7th Inning Stretch finding, not a doc value: the model card's example uses 7 s and states no minimum; docs: [model card](https://huggingface.co/stabilityai/stable-audio-3-small-sfx), [repo](https://github.com/Stability-AI/stable-audio-3)); sampler `pingpong` passed explicitly (`sampler`; the package picks it only for rf_denoiser models, else euler); a take that is noise, hiss or clipped is made again (`tries`) | Stability AI Community License |
| `yue2` (music, default) | `yue2` | YuE2-3B ([model card](https://huggingface.co/m-a-p/YuE2-3B), [repo](https://github.com/multimodal-art-projection/YuE), docs/generation.md), code pinned to release yue2-v0.1.6 (the worker refuses another version), huggingface-hub==0.36.2 as the card pins, weights m-a-p/YuE2-3B rev 8f24312f in `models/yue2`, venv-yue | **CC BY-NC 4.0**: non-commercial only |
| written notes | `tools.py music` | MIDI through fluidsynth | the soundfont's |

YuE2 makes instrumental music by the 7th Inning Stretch recipe (its shipped music): plan the song with lyrics `[Instrumental]`, `cot` full and the take's seed; the score's "Vocal" voice is silenced (`recipe.novocal`). `vocal: "rests"` (the default) drops its notes: this is what the YuE yue2-music skill does (abc-editing.md, release yue2-v0.1.6: "The unselected voice is replaced with rests on the same time grid", with `--keep-voice Ins`). `vocal: "move"` (an option; the skill never moves notes) first puts each Vocal bar's notes in the same bar of the `Ins` voice (else the first other voice), only where that bar has no notes of its own (a voice is monophonic, so an instrumental bar with notes is kept as it is); a score with repeats, double or final bar lines or inline fields is only silenced; render with that score (`abc=`); split the take with demucs htdemucs two-stem on cuda (`demucsPython`, venv-demucs) and keep it only when vocal/mix is at most -25 dB and at most 3 % of its 0.5 s windows have the vocal above -14 dB (`recipe.measure`); these gate numbers are 7th Inning Stretch findings, not doc values (the YuE docs have no gate; they say listening is still needed to check for vocal leakage). A take that fails is made again with the next seed (seed + 7919 k) up to `tries` (6); each manifest entry keeps every seed tried with its measures. When no seed passes, the best take (lowest vocal dB) is kept anyway with `extra.failedGate` true, for a person to judge by ear. Name no choir, voice or singing in a YuE2 music style: such takes fail the vocal gate on every seed. YuE2 sets its own length (40 s and more); the pipeline cuts to the cue's length. The loudness and file finishing are the pipeline's, as for every backend.

YuE2 hardware and queue (owner, 19 Nov 2026: YuE2 is the one exception to GPU only, and it must follow the queue). The YuE2 docs ask for a BF16 NVIDIA GPU with 24 GB VRAM, one request at a time (peak 14.08 GiB documented); the Astra Imperium director measured about 10 GB peak on a 16 GB card in a real run. The package's own low-memory option is `offload_ar` (moves the AR weights to host memory between stages, an "optional memory tradeoff"): the kit's `offloadAr` option (true, false, or "auto", the default) turns it on when the card has under 24 GB. It stays on the card otherwise, and every other backend stays GPU only with no offload. Every YuE2 run goes through the heavy queue: the backend starts its worker as `heavy run --label "audio-gen <name>" -- nice ... yue2_worker.py` and skips with a message when `heavy` is missing, at `check` and at generate (`queue: false` turns the wrapping off).

YuE2 must never take WSL down (K474; two runs crashed the VM on a 16 GB card with WSL at 20 GB RAM + 8 GB swap). Each cue's job is `heavy run --slots all --mem <memGiB>`: it holds every slot (nothing else runs beside it) and runs in a memory-capped cgroup with no swap, so an over-limit job is killed by the kernel and not the VM; `heavy` refuses to run when no cap can be set (needs `systemd-run --user`). Option `memGiB` (default 16): from the measured 13.0-13.6 GiB host RSS peak of the model's process (offloadAr auto, 20 GB WSL) plus margin; Windows, WSL itself and the runners keep the other 4 GB (the worker prints the largest child's peak RSS at the end of a run, so set it from a real run plus margin). A take killed by the cap (exit 137) is a failed take whose error names the cap; the other cues go on. The demucs child runs in the same cgroup: its exit by SIGKILL (-9, 137) or a rise of the cgroup's `memory.events` oom_kill count fails that take the same way. K477: each take is generated in a child process (the worker script with `--take`) that loads the pipeline, writes the take and exits, so the model's host memory (13 GiB measured with `offloadAr` auto) is gone before demucs runs; the light parent then runs the demucs gate and, on a fail, starts the next seed's child, all inside the cue's one capped job. The pipeline reloads per take; the log prints that time. A child killed by the cap (-9, 137 or an oom_kill rise) is a failed take naming the cap; that item fails (the cue's other items and cues go on) and is not retried. Before each child the worker reads MemAvailable from /proc/meminfo; under `minAvailGiB` (default 14, from the same measured peak: the child needs that much free to load) the take fails with a clear message instead of starting; before each demucs pass the need is `minAvailDemucsGiB` (default 4, an estimate, not measured: htdemucs on CUDA alone is a torch + CUDA-context process of about 2-3 GiB host RAM plus margin). With `queue: false` there is no cap.

Each YuE2 cue, with all its takes, runs in its own worker process and its own `heavy run` job (host RAM drifts down while one process makes many cues; a fresh process gives it back). A take that fails with a CUDA error (`CUDA error` or `AcceleratorError` in the worker's error text) is retried once in a fresh process; a second failure, or any other error, fails it as before. A worker that cannot start (Skip) mid-run keeps the earlier cues and fails the rest.

### sa3 and yue2
Their own paragraphs above (K459): doc links, doc-backed settings and the kit's findings are marked there.

### Kokoro-82M (voice, `tools.py voice`)
Docs: [model card](https://huggingface.co/hexgrad/Kokoro-82M), [repo](https://github.com/hexgrad/kokoro) (kokoro 0.9.4, misaki 0.9.4; pinned in the install script as `kokoro==0.9.4`, which pulls `misaki[en]>=0.9.4`; needs espeak-ng).
- Doc-backed: 24 kHz mono; one `KPipeline` per language, the language code matching the voice (`af_`, `am_` = `a` American; `bf_`, `bm_` = `b` British; the kit now picks it from the voice's first letter, sharing one model); `repo_id` `hexgrad/Kokoro-82M` passed explicitly; `speed` 1 by default; at most 510 phonemes a chunk (the package splits English text itself); CUDA device.
- Kit's own: the retry rule (silent, under 0.25 s or clipped take is remade with `retryVoice`), `shout` shaping and the per-kind filters.
- No other voice backend exists in the kit (no Chatterbox or MOSS adapter); a new one gets its own subsection and its own tests.

## GPU only

Every model runs on the graphics card (CUDA) and nowhere else (owner, 19 Nov 2026): audio made on the CPU slows the test runners on the same machine.
- One exception (owner, 19 Nov 2026): YuE2 may use its own `offload_ar` option on a card under 24 GB (see YuE2 hardware and queue above), and runs through the heavy queue. Every other model has no offload.
- No CUDA, no audio: a worker or `voice gen` exits 3 with a message. Nothing falls back to the CPU (`allowCpu` is gone).
- Stable Audio 3, YuE2, demucs (`-d cuda`) and Kokoro are put on `cuda` by name.
- Two CPU threads at most (`OMP_NUM_THREADS`, `MKL_NUM_THREADS`, `torch.set_num_threads`) and the lowest priority: the pipeline starts each worker under `nice -n 19`, and `voice gen` lowers itself.
- The check before a batch is built in: after loading, the first generation prints what it used, for example `first generation: GPU at 88 % at its peak, 2983 MiB of CUDA memory, 0.9 CPU cores`, and the batch stops (exit 3) when it took no CUDA memory.

The same check by hand, while the first cue is made (loading the model comes first: under a minute of CPU work, the LM longer):

```sh
nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv -l 1   # GPU well above 0 %, memory up by the model
top -b -n 1 -o %CPU | head -12                                         # the worker: NI 19, about 100 % (one core)
```

GPU near 0 % while the worker stays far above one core: stop the run. `tools.py status` says whether the torch in each venv sees CUDA. Measured on a 16 GB RTX 5080 with the runners busy: music (2 x 20 s) GPU peak 95 %, 1.1 cores; sounds GPU peak 88 %, 1.1 cores; a voice line GPU peak 24 %, 0.5 cores. Left on the CPU: loading the weights, Kokoro's text-to-phoneme step, ffmpeg.

What each model was good for in the first game's rounds
- Stable Audio 3 Small SFX (`sa3`): the later rounds' sound effects (7th Inning Stretch round 8, Astra Imperium); now the default.
- YuE2-3B (`yue2`), the instrumental recipe: the shipped music of 7th Inning Stretch; the owner's pick ("much better music than the other ones"); now the default.
- Written notes (`music`): the reliable route for tunes and stems; exact loops and layers that stack.
- Kokoro-82M: clear short lines; the shouted calls need `shout` and a retry voice.
- Tried and not lifted (no install here): MOSS-SoundEffect v2 was worse than Stable Audio Open for most cues.

Prompt wording built from a sheet differs from hand-written prompts; `prompt.overrides` keeps any hand-written one.

Left out: any hosted (paid) backend. The script that makes the game's owner-facing review page itself stays in the game-sfx-review skill.

Tests: `tests/test_pure.py` (cue sheet, tail rule on a synthetic clip, loop length and MIDI, voice table, listening data, limits, the GPU-only rules with a fake torch) `tests/test_k461.py` (Kokoro settings against their docs, with fake modules) and `tests/test_k451.py` (the Vocal-to-rests rewrite, the gate math, the defaults and backend choice, the YuE2 worker with a fake YuE2 and demucs), run through vitest by `audio-gen.test.ts`.

## Use it in 10 lines

```sh
cd kit/audio-gen
python3 audiogen/tools.py limits --config config.json   # formats and sizes the sound player expects
```
