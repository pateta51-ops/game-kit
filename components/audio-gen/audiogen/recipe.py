"""The YuE2 instrumental recipe's pure parts (7th Inning Stretch round6i): the ABC "Vocal" voice turned to rests, and
the demucs vocal gate (vocal/mix <= -25 dB over the take, at most 3 % of 0.5 s windows with the vocal above -14 dB)."""
from __future__ import annotations

import math
import re

MAX_VOCAL_DB = -25.0
MAX_LOUD_WINDOWS = 0.03
LOUD_WINDOW_DB = -14.0


def novocal(abc: str, vocal: str = "move") -> tuple[str, int]:
    """The "Vocal" voice is silenced bar by bar (chord symbols stay, as the native format keeps harmony in Vocal even
    when it rests). vocal="move" (default) first moves each bar's notes, chords dropped, into the same bar of the first
    other voice (the instrumental part), as the YuE repo's yue2-music skill does ("moves the vocal melody into the
    instrumental part", release yue2-v0.1.6, skills/yue2-music/references/abc-editing.md: the `Ins` part "can carry an
    instrumental theme or solo"); a bar with no vocal notes keeps the instrumental bar. With no other voice, or
    vocal="rests", the notes are dropped. Returns the score and the number of Vocal bars that had notes."""
    lines = abc.split("
")
    q = lambda b: re.sub(r'"[^"]*"', "", b)  # noqa: E731
    music = lambda ln: "|" in ln and not ln.startswith(("%", "w:"))  # noqa: E731
    ins, cur = None, None
    for ln in lines:
        if ln.startswith("V:"):
            cur = "vocal" if ln.startswith(("V: Vocal", "V:Vocal")) else ln[2:].split()[0] if ln[2:].split() else None
            if cur != "vocal" and ins is None:
                ins = cur
    cur, moved, n, queue = None, vocal == "move" and ins is not None, 0, []
    for ln in lines:
        if ln.startswith("V:"):
            cur = "vocal" if ln.startswith(("V: Vocal", "V:Vocal")) else (ln[2:].split() or [None])[0]
        elif cur == "vocal" and music(ln):
            queue.append([b.strip() for b in ln.split("|") if b.strip()])
    out, cur, k = [], None, 0
    for ln in lines:
        if ln.startswith("V:"):
            cur = "vocal" if ln.startswith(("V: Vocal", "V:Vocal")) else (ln[2:].split() or [None])[0]
            out.append(ln)
        elif cur == "vocal" and music(ln):
            nb = []
            for b in [b for b in ln.split("|") if b.strip()]:
                if re.search(r"[A-Ga-g]", q(b)):
                    n += 1
                nb.append("".join(re.findall(r'"[^"]*"', b)) + "z16")
            out.append("|".join(nb) + "|")
        elif moved and cur == ins and music(ln) and k < len(queue):
            own = [b.strip() for b in ln.split("|") if b.strip()]
            vb = queue[k]
            k += 1
            res = [q(v).strip() if re.search(r"[A-Ga-g]", q(v)) else (own[i] if i < len(own) else "z16") for i, v in enumerate(vb)]
            res += own[len(vb):]
            out.append("|".join(res) + "|")
        else:
            out.append(ln)
    return "
".join(out), n


YUE2_DOC_GIB = 24  # YuE2 docs (README, docs/generation.md): "a BF16-capable NVIDIA GPU with 24 GB VRAM, one request at a time"


def offload_ar(opt, total_gib: float) -> bool:
    """YuE2 only (owner, 19 Nov 2026: the one exception to GPU only): the package's `offload_ar` option moves the AR
    weights to host memory between stages. opt true/false, or "auto" (default): on when the card has under 24 GB."""
    return total_gib < YUE2_DOC_GIB if opt in (None, "auto") else bool(opt)


def measure(v2: list[float], m2: list[float], w: int) -> tuple[float, float]:
    """v2, m2: energy per frame (sum of squared channels) of the vocal stem and of the mix (vocals + no_vocals);
    w: frames per window (half a second). Returns (vocal/mix dB, share of loud windows)."""
    r = lambda s, n: math.sqrt(s / max(n, 1) + 1e-12)  # noqa: E731
    db = 20 * math.log10(r(sum(v2), len(v2)) / r(sum(m2), len(m2)))
    n = len(m2) // w
    loud = sum(20 * math.log10((r(sum(v2[i * w:(i + 1) * w]), w) + 1e-9) / (r(sum(m2[i * w:(i + 1) * w]), w) + 1e-9))
               > LOUD_WINDOW_DB for i in range(n))  # fmt: skip
    return round(db, 1), round(loud / n, 3) if n else 1.0


def passes(db: float, loud: float, max_db: float = MAX_VOCAL_DB, max_loud: float = MAX_LOUD_WINDOWS) -> bool:
    return db <= max_db and loud <= max_loud


def seeds(seed: int, tries: int, step: int = 7919) -> list[int]:
    """The seeds tried for one take, in order: the take's seed, then a step apart (round6i's candidates)."""
    return [seed + step * k for k in range(tries)]


def sa3_bad(flatness: float, high: float, peak: float) -> bool:
    """7th Inning Stretch round 8: a Stable Audio 3 take is noise (spectral flatness > 0.4), hiss (over 20 % of its
    energy above 8 kHz) or clipped (peak 1.0)."""
    return flatness > 0.4 or high > 0.2 or peak >= 0.999


def first_good(make, bad, seed: int, tries: int):
    """make(seed) -> take; the first take `bad` passes, trying seed, seed + 1, ... Returns (take, seed, tries used);
    raises RuntimeError when every try was bad."""
    for tr in range(tries):
        a = make(seed + tr)
        if not bad(a):
            return a, seed + tr, tr + 1
    raise RuntimeError("every try was noise, hiss or clipped")
