"""YuE2-3B worker, the 7th Inning Stretch instrumental recipe (round6i): runs in the YuE2 Python (venv-yue, yue2-infer
0.1.6, CUDA PyTorch). GPU only.

Per take: plan the song (lyrics "[Instrumental]", cot "full", the seed), turn every note of the ABC "Vocal" voice into
rests, render with that score (abc=), then split it with demucs htdemucs two-stem on cuda (in `demucsPython`) and keep
it only when vocal/mix <= -25 dB and at most 3 % of 0.5 s windows are loud. A take that fails is tried again with the
next seed (seed + 7919 k), up to `tries` seeds; none passing fails the item.

Usage: <venv python> yue2_worker.py job.json     (written by audiogen; see audiogen/backends.py)
Job options (config backends.<name>): modelDir (local snapshot, default ~/audio-gen/models/yue2; when missing the hub
model is used), model ("m-a-p/YuE2-3B"), revision ("8f24312f"), version (yue2 code, "0.1.6"), demucsPython,
tries (4), maxVocalDb (-25), maxLoudWindows (0.03), cot ("full"), lyrics ("[Instrumental]").
Per item: prompt (the style text), seed, options.lyrics / options.tries. YuE2 sets its own length: the pipeline cuts.
Exit 3 = cannot start (wrong yue2 version, no CUDA, or a first generation that did not use the GPU).
Weights: CC BY-NC 4.0 (non-commercial).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from audiogen import gpu, recipe  # noqa: E402


def main() -> int:
    job = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    opts = job["options"]
    import yue2

    want = str(opts.get("version", "0.1.6"))
    if yue2.__version__ != want:
        print(f"yue2 worker: yue2 {yue2.__version__} installed, the kit is pinned to {want} (install.sh yue2)", file=sys.stderr)
        return 3
    torch = gpu.cuda("yue2 worker")
    import soundfile as sf
    from yue2 import YuE2Pipeline

    local = Path(str(opts.get("modelDir", "~/audio-gen/models/yue2"))).expanduser()
    hub = str(opts.get("model", "m-a-p/YuE2-3B"))
    rev = str(opts.get("revision", "8f24312f"))
    if (local / "config.json").is_file():
        pipe = YuE2Pipeline.from_pretrained(str(local), device="cuda")
    else:
        pipe = YuE2Pipeline.from_pretrained(hub, revision=rev, device="cuda")
    demucs = str(Path(str(opts.get("demucsPython", "~/audio-gen/venv-demucs/bin/python"))).expanduser())
    env = {**os.environ, "OMP_NUM_THREADS": "2", "MKL_NUM_THREADS": "2"}

    def gate(wav: Path) -> tuple[float, float]:
        sep = wav.parent / f"_sep_{wav.stem}"
        try:
            subprocess.run(["nice", "-n", "19", demucs, "-m", "demucs", "-n", "htdemucs", "--two-stems=vocals", "-d", "cuda",
                            "-o", str(sep), str(wav)], env=env, check=True)  # fmt: skip
            d = sep / "htdemucs" / wav.stem
            v, sr = sf.read(str(d / "vocals.wav"))
            f, _ = sf.read(str(d / "no_vocals.wav"))
            e = lambda x: (x**2).sum(1) if x.ndim == 2 else x**2  # noqa: E731
            return recipe.measure(e(v).tolist(), e(v + f).tolist(), sr // 2)
        finally:
            shutil.rmtree(sep, ignore_errors=True)

    def one(item: dict) -> dict:
        t0 = time.time()
        out = Path(item["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        o = item.get("options") or {}
        lyrics = str(o.get("lyrics", opts.get("lyrics", "[Instrumental]")))
        cot = str(opts.get("cot", "full"))
        tried = []
        for s in recipe.seeds(int(item["seed"]), int(o.get("tries", opts.get("tries", 4)))):
            plan = pipe.plan(style=item["prompt"], lyrics=lyrics, cot=cot, seed=s)
            abc, nv = recipe.novocal(plan.abc)
            tmp = out.parent / f"_yue_{out.stem}-{s}.wav"
            pipe(style=item["prompt"], lyrics=lyrics, cot=cot, seed=s, abc=abc).save(tmp)
            db, loud = gate(tmp)
            tried.append({"seed": s, "vocalDb": db, "loudWindows": loud, "vocalBarsSilenced": nv})
            print(f"yue2 worker: {item['label']} seed {s}: vocal {db} dB, {loud:.1%} loud windows", file=sys.stderr, flush=True)
            if recipe.passes(db, loud, float(opts.get("maxVocalDb", recipe.MAX_VOCAL_DB)),
                             float(opts.get("maxLoudWindows", recipe.MAX_LOUD_WINDOWS))):  # fmt: skip
                shutil.move(tmp, out)
                print(f"yue2 worker: {item['label']} in {time.time() - t0:.0f} s", file=sys.stderr, flush=True)
                return {"out": str(out), "seed": s, "model": f"{hub}@{rev} (yue2 {want})",
                        "extra": {"recipe": "instrumental: plan cot full, Vocal voice to rests, render abc=, demucs gate",
                                  "tried": tried}}  # fmt: skip
            tmp.unlink(missing_ok=True)
        raise RuntimeError(f"no take passed the vocal gate: {tried}")

    results = []
    for item in job["items"]:
        try:
            results.append(one(item) if any("error" not in r for r in results)
                           else gpu.first(torch, "yue2 worker", lambda: one(item)))  # fmt: skip
        except Exception as e:  # noqa: BLE001 - one bad item must not stop the rest
            print(f"yue2 worker: {item['label']} failed: {e}", file=sys.stderr, flush=True)
            results.append({"out": item["out"], "error": f"{type(e).__name__}: {e}"[:500]})
        Path(job["result"]).write_text(json.dumps({"items": results}, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
