# audio-gen

Sounds, music and voice lines for a game, made with free local models in WSL and finished by rules in code. Python 3 and ffmpeg; no paid service is called anywhere (the paid speech client is `voice`, K66). Model weights and generated audio are never committed. It knows no game: names, paths, tiers and wording are in a config. Not for the browser.

Run from `components/audio-gen` (a game pulls the folder into `kit/`): `python3 audiogen/tools.py <step>`; generation itself is `python3 audiogen.py generate --config <config> --spec <cues.json>` (`check` first). Copy `example/config.json`; `~/audio-gen` is the home of models and output.

| Step | Command |
|---|---|
| Install (each group optional) | `bash install/install.sh core sa3 yue2 ace sao kokoro midi`, then `tools.py status` says what is there |
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
| `ace-xl` | `acestep` | ACE-Step 1.5 XL SFT (`acestep-v15-xl-sft`, 50 steps, guidance 7) | MIT |
| `ace` | `acestep` | ACE-Step 1.5 turbo (`acestep-v15-turbo`, 8 steps, shift 3.0) | MIT |
| `sao` | `stable-audio-open` | Stable Audio Open 1.0 | Stability AI Community License |
| written notes | `tools.py music` | MIDI through fluidsynth | the soundfont's |

YuE2 makes instrumental music by the 7th Inning Stretch recipe (its shipped music): plan the song with lyrics `[Instrumental]`, `cot` full and the take's seed; the score's "Vocal" voice is silenced (`recipe.novocal`). `vocal: "rests"` (the default) drops its notes: this is what the YuE yue2-music skill does (abc-editing.md, release yue2-v0.1.6: "The unselected voice is replaced with rests on the same time grid", with `--keep-voice Ins`). `vocal: "move"` (an option; the skill never moves notes) first puts each Vocal bar's notes in the same bar of the `Ins` voice (else the first other voice), only where that bar has no notes of its own (a voice is monophonic, so an instrumental bar with notes is kept as it is); a score with repeats, double or final bar lines or inline fields is only silenced; render with that score (`abc=`); split the take with demucs htdemucs two-stem on cuda (`demucsPython`, venv-demucs) and keep it only when vocal/mix is at most -25 dB and at most 3 % of its 0.5 s windows have the vocal above -14 dB (`recipe.measure`); these gate numbers are 7th Inning Stretch findings, not doc values (the YuE docs have no gate; they say listening is still needed to check for vocal leakage). A take that fails is made again with the next seed (seed + 7919 k) up to `tries` (6); each manifest entry keeps every seed tried with its measures. When no seed passes, the best take (lowest vocal dB) is kept anyway with `extra.failedGate` true, for a person to judge by ear. Name no choir, voice or singing in a YuE2 music style: such takes fail the vocal gate on every seed. YuE2 sets its own length (40 s and more); the pipeline cuts to the cue's length. The loudness and file finishing are the pipeline's, as for every backend.

YuE2 hardware and queue (owner, 19 Nov 2026: YuE2 is the one exception to GPU only, and it must follow the queue). The YuE2 docs ask for a BF16 NVIDIA GPU with 24 GB VRAM, one request at a time (peak 14.08 GiB documented); the Astra Imperium director measured about 10 GB peak on a 16 GB card in a real run. The package's own low-memory option is `offload_ar` (moves the AR weights to host memory between stages, an "optional memory tradeoff"): the kit's `offloadAr` option (true, false, or "auto", the default) turns it on when the card has under 24 GB. It stays on the card otherwise, and every other backend stays GPU only with no offload. Every YuE2 run goes through the heavy queue: the backend starts its worker as `heavy run --label "audio-gen <name>" -- nice ... yue2_worker.py` and skips with a message when `heavy` is missing, at `check` and at generate (`queue: false` turns the wrapping off). Not yet measured by the kit on this PC.

YuE2 must never take WSL down (K474; two runs crashed the VM on a 16 GB card with WSL at 20 GB RAM + 8 GB swap). Each cue's job is `heavy run --slots all --mem <memGiB>`: it holds every slot (nothing else runs beside it) and runs in a memory-capped cgroup with no swap, so an over-limit job is killed by the kernel and not the VM; `heavy` refuses to run when no cap can be set (needs `systemd-run --user`). Option `memGiB` (default 14): the WSL total is 20 GB and Windows, WSL itself and the runners need the rest, so 14 leaves 6 GB; this is a safe ceiling chosen from that total, not a measured peak (the worker prints its peak host RSS at the end of a run, demucs excluded, so set it from a real run plus margin). A take killed by the cap (exit 137) is a failed take whose error names the cap; the other cues go on. Before loading the model and before each demucs pass the worker reads MemAvailable from /proc/meminfo; under `minAvailGiB` (default 6) the take fails with a clear message instead of starting. Before demucs it calls `gc.collect()` and `torch.cuda.empty_cache()`. With `queue: false` there is no cap.

Each YuE2 cue, with all its takes, runs in its own worker process and its own `heavy run` job (host RAM drifts down while one process makes many cues; a fresh process gives it back). A take that fails with a CUDA error (`CUDA error` or `AcceleratorError` in the worker's error text) is retried once in a fresh process; a second failure, or any other error, fails it as before. A worker that cannot start (Skip) mid-run keeps the earlier cues and fails the rest.

### sa3 and yue2
Their own paragraphs above (K459): doc links, doc-backed settings and the kit's findings are marked there.

### ACE-Step 1.5 (`ace`, `ace-xl`)
Docs: [repo](https://github.com/ace-step/ACE-Step-1.5) (README, `docs/en/INFERENCE.md`, `docs/en/Tutorial.md`). Code is the repo checkout in `~/audio-gen/ACE-Step-1.5` (1.5.0), run in `venv`; the install script clones it unpinned.
- Doc-backed: turbo takes 8 steps and no CFG (the package forces `guidance_scale` to 1.0) and wants `shift=3.0`: INFERENCE.md says "the only timestep/guidance parameter you need to set manually for turbo is `shift=3.0`" and, in the `shift` row, "Recommended 3.0 for turbo models" (the kit sets it; option `shift`); base/SFT/XL-SFT take 32-64 steps (kit 50) and CFG 5-9 (kit 7.0), shift default 1.0 (the kit passes none); `duration` is, in INFERENCE.md, "Target audio length in seconds (10-600)": a cue under 10 s is made at 10 s and the pipeline cuts it to the cue's length (`post.clean`: `atrim=end=<length>` for one-shots, `loop_seam` for loops; tested), a cue over 600 s fails its item with that limit in the message; lyrics `[Instrumental]` for music with no singing; weights bf16 as the package loads them.
- Hardware (docs): XL (4B) needs 20 GB or more without CPU offload (12 GB with offload and quantisation). Offload is not allowed here (GPU only), so `ace-xl` belongs on a 24 GB card; on 16 GB use `ace`.
- Kit's own: the VAE decode fails the item instead of moving to the CPU; `thinking` is off unless set; the caption should stay under 512 characters and lyrics under 4096 (the docs' limits; the kit does not cut).

### Stable Audio Open 1.0 (`sao`)
Docs: [model card](https://huggingface.co/stabilityai/stable-audio-open-1.0), diffusers `StableAudioPipeline` docs. Venv `venv` (diffusers 0.37.1, torch 2.10 cu128).
- Doc-backed: 44.1 kHz stereo (read from the VAE), up to 47 s (the pipeline's limit is 47.55 s; the kit caps at 47), 100 steps and CFG 7 (defaults of the model card and the pipeline; the diffusers example uses 200 steps and the negative prompt "Low quality."), fp16 (the diffusers example), scheduler `CosineDPMSolverMultistepScheduler` from the model's own config (v-prediction, sigma 0.3 to 500), which imports `torchsde`: the install script now installs it. English prompts, T5 limit of 128 tokens (longer is cut by the pipeline).
- Kit's own: a negative prompt is passed only when the cue has one; weights are gated (licence, `hf auth login`).

### Kokoro-82M (voice, `tools.py voice`)
Docs: [model card](https://huggingface.co/hexgrad/Kokoro-82M), [repo](https://github.com/hexgrad/kokoro) (kokoro 0.9.4, misaki 0.9.4; pinned in the install script as `kokoro==0.9.4`, which pulls `misaki[en]>=0.9.4`; needs espeak-ng).
- Doc-backed: 24 kHz mono; one `KPipeline` per language, the language code matching the voice (`af_`, `am_` = `a` American; `bf_`, `bm_` = `b` British; the kit now picks it from the voice's first letter, sharing one model); `repo_id` `hexgrad/Kokoro-82M` passed explicitly; `speed` 1 by default; at most 510 phonemes a chunk (the package splits English text itself); CUDA device.
- Kit's own: the retry rule (silent, under 0.25 s or clipped take is remade with `retryVoice`), `shout` shaping and the per-kind filters.
- No other voice backend exists in the kit (no Chatterbox or MOSS adapter); a new one gets its own subsection and its own tests.

## GPU only

Every model runs on the graphics card (CUDA) and nowhere else (owner, 19 Nov 2026): audio made on the CPU slows the test runners on the same machine.
- One exception (owner, 19 Nov 2026): YuE2 may use its own `offload_ar` option on a card under 24 GB (see YuE2 hardware and queue above), and runs through the heavy queue. Every other model has no offload.
- No CUDA, no audio: a worker or `voice gen` exits 3 with a message. Nothing falls back to the CPU (`allowCpu` is gone).
- ACE-Step keeps its models on the card: `offload` is ignored, and a config that still sets it gets a line saying so. It works without the 5 Hz LM (`thinking` false). `thinking: true` loads the LM on CUDA too: about 5.5 GB more VRAM (all models must fit on the card together), over a minute of loading on two CPU threads, and its token loop holds one core while the GPU stays under 20 %. A VAE decode that ACE-Step would move to the CPU (under 0.5 GB of free VRAM) fails that item instead.
- Stable Audio Open, Stable Audio 3, YuE2, demucs (`-d cuda`) and Kokoro are put on `cuda` by name.
- Two CPU threads at most (`OMP_NUM_THREADS`, `MKL_NUM_THREADS`, `torch.set_num_threads`) and the lowest priority: the pipeline starts each worker under `nice -n 19`, and `voice gen` lowers itself.
- The check before a batch is built in: after loading, the first generation prints what it used, for example `first generation: GPU at 88 % at its peak, 2983 MiB of CUDA memory, 0.9 CPU cores`, and the batch stops (exit 3) when it took no CUDA memory.

The same check by hand, while the first cue is made (loading the model comes first: under a minute of CPU work, the LM longer):

```sh
nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv -l 1   # GPU well above 0 %, memory up by the model
top -b -n 1 -o %CPU | head -12                                         # the worker: NI 19, about 100 % (one core)
```

GPU near 0 % while the worker stays far above one core: stop the run. `tools.py status` says whether the torch in each venv sees CUDA. Measured on a 16 GB RTX 5080 with the runners busy: music (2 x 20 s) GPU peak 95 %, 1.1 cores; sounds GPU peak 88 %, 1.1 cores; a voice line GPU peak 24 %, 0.5 cores. Left on the CPU: loading the weights, Kokoro's text-to-phoneme step, ffmpeg.

What each model was good for in the first game's rounds
- Stable Audio Open 1.0 (`sao`): short dry one-shots (taps, knocks, steps, bell, plate); the first accepted sound effects. Gated weights: accept the licence on Hugging Face, `hf auth login`.
- Stable Audio 3 Small SFX (`sa3`): the later rounds' sound effects (7th Inning Stretch round 8, Astra Imperium); now the default.
- YuE2-3B (`yue2`), the instrumental recipe: the shipped music of 7th Inning Stretch; the owner's pick ("much better music than the other ones"); now the default.
- ACE-Step 1.5 (`ace`, `ace-xl`): music from a prompt; its organ takes did not pass, and prompted music is worth trying only for ambience and beds.
- Written notes (`music`): the reliable route for tunes and stems; exact loops and layers that stack.
- Kokoro-82M: clear short lines; the shouted calls need `shout` and a retry voice.
- Tried and not lifted (no install here): MOSS-SoundEffect v2 was worse than Stable Audio Open for most cues.

Prompt wording built from a sheet differs from hand-written prompts; `prompt.overrides` keeps any hand-written one.

Left out: any hosted (paid) backend. The script that makes the game's owner-facing review page itself stays in the game-sfx-review skill.

Tests: `tests/test_pure.py` (cue sheet, tail rule on a synthetic clip, loop length and MIDI, voice table, listening data, limits, the GPU-only rules with a fake torch) `tests/test_k461.py` (Stable Audio Open, ACE-Step and Kokoro settings against their docs, with fake modules) and `tests/test_k451.py` (the Vocal-to-rests rewrite, the gate math, the defaults and backend choice, the YuE2 worker with a fake YuE2 and demucs), run through vitest by `audio-gen.test.ts`.

## Use it in 10 lines

```sh
cd kit/audio-gen
python3 audiogen/tools.py limits --config config.json   # formats and sizes the sound player expects
```
