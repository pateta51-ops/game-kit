"""Imperium tokens on magenta (plug-in `token*` kinds, `printed_edge_kinds`; scanpipe/key.py ``neutral_shadow``): the
dark-red shadow a thick token casts on one side is removed, its own black edge is kept, and a round token can be turned
by any angle. Synthetic shapes only."""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from scanpipe.__main__ import main
from scanpipe.detect import rotate_any
from tests.synth import magenta_sheet

DPI = 300
PX = DPI / 25.4
SHADOW_BGR = (45, 25, 95)     # the dark-red cut side and shadow on the side away from the lamp


def token(diameter_mm: float = 20.0, shadow_mm: float = 1.5) -> np.ndarray:
    """A round token (BGRA): a black ring printed to its edge around a red centre with a white bar, and its dark-red
    shadow showing below it."""
    d, s = int(round(diameter_mm * PX)), int(round(shadow_mm * PX))
    img = np.zeros((d + s + 4, d + 4, 4), np.uint8)
    c, r = (d // 2 + 2, d // 2 + 2), d // 2
    cv2.circle(img, (c[0], c[1] + s), r, (*SHADOW_BGR, 255), -1)
    cv2.circle(img, c, r, (25, 25, 25, 255), -1)
    cv2.circle(img, c, int(r * 0.75), (40, 30, 150, 255), -1)
    cv2.rectangle(img, (c[0] - r // 6, c[1] - r // 2), (c[0] + r // 6, c[1] + r // 2), (245, 245, 245, 255), -1)
    return img


def run(tmp_path: Path, *extra: str) -> tuple[Path, dict]:
    sheet = magenta_sheet([(token(), 0.3, 0.5, 0.0), (token(40.0, 2.0), 0.7, 0.5, 0.0)], DPI, bed_mm=(120.0, 70.0))
    scan = tmp_path / "t.tif"
    Image.fromarray(cv2.cvtColor(sheet, cv2.COLOR_BGR2RGB)).save(scan, dpi=(DPI, DPI))
    out = tmp_path / "out"
    main(["scan", "--plugin", "tests.fake_game:FakeGame", "--out", str(out), str(scan), *extra])
    return out, json.loads((tmp_path / "scan-review" / "t.json").read_text(encoding="utf-8"))


def test_the_shadow_is_removed_and_the_black_edge_kept(tmp_path: Path):
    out, m = run(tmp_path, "--turn", "0", "--turn", "0")
    kinds = sorted(it["kind"] for it in m["items"])
    assert kinds == ["token20", "token40"], m["items"]
    for it in m["items"]:
        want = 20.0 if it["kind"] == "token20" else 39.8
        w, h = it["sizeMm"]
        assert abs(w - want) < 0.6 and abs(h - want) < 0.6, it   # round again: no shadow, and the ring not eaten
        crop = cv2.imread(it["file"], cv2.IMREAD_UNCHANGED)
        a = crop[..., 3] > 128
        lab = cv2.cvtColor(crop[..., :3], cv2.COLOR_BGR2LAB).astype(float)
        edge = a & (cv2.erode(a.astype(np.uint8), np.ones((5, 5), np.uint8)) == 0)
        chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
        assert np.median(chroma[edge]) < 15, it          # the edge is the black ring, not dark-red shadow


def test_a_round_token_turns_by_any_angle():
    img = token(shadow_mm=0.0)
    turned = rotate_any(img, 45)
    assert turned.shape[2] == 4
    assert turned.shape[0] >= img.shape[0] and turned.shape[1] >= img.shape[1]
    # the piece is whole: its opaque area is kept (within interpolation)
    assert abs(int((turned[..., 3] > 128).sum()) - int((img[..., 3] > 128).sum())) < 0.02 * (img[..., 3] > 128).sum()
    # a clockwise turn: the white bar (vertical) now runs from top right to bottom left
    w = (turned[..., :3].min(axis=2) > 200) & (turned[..., 3] > 128)
    ys, xs = np.nonzero(w)
    assert np.corrcoef(xs, ys)[0, 1] < -0.8
    # and the same sense as the quarter turns: 90 by any angle equals OpenCV's clockwise quarter turn
    odd = np.zeros((30, 50, 4), np.uint8); odd[2:10, 2:20] = 255
    assert np.array_equal(rotate_any(odd, 90)[..., 3] > 128, cv2.rotate(odd, cv2.ROTATE_90_CLOCKWISE)[..., 3] > 128)


def test_the_near_black_cut_side_of_a_light_token_is_removed(tmp_path: Path):
    """A light square token (a Slot marker) shows its cut side as a near-black line on the side away from the lamp,
    then the dark-red shadow: both go, the token's light edge stays."""
    d, cut, s = int(round(20.0 * PX)), int(round(0.5 * PX)), int(round(1.2 * PX))
    img = np.zeros((d + cut + s + 4, d + 4, 4), np.uint8)
    cv2.rectangle(img, (2, 2 + cut), (d + 1, d + 1 + cut + s), (*SHADOW_BGR, 255), -1)
    cv2.rectangle(img, (2, 2 + cut), (d + 1, d + 1 + cut), (20, 20, 20, 255), -1)
    cv2.rectangle(img, (2, 2), (d + 1, d + 1), (200, 205, 210, 255), -1)
    cv2.putText(img, "3", (d // 3, 2 * d // 3), cv2.FONT_HERSHEY_SIMPLEX, d / 60, (30, 30, 30, 255), max(2, d // 20))
    sheet = magenta_sheet([(img, 0.5, 0.5, 0.0)], DPI, bed_mm=(60.0, 60.0))
    scan = tmp_path / "s.tif"
    Image.fromarray(cv2.cvtColor(sheet, cv2.COLOR_BGR2RGB)).save(scan, dpi=(DPI, DPI))
    main(["scan", "--plugin", "tests.fake_game:FakeGame", "--out", str(tmp_path / "out"), str(scan), "--turn", "0"])
    it = json.loads((tmp_path / "scan-review" / "s.json").read_text(encoding="utf-8"))["items"][0]
    assert it["kind"] == "token20" and "SHADOW_KEPT_CHECK_CROP" not in it["flags"], it
    assert max(abs(v - 20.0) for v in it["sizeMm"]) < 0.6, it
    crop = cv2.imread(it["file"], cv2.IMREAD_UNCHANGED)
    a = crop[..., 3] > 128
    L = cv2.cvtColor(crop[..., :3], cv2.COLOR_BGR2LAB)[..., 0]
    edge = a & (cv2.erode(a.astype(np.uint8), np.ones((5, 5), np.uint8)) == 0)
    assert np.percentile(L[edge], 10) > 90, it   # no near-black line left along any side
