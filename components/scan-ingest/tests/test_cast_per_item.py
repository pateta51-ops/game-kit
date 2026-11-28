"""K789: the cast-shadow fit is chosen per item from its silhouette, read on the plain cut, so a kind that comes both
plain and die-cut can use the fit (synthetic cards from test_cast_shadow, each casting a real shadow on the magenta,
1.0 mm right and 0.4 mm top; original shapes only)."""
import json
from pathlib import Path

import cv2
import numpy as np

from scanpipe.__main__ import main
from tests.fake_game import FakeGame
from tests.synth_sleeves import silhouette_mask
from tests.test_cast_shadow import CARD_MM, card, save, sheet_with

SEEN: list = []


class SilGame(FakeGame):
    name = "fake-sil"
    silhouette_kinds = frozenset({"card"})

    def cast_for(self, kind, silhouette, crop):
        SEEN.append(silhouette)
        return super().cast_for(kind, silhouette, crop)


class AlwaysCast(SilGame):
    def cast_for(self, kind, silhouette, crop):
        SEEN.append(silhouette)
        return True


class NeverCast(SilGame):
    def cast_for(self, kind, silhouette, crop):
        SEEN.append(silhouette)
        return False


def die_cut(shape: str) -> np.ndarray:
    face = card(crimson="none")
    h, w = face.shape[:2]
    face[:, :, 3] = np.minimum(face[:, :, 3], silhouette_mask(shape, w, h))
    return face


def scan(tmp_path: Path, face: np.ndarray, plugin: str, module: str = "tests.test_cast_per_item") -> dict:
    SEEN.clear()
    main(["scan", "--plugin", f"{module}:{plugin}", "--out", str(tmp_path / "out"),
          str(save(sheet_with(face), tmp_path / "d.tif")), "--name", "card", "--turn", "0", "--tone", "none"])
    (it,) = json.loads((tmp_path / "scan-review" / "d.json").read_text(encoding="utf-8"))["items"]
    return it


def test_k789_a_plain_card_still_gets_the_cast_fit(tmp_path: Path):
    it = scan(tmp_path, card(crimson="none"), "SilGame")
    assert it["kind"] == "card" and "cast" in it and "castSkipped" not in it
    assert [s["shape"] for s in SEEN] == ["plain"]          # read plain on the shadowed plain cut
    assert it["silhouette"]["shape"] == "plain"
    w, h = it["sizeMm"]
    assert abs(w - CARD_MM[0]) < 0.2 and abs(h - CARD_MM[1]) < 0.2, it["sizeMm"]


def test_k789_a_notched_card_of_the_same_size_skips_the_fit_and_keeps_its_silhouette_flags(tmp_path: Path):
    it = scan(tmp_path, die_cut("core"), "SilGame")
    assert it["kind"] == "card" and "cast" not in it
    assert [s["shape"] for s in SEEN] == ["notched"]        # read notched on the shadowed plain cut
    assert it["silhouette"] == SEEN[0]
    assert it["castSkipped"] == "cast_for(card): no (silhouette notched)"
    assert "SILHOUETTE_ROTATION_GUESSED" in it["silhouette"]["flags"] and "SILHOUETTE_ROTATION_GUESSED" in it["flags"]
    a = cv2.imread(it["file"], cv2.IMREAD_UNCHANGED)[:, :, 3]
    hh, ww = a.shape
    assert a[int(hh * 0.57), ww - 1 - int(ww * 0.1)] == 0          # the notch stays open, not filled with backing


def test_k789_a_tabbed_card_skips_the_fit(tmp_path: Path):
    it = scan(tmp_path, die_cut("upgrade"), "SilGame")
    assert it["kind"] == "card" and "cast" not in it
    assert it["silhouette"]["shape"] == "tabbed" and it["castSkipped"] == "cast_for(card): no (silhouette tabbed)"


def test_k789_the_cast_for_hook_overrides_the_default_and_the_fitted_crop_is_read_again(tmp_path: Path):
    it = scan(tmp_path, die_cut("core"), "AlwaysCast")
    assert it["kind"] == "card" and "cast" in it and "castSkipped" not in it
    assert SEEN[0]["shape"] == "notched" and it["silhouette"] != SEEN[0]   # read again on the fitted crop


def test_k789_cast_for_false_skips_the_fit_on_a_plain_card(tmp_path: Path):
    it = scan(tmp_path, card(crimson="none"), "NeverCast")
    assert it["kind"] == "card" and "cast" not in it
    assert it["castSkipped"] == "cast_for(card): no (silhouette plain)" and it["silhouette"]["shape"] == "plain"


def test_k789_a_game_without_silhouette_kinds_fits_as_before(tmp_path: Path):
    it = scan(tmp_path, die_cut("core"), "FakeGame", "tests.fake_game")
    assert it["kind"] == "card" and "cast" in it and "castSkipped" not in it and "silhouette" not in it
