"""A synthetic map: noisy parchment ground, red marker squares in two rows, one blue tile, a red speck."""
from __future__ import annotations

import cv2
import numpy as np

RED = [(100, 80, 60, 60), (300, 90, 80, 50), (520, 70, 50, 70), (140, 300, 70, 70), (420, 310, 90, 60)]
BLUE = (600, 300, 40, 40)


def ground(H: int = 420, W: int = 700, seed: int = 1) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return np.clip(np.full((H, W, 3), (190, 215, 230), np.float32) + rng.normal(0, 4, (H, W, 3)), 0, 255).astype(np.uint8)


def boxes(img: np.ndarray, rects, bgr=(30, 30, 220)) -> np.ndarray:
    for x, y, w, h in rects:
        cv2.rectangle(img, (x, y), (x + w - 1, y + h - 1), bgr, cv2.FILLED)
    return img


def map_scan(seed: int = 1) -> np.ndarray:
    img = boxes(boxes(ground(seed=seed), RED), [BLUE], (200, 90, 20))
    cv2.circle(img, (650, 30), 2, (30, 30, 220), cv2.FILLED)
    return img
