"""The steps around generation: python3 audiogen/tools.py <step> ... (generation itself: audiogen.py generate).

  specs   cue sheet (Markdown) -> cues.json, one written prompt per cue    [--dry prints, writes nothing]
  music   score (JSON) -> MIDI -> soundfont -> one stem per layer, exact loops, shared gain, webm and m4a
  voice   gen | finish   a script table -> raw takes (Kokoro) -> shipped clips
  listen  manifest (+ voice stats) -> the listening page's data file
  limits  the sound player's format and size limits against a manifest
  status  which local models and tools are installed"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from audiogen import cuesheet, limits, listening, manifest as M  # noqa: E402
from audiogen import music as MU  # noqa: E402
from audiogen import post as P  # noqa: E402
from audiogen import voice as V  # noqa: E402
from audiogen.spec import load_config  # noqa: E402

E = os.path.expanduser


def raw_cfg(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def cmd_specs(a: argparse.Namespace) -> int:
    cfg = raw_cfg(a.config)
    sheet = cfg.get("sheet", {})
    rows = cuesheet.parse_sheet(Path(a.sheet).read_text(encoding="utf-8"), sheet.get("header", "Cue"), tuple(sheet.get("tiers", cfg["categories"])))
    specs, bad = cuesheet.to_specs(rows, cfg.get("prompt"))
    for b in bad:
        print("problem:", b, file=sys.stderr)
    text = cuesheet.dump(specs)
    if a.dry:
        print(text, end="")
    else:
        Path(a.out).write_text(text, encoding="utf-8")
        print(f"{len(specs)} specs -> {a.out}")
    return 1 if bad else 0


def cmd_music(a: argparse.Namespace) -> int:
    cfg = load_config(a.config)
    cat = cfg.categories[a.category]
    score = MU.load_score(a.score)
    out = Path(a.out)
    work = Path(a.work or cfg.work_dir) / "music"
    wavs = MU.render(score, work, Path(E(a.soundfont)), cfg.sample_rate)
    n = MU.loop_samples(score, cfg.sample_rate)
    g = cat.lufs - P.measure(wavs["full"]).integrated  # one gain for the mix and every stem: the balance stays as written
    done = {}
    for name, w in wavs.items():
        norm = work / f"{name}.n.wav"
        P.ff("-i", str(w), "-af", f"volume={g:.3f}dB,alimiter=limit={10 ** ((cat.true_peak - 0.3) / 20):.5f}:level=false", "-c:a", "pcm_f32le", str(norm))
        stem = out / f"{a.name}" if name == "full" else out / f"{a.name}-{name}"
        webm, m4a = P.deliver(norm, stem, cat, cat.channels, cfg.sample_rate, n / cfg.sample_rate, work / "ship")[:2]
        done[name] = {"file": webm.path.name, "fileFallback": m4a.path.name, "seconds": round(n / cfg.sample_rate, 6), "lufs": round(webm.integrated, 1), "truePeak": round(webm.true_peak, 2)}
        norm.unlink(missing_ok=True)
    info = {"name": a.name, "tempo": score["tempo"], "bars": score["bars"], "beatsPerBar": score.get("beatsPerBar", 4), "loopSeconds": n / cfg.sample_rate, "gainDb": round(g, 3), "files": done}
    (out / f"{a.name}.json").write_text(json.dumps(info, indent=1), encoding="utf-8")
    print(json.dumps(info)[:600])
    return 0


def cmd_voice(a: argparse.Namespace) -> int:
    table = raw_cfg(a.table)
    out = Path(E(a.out))
    if a.step == "gen":
        used = V.generate(table, out / "raw", set(a.only) if a.only else None)
        print(len(used), "takes")
        return 0
    stats = V.finish(table, out / "raw", out, Path(E(a.work)) if a.work else out / "work")
    bad = [k for k, v in stats.items() if v["short"]]
    print(len(stats), "clips; too short:", bad)
    return 1 if bad else 0


def cmd_listen(a: argparse.Namespace) -> int:
    cfg = load_config(a.config)
    man = M.load(cfg.manifest)
    cues = json.loads(Path(a.cues).read_text(encoding="utf-8"))["cues"] if a.cues else []
    stats = json.loads(Path(a.voice_stats).read_text(encoding="utf-8")) if a.voice_stats else None
    table = raw_cfg(a.voice_table) if a.voice_table else None
    data = listening.build(man, cues, stats, table)
    listening.write(Path(a.out), data)
    print(len(data["snd"]), "sound cues,", len(data["mus"]), "music,", len(data["voi"]), "voice lines ->", a.out)
    return 0


def cmd_limits(a: argparse.Namespace) -> int:
    cfg = load_config(a.config)
    bad = limits.check_manifest(M.load(cfg.manifest), cfg.manifest.parent)
    print("\n".join(bad) if bad else "all files within the formats and size limits")
    return 1 if bad else 0


def probe(venv: str, mod: str) -> bool:
    py = Path(E(f"~/audio-gen/{venv}/bin/python"))
    return py.exists() and subprocess.run([str(py), "-c", f"import {mod}"], capture_output=True).returncode == 0


def status() -> dict[str, bool]:
    home = Path(E("~/audio-gen"))
    return {
        "ffmpeg": shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None,
        "fluidsynth": shutil.which("fluidsynth") is not None,
        "soundfont": any((home / "soundfonts").glob("*.sf2")),
        "core (numpy, soundfile)": probe("venv", "numpy") and probe("venv", "soundfile"),
        "sao (Stable Audio Open: diffusers)": probe("venv", "diffusers"),
        "ace (ACE-Step 1.5 checkout)": (home / "ACE-Step-1.5").is_dir(),
        "kokoro (voice)": probe("venv-kokoro", "kokoro"),
        "CUDA in venv (sao, ace)": probe("venv", "torch; assert torch.cuda.is_available()"),
        "CUDA in venv-kokoro (voice)": probe("venv-kokoro", "torch; assert torch.cuda.is_available()"),
    }


def cmd_status(_a: argparse.Namespace) -> int:
    s = status()
    for k, v in s.items():
        print(("installed  " if v else "missing    ") + k)
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="tools.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("specs")
    p.add_argument("--sheet", required=True)
    p.add_argument("--config", required=True)
    p.add_argument("--out", default="cues.json")
    p.add_argument("--dry", action="store_true")
    p.set_defaults(f=cmd_specs)
    p = sub.add_parser("music")
    p.add_argument("--score", required=True)
    p.add_argument("--config", required=True)
    p.add_argument("--soundfont", required=True)
    p.add_argument("--category", default="music")
    p.add_argument("--name", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--work")
    p.set_defaults(f=cmd_music)
    p = sub.add_parser("voice")
    p.add_argument("step", choices=["gen", "finish"])
    p.add_argument("--table", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--only", nargs="*")
    p.add_argument("--work")
    p.set_defaults(f=cmd_voice)
    p = sub.add_parser("listen")
    p.add_argument("--config", required=True)
    p.add_argument("--cues")
    p.add_argument("--voice-stats")
    p.add_argument("--voice-table")
    p.add_argument("--out", required=True)
    p.set_defaults(f=cmd_listen)
    p = sub.add_parser("limits")
    p.add_argument("--config", required=True)
    p.set_defaults(f=cmd_limits)
    p = sub.add_parser("status")
    p.set_defaults(f=cmd_status)
    a = ap.parse_args(argv)
    return a.f(a)


if __name__ == "__main__":
    sys.exit(main())
