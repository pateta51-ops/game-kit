"""K792: thick wooden pieces on magenta cast a soft shadow, the backing darkened on the side away from the lamp. It is
removed from a black and a red piece (plain mode) and from a coloured piece in printed_edge mode; the cut lands within
0.3 mm of the piece. The manifest's ``thickCut`` says which cut won. Synthetic shapes only."""
import json
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import pytest
from PIL import Image

from scanpipe import key
from scanpipe.__main__ import main
from tests.fake_game import FakeGame
from tests.synth import MAGENTA_BGR, MM, magenta_sheet, rounded_alpha

DPI = 300
PX = DPI / 25.4
BED = (200.0, 110.0)


class WoodGame(FakeGame):
    item_sizes_mm = {**FakeGame.item_sizes_mm, "block": (25.0, 25.0)}
    thick_kinds = {**FakeGame.thick_kinds, "block": 8.0}


class NoSizeGame(WoodGame):
    """A plug-in whose classify names a thick kind it gives no size for."""
    thick_kinds = {**WoodGame.thick_kinds, "blob": 8.0}

    def classify(self, w_mm: float, h_mm: float) -> Optional[str]:
        return "blob" if 29.0 < min(w_mm, h_mm) < 33.0 else super().classify(w_mm, h_mm)


def piece(bgr: tuple, size_mm: float, shadow_mm: float = 2.0, ring: Optional[tuple] = None) -> np.ndarray:
    """A square piece (BGRA) and, below it, its soft shadow: black at partial alpha, so the backing darkened. With
    ``ring`` (BGR, mm), a band of that colour printed along its edge all round."""
    d, s = int(round(size_mm * PX)), int(round(shadow_mm * PX))
    pad = s + int(3 * PX) + 4
    m = np.zeros((d + 2 * pad, d + 2 * pad), np.uint8)
    m[pad:pad + d, pad:pad + d] = 255
    sh = np.zeros(m.shape, np.float32)
    for i in range(s + 1):
        sh = np.maximum(sh, np.roll(m, i, 0) / 255.0)
    sh = cv2.GaussianBlur(sh, (0, 0), PX / 2) * 0.85 if s else sh * 0
    img = np.zeros((*m.shape, 4), np.uint8)
    img[..., 3] = np.clip(sh * 255, 0, 255)
    img[m > 0] = (*bgr, 255)
    if ring:
        b = int(round(ring[1] * PX))
        img[pad:pad + d, pad:pad + d, :3] = ring[0]
        img[pad + b:pad + d - b, pad + b:pad + d - b, :3] = bgr
    return img


def card() -> np.ndarray:
    w, h = int(round(63.2 * PX)), int(round(88.4 * PX))
    img = np.full((h, w, 3), (215, 220, 224), np.uint8)
    cv2.rectangle(img, (w // 5, h // 5), (w // 2, h // 2), (70, 110, 60), -1)
    return np.dstack([img, rounded_alpha(w, h, int(3 * PX))])


def scan(tmp_path: Path, items: list, plugin: str = "WoodGame") -> list:
    sheet = magenta_sheet(items, DPI, bed_mm=BED)
    tmp_path.mkdir(parents=True, exist_ok=True)
    f = tmp_path / "w.tif"
    Image.fromarray(cv2.cvtColor(sheet, cv2.COLOR_BGR2RGB)).save(f, dpi=(DPI, DPI))
    main(["scan", "--plugin", f"tests.test_thick_pieces:{plugin}", "--out", str(tmp_path / "out"), str(f),
          *["--turn", "0"] * len(items)])
    its = json.loads((tmp_path / "scan-review" / "w.json").read_text(encoding="utf-8"))["items"]
    return sorted(its, key=lambda it: it["region"]["cx"])


def as_on_main(monkeypatch, tmp_path: Path, items: list, plugin: str = "WoodGame") -> list:
    """The same scan with only the colour cut, as before K792."""
    real = key.key_region
    monkeypatch.setattr(key, "key_region", lambda *a, tinted_shadow=False, **kw: None if tinted_shadow else real(*a, **kw))
    try:
        return scan(tmp_path, items, plugin)
    finally:
        monkeypatch.setattr(key, "key_region", real)


def edge_off(it: dict, fx: float, fy: float, size_mm: float) -> float:
    """The largest distance (mm) of the cut's left, top, right or bottom edge from the true square's."""
    c = np.array(it["region"]["corners"], float)
    W, H = int(BED[0] * MM * DPI), int(BED[1] * MM * DPI)
    h = size_mm * PX / 2
    true = (fx * W - h, fy * H - h, fx * W + h, fy * H + h)
    got = (c[:, 0].min() - 0.5, c[:, 1].min() - 0.5, c[:, 0].max() + 0.5, c[:, 1].max() + 0.5)
    return max(abs(a - b) for a, b in zip(got, true)) / PX


def same(a: list, b: list) -> None:
    assert [(x["kind"], x["sizeMm"], x["region"], x["flags"]) for x in a] == \
           [(x["kind"], x["sizeMm"], x["region"], x["flags"]) for x in b]


def test_k792_the_shadow_of_black_red_and_printed_edge_coloured_pieces_is_removed(tmp_path: Path):
    items = scan(tmp_path, [(piece((25, 25, 25), 25.0), 0.2, 0.5, 0.0), (piece((35, 35, 170), 25.0), 0.5, 0.5, 0.0),
                            (piece((150, 80, 30), 20.0), 0.8, 0.5, 0.0)])
    assert [it["kind"] for it in items] == ["block", "block", "token20"], items
    for it, fx, size in zip(items, (0.2, 0.5, 0.8), (25.0, 25.0, 20.0)):
        assert edge_off(it, fx, 0.5, size) <= 0.3, it
        assert "SHADOW_KEPT_CHECK_CROP" not in it["flags"] and it["thickCut"] == "tinted", it


def angle(bgr: tuple) -> float:
    p, b = np.array(bgr, float), np.array(MAGENTA_BGR, float)
    return float(np.degrees(np.arccos(p @ b / np.linalg.norm(p) / np.linalg.norm(b))))


def test_k792_a_pink_piece_of_nearly_the_backings_hue_keeps_its_outline(tmp_path: Path):
    pink = (150, 110, 255)
    assert angle(pink) < 8.0
    items = scan(tmp_path, [(piece(pink, 25.0), 0.3, 0.5, 0.0), (piece(pink, 20.0), 0.7, 0.5, 0.0)])
    assert [(it["kind"], it["thickCut"]) for it in items] == [("block", "colour"), ("token20", "tinted")], items
    for it, fx, size in zip(items, (0.3, 0.7), (25.0, 20.0)):
        assert edge_off(it, fx, 0.5, size) <= 0.3, it


@pytest.mark.xfail(strict=True, reason="K792 gap: a piece darker than the sheet and of its hue (within 8 degrees) is "
                   "taken for shadow by both cuts; the plain cut is kept and flagged UNKNOWN_SIZE for a look")
def test_k792_a_dark_purple_piece_of_the_backings_hue_keeps_its_outline(tmp_path: Path):
    purple = (90, 50, 150)
    assert angle(purple) < 8.0
    it = scan(tmp_path, [(piece(purple, 25.0), 0.5, 0.5, 0.0)])[0]
    assert "UNKNOWN_SIZE" in it["flags"]      # what happens now: flagged, never cut wrong silently
    assert it["kind"] == "block" and edge_off(it, 0.5, 0.5, 25.0) <= 0.3, it


def test_k792_a_printed_edge_piece_whose_cuts_both_eat_its_edge_is_flagged(tmp_path: Path):
    # a 20.4 mm token printed to its edge with a 0.3 mm band of darkened-backing colour, and no shadow: both cuts take
    # the band all round (not one-sided), so the plain cut is kept and flagged
    it = scan(tmp_path, [(piece((200, 205, 210), 20.4, 0.0, ring=((50, 34, 108), 0.3)), 0.5, 0.5, 0.0)])[0]
    assert it["kind"] == "token20" and "SHADOW_KEPT_CHECK_CROP" in it["flags"] and "thickCut" not in it, it


def test_k792_a_piece_with_no_shadow_and_a_card_come_out_as_before(tmp_path: Path, monkeypatch):
    items = [(piece((150, 80, 30), 25.0, 0.0), 0.2, 0.5, 0.0), (card(), 0.6, 0.5, 0.0)]
    now = scan(tmp_path / "now", items)
    same(now, as_on_main(monkeypatch, tmp_path / "main", items))
    assert [it["kind"] for it in now] == ["block", "card"] and now[0]["thickCut"] == "colour", now
    assert "thickCut" not in now[1], now


def test_k792_an_unknown_size_or_a_kind_with_no_size_comes_out_as_before(tmp_path: Path, monkeypatch):
    items = [(piece((25, 25, 25), 36.0), 0.25, 0.5, 0.0), (piece((150, 80, 30), 30.0, 0.0), 0.7, 0.5, 0.0)]
    now = scan(tmp_path / "now", items, "NoSizeGame")
    same(now, as_on_main(monkeypatch, tmp_path / "main", items, "NoSizeGame"))
    assert [it["kind"] for it in now] == [None, "blob"] and now[1]["thickCut"] == "colour", now
    assert "thickCut" not in now[0], now
