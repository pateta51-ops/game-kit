"""Voice lines from a script table with a free local voice (Kokoro-82M, on CUDA only). Parts (names, number words) are
separate files.

Table (JSON): {"kinds": {kind: {"voices": [..], "speed": 1.0, "filters": "<ffmpeg af>", "lufs": -20, "peakDbfs": -3,
"peakBelowS": 0, "shout": false}}, "lines": [{"id", "text", "kind"}], "parts": {group: [{"id", "text", "kind"?}]}}.
A part's file is named `<group>.<id>`; one file per voice, named `<id>-<voice-number>`."""
from __future__ import annotations

import json
import math
import os
from pathlib import Path

from . import post as P
from .spec import Category
from .tail import TailRule, apply_tail

KOKORO_RATE = 24000


def jobs(table: dict) -> list[dict]:
    """One job per line and part: {id, text, kind, voices, speed, filters, ...}. Checks ids and kinds."""
    kinds = table["kinds"]
    out, seen = [], set()
    items = [(ln["id"], ln) for ln in table["lines"]]
    for g, ps in (table.get("parts") or {}).items():
        items += [(f"{g}.{p['id']}", p) for p in ps]
    for i, ln in items:
        if i in seen:
            raise ValueError(f"line '{i}' appears twice")
        seen.add(i)
        k = ln.get("kind") or next(iter(kinds))
        if k not in kinds:
            raise ValueError(f"line '{i}': kind '{k}' is not in kinds ({', '.join(kinds)})")
        if not str(ln.get("text", "")).strip():
            raise ValueError(f"line '{i}': no text")
        c = kinds[k]
        out.append({"id": i, "text": ln["text"].strip(), "kind": k, "voices": list(c["voices"]), "speed": c.get("speed", 1.0)})
    return out


def keys(job: dict) -> list[str]:
    return [f"{job['id']}-{n}" for n in range(1, len(job["voices"]) + 1)]


def shout(x: list[float], drive: float = 3.0) -> list[float]:
    """tanh shaping for a barked call: peak-normalised input, then a soft clip scaled back to the same peak."""
    pk = max((abs(v) for v in x), default=0.0)
    if pk == 0:
        return x
    t = math.tanh(drive)
    return [math.tanh(drive * v / pk) / t * pk for v in x]


def generate(table: dict, out: Path, only: set[str] | None = None) -> dict:
    """Make the raw takes with Kokoro (run in the venv that has it). A take that is silent, too short or clipped is
    remade once with the kind's `retryVoice`, when it has one. Returns {key: voice used}. GPU only, low priority."""
    from . import gpu

    torch = gpu.cuda("voice")
    os.nice(19)
    import numpy as np
    import soundfile as sf
    from kokoro import KPipeline

    out.mkdir(parents=True, exist_ok=True)
    pipe, used = KPipeline(lang_code="a", device="cuda"), {}

    def say(j: dict, voice: str):
        return np.concatenate([np.asarray(g[2].cpu() if hasattr(g[2], "cpu") else g[2]) for g in pipe(j["text"], voice=voice, speed=j["speed"])])

    for j in jobs(table):
        if only and j["id"] not in only:
            continue
        retry = table["kinds"][j["kind"]].get("retryVoice")
        for key, v in zip(keys(j), j["voices"]):
            for voice in [v] + ([retry] if retry else []):
                a = say(j, voice) if used else gpu.first(torch, "voice", lambda: say(j, voice))
                if 0.02 < np.abs(a).max() < 0.999 and len(a) / KOKORO_RATE >= 0.25:
                    break
            sf.write(out / f"{key}.raw.wav", a, KOKORO_RATE)
            (out / f"{key}.voice").write_text(voice)
            used[key] = voice
    return used


def finish(table: dict, raw_dir: Path, out_dir: Path, tmp: Path, rate: int = 44100) -> dict:
    """Raw takes to shipped clips: pad, optional shout shaping, the kind's filters, the rings-out tail rule, loudness,
    webm and m4a. Returns {key: stats} (duration, loudness, true peak, voice, flags)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp.mkdir(parents=True, exist_ok=True)
    stats = {}
    for j in jobs(table):
        k = table["kinds"][j["kind"]]
        for key in keys(j):
            raw = raw_dir / f"{key}.raw.wav"
            if not raw.exists():
                continue
            w = tmp / f"{key}.w.wav"
            P.to_wav(raw, w, rate, 1)
            x = list(P.decode_mono(w, rate)) + [0.0] * int(0.4 * rate)
            if k.get("shout"):
                x = shout(x)
            P.write_f32(w, x, rate)
            if k.get("filters"):
                f = tmp / f"{key}.f.wav"
                P.ff("-i", str(w), "-af", k["filters"], "-c:a", "pcm_f32le", str(f))
                f.replace(w)
                x = list(P.decode_mono(w, rate))
            y = apply_tail(x, rate, 0.0, TailRule(fade_out_ms=k.get("fadeOutMs", 200.0), fade_in_ms=3.0, max_extra_s=60.0, min_len_s=0.1))
            pre = tmp / f"{key}.pre.wav"
            P.write_f32(pre, y, rate)
            cat = Category(name=j["kind"], kind="sfx", lufs=k.get("lufs", -20), true_peak=k.get("truePeak", -1.0),
                           peak_below_s=k.get("peakBelowS", 0.0), peak_dbfs=k.get("peakDbfs", -3.0), opus_kbps=k.get("opusKbps", 64))
            fin = tmp / f"{key}.wav"
            m, rule = P.normalise(pre, fin, cat, rate)
            webm, m4a = P.encode(fin, out_dir / key, cat, 1)
            d = P.duration(fin)
            stats[key] = {"id": j["id"], "voice": (raw_dir / f"{key}.voice").read_text().strip() if (raw_dir / f"{key}.voice").exists() else "",
                          "speed": j["speed"], "text": j["text"], "seconds": round(d, 2), "lufs": round(m.integrated, 1),
                          "truePeak": round(m.true_peak, 1), "rule": rule, "short": d < 0.25, "file": webm.name, "fileFallback": m4a.name}
            for q in (w, pre, fin):
                q.unlink(missing_ok=True)
    (out_dir / "stats-voice.json").write_text(json.dumps(stats, indent=1), encoding="utf-8")
    return stats
