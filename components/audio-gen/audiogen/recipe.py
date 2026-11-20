"""The YuE2 instrumental recipe's pure parts (7th Inning Stretch round6i): the ABC "Vocal" voice turned to rests, and
the demucs vocal gate (vocal/mix <= -25 dB over the take, at most 3 % of 0.5 s windows with the vocal above -14 dB)."""
from __future__ import annotations

import math
import re
import sys

MAX_VOCAL_DB = -25.0
MAX_LOUD_WINDOWS = 0.03
LOUD_WINDOW_DB = -14.0


_CH = re.compile(r'"[^"]*"')
_NOTE = re.compile(r"[A-Ga-g]")
_FANCY = re.compile(r"\|:|:\||\|\]|\[\||\|\||\[[A-Za-z]:")  # repeats, double and final bars, inline fields


def _voice(ln: str):
    t = ln[2:].split()
    return t[0] if t else None


def novocal(abc: str, vocal: str = "rests", ins: str = "Ins") -> tuple[str, int]:
    """The "Vocal" voice is silenced bar by bar (whole-bar rests, chord symbols kept: the native format keeps harmony in
    Vocal). Returns the score and the number of Vocal bars that had notes.
    vocal="rests": the notes are dropped. This is what the YuE yue2-music skill does (release yue2-v0.1.6,
    skills/yue2-music/references/abc-editing.md): "If the cover should preserve only one part ... `--keep-voice Ins` ...
    The unselected voice is replaced with rests on the same time grid".
    vocal="move" (option; the skill itself never moves notes):
    first each Vocal bar with notes (chords dropped) is put in the same bar index of the voice named `ins` (else the
    first other voice), but only where that bar has no notes of its own: an instrumental bar with notes is kept as it
    is (a voice is monophonic), vocal bars past the end of the instrumental voice are appended, and a tie that would
    dangle is dropped. A score with repeats, double or final bar lines or inline fields (`[K:..]`) is only silenced."""
    lines = abc.split(chr(10))
    music = lambda ln: "|" in ln and not ln.startswith(("%", "w:"))  # noqa: E731
    names, cur = [], None
    for ln in lines:
        if ln.startswith("V:"):
            cur = _voice(ln)
            if cur != "Vocal" and cur not in names:
                names.append(cur)
    tgt = ins if ins in names else (names[0] if names else None)
    vb, ib, il, cur = [], [], [], None  # Vocal bars; target bars; target line -> bar count
    for ln in lines:
        if ln.startswith("V:"):
            cur = _voice(ln)
        elif music(ln) and cur == "Vocal":
            vb += [b.strip() for b in ln.split("|") if b.strip()]
        elif music(ln) and cur == tgt and tgt:
            bs = [b.strip() for b in ln.split("|") if b.strip()]
            ib += bs
            il.append(len(bs))
    fancy = any(_FANCY.search(ln) for ln in lines if music(ln))
    new = None
    if vocal == "move" and il and not fancy:
        new = list(ib) + ["z16"] * max(0, len(vb) - len(ib))
        mv = [False] * len(new)
        for i, v in enumerate(vb):
            if _NOTE.search(_CH.sub("", v)) and not _NOTE.search(_CH.sub("", ib[i] if i < len(ib) else "")):
                new[i], mv[i] = _CH.sub("", v).strip(), True
        for i, x in enumerate(new):  # no tie into or out of a bar that was swapped
            if x.endswith("-") and (i + 1 >= len(new) or mv[i] != mv[i + 1]):
                new[i] = x[:-1].rstrip()
        il[-1] += len(new) - len(ib)
    out, cur, k, n = [], None, 0, 0
    for ln in lines:
        if ln.startswith("V:"):
            cur = _voice(ln)
            out.append(ln)
        elif music(ln) and cur == "Vocal":
            nb = []
            for b in [b for b in ln.split("|") if b.strip()]:
                if _NOTE.search(_CH.sub("", b)):
                    n += 1
                nb.append("".join(_CH.findall(b)) + "z16")
            out.append("|".join(nb) + "|")
        elif new is not None and music(ln) and cur == tgt:
            c = il.pop(0)
            out.append("|".join(new[k:k + c]) + "|")
            k += c
        else:
            out.append(ln)
    return chr(10).join(out), n


YUE2_DOC_GIB = 24  # YuE2 docs (README, docs/generation.md): "a BF16-capable NVIDIA GPU with 24 GB VRAM, one request at a time"


def offload_ar(opt, total_gib: float) -> bool:
    """YuE2 only (owner, 19 Nov 2026: the one exception to GPU only): the package's `offload_ar` option moves the AR
    weights to host memory between stages. opt true/false, or "auto" (default): on when the card has under 24 GB."""
    return total_gib < YUE2_DOC_GIB if opt in (None, "auto") else bool(opt)


class LowMemory(RuntimeError):
    """MemAvailable is under what the next YuE2 step needs (K474): the take fails instead of risking the WSL VM."""


def mem_available_gib(path: str = "/proc/meminfo") -> float | None:
    """MemAvailable in GiB, or None when it cannot be read (not Linux)."""
    try:
        for ln in open(path, encoding="ascii"):
            if ln.startswith("MemAvailable:"):
                return int(ln.split()[1]) / 2**20
    except (OSError, ValueError, IndexError):
        pass
    return None


def oom_kills(root: str = "/sys/fs/cgroup", cgroup_file: str = "/proc/self/cgroup") -> int:
    """oom_kill count of this process's cgroup (memory.events), 0 when unreadable."""
    try:
        cg = next(ln.strip()[3:] for ln in open(cgroup_file, encoding="ascii") if ln.startswith("0::"))
        for ln in open(f"{root}{cg}/memory.events", encoding="ascii"):
            if ln.startswith("oom_kill "):
                return int(ln.split()[1])
    except (OSError, ValueError, StopIteration):
        pass
    return 0


def need_memory(need_gib: float, what: str, avail: float | None = None) -> None:
    """Raise LowMemory when MemAvailable is under need_gib before `what`."""
    a = mem_available_gib() if avail is None else avail
    if a is not None and a < need_gib:
        raise LowMemory(f"only {a:.1f} GiB of host memory available, {what} needs {need_gib:g} GiB (option minAvailGiB): not started, so the WSL VM is not put at risk")


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


SA3_GATE = {"flatness": 0.4, "high": 0.2, "peak": 0.999}


def sa3_fail(flatness: float, high: float, peak: float, gate: dict | bool | None = None) -> str:
    """K475: the first test a take fails ("high 0.310 > 0.2"), or "" when it passes. gate False skips the gate; a dict
    overrides the limits of SA3_GATE (a cue's options.gate, e.g. {"high": 0.5} for metallic clinks)."""
    if gate is False:
        return ""
    g = {**SA3_GATE, **(gate if isinstance(gate, dict) else {})}
    if flatness > g["flatness"]:
        return f"flatness {flatness:.3f} > {g['flatness']}"
    if high > g["high"]:
        return f"high {high:.3f} > {g['high']}"
    if peak >= g["peak"]:
        return f"peak {peak:.3f} >= {g['peak']}"
    return ""


def sa3_bad(flatness: float, high: float, peak: float, gate: dict | bool | None = None) -> bool:
    """7th Inning Stretch round 8: a Stable Audio 3 take is noise (spectral flatness > 0.4), hiss (over 20 % of its
    energy above 8 kHz) or clipped (peak 1.0)."""
    return bool(sa3_fail(flatness, high, peak, gate))


def first_good(make, bad, seed: int, tries: int):
    """make(seed) -> take; the first take `bad` passes, trying seed, seed + 1, ... Returns (take, seed, tries used);
    raises RuntimeError when every try was bad."""
    why = []
    for tr in range(tries):
        a = make(seed + tr)
        r = bad(a)
        if not r:
            return a, seed + tr, tr + 1
        why.append(f"seed {seed + tr}: {r if isinstance(r, str) else 'bad'}")
        print(f"take rejected, {why[-1]}", file=sys.stderr, flush=True)
    raise RuntimeError("every try was noise, hiss or clipped (" + "; ".join(why) + ")")
