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
