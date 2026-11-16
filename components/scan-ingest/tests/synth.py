"""Synthetic black-backed scans: original shapes only, no real component art."""
from __future__ import annotations

import cv2
import numpy as np

MM = 1 / 25.4


def black_paper(H: int, W: int, rng: np.random.Generator) -> np.ndarray:
    """Black paper under a closed lid: near-black, sensor noise, soft mottling and a few lint specks."""
    base = np.full((H, W, 3), 4.0, np.float32)
    base += rng.normal(0, 1.0, (H, W, 1)).astype(np.float32)
    mott = cv2.GaussianBlur(rng.normal(0, 2.0, (H // 16, W // 16)).astype(np.float32), (0, 0), 1.5)
    base += np.abs(cv2.resize(mott, (W, H)))[:, :, None]
    for _ in range(25):  # lint and dust
        x, y = int(rng.integers(0, W)), int(rng.integers(0, H))
        cv2.circle(base, (x, y), int(rng.integers(1, 4)), (40, 40, 40), cv2.FILLED)
    return np.clip(base, 0, 255).astype(np.uint8)


def dark_tile(w: int, h: int, pink_right: bool = True) -> np.ndarray:
    """A landscape tile whose black print runs to its edges on three sides (as on a base tile), with coloured
    rooms inside, a grey panel down each short side and pink squares in the right panel."""
    t = np.full((h, w, 3), 11, np.uint8)  # black print: a few units above black paper
    pw = int(0.12 * w)
    cv2.rectangle(t, (0, int(0.1 * h)), (pw, h - 1), (60, 70, 70), cv2.FILLED)
    cv2.rectangle(t, (w - pw, 0), (w - 1, int(0.9 * h)), (60, 70, 70), cv2.FILLED)
    colours = [(40, 200, 240), (60, 220, 90), (30, 120, 240), (230, 200, 120)]
    for r in range(3):
        for c in range(4):
            x0 = int(pw + 0.03 * w + c * 0.18 * w)
            y0 = int(0.08 * h + r * 0.3 * h)
            cv2.rectangle(t, (x0, y0), (x0 + int(0.15 * w), y0 + int(0.22 * h)), colours[(r + c) % 4], cv2.FILLED)
    for k in range(3):
        y0 = int(0.3 * h + k * 0.2 * h)
        x0 = w - pw + int(0.02 * w)
        cv2.rectangle(t, (x0, y0), (x0 + int(0.07 * w), y0 + int(0.12 * h)), (140, 40, 230), cv2.FILLED)
    return t if pink_right else cv2.rotate(t, cv2.ROTATE_180)


def paste(canvas: np.ndarray, face: np.ndarray, cx: float, cy: float, angle: float) -> None:
    """Composite a face at a centre and tilt (degrees, counter-clockwise as displayed)."""
    h, w = face.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    M[:, 2] += (cx - w / 2, cy - h / 2)
    H, W = canvas.shape[:2]
    rgba = np.dstack([face, np.full((h, w), 255, np.uint8)])
    rot = cv2.warpAffine(rgba, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    a = rot[:, :, 3:4].astype(np.float32) / 255.0
    canvas[:] = np.clip(canvas.astype(np.float32) * (1 - a) + rot[:, :, :3] * a, 0, 255).astype(np.uint8)


def sheet(dpi: int = 200, angle: float = 1.5, pink_right: bool = True, seed: int = 1,
          size_mm: tuple = (163.0, 88.5)) -> tuple[np.ndarray, tuple]:
    """One tile on black paper (a 216 x 150 mm bed). Returns (scan, (w_px, h_px))."""
    rng = np.random.default_rng(seed)
    W, H = int(216 * MM * dpi), int(150 * MM * dpi)
    img = black_paper(H, W, rng)
    w, h = int(size_mm[0] * MM * dpi), int(size_mm[1] * MM * dpi)
    paste(img, dark_tile(w, h, pink_right), W / 2, H / 2, angle)
    return img, (w, h)


MAGENTA_BGR = (101, 68, 216)  # a magenta sheet as scanned (RGB 216, 68, 101)
RIM_BGR = (80, 40, 150)       # the backing reflected off an item's cut side: darker magenta


def rounded_alpha(w: int, h: int, r: int) -> np.ndarray:
    a = np.zeros((h, w), np.uint8)
    cv2.rectangle(a, (r, 0), (w - 1 - r, h - 1), 255, cv2.FILLED)
    cv2.rectangle(a, (0, r), (w - 1, h - 1 - r), 255, cv2.FILLED)
    for x, y in ((r, r), (w - 1 - r, r), (r, h - 1 - r), (w - 1 - r, h - 1 - r)):
        cv2.circle(a, (x, y), r, 255, cv2.FILLED)
    return a


def magenta_sheet(items: list, dpi: int = 200, seed: int = 4, rim_px: int = 2,
                  bed_mm: tuple = (216.0, 150.0)) -> np.ndarray:
    """Items (BGRA faces, centre x/y as fractions of the bed, tilt in degrees) on a magenta sheet lit a little unevenly,
    each with a rim of darker magenta just outside its edge."""
    rng = np.random.default_rng(seed)
    W, H = int(bed_mm[0] * MM * dpi), int(bed_mm[1] * MM * dpi)
    xx = np.arange(W, dtype=np.float32)[None, :]
    canvas = np.empty((H, W, 3), np.float32)
    canvas[:] = MAGENTA_BGR
    canvas *= (1.0 - 0.05 * xx / W)[:, :, None]
    canvas += rng.normal(0, 1.5, (H, W, 1))
    canvas = np.clip(canvas, 0, 255).astype(np.uint8)
    for face, fx, fy, angle in items:
        h, w = face.shape[:2]
        M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
        M[:, 2] += (fx * W - w / 2, fy * H - h / 2)
        rot = cv2.warpAffine(face, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
        a = rot[:, :, 3]
        rim = cv2.dilate(a, np.ones((2 * rim_px + 1, 2 * rim_px + 1), np.uint8)) > 0
        canvas[rim & (a == 0)] = RIM_BGR
        af = a[:, :, None].astype(np.float32) / 255.0
        canvas[:] = np.clip(canvas * (1 - af) + rot[:, :, :3] * af, 0, 255).astype(np.uint8)
    return canvas
