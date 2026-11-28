"""Synthetic card faces for the identify tests: random shapes, lines and text on a mottled ground (seeded)."""
import cv2
import numpy as np


def face(seed: int, w: int = 300, h: int = 420) -> np.ndarray:
    rng = np.random.default_rng(seed)
    img = cv2.resize(rng.integers(120, 240, (14, 10, 3)).astype(np.uint8), (w, h), interpolation=cv2.INTER_CUBIC)
    for _ in range(60):
        c = tuple(int(v) for v in rng.integers(0, 200, 3))
        x, y = int(rng.integers(0, w)), int(rng.integers(0, h))
        k = rng.integers(0, 4)
        if k == 0:
            cv2.rectangle(img, (x, y), (x + int(rng.integers(10, 60)), y + int(rng.integers(10, 60))), c, -1)
        elif k == 1:
            cv2.circle(img, (x, y), int(rng.integers(5, 30)), c, int(rng.integers(-1, 4)) or 1)
        elif k == 2:
            cv2.line(img, (x, y), (int(rng.integers(0, w)), int(rng.integers(0, h))), c, 2)
        else:
            cv2.putText(img, "".join(chr(int(v)) for v in rng.integers(65, 90, 4)), (x, y), cv2.FONT_HERSHEY_SIMPLEX,
                        0.8, c, 2)
    return img


def scanned(img: np.ndarray, turn: int, scale: float = 1.3, seed: int = 0) -> np.ndarray:
    """The face as a crop of a scan would show it: turned clockwise by ``turn``, resized, a little blur and noise."""
    rot = {0: None, 90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}[turn]
    out = img if rot is None else cv2.rotate(img, rot)
    out = cv2.GaussianBlur(cv2.resize(out, None, fx=scale, fy=scale), (3, 3), 0).astype(np.int16)
    out += np.random.default_rng(seed).integers(-8, 9, out.shape, dtype=np.int16)
    return np.clip(out * 0.9 + 15, 0, 255).astype(np.uint8)
