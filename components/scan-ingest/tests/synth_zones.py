"""A synthetic map: noisy parchment ground, red marker squares in two rows, one blue tile, a red speck."""
from __future__ import annotations

import cv2
import numpy as np

RED = [(100, 80, 60, 60), (300, 90, 80, 50), (520, 70, 50, 70), (140, 300, 70, 70), (420, 310, 90, 60)]
BLUE = (600, 300, 40, 40)


def map_scan(seed: int = 1) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = np.clip(np.full((420, 700, 3), (190, 215, 230), np.float32) + rng.normal(0, 4, (420, 700, 3)), 0, 255).astype(np.uint8)
    for x, y, w, h in RED:
        cv2.rectangle(img, (x, y), (x + w - 1, y + h - 1), (30, 30, 220), cv2.FILLED)
    x, y, w, h = BLUE
    cv2.rectangle(img, (x, y), (x + w - 1, y + h - 1), (200, 90, 20), cv2.FILLED)
    cv2.circle(img, (650, 30), 2, (30, 30, 220), cv2.FILLED)
    return img
