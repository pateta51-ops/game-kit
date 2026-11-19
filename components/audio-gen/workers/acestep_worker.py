"""ACE-Step 1.5 worker: runs in the ACE-Step Python (a venv with CUDA PyTorch), not in the pipeline's. GPU only.

Usage: <venv python> acestep_worker.py job.json     (written by audiogen; see audiogen/backends.py)
Job options (config backends.<name>, all optional except repo):
  repo            the ACE-Step-1.5 checkout
  checkpointsDir  where weights are downloaded (outside any game repo)
  model           DiT config, default "acestep-v15-turbo"
  thinking        use the 5 Hz LM to plan the audio codes (better structure; the LM is on CUDA too), default false
  lmModel         LM name, default: the first one available (downloaded on first use)
  lmBackend       "pt" (default) or "vllm"
  steps           diffusion steps, default 8 (turbo)
  offload         ignored: the models stay on the card (it moved them to the CPU between stages)
Per item: prompt, seconds, seed, tempo, key, beatsPerBar, options.lyrics (default "[Instrumental]").
Exit 3 = cannot start (missing checkout, no CUDA, or a first generation that did not use the GPU); the pipeline
turns it into a skip. There is no CPU fallback: a VAE decode that ACE-Step would move to the CPU fails the item.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from audiogen import gpu  # noqa: E402


def main() -> int:
    job = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    opts = job["options"]
    repo = Path(opts["repo"]).expanduser()
    if not (repo / "acestep").is_dir():
        print(f"acestep worker: no ACE-Step checkout at {repo}", file=sys.stderr)
        return 3
    if opts.get("checkpointsDir"):
        os.environ["ACESTEP_CHECKPOINTS_DIR"] = str(Path(opts["checkpointsDir"]).expanduser())
    os.chdir(repo)
    sys.path.insert(0, str(repo))

    torch = gpu.cuda("acestep worker")
    os.environ.pop("ACESTEP_VAE_ON_CPU", None)

    from acestep.handler import AceStepHandler
    from acestep.inference import GenerationConfig, GenerationParams, generate_music
    from acestep.llm_inference import LLMHandler
    from acestep.model_downloader import (
        check_main_model_exists,
        check_model_exists,
        ensure_dit_model,
        ensure_lm_model,
        ensure_main_model,
        get_checkpoints_dir,
    )

    device = "cuda"
    model = str(opts.get("model", "acestep-v15-turbo"))
    thinking = bool(opts.get("thinking", False))
    if opts.get("offload"):
        print("acestep worker: 'offload' is ignored. GPU only: the models stay on the card.", file=sys.stderr)
    ckpt = get_checkpoints_dir()
    if not check_main_model_exists(ckpt):
        ok, msg = ensure_main_model(ckpt)
        print(msg, file=sys.stderr)
        if not ok:
            return 3
    if not check_model_exists(model, ckpt):
        ok, msg = ensure_dit_model(model, ckpt)
        if not ok:
            print(msg, file=sys.stderr)
            return 3

    dit = AceStepHandler()
    status, ok = dit.initialize_service(
        project_root=str(repo), config_path=model, device=device, offload_to_cpu=False, use_mlx_dit=False
    )
    if not ok:
        print(f"acestep worker: DiT init failed: {status}", file=sys.stderr)
        return 3
    decode = dit.vae.decode

    def gpu_decode(z, *a, **k):  # ACE-Step moves the VAE decode to the CPU when VRAM is short
        if z.device.type != "cuda":
            raise RuntimeError("GPU only: not enough free VRAM for the VAE decode, and no CPU fallback")
        return decode(z, *a, **k)

    dit.vae.decode = gpu_decode
    llm = LLMHandler()
    lm_name = ""
    if thinking:
        lm_name = str(opts.get("lmModel") or "")
        if not lm_name:
            names = llm.get_available_5hz_lm_models()
            if not names:
                ensure_lm_model(checkpoints_dir=ckpt)
                names = llm.get_available_5hz_lm_models()
            lm_name = names[0] if names else ""
        elif not check_model_exists(lm_name, ckpt):
            ensure_lm_model(lm_name, checkpoints_dir=ckpt)
        if lm_name:
            status, ok = llm.initialize(
                checkpoint_dir=str(ckpt), lm_model_path=lm_name, backend=str(opts.get("lmBackend", "pt")),
                device=device, offload_to_cpu=False,
            )  # fmt: skip
            if not ok:
                print(f"acestep worker: LM init failed ({status}); continuing without thinking", file=sys.stderr)
                thinking, lm_name = False, ""
        else:
            thinking = False

    def one(item: dict) -> dict:
        t0 = time.time()
        out = Path(item["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        o = item.get("options") or {}
        params = GenerationParams(
            caption=item["prompt"],
            lyrics=str(o.get("lyrics", "[Instrumental]")),
            instrumental=bool(o.get("instrumental", True)),
            bpm=int(round(item["tempo"])) if item.get("tempo") else None,
            keyscale=str(item.get("key") or ""),
            timesignature=str(item.get("beatsPerBar") or ""),
            duration=float(item["seconds"]),
            inference_steps=int(o.get("steps", opts.get("steps", 8))),
            seed=int(item["seed"]),
            thinking=thinking,
            use_cot_metas=False,
            use_cot_caption=False,
            use_cot_language=False,
            enable_normalization=False,  # the pipeline does loudness
        )
        cfg = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[int(item["seed"])], audio_format="wav")
        tmp = out.parent / f"_ace_{out.stem}"
        tmp.mkdir(exist_ok=True)
        try:
            res = generate_music(dit, llm, params, cfg, save_dir=str(tmp))
            if not res.success or not res.audios:
                raise RuntimeError(f"ACE-Step: {res.error}")
            audio = res.audios[0]
            shutil.move(audio["path"], out)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        seed = audio.get("params", {}).get("seed", item["seed"])
        print(f"acestep worker: {item['label']} {item['seconds']:.1f} s in {time.time() - t0:.0f} s (seed {seed})",
              file=sys.stderr, flush=True)  # fmt: skip
        return {
            "out": str(out),
            "seed": int(seed) if str(seed).lstrip("-").isdigit() else item["seed"],
            "model": model + (f" + {lm_name}" if lm_name else ""),
            "extra": {"steps": params.inference_steps, "thinking": thinking},
        }

    results = []
    for item in job["items"]:
        try:
            results.append(one(item) if any("error" not in r for r in results)
                           else gpu.first(torch, "acestep worker", lambda: one(item)))  # fmt: skip
        except Exception as e:  # noqa: BLE001 - one bad item must not stop the rest
            print(f"acestep worker: {item['label']} failed: {e}", file=sys.stderr, flush=True)
            results.append({"out": item["out"], "error": f"{type(e).__name__}: {e}"[:500]})
        # written after every item, so a crash keeps what was finished
        Path(job["result"]).write_text(json.dumps({"items": results}, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
