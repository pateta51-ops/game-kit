"""Stable Audio 3 Small SFX worker (package stable-audio-3): runs in venv-sa3 (CUDA PyTorch). GPU only.

Usage: <venv python> stable_audio_3_worker.py job.json     (written by audiogen; see audiogen/backends.py)
Job options (config backends.<name>): model ("small-sfx", hf stabilityai/stable-audio-3-small-sfx), steps (8),
cfg (1.0), half (true), minSeconds (7: shorter cues are generated at 7 s and cut by the pipeline), tries (4: a take
with spectral flatness > 0.4, over 20 % of its energy above 8 kHz, or a peak at 1.0 is made again with seed + 1),
cacheDir (Hugging Face cache, outside any game repo).
Per item: prompt, negativePrompt, seconds, seed.
Exit 3 = cannot start (no CUDA, or a first generation that did not use the GPU).
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from audiogen import gpu, recipe  # noqa: E402


def main() -> int:
    job = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    opts = job["options"]
    if opts.get("cacheDir"):
        os.environ["HF_HUB_CACHE"] = str(Path(opts["cacheDir"]).expanduser())
    torch = gpu.cuda("stable-audio-3 worker")
    import numpy as np
    import soundfile as sf
    from stable_audio_3 import StableAudioModel

    name = str(opts.get("model", "small-sfx"))
    m = StableAudioModel.from_pretrained(name, device="cuda", model_half=bool(opts.get("half", True)))
    rate = int(m.model_config["sample_rate"])

    def bad(a):
        x = a[0].astype("float64")
        sp = np.abs(np.fft.rfft(x)) ** 2
        fq = np.fft.rfftfreq(len(x), 1 / rate)
        fl = float(np.exp(np.mean(np.log(sp + 1e-20))) / (sp.mean() + 1e-20))
        hi = float(sp[fq > 8000].sum() / (sp.sum() + 1e-20))
        return recipe.sa3_bad(fl, hi, float(np.abs(a).max()))

    def one(item: dict) -> dict:
        t0 = time.time()
        out = Path(item["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        o = item.get("options") or {}
        sec = max(float(opts.get("minSeconds", 7.0)), float(item["seconds"]))
        def make(seed):
            a = m.generate(prompt=item["prompt"], negative_prompt=item.get("negativePrompt") or None, duration=sec,
                           steps=int(o.get("steps", opts.get("steps", 8))), cfg_scale=float(o.get("cfg", opts.get("cfg", 1.0))),
                           seed=seed)  # fmt: skip
            return (a[0] if a.dim() == 3 else a).float().cpu().numpy()

        a, seed, tr = recipe.first_good(make, bad, int(item["seed"]), int(o.get("tries", opts.get("tries", 4))))
        sf.write(str(out), a.T, rate, subtype="FLOAT")
        print(f"stable-audio-3 worker: {item['label']} {sec:.1f} s in {time.time() - t0:.1f} s (seed {seed})",
              file=sys.stderr, flush=True)  # fmt: skip
        return {"out": str(out), "seed": seed, "model": f"stabilityai/stable-audio-3-{name}",
                "extra": {"generatedSeconds": sec, "tries": tr}}  # fmt: skip

    results = []
    for item in job["items"]:
        try:
            results.append(one(item) if any("error" not in r for r in results)
                           else gpu.first(torch, "stable-audio-3 worker", lambda: one(item)))  # fmt: skip
        except Exception as e:  # noqa: BLE001 - one bad item must not stop the rest
            print(f"stable-audio-3 worker: {item['label']} failed: {e}", file=sys.stderr, flush=True)
            results.append({"out": item["out"], "error": f"{type(e).__name__}: {e}"[:500]})
        Path(job["result"]).write_text(json.dumps({"items": results}, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
