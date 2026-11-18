"""Scanner tone curves: one fixed per-channel curve applied to every crop of a scan (README, *Magenta backing*).

A scan made with the scanner's own colour correction off comes out flat (grey blacks, grey whites) but loses nothing;
one fixed curve, the same for every item, then gives the look of a corrected scan. The curves live in
`tones/<name>.json` as three 256-entry lists (r, g, b); the manifest records the one used as ``"tone"``.
Ported from unstoppable-fan-prototype `tools/ingest/ufp_ingest/tone.py`.
"""
from __future__ import annotations

import functools
import json
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

TONES_DIR = Path(__file__).resolve().parent / "tones"
DEFAULT_KEYED_TONE = "canon-tr4700-none"   # the owner's Canon TR4700, ScanGear Color Settings: None (2026-10-14)


def names() -> list[str]:
    return sorted(p.stem for p in TONES_DIR.glob("*.json"))


def resolve(name: Optional[str], keyed: bool) -> Optional[str]:
    """The curve for a scan: "auto" is the default curve on a keyed scan and none otherwise; "none" is none."""
    if name in (None, "none"):
        return None
    if name == "auto":
        return DEFAULT_KEYED_TONE if keyed else None
    if name not in names():
        raise SystemExit(f"Unknown tone curve {name!r}. Known: {', '.join(names())}, auto, none")
    return name


@functools.lru_cache(maxsize=None)
def lut(name: str) -> np.ndarray:
    """The curve as a 256 x 1 x 3 BGR lookup table for `cv2.LUT`."""
    with open(TONES_DIR / f"{name}.json", encoding="utf-8") as f:
        d = json.load(f)
    return np.stack([np.asarray(d[c], np.uint8) for c in ("b", "g", "r")], axis=1).reshape(256, 1, 3)


def apply(img: np.ndarray, name: Optional[str]) -> np.ndarray:
    """A BGR or BGRA image with the named curve applied to its colour (alpha untouched); unchanged when ``name`` is None."""
    if not name:
        return img
    colour = cv2.LUT(np.ascontiguousarray(img[:, :, :3]), lut(name))
    return np.dstack([colour, img[:, :, 3]]) if img.shape[2] == 4 else colour


# ---- fitting a scanner's profile (K373): Unstoppable fitted its curve on cards scanned both ways (flat and corrected) ----

def profile(img: np.ndarray) -> dict:
    """A scan's tone profile: per channel (r, g, b) its black point, median and white point (1st, 50th, 99th percentiles)."""
    out = {}
    for c, name in zip((2, 1, 0), "rgb"):
        lo, mid, hi = np.percentile(img[:, :, c], (1, 50, 99))
        out[name] = {"black": float(lo), "median": float(mid), "white": float(hi)}
    return out


def fit(flat: list, reference: list, name: str, about: str = "") -> dict:
    """A per-channel curve that maps flat scans to the look of the same items scanned with correction (pairs of aligned BGR
    images of one size each): for each input level the mean reference value, the levels never seen interpolated, made
    non-decreasing. In the form of ``tones/<name>.json``."""
    curve = {"name": name, "about": about}
    for c, key in zip((2, 1, 0), "rgb"):
        x = np.concatenate([f[:, :, c].ravel() for f in flat]).astype(np.int64)
        y = np.concatenate([r[:, :, c].ravel() for r in reference]).astype(np.float64)
        n = np.bincount(x, minlength=256)
        s = np.bincount(x, weights=y, minlength=256)
        seen = n > 0
        levels = np.arange(256)
        v = np.interp(levels, levels[seen], s[seen] / n[seen])
        curve[key] = [int(round(t)) for t in np.clip(np.maximum.accumulate(v), 0, 255)]
    return curve


def save(curve: dict, path: Path) -> None:
    Path(path).write_text(json.dumps(curve), encoding="utf-8")


def apply_curve(img: np.ndarray, curve: dict) -> np.ndarray:
    """Like ``apply`` with a curve given as a dict (``fit``'s result or a game's own file)."""
    table = np.stack([np.asarray(curve[c], np.uint8) for c in ("b", "g", "r")], axis=1).reshape(256, 1, 3)
    colour = cv2.LUT(np.ascontiguousarray(img[:, :, :3]), table)
    return np.dstack([colour, img[:, :, 3]]) if img.shape[2] == 4 else colour


def delta_e(a: np.ndarray, b: np.ndarray) -> float:
    """Mean CIE76 colour difference of two BGR images of one size."""
    la = cv2.cvtColor(np.ascontiguousarray(a[:, :, :3]), cv2.COLOR_BGR2LAB).astype(np.float64)
    lb = cv2.cvtColor(np.ascontiguousarray(b[:, :, :3]), cv2.COLOR_BGR2LAB).astype(np.float64)
    scale = np.array([100 / 255, 1, 1])
    return float(np.sqrt((((la - lb) * scale) ** 2).sum(2)).mean())
