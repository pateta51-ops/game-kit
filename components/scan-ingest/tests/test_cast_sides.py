"""K791: on notched and tabbed cards (cast fit skipped, K789) the cast-shadow band along the straight sides is taken
off (cast mode "sides"), the notch and the tab keep their outline, plain cards are as before. Synthetic light-edged
cards pasted on whole pixels on magenta, with a one-sided dark red band 0.5 mm wide on the right (original shapes)."""
import io
import contextlib
import json
from pathlib import Path

import cv2
import numpy as np

from scanpipe.__main__ import main
from tests.synth import MAGENTA_BGR
from tests.synth_sleeves import silhouette_mask
from tests.test_cast_per_item import SilGame
from tests.test_cast_shadow import PX, card, crisp_sheet, save

BAND_BGR = (25, 45, 110)  # dark red by the measure, a hue the plain cut keeps (as on the owner's die-cut scans)
BAND_PX = 6


class NoSides(SilGame):
    cast_skip_mode = None


def face_of(shape: str) -> np.ndarray:
    f = card(crimson="none", halftone_left=False)
    f[:, :, 3] = np.minimum(f[:, :, 3], silhouette_mask(shape, f.shape[1], f.shape[0]))
    f[:, :, :3][f[:, :, 0] == 20] = (200, 215, 225)   # a light edge: the band is not taken for a blend with the print
    return f


def sheet_of(face: np.ndarray) -> np.ndarray:
    s = crisp_sheet(face, right_mm=0.0, top_mm=0.0)
    item = ~np.all(np.abs(s.astype(int) - MAGENTA_BGR) < 40, axis=2)
    moved = np.zeros_like(item)
    for k in range(1, BAND_PX + 1):
        moved[:, k:] |= item[:, :-k]
    s[moved & ~item] = BAND_BGR
    return s


def run(tmp_path: Path, face: np.ndarray, plugin: str) -> tuple[dict, np.ndarray]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    with contextlib.redirect_stdout(io.StringIO()):
        main(["scan", "--plugin", f"tests.test_cast_sides:{plugin}", "--out", str(tmp_path / "out"),
                     str(save(sheet_of(face), tmp_path / "d.tif")), "--name", "card", "--turn", "0",
                     "--tone", "none"])
    (it,) = json.loads((tmp_path / "scan-review" / "d.json").read_text(encoding="utf-8"))["items"]
    return it, cv2.imread(it["file"], cv2.IMREAD_UNCHANGED)


def band_on_right(crop: np.ndarray, true: np.ndarray) -> bool:
    """The owner's measure on the right side's straight rows (where the true outline reaches its right edge, corners
    left out): outer 0.5 mm more than 12 % dark red, 0.5-1.5 mm in under 5 %."""
    b, g, r = (crop[..., i].astype(int) for i in range(3))
    seen = crop[:, :, 3] > 127
    red = (r - g > 45) & (r - b > 15) & (r < 190) & seen
    h = min(true.shape[0], crop.shape[0])
    rows = [y for y in range(int(0.08 * h), int(0.92 * h)) if true[y, -1] and true[y, -int(0.1 * true.shape[1])]]
    n05, n15 = int(round(0.5 * PX)), int(round(1.5 * PX))
    o = [crop.shape[1] - 1 - seen[y, ::-1].argmax() for y in rows]
    outer = np.mean([red[y, x - n05 + 1:x + 1].mean() for y, x in zip(rows, o)])
    inner = np.mean([red[y, x - n15 + 1:x - n05 + 1].mean() for y, x in zip(rows, o)])
    return outer > 0.12 and inner < 0.05


def right_edge_within_1px(crop: np.ndarray, true: np.ndarray) -> bool:
    """Along the right side's straight rows the crop's outer edge is within 1 px of the true outline's."""
    seen = crop[:, :, 3] > 127
    h = min(true.shape[0], crop.shape[0])
    rows = [y for y in range(int(0.08 * h), int(0.92 * h)) if true[y, -1] and true[y, -int(0.1 * true.shape[1])]]
    return all(abs((crop.shape[1] - 1 - seen[y, ::-1].argmax()) - (true.shape[1] - 1)) <= 1 for y in rows)


def iou(crop: np.ndarray, true: np.ndarray) -> float:
    h, w = min(true.shape[0], crop.shape[0]), min(true.shape[1], crop.shape[1])
    c, t = crop[:h, :w, 3] > 127, true[:h, :w] > 127
    return (c & t).sum() / (c | t).sum()


def check_die_cut(tmp_path: Path, shape: str, name: str):
    face = face_of(shape)
    true = silhouette_mask(shape, face.shape[1], face.shape[0])
    old, old_crop = run(tmp_path / "old", face, "NoSides")
    assert old["silhouette"]["shape"] == name and "cast" not in old
    assert band_on_right(old_crop, true) and not right_edge_within_1px(old_crop, true)   # the band without "sides"
    it, crop = run(tmp_path / "new", face, "SilGame")
    assert it["castSkipped"] == f"cast_for(card): no (silhouette {name})" and it["silhouette"] == old["silhouette"]
    assert it["cast"]["mode"] == "sides" and abs(it["cast"]["removedMm"]["right"] - BAND_PX / PX) < 0.1, it["cast"]
    assert it["cast"]["removedMm"]["left"] == 0.0 and it["cast"]["removedMm"]["top"] == 0.0
    assert not band_on_right(crop, true) and right_edge_within_1px(crop, true)
    assert iou(crop, true) > 0.995 and iou(crop, true) > iou(old_crop, true)
    # the notch and the tab exactly as the plain cut read them
    s, H, W = it["silhouette"], crop.shape[0], crop.shape[1]
    y0, y1 = int(s["notchSpan"][0] * H), int(s["notchSpan"][1] * H)
    assert np.array_equal(crop[y0:y1, :, 3], old_crop[y0:y1, :W, 3])
    if s.get("tab"):
        t, x0, x1 = int(s["tabHeight"] * H), int(s["tabX"][0] * W), int(s["tabX"][1] * W)
        assert crop[:t, x0:x1, 3].any() and np.array_equal(crop[:t, x0:x1, 3], old_crop[:t, x0:x1, 3])
    return it


def test_k791_a_notched_card_loses_the_band_on_its_straight_sides_and_keeps_its_notch(tmp_path: Path):
    it = check_die_cut(tmp_path, "core", "notched")
    assert abs(it["sizeMm"][0] - 63.2) < 0.15


def test_k791_a_tabbed_card_loses_the_band_and_keeps_its_tab_and_notch(tmp_path: Path):
    check_die_cut(tmp_path, "upgrade", "tabbed")


def test_k791_a_plain_card_is_unchanged(tmp_path: Path):
    face = face_of("plain")
    a, ca = run(tmp_path / "a", face, "SilGame")
    b, cb = run(tmp_path / "b", face, "NoSides")
    assert a["cast"] == b["cast"] and "mode" not in a["cast"] and "castSkipped" not in a
    assert np.array_equal(ca, cb)
