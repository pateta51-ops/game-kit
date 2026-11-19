"""The YuE2 instrumental recipe's pure parts (7th Inning Stretch round6i): the ABC "Vocal" voice turned to rests, and
the demucs vocal gate (vocal/mix <= -25 dB over the take, at most 3 % of 0.5 s windows with the vocal above -14 dB)."""
from __future__ import annotations

import math
import re

MAX_VOCAL_DB = -25.0
MAX_LOUD_WINDOWS = 0.03
LOUD_WINDOW_DB = -14.0


def novocal(abc: str) -> tuple[str, int]:
    """Every bar of the Vocal voice becomes a whole-bar rest (chord symbols kept). Returns the score and the number
    of bars that had notes."""
    out, inv, n = [], False, 0
    for ln in abc.split("\n"):
        if ln.startswith("V:"):
            inv = ln.startswith(("V: Vocal", "V:Vocal"))
            out.append(ln)
            continue
        if inv and "|" in ln and not ln.startswith(("%", "w:")):
            nb = []
            for b in [b for b in ln.split("|") if b.strip()]:
                ch = "".join(re.findall(r'"[^"]*"', b))
                if re.search(r"[A-Ga-g]", re.sub(r'"[^"]*"', "", b)):
                    n += 1
                nb.append(ch + "z16")
            out.append("|".join(nb) + "|")
        else:
            out.append(ln)
    return "\n".join(out), n


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
