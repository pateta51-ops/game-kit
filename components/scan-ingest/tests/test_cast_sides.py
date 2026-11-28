"""K791: on notched and tabbed cards (cast fit skipped, K789) the cast-shadow band along the straight sides is taken
off (cast mode "sides"), the notch and the tab keep their outline, plain cards are as before, and a printed dark red
rim is not taken for shadow. Synthetic light-edged cards pasted on whole pixels on magenta, each with a dark red band
0.5 mm wide cast on the named sides (original shapes)."""
import io
import contextlib
import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from scanpipe.__main__ import main
from tests.synth import MAGENTA_BGR
from tests.synth_sleeves import silhouette_mask
from tests.test_cast_per_item import SilGame
from tests.test_cast_shadow import PX, card, crisp_sheet, save

BAND_BGR = (25, 45, 110)  # dark red by the measure, a hue the plain cut keeps (as on the owner's die-cut scans)
BAND_PX = 6


class NoSides(SilGame):
    cast_skip_mode = None


def face_of(shape: str, rim: bool = False) -> np.ndarray:
    f = card(crimson="none", halftone_left=False)
    f[:, :, :3][f[:, :, 0] == 20] = (200, 215, 225)   # a light edge: the band is not taken for a blend with the print
    f[:, :, 3] = np.minimum(f[:, :, 3], silhouette_mask(shape, f.shape[1], f.shape[0]))
    if rim:   # a printed dark red rim all round, as wide as the band
        a = (f[:, :, 3] > 0).astype(np.uint8)
        f[:, :, :3][(a > 0) & (cv2.erode(a, np.ones((2 * BAND_PX + 1,) * 2, np.uint8), borderType=cv2.BORDER_CONSTANT, borderValue=0) == 0)] = BAND_BGR
    return f


def sheet_of(face: np.ndarray, sides: tuple) -> np.ndarray:
    s = crisp_sheet(face, right_mm=0.0, top_mm=0.0)
    item = ~np.all(np.abs(s.astype(int) - MAGENTA_BGR) < 40, axis=2)
    moved = np.zeros_like(item)
    for k in range(1, BAND_PX + 1):
        if "right" in sides:
            moved[:, k:] |= item[:, :-k]
        if "left" in sides:
            moved[:, :-k] |= item[:, k:]
        if "top" in sides:
            moved[:-k, :] |= item[k:, :]
        if "bottom" in sides:
            moved[k:, :] |= item[:-k, :]
    s[moved & ~item] = BAND_BGR
    return s


def run(tmp_path: Path, face: np.ndarray, plugin: str, sides: tuple) -> tuple[dict, np.ndarray]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    with contextlib.redirect_stdout(io.StringIO()):
        main(["scan", "--plugin", f"tests.test_cast_sides:{plugin}", "--out", str(tmp_path / "out"),
              str(save(sheet_of(face, sides), tmp_path / "d.tif")), "--name", "card", "--turn", "0", "--tone", "none"])
    (it,) = json.loads((tmp_path / "scan-review" / "d.json").read_text(encoding="utf-8"))["items"]
    return it, cv2.imread(it["file"], cv2.IMREAD_UNCHANGED)


def edges(alpha: np.ndarray, side: str) -> np.ndarray:
    """The outer edge on a side, per row (left, right) or column (top, bottom), in the crop's own frame."""
    a = alpha > 127 if side in ("left", "right") else (alpha > 127).T
    first, last = a.argmax(axis=1), a.shape[1] - 1 - a[:, ::-1].argmax(axis=1)
    return (first if side in ("left", "top") else last).astype(int)


def straight(crop: np.ndarray, true: np.ndarray, side: str):
    """The crop's and the true outline's outer edge on a side, and the side's straight rows: where the true edge is on
    the outermost value that a quarter of the rows share (the notch, the tab and the corners left out)."""
    oc, ot = edges(crop[:, :, 3], side), edges(true, side)
    n = min(len(oc), len(ot))
    v, cnt = np.unique(ot[int(0.08 * n):int(0.92 * n)], return_counts=True)
    v = v[cnt >= 0.25 * cnt.sum()]
    edge = v.min() if side in ("left", "top") else v.max()
    m = 22   # and 22 px from them (the tab's slanted sides and the columns beside them keep their band)
    return oc, ot, [y for y in range(int(0.08 * n), int(0.92 * n)) if (ot[max(0, y - m):y + m + 1] == edge).all()]


def band_on(crop: np.ndarray, true: np.ndarray, side: str) -> bool:
    """The owner's measure on a side: outer 0.5 mm more than 12 % dark red, 0.5-1.5 mm in under 5 %."""
    oc, _ot, rows = straight(crop, true, side)
    a = crop if side in ("left", "right") else crop.transpose(1, 0, 2)
    if side in ("left", "top"):
        a, oc = a[:, ::-1], a.shape[1] - 1 - oc
    b, g, r = (a[..., i].astype(int) for i in range(3))
    red = (r - g > 45) & (r - b > 15) & (r < 190) & (a[:, :, 3] > 127)
    n05, n15 = int(round(0.5 * PX)), int(round(1.5 * PX))
    outer = np.mean([red[y, oc[y] - n05 + 1:oc[y] + 1].mean() for y in rows])
    inner = np.mean([red[y, oc[y] - n15 + 1:oc[y] - n05 + 1].mean() for y in rows])
    return outer > 0.12 and inner < 0.05


def edge_within_1px(crop: np.ndarray, true: np.ndarray, side: str, tab_band: bool = False) -> bool:
    """``tab_band``: the band stays above the tab (it is left as cut), so the crop's top is the band's: the body's
    top is then measured from the band's width down."""
    oc, ot, rows = straight(crop, true, side)
    d = np.array([int(oc[y]) - int(ot[y]) for y in rows])
    if tab_band:
        assert abs(np.median(d) - BAND_PX) <= 1
        d -= BAND_PX
    return bool((np.abs(d) <= 1).all())


def iou(crop: np.ndarray, true: np.ndarray, dy: int = 0) -> float:
    """With the true outline ``dy`` rows down the crop (below a band left above a tab)."""
    crop = crop[dy:]
    h, w = min(true.shape[0], crop.shape[0]), min(true.shape[1], crop.shape[1])
    c, t = crop[:h, :w, 3] > 127, true[:h, :w] > 127
    return (c & t).sum() / (c | t).sum()


@pytest.mark.parametrize("shape,name,sides", [
    ("core", "notched", ("right",)), ("upgrade", "tabbed", ("right",)), ("core", "notched", ("left",)),
    ("upgrade", "tabbed", ("top",)), ("core", "notched", ("bottom",)), ("upgrade", "tabbed", ("right", "top")),
])
def test_k791_the_band_goes_from_the_shadowed_sides_and_the_notch_and_tab_stay(tmp_path: Path, shape, name, sides):
    face = face_of(shape)
    true = silhouette_mask(shape, face.shape[1], face.shape[0])
    old, old_crop = run(tmp_path / "old", face, "NoSides", sides)
    assert old["silhouette"]["shape"] == name and "cast" not in old
    assert all(band_on(old_crop, true, s) for s in sides)   # the band, without "sides"
    assert old_crop.shape[1] - true.shape[1] >= BAND_PX - 2 if {"left", "right"} & set(sides) else True
    it, crop = run(tmp_path / "new", face, "SilGame", sides)
    assert it["castSkipped"] == f"cast_for(card): no (silhouette {name})" and it["silhouette"]["shape"] == name
    rm = it["cast"]["removedMm"]
    assert it["cast"]["mode"] == "sides" and all(abs(rm[s] - BAND_PX / PX) < 0.1 for s in sides), rm
    assert all(rm[s] == 0.0 for s in rm if s not in sides), rm
    assert all(not band_on(crop, true, s) and edge_within_1px(crop, true, s, s == "top" and shape == "upgrade") for s in sides)
    tab_top = shape == "upgrade" and "top" in sides
    new_iou = iou(crop, true, BAND_PX if tab_top else 0)
    assert new_iou > 0.99 and new_iou > iou(old_crop, true, BAND_PX if "top" in sides else 0)
    # the notch and the tab exactly as the plain cut read them (the crop shifted by what came off the left and top)
    s, H, W = old["silhouette"], old_crop.shape[0], old_crop.shape[1]
    dx, dy = int(round(rm["left"] * PX)), 0 if tab_top else int(round(rm["top"] * PX))
    y0, y1 = int(s["notchSpan"][0] * H), int(s["notchSpan"][1] * H)
    x0, x1 = (W // 2, W - 2 * BAND_PX) if s["notch"] == "right" else (2 * BAND_PX, W // 2)
    assert np.array_equal(crop[y0 - dy:y1 - dy, x0 - dx:x1 - dx, 3], old_crop[y0:y1, x0:x1, 3])
    if s.get("tab"):
        t, x0, x1 = int(s["tabHeight"] * H), int(s["tabX"][0] * W), int(s["tabX"][1] * W)
        assert crop[:t, x0 - dx:x1 - dx, 3].any() and np.array_equal(crop[:t, x0 - dx:x1 - dx, 3], old_crop[:t, x0:x1, 3])
    # the silhouette is read again on the final crop
    assert abs(it["silhouette"]["aspect"] - crop.shape[1] / crop.shape[0]) < 0.002


def test_k791_a_turned_card_loses_the_band_on_the_side_it_falls_on(tmp_path: Path):
    face = np.ascontiguousarray(np.rot90(face_of("core")))   # lies landscape; the band is still on the scan's right
    it, crop = run(tmp_path, face, "SilGame", ("right",))
    rm = it["cast"]["removedMm"]
    side = "top" if rm["top"] else "bottom"
    assert abs(rm[side] - BAND_PX / PX) < 0.1 and sum(v > 0 for v in rm.values()) == 1, rm
    m = silhouette_mask("core", face.shape[0], face.shape[1])
    assert max(iou(crop, np.ascontiguousarray(np.rot90(m, k))) for k in (0, 2)) > 0.995


def test_k791_a_printed_dark_red_rim_all_round_is_not_trimmed(tmp_path: Path):
    face = face_of("core", rim=True)
    old, old_crop = run(tmp_path / "old", face, "NoSides", ())
    it, crop = run(tmp_path / "new", face, "SilGame", ())
    true = silhouette_mask("core", face.shape[1], face.shape[0])
    assert band_on(crop, true, "left")     # the measure alone would take the rim for a band
    assert not any(it["cast"]["removedMm"].values()) and np.array_equal(crop, old_crop)


def test_k791_a_printed_rim_and_a_shadow_on_one_side_is_trimmed_on_that_side_only(tmp_path: Path):
    face = face_of("core", rim=True)
    true = silhouette_mask("core", face.shape[1], face.shape[0])
    it, crop = run(tmp_path, face, "SilGame", ("right",))
    rm = it["cast"]["removedMm"]
    assert abs(rm["right"] - BAND_PX / PX) < 0.1 and rm["left"] == rm["top"] == rm["bottom"] == 0.0, rm
    assert edge_within_1px(crop, true, "right") and edge_within_1px(crop, true, "left")


@pytest.mark.parametrize("shape", ["core", "upgrade"])
def test_k791_a_die_cut_card_with_no_band_is_unchanged(tmp_path: Path, shape):
    face = face_of(shape)
    a, ca = run(tmp_path / "a", face, "SilGame", ())
    b, cb = run(tmp_path / "b", face, "NoSides", ())
    assert not any(a["cast"]["removedMm"].values()) and a["silhouette"] == b["silhouette"]
    assert np.array_equal(ca, cb)


def test_k791_a_plain_card_is_unchanged(tmp_path: Path):
    face = face_of("plain")
    a, ca = run(tmp_path / "a", face, "SilGame", ("right",))
    b, cb = run(tmp_path / "b", face, "NoSides", ("right",))
    assert a["cast"] == b["cast"] and "mode" not in a["cast"] and "castSkipped" not in a
    assert np.array_equal(ca, cb)
