import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from scanpipe import detect
from scanpipe.__main__ import main
from scanpipe.pipeline import params_for
from scanpipe.plugins import get
from tests.synth import sheet

DPI = 200


def test_dark_edged_tile_on_black_paper_is_one_item_of_the_right_size():
    img, (w, h) = sheet(DPI)
    det = detect.detect(img, params_for(get("tests.fake_game:FakeTiles"), DPI))
    assert det.background.dark and det.background.t_faint > 0
    assert len(det.regions) == 1, [r.to_json() for r in det.regions]
    r = det.regions[0]
    assert abs(r.h - w) <= 0.01 * w and abs(r.w - h) <= 0.01 * h, (r.w, r.h, w, h)
    assert not det.rejected


def test_without_the_faint_cue_the_same_tile_breaks_up():
    """The reason for the cue: per-pixel colour alone loses the black print at the tile's edges."""
    img, (w, h) = sheet(DPI)
    params = params_for(get("tests.fake_game:FakeTiles"), DPI)
    params.dark_l = -1.0  # never dark: the old behaviour
    det = detect.detect(img, params)
    ok = [r for r in det.regions if abs(r.h - w) <= 0.01 * w and abs(r.w - h) <= 0.01 * h]
    assert not ok


def test_light_backing_is_not_dark():
    lid = np.full((900, 1300, 3), 235, np.uint8)
    cv2.rectangle(lid, (300, 250), (1000, 650), (40, 90, 160), cv2.FILLED)
    det = detect.detect(lid)
    assert not det.background.dark and len(det.regions) == 1


def test_cli_writes_upright_named_crops(tmp_path: Path):
    for i, pink_right in enumerate((True, False)):
        img, _ = sheet(DPI, angle=-1.0 if i else 2.0, pink_right=pink_right, seed=i + 3)
        Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).save(tmp_path / f"s{i}.tif", dpi=(DPI, DPI))
    out = tmp_path / "out"
    code = main(["scan", "--plugin", "tests.fake_game:FakeTiles", "--out", str(out), str(tmp_path / "s0.tif"),
                 str(tmp_path / "s1.tif"), "--name", "base-A-upper", "--name", "base-A-lower"])
    assert code == 0
    for name in ("base-A-upper", "base-A-lower"):
        crop = cv2.imread(str(out / f"{name}.jpg"))
        assert crop.shape[1] > crop.shape[0]  # landscape
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        pink = (hsv[..., 0] >= 150) & (hsv[..., 1] > 120)
        q = crop.shape[1] // 5
        assert pink[:, -q:].mean() > 5 * pink[:, :q].mean()  # pink squares on the right: upright
    man = json.loads((tmp_path / "scan-review" / "s0.json").read_text(encoding="utf-8"))
    assert man["items"][0]["kind"] == "base" and man["background"]["dark"]
