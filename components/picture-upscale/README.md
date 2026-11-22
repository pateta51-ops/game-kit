# picture-upscale

Enlarges a picture 2-4x offline with a super-resolution model (any spandrel model file, on torch CUDA, in tiles with blended seams), for art shown larger than its source. Python 3 in WSL; the weights and the pictures never go into the kit. Not for the browser.

## Rules for agents

**What it does:** `upscale.py run` makes a PNG per picture plus `manifest.json` (source sha256, model, licence, scale, sizes, tile settings, time, peak VRAM). GPU only.

**You must:**
1. Run it in WSL from the folder (`kit/picture-upscale`): `bash install/install.sh` once (venv `~/picture-upscale/venv`, weights in `~/picture-upscale/models`), `python3 upscale.py status`, then `check` before `run`.
2. GPU only: no CUDA means exit 3 and no output. Never add a CPU fallback or offload.
3. Run GPU work through the heavy queue: `heavy run --label "picture-upscale <name>" -- ~/picture-upscale/venv/bin/python -I upscale.py run ...`.
4. Never commit model weights, source pictures or upscaled output (game art; this repository is public).
5. Every model in `models.json` has a name, URL, sha256 and licence; a model with no licence line is refused (exit 2). The licence goes into `manifest.json` for each picture: keep that file with the output.6. Give `--scale 2..4` or `--width <px>`, not both (default scale 4). The model's own scale is applied first, then a Lanczos resize to the asked size. Tiles default to 512 with 32 overlap (fits 16 GB; peak is about 4 GB); lower `--tile` on out-of-memory.

**Common mistakes:**
- Expecting a CPU run when CUDA is missing: it exits 3.
- Committing the output next to the code.
- Upscaling already large art with a 4x model and a small `--width`: the result is a downscale of the model output.

| Exit | Meaning |
|---|---|
| 0 | done |
| 2 | refused: arguments, unknown model, no licence line, weights not fetched |
| 3 | no CUDA |

## Use it in 10 lines

```sh
cd kit/picture-upscale
bash install/install.sh                      # venv, spandrel, torch CUDA, the weights in models.json
python3 upscale.py status                    # torch, CUDA, which models are fetched
python3 upscale.py check --in mat.png --width 3400
heavy run --label "picture-upscale mat" -- ~/picture-upscale/venv/bin/python -I upscale.py run --in mat.png --out out --width 3400
```
