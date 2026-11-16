"""Synthetic die-cut cards and clear sleeves on a white or dark backing, for the sleeve and silhouette tests. Ported
from Unstoppable's tools/ingest/tests/synth.py (silhouette masks, bordered faces, sleeves).

Card silhouettes: "core" (notched: a notch in the right side from 31 % to 85 % of the height, about 21 % of the width
deep), "upgrade" (tabbed: a centred tab on top and a right-side notch "high" 26-53 % or "low" 59-87 %), "plain"."""
from __future__ import annotations

import math
import random
from typing import Optional

import cv2
import numpy as np

MM = 1 / 25.4
CARD_W, CARD_H = 63.5, 88.9  # mm
TAB_MM = 6.7


def _round_corners(alpha: np.ndarray, r: int) -> None:
    """Round the four corners of a filled rectangle mask in place."""
    h, w = alpha.shape
    for cx, cy in ((r, r), (w - 1 - r, r), (r, h - 1 - r), (w - 1 - r, h - 1 - r)):
        x0, x1 = (0, r) if cx == r else (w - r, w)
        y0, y1 = (0, r) if cy == r else (h - r, h)
        block = alpha[y0:y1, x0:x1]
        yy, xx = np.mgrid[y0:y1, x0:x1]
        block[(xx - cx) ** 2 + (yy - cy) ** 2 > r * r] = 0


def silhouette_mask(shape: str, w: int, h: int, variant: str = "high") -> np.ndarray:
    """uint8 alpha (255 inside) for a face in its canonical front orientation; h includes any tab."""
    a = np.zeros((h, w), np.uint8)
    if shape == "core":
        d = 0.21 * w
        pts = [(0, 0), (w - 1, 0), (w - 1, 0.29 * h), (w - 1 - d, 0.33 * h), (w - 1 - d, 0.81 * h),
               (w - 1, 0.86 * h), (w - 1, h - 1), (0, h - 1)]
        cv2.fillPoly(a, [np.int32(np.round(pts))], 255)
        _round_corners(a, max(2, int(0.045 * w)))
    elif shape == "upgrade":
        t = int(round(h * TAB_MM / (CARD_H + TAB_MM)))
        body = np.zeros((h - t, w), np.uint8)
        body[:] = 255
        _round_corners(body, max(2, int(0.045 * w)))
        a[t:] = body
        tx0, tx1 = 0.40 * w, 0.60 * w  # trapezoid tab with slanted sides
        cv2.fillPoly(a, [np.int32(np.round([(tx0, t + 1), (tx0 + 0.03 * w, 0), (tx1 - 0.03 * w, 0), (tx1, t + 1)]))], 255)
        y0, y1 = (0.26, 0.53) if variant == "high" else (0.59, 0.87)
        d = 0.235 * w
        notch = [(w, y0 * h - 0.04 * h), (w - 1 - d, y0 * h), (w - 1 - d, y1 * h), (w, y1 * h + 0.04 * h)]
        cv2.fillPoly(a, [np.int32(np.round(notch))], 0)
    else:
        a[:] = 255
        _round_corners(a, max(2, int(0.045 * w)))
    return a


def _print_face(w: int, h: int, rng: random.Random, dark: bool, landscape: bool = False,
                alpha: Optional[np.ndarray] = None, darkest: bool = False) -> np.ndarray:
    """BGR artwork for a face (alpha applied separately).

    Dark backs carry a thin printed border that follows the die-cut (as the real grey and blue
    backs do). The "darkest" back is near-black with a border on its straight sides only, so the
    detector has to fall back to the front's position to find it.
    """
    if landscape:
        return np.ascontiguousarray(cv2.rotate(_print_face(h, w, rng, dark), cv2.ROTATE_90_CLOCKWISE))
    img = np.zeros((h, w, 3), np.uint8)
    if dark:
        lo, hi = (12, 26) if darkest else (34, 60)
        base = (rng.randint(lo, hi), rng.randint(lo - 4, hi - 6), rng.randint(lo - 8, hi - 12))
        img[:] = base
        for y in range(0, h, max(6, h // 60)):  # faint pattern lines
            cv2.line(img, (0, y), (w, y + h // 8), tuple(min(255, c + 14) for c in base), 1)
        t = max(2, w // 120)
        if darkest or alpha is None:
            cv2.rectangle(img, (2, 2), (w - 3, h - 3), (90, 80, 70), t)
        else:
            cs, _ = cv2.findContours(alpha, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            cv2.drawContours(img, cs, -1, (90, 80, 70), 2 * t)
    else:
        img[:] = (225, 228, 232)
        bw = max(6, w // 18)
        art = (rng.randint(40, 200), rng.randint(40, 200), rng.randint(40, 200))
        cv2.rectangle(img, (bw, bw), (w - bw, int(h * 0.55)), art, cv2.FILLED)
        for k in range(5):
            y = int(h * 0.62) + k * int(h * 0.06)
            txt = rng.choice(["Deal 3 damage.", "Gain 2 credits.", "Focus: train 1.", "Bargain 2: +2", "Taunt"])
            cv2.putText(img, txt, (bw + 4, y), cv2.FONT_HERSHEY_SIMPLEX, w / 520, (20, 20, 20), max(1, w // 260), cv2.LINE_AA)
    return img


def _rgba(img: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    return np.dstack([img, alpha])


def _paste(canvas: np.ndarray, face: np.ndarray, cx: float, cy: float, angle: float) -> None:
    h, w = face.shape[:2]
    diag = int(math.ceil(math.hypot(w, h))) + 4
    pad = np.zeros((diag, diag, 4), np.uint8)
    oy, ox = (diag - h) // 2, (diag - w) // 2
    pad[oy:oy + h, ox:ox + w] = face
    M = cv2.getRotationMatrix2D((diag / 2, diag / 2), angle, 1.0)
    rot = cv2.warpAffine(pad, M, (diag, diag), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    x0, y0 = int(round(cx - diag / 2)), int(round(cy - diag / 2))
    H, W = canvas.shape[:2]
    xs0, ys0 = max(0, x0), max(0, y0)
    xs1, ys1 = min(W, x0 + diag), min(H, y0 + diag)
    sub = rot[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0]
    a = sub[:, :, 3:4].astype(np.float32) / 255.0
    canvas[ys0:ys1, xs0:xs1] = (canvas[ys0:ys1, xs0:xs1] * (1 - a) + sub[:, :, :3] * a).astype(np.uint8)


def _backing(H: int, W: int, rng: np.random.Generator) -> np.ndarray:
    base = np.full((H, W, 3), 14, np.float32)
    base += rng.normal(0, 2.0, (H, W, 1)).astype(np.float32)  # sensor noise
    tex = cv2.GaussianBlur(rng.normal(0, 3.0, (H // 8, W // 8)).astype(np.float32), (0, 0), 1.0)
    base += cv2.resize(tex, (W, H))[:, :, None]  # soft cloth texture
    yy, xx = np.mgrid[0:H, 0:W]
    vign = 1.0 - 0.15 * (((xx - W / 2) / W) ** 2 + ((yy - H / 2) / H) ** 2)
    return np.clip(base * vign[:, :, None], 0, 255).astype(np.uint8)


SLEEVE_MM = (66.0, 92.0)  # the owner's sleeves, measured on the scans
SEAM_MM = 0.4  # the welded seam along one short edge
SLEEVE_TINT = (205, 214, 226)  # BGR; at 5 % opacity it moves white by 2-3 Lab units
SLEEVE_LINE = (110, 116, 126)  # edge lines and seam: ~30-40 Lab units from white, but thin


def _backing_white(H: int, W: int, rng: np.random.Generator) -> np.ndarray:
    """A white backing, about 245-252: mild sensor noise and a gentle lighting gradient."""
    xx = np.arange(W, dtype=np.float32)[None, :] / W - 0.5
    yy = np.arange(H, dtype=np.float32)[:, None] / H - 0.5
    base = (248.5 + 3.0 * xx + 2.5 * yy)[:, :, None]
    return np.clip(base + rng.normal(0, 1.0, (H, W, 3)).astype(np.float32), 0, 255).astype(np.uint8)


def strip_px(w: int) -> int:
    """Width of a face's pale strip (~5 mm), for a face w px wide."""
    return max(4, int(round(0.08 * w)))


def _bordered_face(w: int, h: int, rng: random.Random, alpha: np.ndarray, landscape: bool = False,
                   strip: bool = False) -> np.ndarray:
    """A light face framed in a dark border that follows the die-cut, as the real faces are.

    ``strip``: a pale band along the long edge at x = 0 replaces the frame there, as on the threat
    sides whose type is printed in a light-grey strip. Its profile follows the measured ones: ~208
    at the card's edge (35 Lab units from white), still ~218 halfway in, then fading to ~238
    (10 units) on its inner side; lightly mottled like the print. The frame still closes over its
    two ends, as the dark print does on the real cards.
    """
    img = _print_face(w, h, rng, False, landscape=landscape)
    cs, _ = cv2.findContours(alpha, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    bw = max(3, int(round(0.035 * w)))  # ~2 mm
    cv2.drawContours(img, cs, -1, (rng.randint(30, 70), rng.randint(25, 60), rng.randint(20, 55)), 2 * bw)
    if strip:
        sw = strip_px(w)
        mottle = cv2.GaussianBlur(np.random.default_rng(rng.randint(0, 2 ** 31)).normal(0, 1, (h, sw)), (0, 0), 2.0)
        tone = 208.0 + 30.0 * np.linspace(0.0, 1.0, sw)[None, :] ** 1.5 + 3.0 * mottle / max(float(mottle.std()), 1e-6)
        img[2 * bw:h - 2 * bw, :sw] = np.clip(tone, 0, 255).astype(np.uint8)[2 * bw:h - 2 * bw, :, None]
        for y in range(int(0.1 * h), int(0.9 * h), max(8, h // 30)):  # dark lettering inside the strip
            cv2.line(img, (sw // 2, y), (sw // 2, y + max(3, h // 60)), (60, 60, 60), max(1, sw // 6))
    return img


def sleeve(card: np.ndarray, px: float, offset_mm=(0.0, 0.0), sleeve_mm=SLEEVE_MM) -> tuple[np.ndarray, tuple]:
    """A card (RGBA, portrait) in a clear sleeve whose seam runs along the bottom short edge.

    The card's centre sits ``offset_mm`` (right, down) from the sleeve's; a vertical offset of
    "seam" puts the card against the seam. Returns (RGBA, (dx, dy) of the card's centre from the
    sleeve's centre in px).
    """
    sw, sh = int(round(sleeve_mm[0] * px)), int(round(sleeve_mm[1] * px))
    col = np.empty((sh, sw, 3), np.float32)
    col[:] = SLEEVE_TINT
    a = np.full((sh, sw), 0.05, np.float32)
    lw = max(1, int(round(0.08 * px)))  # edge lines: ~2 px at 600 dpi, 1 px at 300
    for sl in ((slice(0, lw), slice(None)), (slice(sh - lw, sh), slice(None)),
               (slice(None), slice(0, lw)), (slice(None), slice(sw - lw, sw))):
        col[sl] = SLEEVE_LINE
        a[sl] = 0.30
    sm = max(2, int(round(SEAM_MM * px)))
    col[sh - sm:] = SLEEVE_LINE
    a[sh - sm:] = 0.35
    ch, cw = card.shape[:2]
    x0 = int(round(sw / 2 + offset_mm[0] * px - cw / 2))
    y0 = sh - sm - ch if offset_mm[1] == "seam" else int(round(sh / 2 + offset_mm[1] * px - ch / 2))
    if x0 < lw or y0 < lw or x0 + cw > sw - lw or y0 + ch > sh - sm:
        raise ValueError("the card does not fit in the sleeve at that offset")
    ca = card[:, :, 3].astype(np.float32)[:, :, None] / 255.0
    film = 0.03  # the sleeve's front film tints the card a little too
    ccol = card[:, :, :3].astype(np.float32) * (1 - film) + np.float32(SLEEVE_TINT) * film
    col[y0:y0 + ch, x0:x0 + cw] = ccol * ca + col[y0:y0 + ch, x0:x0 + cw] * (1 - ca)
    a[y0:y0 + ch, x0:x0 + cw] = ca[:, :, 0] + a[y0:y0 + ch, x0:x0 + cw] * (1 - ca[:, :, 0])
    rgba = np.dstack([np.clip(col, 0, 255), a[:, :, None] * 255.0]).astype(np.uint8)
    return rgba, (x0 + (cw - 1) / 2 - (sw - 1) / 2, y0 + (ch - 1) / 2 - (sh - 1) / 2)


def _turn(d: tuple, angle: float) -> tuple:
    """Offset d turned as ``_paste`` turns a face by ``angle`` (cv2 convention)."""
    t = math.radians(angle)
    return (math.cos(t) * d[0] + math.sin(t) * d[1], -math.sin(t) * d[0] + math.cos(t) * d[1])
