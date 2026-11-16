"""Which way up an item lies, read from its print: the game-independent part of Imperium's orient.py and suggest.py.

A plain rectangle's outline says nothing about which way up it lies. ``detect.rectify`` always cuts a portrait crop
(long side down), so an item that is portrait when upright reads at 0 or 180, a landscape one at 90 or 270
(``ROTATIONS``). ``osd_rotation`` asks Tesseract's orientation detection for the turn of a whole face;
``page_flip`` gives the other face's turn when an item is flipped in place like a page between two scans. A game's
plug-in calls these from its ``orient`` hook; what a game reads besides (its printed codes, its back designs) stays
in the game.

Every reading has a confidence (``LEVELS``). Tesseract is optional: without it ``osd_rotation`` returns None with one
warning (``tess.py``).
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from . import tess

ROTATIONS = {"portrait": (0, 180), "landscape": (90, 270)}
OSD_MIN_CONF = 1.0        # Tesseract's orientation confidence below which OSD is ignored
LEVELS = ("none", "low", "medium", "high")


def page_flip(rotate: Optional[int], shape: str) -> Optional[int]:
    """The other face's turn after flipping the item in place like a page (left over right)."""
    if rotate is None:
        return None
    return rotate % 360 if shape == "portrait" else (rotate + 180) % 360


def _downgrade(level: str) -> str:
    return LEVELS[max(1, LEVELS.index(level) - 1)] if level != "none" else "none"


def osd_rotation(img_bgr, timeout: float = 30.0) -> Optional[tuple[int, float]]:
    """Clockwise rotation (0/90/180/270) that makes the face's text upright, with Tesseract's confidence.

    Returns None when Tesseract is unavailable or finds too little text.
    """
    import tempfile

    import cv2

    h, w = img_bgr.shape[:2]
    s = min(1.0, 1800 / max(h, w))
    small = cv2.resize(img_bgr, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA) if s < 1 else img_bgr
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "osd.png"
        cv2.imwrite(str(p), gray)
        out = tess.run([str(p), "stdout", "--psm", "0"], timeout=timeout)
    if out is None:
        return None
    txt = (out.stdout or "") + (out.stderr or "")
    m_rot = re.search(r"Rotate:\s*(\d+)", txt)
    m_conf = re.search(r"Orientation confidence:\s*([\d.]+)", txt)
    if not m_rot:
        return None
    return int(m_rot.group(1)) % 360, float(m_conf.group(1)) if m_conf else 0.0
