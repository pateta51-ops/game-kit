"""YuE2-3B worker, the 7th Inning Stretch instrumental recipe (round6i): runs in the YuE2 Python (venv-yue, yue2-infer
0.1.6, CUDA PyTorch). GPU only.

K477: each take is generated in a child process (this script with --take) that loads the pipeline, writes the take and exits;
this light parent then runs the demucs gate and, on a fail, starts the next seed's child (the reload time is logged per take).
Per take: plan the song (lyrics "[Instrumental]", cot "full", the seed), silence every note of the ABC "Vocal" voice:
silent (its notes move into the instrumental voice; `vocal: "rests"` drops them), render with that score (abc=), then split it with demucs htdemucs two-stem on cuda (in `demucsPython`) and keep
it only when vocal/mix <= -25 dB and at most 3 % of 0.5 s windows are loud. A take that fails is tried again with the
next seed (seed + 7919 k), up to `tries` seeds (default 6); when none passes, the best take (lowest vocal dB) is kept with extra.failedGate true for a human to judge.

Usage: <venv python> yue2_worker.py job.json     (written by audiogen; see audiogen/backends.py)
Job options (config backends.<name>): modelDir (local snapshot, default ~/audio-gen/models/yue2; when missing the hub
model is used), model ("m-a-p/YuE2-3B"), revision ("8f24312f"), version (yue2 code, "0.1.6"), demucsPython,
tries (6), keep (1: passing takes kept per item; the first is the item's file, the others
<out>-keep2.wav, ... listed in extra.alternates; raise tries with it), maxVocalDb (-25), maxLoudWindows (0.03), cot ("full"), lyrics ("[Instrumental]"),
vocal ("rests" default, as the YuE skill does | "move"), minAvailGiB (6: MemAvailable needed before each take's child loads the model; under it the take fails, K474),
minAvailDemucsGiB (3: MemAvailable needed before each demucs pass, K477; an estimate, not measured: demucs htdemucs on CUDA alone is a torch + CUDA-context process of about 2-3 GiB host RAM; the child that held the model has exited by then), offloadAr (true | false | "auto": on when the card has under 24 GB; YuE2 only, the one exception to GPU only).
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


def child(take_path: str) -> int:
    """K477: one take in its own process: load the pipeline, plan, render, save, exit, so its host memory is gone before demucs."""
    t = json.loads(Path(take_path).read_text(encoding="utf-8"))
    opts = t["options"]
    import yue2

    want = str(opts.get("version", "0.1.6"))
    if yue2.__version__ != want:
        print(f"yue2 worker: yue2 {yue2.__version__} installed, the kit is pinned to {want} (install.sh yue2)", file=sys.stderr)
        return 3
    torch = gpu.cuda("yue2 worker")
    from yue2 import YuE2Pipeline

    t0 = time.time()
    local = Path(str(opts.get("modelDir", "~/audio-gen/models/yue2"))).expanduser()
    hub = str(opts.get("model", "m-a-p/YuE2-3B"))
    rev = str(opts.get("revision", "8f24312f"))
    total = torch.cuda.get_device_properties(0).total_memory / 2**30
    off = recipe.offload_ar(opts.get("offloadAr", "auto"), total)
    extra = {"offload_ar": True} if off else {}  # YuE2 only: the package's own low-memory option, see README
    print(f"yue2 worker: {total:.1f} GiB card, offload_ar {off}", file=sys.stderr, flush=True)
    if (local / "config.json").is_file():
        pipe = YuE2Pipeline.from_pretrained(str(local), device="cuda", **extra)
    else:
        pipe = YuE2Pipeline.from_pretrained(hub, revision=rev, device="cuda", **extra)
    load = time.time() - t0

    def make() -> int:
        plan = pipe.plan(style=t["prompt"], lyrics=t["lyrics"], cot=t["cot"], seed=t["seed"])
        abc, nv = recipe.novocal(plan.abc, str(opts.get("vocal", "rests")))
        pipe(style=t["prompt"], lyrics=t["lyrics"], cot=t["cot"], seed=t["seed"], abc=abc).save(t["tmp"])
        return nv

    nv = gpu.first(torch, "yue2 worker", make) if t.get("first") else make()
    Path(t["result"]).write_text(json.dumps({"nv": nv, "loadSeconds": load}), encoding="utf-8")
    return 0


def main() -> int:
    if len(sys.argv) > 3 and sys.argv[2] == "--take":
        return child(sys.argv[3])
    job = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    opts = job["options"]
    import soundfile as sf

    need = float(opts.get("minAvailGiB", 6))
    need_demucs = float(opts.get("minAvailDemucsGiB", 3))
    hub = str(opts.get("model", "m-a-p/YuE2-3B"))
    rev = str(opts.get("revision", "8f24312f"))
    want = str(opts.get("version", "0.1.6"))
    demucs = str(Path(str(opts.get("demucsPython", "~/audio-gen/venv-demucs/bin/python"))).expanduser())
    env = {**os.environ, "OMP_NUM_THREADS": "2", "MKL_NUM_THREADS": "2"}

    def gate(wav: Path) -> tuple[float, float]:
        try:
            recipe.need_memory(need_demucs, "the demucs pass")
        except recipe.LowMemory:
            wav.unlink(missing_ok=True)
            raise
        sep = wav.parent / f"_sep_{wav.stem}"
        try:
            kills = recipe.oom_kills()
            try:
                subprocess.run(["nice", "-n", "19", demucs, "-m", "demucs", "-n", "htdemucs", "--two-stems=vocals", "-d", "cuda",
                                "-o", str(sep), str(wav)], env=env, check=True)  # fmt: skip
            except subprocess.CalledProcessError as e:  # demucs runs in this cgroup, so the cap can kill it too
                if e.returncode in (-9, 137) or recipe.oom_kills() > kills:
                    wav.unlink(missing_ok=True)
                    raise recipe.LowMemory(f"killed by the memory cap: demucs died (exit {e.returncode}) in the cgroup limit") from e
                raise
            d = sep / "htdemucs" / wav.stem
            v, sr = sf.read(str(d / "vocals.wav"))
            f, _ = sf.read(str(d / "no_vocals.wav"))
            e = lambda x: (x**2).sum(1) if x.ndim == 2 else x**2  # noqa: E731
            return recipe.measure(e(v).tolist(), e(v + f).tolist(), sr // 2)
        finally:
            shutil.rmtree(sep, ignore_errors=True)

    state = {"first": True}

    def generate(tmp: Path, prompt: str, lyrics: str, cot: str, seed: int) -> int:
        """The take in a child process that has exited when this returns (K477); a child killed by the cap is a failed take naming it."""
        recipe.need_memory(need, "loading YuE2 in a child process")
        tj, rj = tmp.with_suffix(".take.json"), tmp.with_suffix(".take.res.json")
        tj.write_text(json.dumps({"options": opts, "prompt": prompt, "lyrics": lyrics, "cot": cot, "seed": seed, "tmp": str(tmp),
                                  "result": str(rj), "first": state["first"]}), encoding="utf-8")
        t0, kills = time.time(), recipe.oom_kills()
        try:
            try:
                subprocess.run([sys.executable, str(Path(__file__).resolve()), sys.argv[1], "--take", str(tj)], env=env, check=True)
            except subprocess.CalledProcessError as e:
                if e.returncode == 3:
                    raise SystemExit(3) from e
                tmp.unlink(missing_ok=True)
                if e.returncode in (-9, 137) or recipe.oom_kills() > kills:
                    raise recipe.LowMemory(f"killed by the memory cap: the generating child died (exit {e.returncode}) in the cgroup limit") from e
                raise RuntimeError(f"the generating child failed (exit {e.returncode})") from e
            r = json.loads(rj.read_text(encoding="utf-8"))
        finally:
            tj.unlink(missing_ok=True)
            rj.unlink(missing_ok=True)
        state["first"] = False
        print(f"yue2 worker: seed {seed}: child reloaded the pipeline in {r['loadSeconds']:.0f} s ({time.time() - t0:.0f} s in all)", file=sys.stderr, flush=True)
        return r["nv"]

    def one(item: dict) -> dict:
        t0 = time.time()
        out = Path(item["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        o = item.get("options") or {}
        lyrics = str(o.get("lyrics", opts.get("lyrics", "[Instrumental]")))
        cot = str(opts.get("cot", "full"))
        best, tried, kept, keep = None, [], [], int(o.get("keep", opts.get("keep", 1)))
        for s in recipe.seeds(int(item["seed"]), int(o.get("tries", opts.get("tries", 6)))):
            tmp = out.parent / f"_yue_{out.stem}-{s}.wav"
            nv = generate(tmp, item["prompt"], lyrics, cot, s)
            db, loud = gate(tmp)
            tried.append({"seed": s, "vocalDb": db, "loudWindows": loud, "vocalBarsSilenced": nv})
            print(f"yue2 worker: {item['label']} seed {s}: vocal {db} dB, {loud:.1%} loud windows", file=sys.stderr, flush=True)
            if recipe.passes(db, loud, float(opts.get("maxVocalDb", recipe.MAX_VOCAL_DB)),
                             float(opts.get("maxLoudWindows", recipe.MAX_LOUD_WINDOWS))):  # fmt: skip
                dest = out if not kept else out.with_name(f"{out.stem}-keep{len(kept) + 1}{out.suffix}")
                shutil.move(tmp, dest)
                kept.append({"seed": s, "file": str(dest)})
                if len(kept) >= keep:
                    break
            elif best is None or (db, loud) < best[0]:
                if best:
                    best[1].unlink(missing_ok=True)
                best = ((db, loud), tmp, s)
            else:
                tmp.unlink(missing_ok=True)
        if not kept and best is None:
            raise RuntimeError(f"no take made: {tried}")
        failed = not kept
        if failed:  # keep the best failing take for a human to judge
            shutil.move(best[1], out)
            kept.append({"seed": best[2], "file": str(out)})
            print(f"yue2 worker: {item['label']} no take passed the vocal gate; kept best seed {best[2]} marked failedGate", file=sys.stderr, flush=True)
        elif best:
            best[1].unlink(missing_ok=True)
        print(f"yue2 worker: {item['label']} {len(kept)} take(s) in {time.time() - t0:.0f} s", file=sys.stderr, flush=True)
        return {"out": str(out), "seed": kept[0]["seed"], "model": f"{hub}@{rev} (yue2 {want})",
                "extra": {"recipe": "instrumental: plan cot full, Vocal voice to rests, render abc=, demucs gate",
                          "tried": tried, "alternates": kept[1:], "failedGate": failed}}  # fmt: skip

    results = []
    for item in job["items"]:
        try:
            results.append(one(item))
        except SystemExit as e:
            return int(e.code or 0)
        except Exception as e:  # noqa: BLE001 - one bad item must not stop the rest
            print(f"yue2 worker: {item['label']} failed: {e}", file=sys.stderr, flush=True)
            results.append({"out": item["out"], "error": f"{type(e).__name__}: {e}"[:500]})
        Path(job["result"]).write_text(json.dumps({"items": results}, indent=2), encoding="utf-8")
    try:
        import resource
        print(f"yue2 worker: peak host RSS {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2**20:.1f} GiB (demucs not included)", file=sys.stderr, flush=True)
    except ImportError:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
