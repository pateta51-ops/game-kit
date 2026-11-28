"""K792: thick wooden pieces on magenta cast a soft shadow, the backing darkened on the side away from the lamp. It is
removed from a black and a red piece (plain mode) and from a coloured piece in printed_edge mode; the cut lands within
0.3 mm of the piece. Synthetic shapes only."""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from scanpipe.__main__ import main
from tests.fake_game import FakeGame
from tests.synth import magenta_sheet

DPI = 300
PX = DPI / 25.4


class WoodGame(FakeGame):
    item_sizes_mm = {**FakeGame.item_sizes_mm, "block": (25.0, 25.0)}
    thick_kinds = {**FakeGame.thick_kinds, "block": 8.0}


def piece(bgr: tuple, size_mm: float, shadow_mm: float = 2.0) -> np.ndarray:
    """A square piece (BGRA) and, below it, its soft shadow: black at partial alpha, so the backing darkened."""
    d, s = int(round(size_mm * PX)), int(round(shadow_mm * PX))
    pad = s + int(3 * PX) + 4
    m = np.zeros((d + 2 * pad, d + 2 * pad), np.uint8)
    m[pad:pad + d, pad:pad + d] = 255
    sh = np.zeros(m.shape, np.float32)
    for i in range(s + 1):
        sh = np.maximum(sh, np.roll(m, i, 0) / 255.0)
    sh = cv2.GaussianBlur(sh, (0, 0), PX / 2) * 0.85
    img = np.zeros((*m.shape, 4), np.uint8)
    img[..., 3] = np.clip(sh * 255, 0, 255)
    img[m > 0] = (*bgr, 255)
    return img


def scan(tmp_path: Path, items: list) -> list:
    sheet = magenta_sheet(items, DPI, bed_mm=(140.0, 60.0))
    f = tmp_path / "w.tif"
    Image.fromarray(cv2.cvtColor(sheet, cv2.COLOR_BGR2RGB)).save(f, dpi=(DPI, DPI))
    main(["scan", "--plugin", "tests.test_thick_pieces:WoodGame", "--out", str(tmp_path / "out"), str(f),
          *["--turn", "0"] * len(items)])
    return json.loads((tmp_path / "scan-review" / "w.json").read_text(encoding="utf-8"))["items"]


def test_k792_the_shadow_of_black_red_and_printed_edge_coloured_pieces_is_removed(tmp_path: Path):
    items = scan(tmp_path, [(piece((25, 25, 25), 25.0), 0.2, 0.5, 0.0), (piece((35, 35, 170), 25.0), 0.5, 0.5, 0.0),
                            (piece((150, 80, 30), 20.0), 0.8, 0.5, 0.0)])
    got = sorted((it["file"] and it["kind"], it["sizeMm"], it["flags"]) for it in items)
    assert [g[0] for g in got] == ["block", "block", "token20"], got
    for kind, size, flags in got:
        want = 25.0 if kind == "block" else 20.0
        assert max(abs(v - want) for v in size) <= 0.35, (kind, size)   # the cut-out erodes each edge ~0.15 mm
        assert "SHADOW_KEPT_CHECK_CROP" not in flags, (kind, flags)
