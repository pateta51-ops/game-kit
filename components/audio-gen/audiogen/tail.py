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
    max_length_x: float | None = None  # K512 opt-in hard cap: at most this x the cue's length after the first sound
    max_s: float | None = None  # K512: absolute cap in seconds; the smaller of the two wins
    cap_fade_ms: float = 60.0  # K512: fade-out that ends at the cap

    @staticmethod
    def from_category(k: dict) -> "TailRule":
        t = k.get("tail") or {}
        return TailRule(end_below_dbfs=t.get("endBelowDbfs", -50.0), min_fade_ms=t.get("minFadeMs", 150.0),
                        fade_out_ms=k.get("fadeOutMs", 200.0), fade_in_ms=k.get("fadeInMs", 3.0),
                        max_length_x=t.get("maxLengthX"), max_s=t.get("maxS"), cap_fade_ms=t.get("capFadeMs", 60.0))

    def cap_s(self, length: float) -> float | None:
        c = [v for v in (self.max_length_x * length if self.max_length_x is not None else None, self.max_s) if v is not None]
        return min(c) if c else None


def frame_db(x: list[float], rate: int, frame_ms: float = 10.0) -> list[float]:
    fr = max(1, int(rate * frame_ms / 1000))
    out = []
    for i in range(len(x) // fr):
        seg = x[i * fr:(i + 1) * fr]
        out.append(20 * math.log10(math.sqrt(sum(v * v for v in seg) / fr) + 1e-12))
    return out


def apply_tail(x: list[float], rate: int, length: float, rule: TailRule | None = None) -> list[float]:
    """Return the trimmed, faded clip (same scale as the input). `length` is the cue's intended length in seconds."""
    return apply_tail_info(x, rate, length, rule)[0]


def check_cap(y: list[float], rate: int, length: float, rule: TailRule) -> str:
    """K512 gate: "" or a message when a finished clip is still audible (above endBelowDbfs) past its cap."""
    cap = rule.cap_s(length)
    pk = max((abs(v) for v in y), default=0.0)
    if cap is None or pk <= 0:
        return ""
    db = frame_db([v * 10 ** (rule.detect_peak_dbfs / 20) / pk for v in y], rate, rule.frame_ms)
    above = [i for i, d in enumerate(db) if d > rule.end_below_dbfs]
    fr = max(1, int(rate * rule.frame_ms / 1000))
    if above and (above[-1] + 1 - above[0]) * fr / rate > cap + 2 * rule.frame_ms / 1000:
        return f"audible {(above[-1] + 1 - above[0]) * fr / rate:.3f} s, past the {cap:.3f} s cap"
    return ""


def apply_tail_info(x: list[float], rate: int, length: float, rule: TailRule | None = None) -> tuple[list[float], dict]:
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
    before = e - s
    cap = r.cap_s(length)
    capped = False
    if cap is not None:
        ec = min(len(x), above[0] * fr + int(cap * rate))  # counted from the first sound; the minimum never overrides it
        if ec < e:
            e, capped = max(ec, s + 1), True
    y = list(x[s:e])
    d = len(y) / rate
    fo = min(max(r.fade_out_ms, r.min_fade_ms) / 1000, d / 2)
    if capped:
        fo = min(r.cap_fade_ms / 1000, d / 2)
    fi = min(r.fade_in_ms / 1000, d / 4)
    n_in = int(fi * rate)
    for i in range(n_in):
        y[i] *= i / max(1, n_in - 1)
    m = int(fo * rate)
    for i in range(m):
        y[len(y) - m + i] *= math.cos((i / max(1, m - 1)) * math.pi / 2) ** 2
    return y, {"lengthBeforeMs": round(1000 * before / rate, 1), "lengthAfterMs": round(1000 * len(y) / rate, 1), "capped": capped}
