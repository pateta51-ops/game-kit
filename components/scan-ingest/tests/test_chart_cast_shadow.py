"""A Bot State card's cast shadow on a magenta backing (the imperium plug-in's ``chart`` kind, 80 x 120 mm, in
``cast_kinds`` like the standard card; scanpipe/cast.py, README *Plug-ins -> Imperium*), on synthetic sheets (original
shapes only): the dark red band it casts along the sides away from the lamp is removed and its edge print kept, a light
tab at a curled corner on a shadow side is kept whole rather than clipped to the fitted edge, and a chart that casts no
shadow is cut as before (nothing removed, its size the plain cut-out's)."""
import json
from pathlib import Path

import cv2
import numpy as np

from scanpipe.__main__ import main
from tests.fake_game import FakeGame
from tests.synth import magenta_sheet, rounded_alpha
from tests.test_cast_shadow import DPI, PX, crop_of, dark_red_on_edge, first_opaque_from_right, save, with_cast_shadow

# (short, long): the Bot State card's crop once its shadow is off, measured on the 52 Bot State faces of the owner's
# sheets 1-7 (80.3-80.6 x 120.4-120.9 mm, median 80.4 x 120.7). A literal, not the plug-in's size, so that a plug-in
# size further than cast_size_tol_mm from it (80 x 120) makes the fitted sides untrusted and fails these tests
CHART_MM = (80.4, 120.7)
RADIUS_MM = 3.0                                     # the corner radius (median 3.0 on their lit corners)
BED_MM = (130.0, 160.0)


def chart(tab_px: int = 0) -> np.ndarray:
    """A Bot State card, portrait as it lies (BGRA): black print to its edges, a light panel and a grid of coloured
    boxes inside, and a light strip along its left (lit) edge. With ``tab_px``, the card's top-right corner is curled:
    over the top 12 % of its right side the light card edge reaches ``tab_px`` further out than the rest of the side
    (a tab of light card, as a lifted corner images)."""
    w, h = int(round(CHART_MM[0] * PX)), int(round(CHART_MM[1] * PX))
    img = np.full((h, w + tab_px, 3), 20, np.uint8)
    cv2.rectangle(img, (int(w * 0.25), int(h * 0.15)), (int(w * 0.75), int(h * 0.35)), (225, 230, 230), -1)
    colours = [(40, 200, 240), (60, 220, 90), (30, 120, 240), (230, 200, 120)]
    for r in range(3):
        for c in range(3):
            x0, y0 = int(w * (0.15 + 0.25 * c)), int(h * (0.45 + 0.15 * r))
            cv2.rectangle(img, (x0, y0), (x0 + int(w * 0.18), y0 + int(h * 0.1)), colours[(r + c) % 4], -1)
    img[:, : int(round(0.8 * PX))] = (215, 220, 220)
    alpha = np.zeros((h, w + tab_px), np.uint8)
    alpha[:, :w] = rounded_alpha(w, h, int(round(RADIUS_MM * PX)))
    if tab_px:
        y1 = int(h * 0.12)
        tab = rounded_alpha(w + tab_px, h, int(round(RADIUS_MM * PX)))[:y1, w:]
        alpha[:y1, w:] = tab
        img[:y1, w - 6:] = (230, 235, 235)          # the tab and the card's edge next to it: light card
    return np.dstack([img, alpha])


def chart_sheet(face: np.ndarray, right_mm: float = 1.0, top_mm: float = 0.5) -> np.ndarray:
    """``face`` pasted on whole pixels in the middle of a magenta sheet, with the shadow it casts to the right and
    top."""
    sheet = magenta_sheet([], DPI, rim_px=0, bed_mm=BED_MM)
    h, w = face.shape[:2]
    y0, x0 = (sheet.shape[0] - h) // 2, (sheet.shape[1] - w) // 2
    a = face[:, :, 3:4].astype(np.float32) / 255.0
    patch = sheet[y0:y0 + h, x0:x0 + w]
    sheet[y0:y0 + h, x0:x0 + w] = (patch * (1 - a) + face[:, :, :3] * a).clip(0, 255).astype(np.uint8)
    if right_mm or top_mm:
        sheet = with_cast_shadow(sheet, right_mm, top_mm)
    return sheet


def scan(tmp_path: Path, sheet: np.ndarray) -> dict:
    tmp_path.mkdir(parents=True, exist_ok=True)
    main(["scan", "--plugin", "tests.fake_game:FakeGame", "--out", str(tmp_path / "out"), str(save(sheet, tmp_path / "c.tif")),
          "--name", "chart", "--turn", "0", "--tone", "none"])
    (it,) = json.loads((tmp_path / "scan-review" / "c.json").read_text(encoding="utf-8"))["items"]
    return it


def test_a_bot_state_card_loses_its_cast_shadow_and_keeps_its_print(tmp_path: Path):
    it = scan(tmp_path, chart_sheet(chart()))
    assert it["kind"] == "chart" and "CAST_SHADOW_KEPT" not in it["flags"], it["flags"]
    w, h = it["sizeMm"]
    assert abs(w - CHART_MM[0]) < 0.2 and abs(h - CHART_MM[1]) < 0.2, it["sizeMm"]   # the shadow (+1.0, +0.5) is gone
    alpha, bgr, lab = crop_of(it)
    assert dark_red_on_edge(alpha, lab) < 0.02                               # no dark red band along the edge
    hh, ww = alpha.shape
    rows = slice(int(hh * 0.2), int(hh * 0.8))
    # the black print reaches the right (shadow) edge: opaque and dark 3 px in, along the whole side
    assert (alpha[rows, ww - 4] == 255).mean() > 0.98 and lab[rows, ww - 4, 0].mean() < 60
    cols = slice(int(ww * 0.2), int(ww * 0.8))
    assert (alpha[3, cols] == 255).mean() > 0.98 and lab[3, cols, 0].mean() < 60       # and the top one
    # the light strip on the lit left edge is kept to the edge
    assert (alpha[rows, 2] == 255).mean() > 0.98 and lab[rows, 2, 0].mean() > 200
    assert it["cast"]["removedMm"]["right"] > 0.7 and it["cast"]["removedMm"]["top"] > 0.3
    assert it["cast"]["removedMm"]["left"] == 0.0 and it["cast"]["removedMm"]["bottom"] == 0.0


def test_a_curled_corners_light_tab_on_a_shadow_side_is_kept(tmp_path: Path):
    tab = 6
    it = scan(tmp_path, chart_sheet(chart(tab_px=tab)))
    assert it["kind"] == "chart" and "CAST_SHADOW_KEPT" not in it["flags"], it["flags"]
    assert it["cast"]["removedMm"]["right"] > 0.7                       # the side's shadow is still cut
    alpha, bgr, lab = crop_of(it)
    hh, ww = alpha.shape
    # the tab (the top 12 % of the right side, below the rounded corner) is opaque and light right out to its edge:
    # the fitted edge, which most of the side supports, runs `tab` px inside it, and the band's end keeps it
    rows_tab = range(int(hh * 0.04), int(hh * 0.10))
    seen = np.array([first_opaque_from_right(alpha, y) for y in rows_tab])
    assert seen.max() <= 2, seen.max()
    assert lab[list(rows_tab), ww - 3, 0].mean() > 150
    # all of it: the light run in from the crop's edge is the tab and the 6 px of light edge inside it (a crop clipped
    # to the fitted edge keeps only those 6 px)
    light = [2 + int(np.argmin(lab[y, ww - 3::-1, 0] > 150)) for y in rows_tab]
    assert np.median(light) >= tab + 6 - 2, np.median(light)
    # below the tab the crop's border lies `tab` px outside the side's edge (the border envelops the tab, straight):
    # the side's black print is there, unbent and uncut, with see-through only outside it
    rows = range(int(hh * 0.25), int(hh * 0.9))
    seen = np.array([first_opaque_from_right(alpha, y) for y in rows])
    assert np.abs(seen - np.median(seen)).max() <= 1 and abs(np.median(seen) - tab) <= 2, (seen.min(), seen.max())
    x = ww - 1 - int(np.median(seen)) - 3
    assert (alpha[list(rows), x] == 255).mean() > 0.98 and lab[list(rows), x, 0].mean() < 60
    assert dark_red_on_edge(alpha, lab) < 0.05


def test_a_bot_state_card_without_shadow_is_cut_as_before(tmp_path: Path, monkeypatch):
    sheet = chart_sheet(chart(), right_mm=0.0, top_mm=0.0)
    it = scan(tmp_path / "now", sheet)
    assert it["kind"] == "chart" and "CAST_SHADOW_KEPT" not in it["flags"], it["flags"]
    assert all(v == 0.0 for v in it["cast"]["removedMm"].values()), it["cast"]
    # the plain cut-out, as before the chart was a cast kind
    monkeypatch.setattr(FakeGame, "cast_kinds", {k: v for k, v in FakeGame.cast_kinds.items() if k != "chart"})
    old = scan(tmp_path / "before", sheet)
    assert old["kind"] == "chart" and "cast" not in old
    alpha, bgr, lab = crop_of(it)
    a0, bgr0, lab0 = crop_of(old)
    assert abs(alpha.shape[0] - a0.shape[0]) <= 1 and abs(alpha.shape[1] - a0.shape[1]) <= 1, (alpha.shape, a0.shape)
    assert abs(it["sizeMm"][0] - old["sizeMm"][0]) <= 0.15 and abs(it["sizeMm"][1] - old["sizeMm"][1]) <= 0.15   # 1 px
    # the same pixels: opaque to the edge along every side, the print where the plain crop has it
    hh, ww = min(alpha.shape[0], a0.shape[0]), min(alpha.shape[1], a0.shape[1])
    mid_r, mid_c = slice(int(hh * 0.1), int(hh * 0.9)), slice(int(ww * 0.1), int(ww * 0.9))
    for a in (alpha, a0):
        h_, w_ = a.shape
        for strip in (a[mid_r, 1], a[mid_r, w_ - 2], a[1, mid_c], a[h_ - 2, mid_c]):
            assert (strip == 255).mean() > 0.98
    diff = np.abs(lab[mid_r, mid_c, 0] - lab0[mid_r, mid_c, 0])
    assert np.median(diff) < 2 and (diff > 40).mean() < 0.01, (np.median(diff), (diff > 40).mean())
