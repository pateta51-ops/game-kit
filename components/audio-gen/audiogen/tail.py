"""The "rings out" rule for one-shots, in pure Python (lists of floats, no numpy): trim leading silence, end the clip
where its own decay falls below a floor, then fade out for at least `minFadeMs`. A clip is never cut off."""
from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class TailRule:
    end_below_dbfs: float = -50.0
    min_fade_ms: float = 150.0
    fade_out_ms: float = 200.0
    fade_in_ms: float = 3.0
    frame_ms: float = 10.0
    max_extra_s: float = 1.5  # keep at most this much past the cue's length
    min_len_s: float = 0.35
    detect_peak_dbfs: float = -3.0  # the clip is scaled to this peak before the floor is applied

    @staticmethod
    def from_category(k: dict) -> "TailRule":
        t = k.get("tail") or {}
        return TailRule(end_below_dbfs=t.get("endBelowDbfs", -50.0), min_fade_ms=t.get("minFadeMs", 150.0),
                        fade_out_ms=k.get("fadeOutMs", 200.0), fade_in_ms=k.get("fadeInMs", 3.0))


def frame_db(x: list[float], rate: int, frame_ms: float = 10.0) -> list[float]:
    fr = max(1, int(rate * frame_ms / 1000))
    out = []
    for i in range(len(x) // fr):
        seg = x[i * fr:(i + 1) * fr]
        out.append(20 * math.log10(math.sqrt(sum(v * v for v in seg) / fr) + 1e-12))
    return out


def apply_tail(x: list[float], rate: int, length: float, rule: TailRule | None = None) -> list[float]:
    """Return the trimmed, faded clip (same scale as the input). `length` is the cue's intended length in seconds."""
    r = rule or TailRule()
    pk = max((abs(v) for v in x), default=0.0)
    if pk <= 0:
        raise ValueError("silent clip")
    g = 10 ** (r.detect_peak_dbfs / 20) / pk
    db = frame_db([v * g for v in x], rate, r.frame_ms)
    fr = max(1, int(rate * r.frame_ms / 1000))
    above = [i for i, d in enumerate(db) if d > r.end_below_dbfs]
    if not above:
        raise ValueError("nothing above the floor")
    s = max(0, above[0] - 1) * fr
    e = min(len(x), (above[-1] + 2) * fr)
    e = min(e, s + int((length + r.max_extra_s) * rate))
    e = min(len(x), max(e, s + int(r.min_len_s * rate)))
    y = list(x[s:e])
    d = len(y) / rate
    fo = min(max(r.fade_out_ms, r.min_fade_ms) / 1000, d / 2)
    fi = min(r.fade_in_ms / 1000, d / 4)
    n_in = int(fi * rate)
    for i in range(n_in):
        y[i] *= i / max(1, n_in - 1)
    m = int(fo * rate)
    for i in range(m):
        y[len(y) - m + i] *= math.cos((i / max(1, m - 1)) * math.pi / 2) ** 2
    return y
