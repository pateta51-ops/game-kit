"""Fake games for the tests: the kinds the ported tests need (thin cards, thick strips and tokens, a tile read by its
pink print). Real games keep their plug-in in their own repository."""
from __future__ import annotations

from typing import Optional

import cv2
import numpy as np

from scanpipe.plugins.base import Orientation, Plugin

TOKEN_TOLERANCE_MM = 0.8


class FakeGame(Plugin):
    name = "fake-game"
    item_sizes_mm = {
        "card": (63.2, 88.4),
        "chart": (80.4, 120.7),
        "strip": (21.0, 181.4),
        "notchedPiece": (30.3, 181.0),
        "token18": (18.1, 18.1),
        "token20": (20.0, 20.0),
        "token22": (22.0, 22.0),
        "token40": (39.8, 39.8),
    }
    shaped_kinds = frozenset({"notchedPiece"})
    thick_kinds = {"strip": 3.0, "notchedPiece": 3.0, "token18": 2.5, "token20": 2.5, "token22": 2.5, "token40": 2.5}
    printed_edge_kinds = frozenset({"token18", "token20", "token22", "token40"})
    cast_kinds = {"card": 2.5, "chart": 2.5}
    corner_radius_mm = {"card": 3.0, "chart": 3.0}
    card_kind = "card"
    out_dpi = None

    def classify(self, w_mm: float, h_mm: float) -> Optional[str]:
        for kind in ("token18", "token20", "token22", "token40"):
            kw, kh = self.item_sizes_mm[kind]
            if abs(w_mm - kw) <= TOKEN_TOLERANCE_MM and abs(h_mm - kh) <= TOKEN_TOLERANCE_MM:
                return kind
        return super().classify(w_mm, h_mm)


def magenta_share(img: np.ndarray) -> float:
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    return float((((h >= 150) | (h <= 5)) & (s > 120) & (v > 120)).mean())


class FakeTiles(Plugin):
    name = "fake-tiles"
    item_sizes_mm = {"base": (88.5, 163.0)}
    out_dpi = 300.0
    jpeg_quality = 92

    def orient(self, crop: np.ndarray, kind: Optional[str]) -> Orientation:
        if kind != "base":
            return Orientation(0, False, "no orientation rule for this kind yet")
        b = max(1, int(0.18 * crop.shape[0]))
        top, bottom = magenta_share(crop[:b]), magenta_share(crop[-b:])
        hi, lo = max(top, bottom), min(top, bottom)
        confident = hi >= 0.02 and hi >= 3 * lo
        turn = 90 if top > bottom else 270
        return Orientation(turn, confident, f"pink squares at the {'top' if top > bottom else 'bottom'} end "
                                            f"({hi:.3f} vs {lo:.3f})")
