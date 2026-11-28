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
from tests.test_cast_sides import BAND_BGR, edge_within_1px, face_of, iou
from tests.test_cast_shadow import crisp_sheet, save
DEEP, LIGHT = 0.6 * np.array(BAND_BGR), 1.6 * np.array(BAND_BGR)   # the band's hue (the plain cut keeps it), darkest at the card


def sheet(face: np.ndarray, side: str, px: int, part=(0.0, 1.0), soft: bool = False, blur: float = 0.0) -> np.ndarray:
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
    return cv2.GaussianBlur(s, (0, 0), blur) if blur > 0 else s


def run(tmp_path: Path, img: np.ndarray, plugin: str = "SilGame") -> tuple[dict, np.ndarray]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    with contextlib.redirect_stdout(io.StringIO()):
        main(["scan", "--plugin", f"tests.test_cast_sides:{plugin}", "--out", str(tmp_path / "out"),
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
    face = rim_lr("core", 8, 4)   # the right rim plus a 5 px shadow is about as wide as the left rim
    true = silhouette_mask("core", face.shape[1], face.shape[0])
    it, crop = run(tmp_path, sheet(face, "right", 5, soft=True))
    sd = it["cast"]["sides"]
    assert sd["right"]["reason"] == "trimmed (soft)" and abs(sd["right"]["runPx"] - sd["right"]["oppositePx"]) < 3, sd
    assert sd["left"]["reason"].startswith("crisp") and sd["top"]["reason"] == "no band", sd
    rm = it["cast"]["removedMm"]
    assert abs(rm["right"] * 300 / 25.4 - 5) < 1 and rm["left"] == rm["top"] == rm["bottom"] == 0.0, rm
    assert edge_within_1px(crop, true, "right") and edge_within_1px(crop, true, "left")


def test_k793_a_flat_band_as_narrow_and_a_flat_rim_stay(tmp_path: Path):
    """The same layout with the band flat (print-like): the width rule refuses, as K791, and the crop is the plain cut."""
    face = rim_lr("core", 8, 4)
    img = sheet(face, "right", 5)
    it, crop = run(tmp_path / "new", img)
    _old, old_crop = run(tmp_path / "old", img, "NoSides")
    assert not any(it["cast"]["removedMm"].values()) and np.array_equal(crop, old_crop), it["cast"]
    assert it["cast"]["sides"]["right"]["reason"].startswith("crisp")


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
    assert set(sd) == {"top", "right", "bottom", "left"} and all(v["reason"].startswith("crisp") and v["bandPct"] > 12 for v in sd.values()), sd
