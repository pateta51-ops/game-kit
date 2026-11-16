"""Magenta backing (scanpipe/key.py, scanpipe/tone.py; README, *Magenta backing*): every item is cut out by colour, the
rim the backing reflects off its cut side is dropped, the crop is tightened to the item and written as a PNG with
transparency, and the scanner's tone curve is applied. White lids and black paper are left as before."""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from scanpipe import tone
from scanpipe.__main__ import main
from tests.synth import MAGENTA_BGR, dark_tile, magenta_sheet, rounded_alpha, sheet

DPI = 200
PX = DPI / 25.4
CARD_MM = (80.0, 120.0)
PINKISH_BGR = (130, 80, 230)  # print inside the card close to the backing: must stay opaque
RED_BGR = (60, 40, 200)       # red print running to the card's edge: must stay card


def card(rng: np.random.Generator, centre_patch: bool = False) -> np.ndarray:
    """A light card with rounded corners (BGRA), a pinkish patch, a red block on its left edge and, if asked, a patch of
    the backing's own colour on its centre."""
    w, h = int(round(CARD_MM[0] * PX)), int(round(CARD_MM[1] * PX))
    img = np.full((h, w, 3), (215, 220, 224), np.uint8)
    cv2.rectangle(img, (int(w * .1), int(h * .08)), (int(w * .7), int(h * .5)), (70, 110, 60), -1)
    cv2.rectangle(img, (int(w * .3), int(h * .2)), (int(w * .5), int(h * .3)), PINKISH_BGR, -1)
    cv2.rectangle(img, (0, int(h * .6)), (int(w * .18), int(h * .8)), RED_BGR, -1)
    if centre_patch:
        cv2.rectangle(img, (int(w * .42), int(h * .45)), (int(w * .58), int(h * .55)), MAGENTA_BGR, -1)
    img = np.clip(img.astype(np.int16) + rng.normal(0, 2, img.shape).astype(np.int16), 0, 255).astype(np.uint8)
    return np.dstack([img, rounded_alpha(w, h, int(3 * PX))])


def save(img: np.ndarray, path: Path) -> Path:
    Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).save(path, dpi=(DPI, DPI))
    return path


def run(tmp_path: Path, img: np.ndarray, *extra: str) -> tuple[Path, dict]:
    scan = save(img, tmp_path / "s.tif")
    out = tmp_path / "out"
    main(["scan", "--plugin", "tests.fake_game:FakeTiles", "--out", str(out), str(scan), *extra])
    return out, json.loads((tmp_path / "scan-review" / "s.json").read_text(encoding="utf-8"))


def two_cards(centre_patch: bool = False) -> np.ndarray:
    rng = np.random.default_rng(7)
    return magenta_sheet([(card(rng, centre_patch), 0.27, 0.5, 4.0), (card(rng, centre_patch), 0.73, 0.5, -7.0)],
                         DPI, bed_mm=(230.0, 150.0))


def test_magenta_scan_is_cut_out_with_alpha_tightened_and_toned(tmp_path: Path):
    out, m = run(tmp_path, two_cards())
    assert m["background"]["keyed"] is True and m["tone"] == tone.DEFAULT_KEYED_TONE
    assert len(m["items"]) == 2 and not m["rejected"]
    for it in m["items"]:
        assert it["keyed"] is True and "KEY_FAILED" not in it["flags"] and it["file"].endswith(".png")
        # the rim is not part of the card: the item measures the card, not the card plus its rim
        short, long_ = sorted(it["sizeMm"])
        assert abs(short - CARD_MM[0]) < 0.5 and abs(long_ - CARD_MM[1]) < 0.5, it["sizeMm"]
        crop = cv2.imread(it["file"], cv2.IMREAD_UNCHANGED)
        assert crop.shape[2] == 4
        alpha, bgr = crop[:, :, 3], crop[:, :, :3].astype(int)
        assert alpha[1, 1] < 30 and alpha[-2, -2] < 30          # the rounded corners are see-through
        assert (alpha > 250).mean() > 0.95                        # the rest is card
        # the tone curve was applied: the card's light grey (215-224) is lifted towards white
        h, w = alpha.shape
        assert bgr[int(h * 0.9), w // 2].min() > 225
        # backing-like print inside stays opaque, and so does red print on the edge
        assert alpha[int(h * 0.25), int(w * 0.4)] == 255
        assert alpha[int(h * 0.7), 2:int(w * 0.15)].min() > 240   # past the soft 1-px edge
        # no backing-coloured fringe left in the soft edge
        edge = (alpha > 40) & (alpha < 215)
        mag = np.all(np.abs(bgr - np.array(MAGENTA_BGR)) < 30, axis=2)
        assert (edge & mag).sum() < 0.05 * max(1, edge.sum())


def test_a_card_whose_centre_is_the_backing_colour_is_still_cut_out(tmp_path: Path):
    _, m = run(tmp_path, two_cards(centre_patch=True), "--tone", "none")
    assert "tone" not in m
    for it in m["items"]:
        assert it["keyed"] is True and "KEY_FAILED" not in it["flags"]
        short, long_ = sorted(it["sizeMm"])
        assert abs(short - CARD_MM[0]) < 0.5 and abs(long_ - CARD_MM[1]) < 0.5, it["sizeMm"]
        alpha = cv2.imread(it["file"], cv2.IMREAD_UNCHANGED)[:, :, 3]
        assert alpha[alpha.shape[0] // 2, alpha.shape[1] // 2] == 255   # the patch is card, not a hole


def test_a_known_tile_on_magenta_is_classified_and_turned_upright(tmp_path: Path):
    """The plug-in reads its orientation from pink print; the magenta left under the crop's transparent corners must
    not count as print."""
    w, h = int(163.0 * PX), int(88.5 * PX)
    for pink_right in (True, False):
        tile = np.dstack([dark_tile(w, h, pink_right), rounded_alpha(w, h, int(2 * PX))])
        sub = tmp_path / str(pink_right)
        sub.mkdir()
        _, m = run(sub, magenta_sheet([(tile, 0.5, 0.5, 2.0)], DPI))
        it = m["items"][0]
        assert it["kind"] == "base" and it["keyed"] and not it["flags"], it
        crop = cv2.imread(it["file"], cv2.IMREAD_UNCHANGED)
        assert crop.shape[1] > crop.shape[0]   # landscape
        hsv = cv2.cvtColor(crop[:, :, :3], cv2.COLOR_BGR2HSV)
        pink = (hsv[..., 0] >= 150) & (hsv[..., 1] > 120) & (crop[:, :, 3] == 255)
        q = crop.shape[1] // 5
        assert pink[:, -q:].mean() > 5 * pink[:, :q].mean()   # pink squares on the right: upright


def test_black_paper_and_white_lid_are_not_keyed(tmp_path: Path):
    img, _ = sheet(DPI)
    out, m = run(tmp_path, img)
    assert "keyed" not in m["background"] and "tone" not in m
    assert m["items"][0]["file"].endswith(".jpg") and "keyed" not in m["items"][0]
    lid = np.full((900, 1300, 3), 235, np.uint8)
    cv2.rectangle(lid, (300, 250), (1000, 650), (40, 90, 160), cv2.FILLED)
    sub = tmp_path / "lid"
    sub.mkdir()
    _, m = run(sub, lid)
    assert "keyed" not in m["background"] and "tone" not in m


def test_tone_curves_are_complete_and_rising():
    assert tone.DEFAULT_KEYED_TONE in tone.names()
    for name in tone.names():
        lut = tone.lut(name)
        assert lut.shape == (256, 1, 3) and (np.diff(lut[:, 0, :].astype(int), axis=0) >= 0).all()
    assert tone.resolve("auto", keyed=False) is None and tone.resolve("none", keyed=True) is None


def test_pink_print_at_the_edge_is_kept_not_smeared(tmp_path: Path):
    # owner's Shangri-La card, 2026-10-15: pink halftone runs to the cut; only the sheet's tint at the very edge and the
    # darker rim may be repainted, not the print (repainting it copied one pixel outward into streaks)
    rng = np.random.default_rng(3)
    face = card(rng)
    h, w = face.shape[:2]
    light_pink = (np.array(MAGENTA_BGR, float) * 0.55 + 255 * 0.45).astype(np.uint8)   # backing hue, lighter
    yy, xx = np.mgrid[0:h, 0:w]
    dots = ((yy + xx) % 2 == 0) & (xx > w * 0.8) & (yy > h * 0.3) & (yy < h * 0.5)
    face[:, :, :3][dots] = light_pink
    face[:, :, :3][((yy + xx) % 2 == 1) & (xx > w * 0.8) & (yy > h * 0.3) & (yy < h * 0.5)] = (240, 240, 245)
    out, m = run(tmp_path, magenta_sheet([(face, 0.5, 0.5, 0.0)], DPI, bed_mm=(140.0, 150.0)))
    crop = cv2.imread(m["items"][0]["file"], cv2.IMREAD_UNCHANGED)
    alpha, g = crop[:, :, 3], crop[:, :, :3].astype(int).sum(axis=2)
    ch, cw = alpha.shape
    rows = range(int(ch * 0.33), int(ch * 0.47))
    strips = []
    for y in rows:
        xs = np.where(alpha[y] == 255)[0]
        left, right = g[y, xs[0]:xs[0] + 13][::-1], g[y, xs[-1] - 12:xs[-1] + 1]
        strips.append(right if right.std() > left.std() else left)   # the checkerboard side, ending at the edge
    v = np.array(strips)
    thr = (v[:, :8].min() + v[:, :8].max()) / 2                    # between a pink dot and a white one, well inside
    for k in (2, 3, 4):                                              # 1-3 px in from the edge: pink dots survive
        assert (v[:, -k] < thr).mean() > 0.4, (k, (v < thr).mean(axis=0).round(2).tolist())
