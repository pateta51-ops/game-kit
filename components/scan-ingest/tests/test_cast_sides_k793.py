"""K793: the die-cut side trim (K791) also takes the band that runs beside a notch or a tab only (the side's straight
run is broken by the notch's or tab's rows), a soft cast shadow over a printed dark red rim that the opposite side's
rim makes no wider than it, and a thin band on a card cut a little under the kind's size. Synthetic sheets, as K791's."""
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
from scanpipe import cast
from tests.synth import rounded_alpha
from tests.test_cast_per_item import SilGame
from tests.test_cast_sides import BAND_BGR, edge_within_1px, face_of, iou
from tests.test_cast_shadow import crisp_sheet, save
DEEP, LIGHT = 0.6 * np.array(BAND_BGR), 1.6 * np.array(BAND_BGR)   # the band's hue (the plain cut keeps it), darkest at the card


def sheet(face: np.ndarray, side: str, px: int, part=(0.0, 1.0), soft: bool = False, blur: float = 0.0,
          noise: float = 0.0) -> np.ndarray:
    """A band ``px`` wide cast on ``side``, along the ``part`` (fractions) of the side only; ``soft``: darkest at the
    card and lighter outward (the backing darkened, as a scan's shadow), else flat BAND_BGR."""
    s = crisp_sheet(face, right_mm=0.0, top_mm=0.0)
    item = ~np.all(np.abs(s.astype(int) - MAGENTA_BGR) < 40, axis=2)
    ys, xs = np.nonzero(item)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    lim = np.zeros_like(item)
    if side in ("left", "right"):
        lim[int(y0 + part[0] * (y1 - y0)):int(y0 + part[1] * (y1 - y0))] = True
    else:
        lim[:, int(x0 + part[0] * (x1 - x0)):int(x0 + part[1] * (x1 - x0))] = True
    done = item.copy()
    dy, dx = {"right": (0, 1), "left": (0, -1), "top": (-1, 0), "bottom": (1, 0)}[side]
    for k in range(1, px + 1):
        m = np.roll(item, (dy * k, dx * k), axis=(0, 1)) & ~done & lim
        s[m] = DEEP + (LIGHT - DEEP) * (k - 1) / max(1, px - 1) if soft else BAND_BGR
        done |= m
    if noise:
        s = (s + np.random.default_rng(7).normal(0, noise, s.shape)).clip(0, 255).astype(np.uint8)
    return cv2.GaussianBlur(s, (0, 0), blur) if blur > 0 else s


def run(tmp_path: Path, img: np.ndarray, plugin: str = "SilGame") -> tuple[dict, np.ndarray]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    with contextlib.redirect_stdout(io.StringIO()):
        main(["scan", "--plugin", plugin if ":" in plugin else f"tests.test_cast_sides:{plugin}", "--out", str(tmp_path / "out"),
                     str(save(img, tmp_path / "d.tif")), "--name", "card", "--turn", "0", "--tone", "none"])
    (it,) = json.loads((tmp_path / "scan-review" / "d.json").read_text(encoding="utf-8"))["items"]
    return it, cv2.imread(it["file"], cv2.IMREAD_UNCHANGED)


def rim_lr(shape: str, lw: int, rw: int) -> np.ndarray:
    """A printed dark red rim along the long sides only, ``lw`` and ``rw`` px wide (the print a little off centre)."""
    f = face_of(shape)
    a = f[:, :, 3] > 0
    for w, flip in ((lw, False), (rw, True)):
        aa = a[:, ::-1] if flip else a
        first = aa.argmax(axis=1)
        m = (np.arange(a.shape[1])[None, :] - first[:, None] < w) & aa
        f[:, :, :3][m[:, ::-1] if flip else m] = BAND_BGR
    return f


def test_k793_a_band_beside_the_notch_only_on_the_opposite_side_is_trimmed(tmp_path: Path):
    face = face_of("core")
    true = silhouette_mask("core", face.shape[1], face.shape[0])
    img = sheet(face, "left", 6, (0.3, 0.86))
    old, old_crop = run(tmp_path / "old", img, "NoSides")
    it, crop = run(tmp_path / "new", img)
    sd = it["cast"]["sides"]["left"]
    assert it["cast"]["removedMm"]["left"] > 0.4 and sd["reason"] == "trimmed" and sd["bandPct"] > 50, it["cast"]
    assert edge_within_1px(crop, true, "left") and iou(crop, true) > 0.995 > iou(old_crop, true)


def test_k793_a_band_along_one_shoulder_beside_the_tab_is_trimmed(tmp_path: Path):
    face = face_of("upgrade")
    true = silhouette_mask("upgrade", face.shape[1], face.shape[0])
    it, crop = run(tmp_path, sheet(face, "top", 6, (0.0, 0.42)))
    rm = it["cast"]["removedMm"]
    assert rm["top"] > 0.4 and rm["left"] == rm["right"] == rm["bottom"] == 0.0, it["cast"]
    assert iou(crop, true) > 0.995


def test_k793_a_soft_shadow_over_a_printed_rim_no_wider_than_the_opposite_rim_is_trimmed(tmp_path: Path):
    face = rim_lr("core", 8, 4)   # the right rim plus a 6 px shadow (5 left after the cut-out) is about as wide as the left rim
    true = silhouette_mask("core", face.shape[1], face.shape[0])
    it, crop = run(tmp_path, sheet(face, "right", 6, soft=True))
    sd = it["cast"]["sides"]
    assert sd["right"]["reason"] == "trimmed (soft)" and abs(sd["right"]["runPx"] - sd["right"]["oppositePx"]) < 3, sd
    assert sd["left"]["reason"].endswith("crisp (a printed rim)") and sd["top"]["reason"] == "no band", sd
    rm = it["cast"]["removedMm"]
    assert abs(rm["right"] * 300 / 25.4 - 5) < 1.5 and rm["left"] == rm["top"] == rm["bottom"] == 0.0, rm
    assert edge_within_1px(crop, true, "right") and edge_within_1px(crop, true, "left")


def test_k793_a_flat_band_as_narrow_and_a_flat_rim_stay(tmp_path: Path):
    """The same layout with the band flat (print-like): the width rule refuses, as K791, and the crop is the plain cut."""
    face = rim_lr("core", 8, 4)
    img = sheet(face, "right", 5)
    it, crop = run(tmp_path / "new", img)
    _old, old_crop = run(tmp_path / "old", img, "NoSides")
    assert not any(it["cast"]["removedMm"].values()) and np.array_equal(crop, old_crop), it["cast"]
    assert it["cast"]["sides"]["right"]["reason"].endswith("crisp (a printed rim)")


def test_k793_a_thin_band_on_a_card_a_little_under_size_is_trimmed_within_the_size_tolerance(tmp_path: Path):
    face = face_of("core")   # 1042 px high, the kind 1044: a 3 px band leaves the crop under half of it over
    true = silhouette_mask("core", face.shape[1], face.shape[0])
    it, crop = run(tmp_path, sheet(face, "bottom", 3))
    assert it["cast"]["removedMm"]["bottom"] == 0.25 and it["cast"]["sides"]["bottom"]["reason"] == "trimmed", it["cast"]
    assert edge_within_1px(crop, true, "bottom")


@pytest.mark.parametrize("blur", [0.0, 1.0])
def test_k793_the_rim_all_round_records_why_no_side_is_trimmed(tmp_path: Path, blur):
    """Blurred as a scan, the rim's crisp edge is still not soft enough for shadow."""
    it, _crop = run(tmp_path, sheet(face_of("core", rim=True), "right", 0, blur=blur))
    sd = it["cast"]["sides"]
    assert not any(it["cast"]["removedMm"].values())
    assert set(sd) == {"top", "right", "bottom", "left"} and all(v["reason"].endswith("crisp (a printed rim)") and v["bandPct"] > 12 for v in sd.values()), sd


class BigCard(SilGame):
    item_sizes_mm = {**SilGame.item_sizes_mm, "card": (63.2, 89.4)}   # 1 mm longer than the card
    cast_size_tol_mm = 0.2


def graded_rim(shape: str, px: int, darker_in: bool) -> np.ndarray:
    """A printed rim ``px`` wide on all four sides graded across its width: ``darker_in`` lighter at the edge and darker
    inward (as a shadow seen from outside), else a vignette darkest at the edge."""
    f = face_of(shape)
    dist = cv2.distanceTransform(np.pad((f[:, :, 3] > 0).astype(np.uint8), 1), cv2.DIST_L1, 3)[1:-1, 1:-1]
    for d in range(1, px + 1):
        t = (d - 1) / (px - 1)
        lt, dk = np.array((45, 80, 188)), np.array((15, 30, 80))   # the band's hue, every pixel of it dark red
        f[:, :, :3][dist == d] = (lt + (dk - lt) * t) if darker_in else (dk + (lt - dk) * t)
    return f


@pytest.mark.parametrize("darker_in", [True, False])
def test_k793_a_graded_rim_on_all_four_sides_is_not_trimmed(tmp_path: Path, darker_in):
    img = sheet(graded_rim("core", 9, darker_in), "right", 0)
    it, crop = run(tmp_path / "new", img)
    _old, old_crop = run(tmp_path / "old", img, "NoSides")
    assert not any(it["cast"]["removedMm"].values()) and np.array_equal(crop, old_crop), it["cast"]
    if darker_in:   # each side as soft as a shadow: the opposite side's softness refuses it
        assert all(v["softPx"] >= cast.SOFT_MIN_PX and v["reason"].endswith("as soft (printed)") for v in it["cast"]["sides"].values()), it["cast"]


def test_k793_a_vignette_rim_and_a_one_sided_shadow_is_trimmed_on_the_shadow_side_only(tmp_path: Path):
    face = graded_rim("core", 9, False)
    true = silhouette_mask("core", face.shape[1], face.shape[0])
    it, crop = run(tmp_path, sheet(face, "right", 6, soft=True))
    rm = it["cast"]["removedMm"]
    assert rm["right"] > 0.2 and rm["left"] == rm["top"] == rm["bottom"] == 0.0, it["cast"]
    assert edge_within_1px(crop, true, "right") and edge_within_1px(crop, true, "left")


def test_k793_noise_level_steps_are_not_soft(tmp_path: Path):
    """A flat band as narrow as the rim opposite, on a sheet with scan noise: not trimmed."""
    it, _crop = run(tmp_path, sheet(rim_lr("core", 8, 4), "right", 5, noise=4.0))
    assert not any(it["cast"]["removedMm"].values()) and it["cast"]["sides"]["right"]["softPx"] < cast.SOFT_MIN_PX, it["cast"]


def test_k793_a_band_on_a_third_of_a_side_is_measured_on_its_rows(tmp_path: Path):
    face = face_of("core")
    true = silhouette_mask("core", face.shape[1], face.shape[0])
    it, crop = run(tmp_path, sheet(face, "left", 6, (0.35, 0.65)))
    sd = it["cast"]["sides"]["left"]
    assert sd["part"] and sd["reason"] == "trimmed" and abs(it["cast"]["removedMm"]["left"] - 0.51) < 0.1, it["cast"]
    assert edge_within_1px(crop, true, "left") and iou(crop, true) > 0.995


def test_k793_a_short_side_and_a_notch_on_one_side_only(tmp_path: Path):
    face = face_of("core")   # the notch on the right: the band along the short top and the long left go, the right stays
    true = silhouette_mask("core", face.shape[1], face.shape[0])
    for side in ("top", "left"):
        it, crop = run(tmp_path / side, sheet(face, side, 6))
        rm = it["cast"]["removedMm"]
        assert abs(rm[side] - 0.51) < 0.1 and sum(v > 0 for v in rm.values()) == 1, it["cast"]
        assert edge_within_1px(crop, true, side) and iou(crop, true) > 0.995


def test_k793_a_card_with_large_rounded_corners(tmp_path: Path):
    face = face_of("core")
    face[:, :, 3] = np.minimum(face[:, :, 3], rounded_alpha(face.shape[1], face.shape[0], int(7 * 300 / 25.4)))
    true = face[:, :, 3]
    a, _ = run(tmp_path / "none", sheet(face, "right", 0))
    assert not any(a["cast"]["removedMm"].values()), a["cast"]
    it, crop = run(tmp_path / "band", sheet(face, "left", 6))
    assert abs(it["cast"]["removedMm"]["left"] - 0.51) < 0.1 and iou(crop, true) > 0.99, it["cast"]


def test_k793_a_crop_under_the_kinds_size_is_refused_with_its_reason(tmp_path: Path):
    it, _crop = run(tmp_path, sheet(face_of("core"), "bottom", 6), "tests.test_cast_sides_k793:BigCard")
    assert it["kind"] == "card" and it["cast"]["removedMm"]["bottom"] == 0.0, it
    assert it["cast"]["sides"]["bottom"]["reason"] == "the crop is not larger than the kind's size", it["cast"]


def test_k793_no_sides_mode_keeps_the_plain_cut(tmp_path: Path):
    it, _crop = run(tmp_path, sheet(rim_lr("core", 8, 4), "right", 6, soft=True), "NoSides")
    assert "cast" not in it and it["castSkipped"].startswith("cast_for(card): no")


def test_k793_a_raw_of_another_size_is_ignored():
    crop = np.zeros((300, 200, 4), np.uint8)
    crop[:, :190] = (200, 215, 225, 255)
    crop[:, 184:190, :3] = BAND_BGR
    raw = np.full((10, 10, 3), 255, np.uint8)
    a, ra = cast.trim_sides(crop, 300 / 25.4, None, None, None, raw)
    b, rb = cast.trim_sides(crop, 300 / 25.4)
    assert np.array_equal(a, b) and ra == rb and ra["removedMm"]["right"] > 0.4
