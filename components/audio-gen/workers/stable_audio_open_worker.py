"""Stable Audio Open worker (diffusers StableAudioPipeline): runs in a venv with CUDA PyTorch, diffusers and torchsde.

Usage: <venv python> stable_audio_open_worker.py job.json     (written by audiogen; see audiogen/backends.py)
Needs a Hugging Face token, HF_TOKEN or the standard login (`hf auth login`): the weights are gated (accept the
licence on the model page first).
Job options (config backends.<name>): model (default "stabilityai/stable-audio-open-1.0"), steps (default 100),
guidance (default 7.0), cacheDir (Hugging Face cache, outside any game repo).
Per item: prompt, negativePrompt, seconds (up to 47), seed.
Exit 3 = cannot start (no token, the licence not accepted, no GPU); the pipeline turns it into a skip.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path


def main() -> int:
    job = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    opts = job["options"]
    import soundfile as sf
    from huggingface_hub import get_token

    # HF_TOKEN if set, else the token `hf auth login` stored (huggingface_hub's own lookup)
    token = os.environ.get("HF_TOKEN") or get_token()
    if not token:
        print("stable-audio-open worker: no Hugging Face token (HF_TOKEN or `hf auth login`)", file=sys.stderr)
        return 3
    import torch
    from diffusers import StableAudioPipeline

    if not torch.cuda.is_available():
        print("stable-audio-open worker: CUDA is not available", file=sys.stderr)
        return 3
    model = str(opts.get("model", "stabilityai/stable-audio-open-1.0"))
    cache = opts.get("cacheDir")
    try:
        pipe = StableAudioPipeline.from_pretrained(
            model, torch_dtype=torch.float16, token=token,
            cache_dir=str(Path(cache).expanduser()) if cache else None,
        )  # fmt: skip
    except Exception as e:  # noqa: BLE001 - a gated repo raises several error types; never echo the token
        msg = str(e).replace(token, "***")
        print(f"stable-audio-open worker: cannot load {model}: {msg[:300]}", file=sys.stderr)
        print("  Has the licence been accepted at https://huggingface.co/stabilityai/stable-audio-open-1.0 ?",
              file=sys.stderr)  # fmt: skip
        return 3
    pipe = pipe.to("cuda")
    rate = pipe.vae.sampling_rate
    steps = int(opts.get("steps", 100))
    guidance = float(opts.get("guidance", 7.0))
    def one(item: dict) -> dict:
        t0 = time.time()
        out = Path(item["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        o = item.get("options") or {}
        seed = int(item["seed"])
        gen = torch.Generator("cuda").manual_seed(seed)
        audio = pipe(
            item["prompt"],
            negative_prompt=item.get("negativePrompt") or None,
            num_inference_steps=int(o.get("steps", steps)),
            guidance_scale=float(o.get("guidance", guidance)),
            audio_end_in_s=min(47.0, max(0.5, float(item["seconds"]))),
            num_waveforms_per_prompt=1,
            generator=gen,
        ).audios
        sf.write(str(out), audio[0].T.float().cpu().numpy(), rate, subtype="FLOAT")
        print(f"stable-audio-open worker: {item['label']} in {time.time() - t0:.1f} s (seed {seed})", file=sys.stderr,
              flush=True)  # fmt: skip
        return {"out": str(out), "seed": seed, "model": model, "extra": {"steps": int(o.get("steps", steps))}}

    results = []
    for item in job["items"]:
        try:
            results.append(one(item))
        except Exception as e:  # noqa: BLE001 - one bad item must not stop the rest
            msg = f"{type(e).__name__}: {e}".replace(token, "***")[:500]
            print(f"stable-audio-open worker: {item['label']} failed: {msg}", file=sys.stderr, flush=True)
            results.append({"out": item["out"], "error": msg})
        # written after every item, so a crash keeps what was finished
        Path(job["result"]).write_text(json.dumps({"items": results}, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
