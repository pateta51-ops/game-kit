"""Playmats and boards: their printed spaces as normalised boxes, found on the image or listed by the game.

The spaces file's checks, the shape check against the image the spaces
were measured on, the image lookup; printed spots found as enclosed
background regions of the ink, grouped in rows, a numbered zigzag track fitted by a line. Sources in component.json. No game's spaces, files or
colours: the game passes them.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from scipy import ndimage as nd

EXTENSIONS = (".webp", ".png", ".jpg", ".jpeg")
ASPECT_TOLERANCE = 0.02   # a 2 % change of shape moves a space by a visible amount


def check(mats: list[dict]) -> list[str]:
    """Problems with a list of mats, each ``{"id", "aspect", "spaces": {name: {x, y, w, h}}}``: an id listed twice, a space
    that runs off the image or is not a box."""
    errors, seen = [], set()
    for m in mats:
        if m["id"] in seen:
            errors.append(f"{m['id']} is listed twice")
        seen.add(m["id"])
        for name, b in m.get("spaces", {}).items():
            if not all(isinstance(b.get(k), (int, float)) for k in "xywh") or b["w"] <= 0 or b["h"] <= 0:
                errors.append(f"{m['id']} space {name} is not a box")
            elif b["x"] < 0 or b["y"] < 0 or b["x"] + b["w"] > 1.0001 or b["y"] + b["h"] > 1.0001:
                errors.append(f"{m['id']} space {name} runs off the image")
    return errors


def shape_problem(mat: dict, w: int, h: int) -> Optional[str]:
    """A line when an image of w x h is a different shape from the one the mat's spaces were measured on, else None."""
    if abs((w / h) / mat["aspect"] - 1) > ASPECT_TOLERANCE:
        return (f"{mat['id']}: the image is {w} x {h}, a different shape from the image its spaces were measured on "
                f"(width/height {mat['aspect']}); the spaces would be misplaced")
    return None


def find_image(folder: Path, name: str) -> Optional[Path]:
    """``name`` with any of EXTENSIONS in ``folder``, whatever the case of its extension, or None."""
    folder = Path(folder)
    if not folder.is_dir():
        return None
    wanted = {name.lower() + ext for ext in EXTENSIONS}
    return next((p for p in sorted(folder.iterdir()) if p.is_file() and p.name.lower() in wanted), None)


def ink_by_ground(rgb: np.ndarray, tol: int = 90, corner: int = 10) -> np.ndarray:
    """Ink: pixels further than ``tol`` (sum of channel differences) from the ground colour sampled near the top left."""
    a = rgb.astype(int)
    ground = a[corner // 2:corner + corner // 2, corner // 2:corner + corner // 2].reshape(-1, 3).mean(0)
    return np.abs(a - ground).sum(2) > tol


def detect_boxes(ink: np.ndarray, size: tuple[float, float], ratio: tuple[float, float] = (0.7, 1.4),
                 fill: float = 0.5, close: int = 2, bars: Optional[tuple[float, float]] = None,
                 edge: bool = False) -> list[dict]:
    """The printed spaces of a mat: regions of ground enclosed by ink (the ink closed ``close`` times first, so a broken
    outline still encloses), ``size`` (lo, hi) of the image's width wide, width over height in ``ratio``, and filling at
    least ``fill`` of their bounding box. Each as normalised ``{x, y, w, h, cx, cy}``, top to bottom then left to right.
    ``edge``: the image border counts as ink, so a space running off the edge encloses. ``bars`` (gap, thick), fractions
    of the width, is spaces from bars (LCARS-style panels): the ink closed over gaps up to ``gap`` (label letters, bar
    segments), then opened to keep only parts at least ``thick`` thick (bars, not stars or grid lines); art left inside
    a panel is filled over. ``close`` is ignored then."""
    H, W = ink.shape
    if bars:
        k = lambda f: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (max(1, round(f * W)) | 1,) * 2)
        m = cv2.morphologyEx(ink.astype(np.uint8), cv2.MORPH_CLOSE, k(bars[0]))
        solid = cv2.morphologyEx(m, cv2.MORPH_OPEN, k(bars[1])) > 0
        if edge:
            solid[[0, -1], :] = solid[:, [0, -1]] = True
    else:
        p = close if edge else 0
        solid = nd.binary_closing(np.pad(ink, p, constant_values=True), iterations=close)[p:p + H, p:p + W] if close \
            else ink.copy()
        if edge and not close:
            solid[[0, -1], :] = solid[:, [0, -1]] = True
    lab, _ = nd.label(~solid)
    out = []
    for i, sl in enumerate(nd.find_objects(lab), 1):
        if sl is None:
            continue
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        area = (nd.binary_fill_holes(lab[sl] == i) if bars else lab[sl] == i).sum()
        if size[0] * W < w < size[1] * W and ratio[0] < w / h < ratio[1] and area > fill * w * h:
            out.append({"x": sl[1].start / W, "y": sl[0].start / H, "w": w / W, "h": h / H,
                        "cx": (sl[1].start + sl[1].stop) / 2 / W, "cy": (sl[0].start + sl[0].stop) / 2 / H})
    return sorted(out, key=lambda b: (b["cy"], b["cx"]))


def rows(boxes: list[dict], tol: float = 0.02) -> list[list[dict]]:
    """Boxes grouped in rows (centres within ``tol`` of the image's height), each row left to right."""
    out: list[list[dict]] = []
    for b in sorted(boxes, key=lambda b: b["cy"]):
        if out and abs(out[-1][0]["cy"] - b["cy"]) < tol:
            out[-1].append(b)
        else:
            out.append([b])
    return [sorted(r, key=lambda b: b["cx"]) for r in out]


def fit_track(points: list[tuple[float, float]], numbers: list[int], n: int, zigzag: bool = True) -> list[list[float]]:
    """Every spot 1..n of a numbered track from the spots found (``points`` with their ``numbers``; the ends are often hidden
    by art): x by a line fitted on the numbers, y the median of the found ones (with ``zigzag`` the odd and even spots
    each their own median, as a track printed in a zigzag). Normalised [x, y] per spot."""
    xs = np.array([p[0] for p in points])
    ys = np.array([p[1] for p in points])
    k = np.array(numbers)
    slope, icept = np.polyfit(k, xs, 1)
    if zigzag:
        odd, even = float(np.median(ys[k % 2 == 1])), float(np.median(ys[k % 2 == 0]))
    else:
        odd = even = float(np.median(ys))
    return [[round(float(icept + slope * i), 4), round(even if i % 2 == 0 else odd, 4)] for i in range(1, n + 1)]
