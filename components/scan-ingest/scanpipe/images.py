"""Image I/O helpers."""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = 400_000_000  # large 600-dpi scans are expected


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_dpi(path: Path) -> Optional[tuple[float, float]]:
    try:
        with Image.open(path) as im:
            dpi = im.info.get("dpi")
            if dpi and dpi[0] and dpi[1] and dpi[0] > 1:
                return float(dpi[0]), float(dpi[1])
    except Exception:
        return None
    return None


def load_bgr(path: Path) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        # Fall back to Pillow (handles more formats, e.g. some TIFF/HEIC builds).
        with Image.open(path) as im:
            img = cv2.cvtColor(np.array(im.convert("RGB")), cv2.COLOR_RGB2BGR)
    return img


def save_jpeg(img_bgr: np.ndarray, path: Path, quality: int = 92, dpi: Optional[float] = None) -> None:
    """Write a JPEG (via Pillow, so the resolution is recorded when it is known)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    im = Image.fromarray(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
    kw = {"quality": quality, "optimize": True}
    if dpi:
        kw["dpi"] = (dpi, dpi)
    im.save(path, "JPEG", **kw)


def save_png(img: np.ndarray, path: Path, dpi: Optional[float] = None) -> None:
    """Write a PNG, keeping an alpha channel (BGRA) when there is one, with the resolution when it is known."""
    path.parent.mkdir(parents=True, exist_ok=True)
    conv = cv2.COLOR_BGRA2RGBA if img.shape[2] == 4 else cv2.COLOR_BGR2RGB
    im = Image.fromarray(cv2.cvtColor(img, conv))
    kw = {"optimize": True}
    if dpi:
        kw["dpi"] = (dpi, dpi)
    im.save(path, "PNG", **kw)


def flatten(img: np.ndarray, grey: int = 128) -> np.ndarray:
    """A BGRA crop over neutral grey as BGR (BGR is returned as is), so the backing left under transparent pixels
    never counts as print."""
    if img.shape[2] != 4:
        return img
    a = img[:, :, 3:4].astype(np.float32) / 255.0
    return (img[:, :, :3].astype(np.float32) * a + grey * (1.0 - a) + 0.5).astype(np.uint8)


def descreen(img: np.ndarray, sigma_px: float) -> np.ndarray:
    """Suppress the print's halftone dot screen (a light Gaussian sized to the dots) before the crop is downscaled and
    encoded; a BGRA crop is blurred premultiplied, so its transparent margin never bleeds into the edge. Ported from
    Imperium's imp_ingest/images.py."""
    if sigma_px <= 0:
        return img
    if img.shape[2] == 4:
        a = img[:, :, 3:4].astype(np.float32) / 255.0
        num = cv2.GaussianBlur(img[:, :, :3].astype(np.float32) * a, (0, 0), sigma_px)
        den = cv2.GaussianBlur(a, (0, 0), sigma_px)[..., None]
        colour = np.where(den > 1e-3, num / np.maximum(den, 1e-3), img[:, :, :3].astype(np.float32))
        return np.dstack([np.clip(colour + 0.5, 0, 255).astype(np.uint8), img[:, :, 3]])
    return cv2.GaussianBlur(img, (0, 0), sigma_px)


def resize_to_dpi(img_bgr: np.ndarray, src_dpi: float, dst_dpi: Optional[float]) -> np.ndarray:
    """Downscale a crop (BGR or BGRA) from the scan's resolution to ``dst_dpi`` (never upscales)."""
    if not dst_dpi or dst_dpi >= src_dpi:
        return img_bgr
    s = dst_dpi / src_dpi
    h, w = img_bgr.shape[:2]
    return cv2.resize(img_bgr, (max(1, round(w * s)), max(1, round(h * s))), interpolation=cv2.INTER_AREA)
