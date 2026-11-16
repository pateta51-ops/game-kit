"""Review sheet: the detection overlay (for Claude and the owner)."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import cv2
import numpy as np



def _fit(img: np.ndarray, max_w: int, max_h: int) -> np.ndarray:
    """Scale to fit the cell; small crops (photos, tokens) are enlarged up to 2x so they stay legible."""
    h, w = img.shape[:2]
    s = min(max_w / w, max_h / h, 2.0)
    interp = cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC
    return cv2.resize(img, (max(1, int(w * s)), max(1, int(h * s))), interpolation=interp)


def overlay(scan: np.ndarray, regions: list, labels: list[str], out: Path, max_px: int = 1800,
            rejected: Optional[list] = None, notes: Optional[list] = None) -> None:
    """Scan downscaled with each detected outline, its slot label, and an optional note
    (the code and orientation reading) under the label.

    Rejected blobs (not used as items) are drawn in red with a "?" so nothing disappears silently.
    """
    h, w = scan.shape[:2]
    s = min(1.0, max_px / max(h, w))
    small = cv2.resize(scan, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    for rj in rejected or []:
        pts = (np.array(rj["corners"]) * s).astype(np.int32)
        cv2.polylines(small, [pts], True, (40, 40, 255), 3, cv2.LINE_AA)
        cv2.putText(small, "?", (int(rj["cx"] * s) - 10, int(rj["cy"] * s) + 12), cv2.FONT_HERSHEY_SIMPLEX,
                    max(1.0, small.shape[1] / 1000), (40, 40, 255), 4, cv2.LINE_AA)
    for r, label in zip(regions, labels):
        if r is None:
            continue
        pts = (np.array(r.corners) * s).astype(np.int32)
        color = (0, 200, 255) if r.source != "prior" else (0, 0, 255)
        cv2.polylines(small, [pts], True, color, 3, cv2.LINE_AA)
        cx, cy = int(r.cx * s), int(r.cy * s)
        scale = max(0.8, small.shape[1] / 1400)
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, scale, 3)
        cv2.rectangle(small, (cx - tw // 2 - 6, cy - th - 8), (cx + tw // 2 + 6, cy + 8), (0, 0, 0), cv2.FILLED)
        cv2.putText(small, label, (cx - tw // 2, cy), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), 3, cv2.LINE_AA)
        note = notes[labels.index(label)] if notes and label in labels else ""
        if note:
            ns = scale * 0.55
            (nw, nh), _ = cv2.getTextSize(note, cv2.FONT_HERSHEY_SIMPLEX, ns, 2)
            ny = cy + 14 + nh
            cv2.rectangle(small, (cx - nw // 2 - 4, ny - nh - 4), (cx + nw // 2 + 4, ny + 6), (0, 0, 0), cv2.FILLED)
            cv2.putText(small, note, (cx - nw // 2, ny), cv2.FONT_HERSHEY_SIMPLEX, ns, (120, 230, 255), 2, cv2.LINE_AA)
    out.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out), small, [cv2.IMWRITE_JPEG_QUALITY, 88])
