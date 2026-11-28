"""K789: the cast-shadow fit is chosen per item from its silhouette, read on the plain cut, so a kind that comes both
plain and die-cut can use the fit (synthetic cards from test_cast_shadow; original shapes only)."""
import json
from pathlib import Path

import cv2
import numpy as np

from scanpipe.__main__ import main
from tests.fake_game import FakeGame
from tests.synth_sleeves import silhouette_mask
from tests.test_cast_shadow import CARD_MM, card, save, sheet_with


class SilGame(FakeGame):
    name = "fake-sil"
    silhouette_kinds = frozenset({"card"})


class AlwaysCast(SilGame):
    def cast_for(self, kind, silhouette, crop):
        return True


def notched() -> np.ndarray:
    face = card(crimson="none")
    h, w = face.shape[:2]
    face[:, :, 3] = np.minimum(face[:, :, 3], silhouette_mask("core", w, h))
    return face


def scan(tmp_path: Path, face: np.ndarray, plugin: str) -> dict:
    main(["scan", "--plugin", f"tests.test_cast_per_item:{plugin}", "--out", str(tmp_path / "out"),
          str(save(sheet_with(face), tmp_path / "d.tif")), "--name", "card", "--turn", "0", "--tone", "none"])
    (it,) = json.loads((tmp_path / "scan-review" / "d.json").read_text(encoding="utf-8"))["items"]
    return it


def test_k789_a_plain_card_still_gets_the_cast_fit(tmp_path: Path):
    it = scan(tmp_path, card(crimson="none"), "SilGame")
    assert it["kind"] == "card" and "cast" in it and "castSkipped" not in it
    assert it["silhouette"]["shape"] == "plain"
    w, h = it["sizeMm"]
    assert abs(w - CARD_MM[0]) < 0.2 and abs(h - CARD_MM[1]) < 0.2, it["sizeMm"]


def test_k789_a_notched_card_of_the_same_size_skips_the_fit(tmp_path: Path):
    it = scan(tmp_path, notched(), "SilGame")
    assert it["kind"] == "card" and "cast" not in it
    assert it["silhouette"]["shape"] == "notched"
    assert it["castSkipped"] == "cast_for: no (silhouette notched)"
    a = cv2.imread(it["file"], cv2.IMREAD_UNCHANGED)[:, :, 3]
    hh, ww = a.shape
    assert a[int(hh * 0.57), ww - 1 - int(ww * 0.1)] == 0          # the notch stays open, not filled with backing


def test_k789_the_cast_for_hook_overrides_the_default(tmp_path: Path):
    it = scan(tmp_path, notched(), "AlwaysCast")
    assert it["kind"] == "card" and "cast" in it and "castSkipped" not in it
