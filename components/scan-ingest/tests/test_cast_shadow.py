"""A card's cast shadow on a magenta backing (scanpipe/cast.py, key.key_region ``cast_mm``; README, *Magenta backing*)
on synthetic sheets (original shapes only): the dark red band a card casts along the sides away from the lamp is
removed, its dark edge print is kept, dark crimson art at the edge on the shadow side (the shadow's own colour) is not
bitten into, the near-black floor of a lifted card's shadow goes too, and a side whose fit cannot be trusted keeps its
outer edge and is flagged rather than bitten.

The first three tests fail on the plain cut-out (the shadow stays, the card measures too large) and the crimson one
also on a per-pixel colour rule (attempt 1 of 2026-10-15, which bit up to 2 mm into such art)."""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from scanpipe.__main__ import main
from tests.synth import MAGENTA_BGR, magenta_sheet, rounded_alpha

DPI = 300
PX = DPI / 25.4
CARD_MM = (63.2, 88.3)
RADIUS_MM = 3.0
SHADOW_RIGHT_MM = 1.0
SHADOW_TOP_MM = 0.4


def lab_bgr(L: float, a: float, b: float) -> np.ndarray:
    """One OpenCV Lab colour (a, b around 0) as BGR (float)."""
    px = np.array([[[L, a + 128, b + 128]]], np.float32).clip(0, 255).astype(np.uint8)
    return cv2.cvtColor(px, cv2.COLOR_LAB2BGR)[0, 0].astype(np.float32)


def card(crimson: str = "part", halftone_left: bool = True) -> np.ndarray:
    """A card whose black print runs to its edges (BGRA, portrait), with a light panel inside, a halftone of red and
    brown print along its left edge, and dark crimson art, the shadow's own colour, along its right edge: over the
    middle third of the edge ("part"), 1.5 mm deep; over the whole edge ("whole"); or none."""
    w, h = int(round(CARD_MM[0] * PX)), int(round(CARD_MM[1] * PX))
    img = np.full((h, w, 3), 20, np.uint8)
    cv2.rectangle(img, (int(w * 0.3), int(h * 0.3)), (int(w * 0.7), int(h * 0.6)), (225, 230, 230), -1)
    if halftone_left:
        reds = [lab_bgr(105, 33, 25), lab_bgr(85, 28, 22), lab_bgr(115, 38, 30), lab_bgr(100, 30, 18)]
        for y in range(int(h * 0.2), int(h * 0.8)):
            for x in range(0, int(w * 0.15)):
                img[y, x] = reds[(x // 2 + y // 2) % 4]
    if crimson != "none":
        deep = int(round(1.5 * PX))
        y0, y1 = (int(h / 3), int(2 * h / 3)) if crimson == "part" else (0, h)
        img[y0:y1, w - deep:] = lab_bgr(42, 24, 5)      # dark crimson, the hue of the backing in shadow, uniform
    return np.dstack([img, rounded_alpha(w, h, int(round(RADIUS_MM * PX)))])


def with_cast_shadow(sheet: np.ndarray, right_mm: float, top_mm: float, umbra_mm: float = 0.0,
                     deep: tuple = (45, 15, 4)) -> np.ndarray:
    """The shadow a card casts on the magenta: along its right and top edges, dark red at the card (``deep``, Lab;
    45, 15, 4 on the owner's scans) lightening into the sheet, after ``umbra_mm`` of a near-black floor (Lab 44, 8, 2)
    on a lifted card."""
    mag = np.all(np.abs(sheet.astype(int) - MAGENTA_BGR) < 40, axis=2)
    out = sheet.astype(np.float32)
    item = (~mag).astype(np.uint8)
    done = ~mag
    deep, light, floor = lab_bgr(*deep), lab_bgr(124, 58, 15), lab_bgr(44, 8, 2)
    n_u = int(round(umbra_mm * PX))
    n_r, n_t = int(round(right_mm * PX)) + n_u, int(round(top_mm * PX)) + n_u
    for k in range(1, max(n_r, n_t) + 1):
        moved = np.zeros_like(item)
        if k <= n_r:
            moved[:, k:] |= item[:, :-k]       # shifted right
        if k <= n_t:
            moved[:-k, :] |= item[k:, :]       # shifted up
        band = (moved > 0) & ~done
        if k <= n_u:
            out[band] = floor
        else:
            t = (k - n_u - 1) / max(1, max(n_r, n_t) - n_u - 1)
            out[band] = deep * (1 - t) + light * t
        done |= band
    return out.clip(0, 255).astype(np.uint8)


def save(img: np.ndarray, path: Path) -> Path:
    Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).save(path, dpi=(DPI, DPI))
    return path


def scan(tmp_path: Path, sheet: np.ndarray) -> dict:
    main(["scan", "--plugin", "tests.fake_game:FakeGame", "--out", str(tmp_path / "out"), str(save(sheet, tmp_path / "d.tif")),
          "--name", "card", "--turn", "0", "--tone", "none"])
    (it,) = json.loads((tmp_path / "scan-review" / "d.json").read_text(encoding="utf-8"))["items"]
    return it


def sheet_with(face: np.ndarray, umbra_mm: float = 0.0) -> np.ndarray:
    # no reflected rim: a card is too thin to show one (the owner's scans show none along a card's lit sides)
    return with_cast_shadow(magenta_sheet([(face, 0.5, 0.5, 0.0)], DPI, rim_px=0, bed_mm=(110.0, 130.0)),
                            SHADOW_RIGHT_MM, SHADOW_TOP_MM, umbra_mm)


def crisp_sheet(face: np.ndarray, umbra_mm: float = 0.0, right_mm: float = SHADOW_RIGHT_MM,
                top_mm: float = SHADOW_TOP_MM, deep: tuple = (45, 15, 4), blur: float = 0.0) -> np.ndarray:
    """``sheet_with`` but the face pasted on whole pixels, so its edge pixels are the card's own (no blend of card and
    sheet, which at a rounded corner would put a half-sheet pixel next to the deep shadow, a thing no scan shows):
    what the edge looks like matters to the tests of the band's end and of the edge colours. ``blur`` (px) images the
    whole sheet a little soft afterwards, shadow included, as a scan is."""
    sheet = magenta_sheet([], DPI, rim_px=0, bed_mm=(110.0, 130.0))
    h, w = face.shape[:2]
    y0, x0 = (sheet.shape[0] - h) // 2, (sheet.shape[1] - w) // 2
    a = face[:, :, 3:4].astype(np.float32) / 255.0
    sheet[y0:y0 + h, x0:x0 + w] = (sheet[y0:y0 + h, x0:x0 + w] * (1 - a) + face[:, :, :3] * a).clip(0, 255).astype(np.uint8)
    out = with_cast_shadow(sheet, right_mm, top_mm, umbra_mm, deep)
    return cv2.GaussianBlur(out, (0, 0), blur) if blur > 0 else out


def crop_of(it: dict) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    crop = cv2.imread(it["file"], cv2.IMREAD_UNCHANGED)
    return crop[:, :, 3], crop[:, :, :3], cv2.cvtColor(crop[:, :, :3], cv2.COLOR_BGR2LAB).astype(np.float32)


def dark_red_on_edge(alpha: np.ndarray, lab: np.ndarray) -> float:
    """Share of the crop's edge pixels along its shadow sides (top and right here) that are dark red: the backing's
    hue within 12 degrees, darker than the sheet (the owner's ranking measure). The red halftone on the lit left edge
    averages to a hue 30 degrees off and is not counted."""
    seen = alpha > 30
    edge = seen & (cv2.erode(seen.astype(np.uint8), np.ones((5, 5), np.uint8)) == 0)
    h, w = alpha.shape
    sides = np.zeros_like(edge)
    sides[: int(h * 0.1), :] = True
    sides[:, w - int(w * 0.1):] = True
    edge &= sides
    a, b = lab[..., 1] - 128.0, lab[..., 2] - 128.0
    hue = np.degrees(np.arctan2(b, a))
    shadow = edge & (np.hypot(a, b) > 12) & (np.abs(hue - 14) < 12) & (lab[..., 0] < 110)
    return shadow.sum() / max(1, edge.sum())


def test_a_dark_edged_card_loses_its_cast_shadow_and_keeps_its_print(tmp_path: Path):
    it = scan(tmp_path, sheet_with(card(crimson="none")))
    assert it["kind"] == "card" and "CAST_SHADOW_KEPT" not in it["flags"]
    w, h = it["sizeMm"]
    assert abs(w - CARD_MM[0]) < 0.2 and abs(h - CARD_MM[1]) < 0.2, it["sizeMm"]   # the shadow (+1.0, +0.4) is gone
    alpha, bgr, lab = crop_of(it)
    assert dark_red_on_edge(alpha, lab) < 0.02                              # no dark red band along the edge
    hh, ww = alpha.shape
    rows = slice(int(hh * 0.3), int(hh * 0.7))
    # the black print reaches the right edge: opaque and dark 3 px in from the edge, along the whole shadow side
    assert (alpha[rows, ww - 4] == 255).mean() > 0.98
    assert lab[rows, ww - 4, 0].mean() < 60
    # the red halftone on the left (lit) edge is kept to the edge, as the plain cut-out keeps it
    assert (alpha[rows, 3] == 255).mean() > 0.98 and (lab[rows, 3, 1] - 128.0).mean() > 20
    assert it["cast"]["removedMm"]["right"] > 0.7 and it["cast"]["removedMm"]["top"] > 0.2
    assert it["cast"]["removedMm"]["left"] == 0.0 and it["cast"]["removedMm"]["bottom"] == 0.0


def test_dark_crimson_art_on_the_shadow_side_is_not_bitten_into(tmp_path: Path):
    it = scan(tmp_path, sheet_with(card(crimson="part")))
    assert it["kind"] == "card" and "CAST_SHADOW_KEPT" not in it["flags"]
    alpha, bgr, lab = crop_of(it)
    hh, ww = alpha.shape
    art = slice(int(hh / 3) + 5, int(2 * hh / 3) - 5)
    # the bite measure: the longest see-through run 3 px inside the right edge, over the straight part
    col = alpha[int(4 * PX):hh - int(4 * PX), ww - 4] < 128
    runs, cur = 0, 0
    for t in col:
        cur = cur + 1 if t else 0
        runs = max(runs, cur)
    assert runs / PX < 0.1, runs / PX
    # the art runs to the card's edge: opaque right up to the edge, and still crimson there (not repainted black)
    for x in (ww - 2, ww - 4, ww - 8):
        assert (alpha[art, x] == 255).mean() > 0.99, x
    assert (lab[art, ww - 8, 1] - 128.0).mean() > 15 and lab[art, ww - 8, 0].mean() < 60
    # the black print above and below the art reaches the edge too, and the shadow is gone
    above = slice(int(hh * 0.1), int(hh / 3) - 5)
    assert (alpha[above, ww - 4] == 255).mean() > 0.98 and lab[above, ww - 4, 0].mean() < 60
    w, h = it["sizeMm"]
    assert abs(w - CARD_MM[0]) < 0.2 and abs(h - CARD_MM[1]) < 0.2, it["sizeMm"]


def test_a_lifted_cards_near_black_shadow_floor_goes_too(tmp_path: Path):
    face = card(crimson="none", halftone_left=False)
    h, w = face.shape[:2]
    face[:, :, :3][: int(h * 0.3)] = (235, 235, 235)   # white print at the top edge, where the floor lies against it
    it = scan(tmp_path, crisp_sheet(face, umbra_mm=0.3, right_mm=1.8, top_mm=0.8))
    assert it["kind"] == "card" and "CAST_SHADOW_KEPT" not in it["flags"]
    w_mm, h_mm = it["sizeMm"]
    assert abs(w_mm - CARD_MM[0]) < 0.2 and abs(h_mm - CARD_MM[1]) < 0.2, it["sizeMm"]
    alpha, bgr, lab = crop_of(it)
    hh, ww = alpha.shape
    cols = slice(int(ww * 0.2), int(ww * 0.8))
    assert lab[3, cols, 0].mean() > 150          # the top edge is the white print, not the near-black floor
    # the crop's outermost pixels along the shadow sides, the rounded corners included, carry no trace of the floor:
    # the card's print there is black (the floor's last pixel, kept as the pixel of blend, is too grey for a hue test
    # and must be taken for the blend it is)
    seen = alpha > 0
    ring = seen & (cv2.erode(seen.astype(np.uint8), np.ones((3, 3), np.uint8)) == 0)
    strips = np.zeros_like(ring)
    strips[: int(hh * 0.5), :] = True                  # the top half: the top edge and its two corners
    strips[:, ww - int(ww * 0.1):] = True              # the right edge
    chroma = np.hypot(lab[..., 1] - 128.0, lab[..., 2] - 128.0)
    sel = ring & strips & (lab[..., 0] < 150)          # the dark print's edge pixels (the white print is above 150)
    assert chroma[sel].mean() < 5.0, chroma[sel].mean()
    corners = ring & ((np.arange(ww)[None, :] < int(4 * PX)) | (np.arange(ww)[None, :] > ww - int(4 * PX))) & (np.arange(hh)[:, None] > int(hh * 0.5))
    assert chroma[corners].mean() < 5.0, chroma[corners].mean()


def test_a_side_whose_fit_cannot_be_trusted_keeps_its_edge_and_is_flagged(tmp_path: Path):
    # uniform dark crimson along the whole right edge: the band ends 1.5 mm in everywhere, which no geometry can tell
    # from a shadow, but the size check can: that side keeps its outer edge (shadow and all) rather than be bitten
    it = scan(tmp_path, sheet_with(card(crimson="whole")))
    assert it["kind"] == "card" and "CAST_SHADOW_KEPT" in it["flags"]
    assert it["cast"]["removedMm"]["right"] == 0.0 and it["cast"]["removedMm"]["top"] > 0.2
    alpha, bgr, lab = crop_of(it)
    hh, ww = alpha.shape
    rows = slice(int(hh * 0.1), int(hh * 0.9))
    assert (alpha[rows, ww - int(1.0 * PX)] == 255).mean() > 0.99      # the art, 1 mm in, is all there
    assert it["sizeMm"][0] > CARD_MM[0] + 0.4          # the shadow on that side stayed (its darker part, as cut out)


def first_opaque_from_right(alpha: np.ndarray, y: int) -> int:
    """How many pixels in from the crop's right edge the first opaque pixel of row ``y`` lies (0: the edge pixel)."""
    row = alpha[y, ::-1] >= 128
    return int(np.argmax(row)) if row.any() else alpha.shape[1]


def test_a_bowed_band_end_is_followed_and_the_print_behind_it_is_not_bent(tmp_path: Path):
    # the right edge imaged lifted and blurred: the backing's red mixes into the card's edge, deepest (10 px) in the
    # middle of the side and not at all over the last 15 % at either end (light tabs, as a curled corner shows), so the
    # band ends on a bowed curve with a step at each end while the print behind it is straight (the owner's scans: a
    # bow of 4-7 px at 600 dpi on every face). A white line 1.5 mm inside that edge shows whether the crop bends it.
    face = card(crimson="none", halftone_left=False)
    h, w = face.shape[:2]
    x_line = w - int(round(1.5 * PX))
    face[:, x_line:x_line + 2, :3] = 235
    bow = 10
    t = (np.arange(h) - h / 2.0) / (h / 2.0)
    depth = np.round(bow * (1.0 - t ** 2)).astype(int).clip(0, bow)
    depth[np.abs(t) > 0.7] = 0
    deep = lab_bgr(45, 15, 4)
    for y in range(h):
        if depth[y] > 0:
            face[y, w - depth[y]:, :3] = deep
    it = scan(tmp_path, crisp_sheet(face))
    assert it["kind"] == "card" and "CAST_SHADOW_KEPT" not in it["flags"], it["flags"]
    assert it["cast"]["removedMm"]["right"] > 0.9                       # the 1 mm shadow and the bow
    w_mm, h_mm = it["sizeMm"]
    assert abs(w_mm - CARD_MM[0]) < 0.25 and abs(h_mm - CARD_MM[1]) < 0.25, it["sizeMm"]   # the border on the chord
    alpha, bgr, lab = crop_of(it)
    hh, ww = alpha.shape
    rows = range(int(hh * 0.1), int(hh * 0.9))
    # the white line is straight in the crop: its column varies by at most a pixel over the rows (the fit's bow is
    # the blur, not the card: a crop that unbent the card to the fit would shear the line by the bow in the middle)
    cols = [int(np.argmax(lab[y, ww - 40:, 0])) for y in rows]
    assert max(cols) - min(cols) <= 1, (min(cols), max(cols))
    # the cut follows the band's end, no deeper (the tabs at the ends are kept by the bound, the bow by the curve) and
    # no shallower than the pixel of blend: see-through from the right edge is within 3 px of the painted depth
    tc = (np.arange(hh) - hh / 2.0) / (hh / 2.0)
    expect = np.round(bow * (1.0 - tc ** 2)).astype(int).clip(0, bow)
    expect[np.abs(tc) > 0.7] = 0
    seen = np.array([first_opaque_from_right(alpha, y) for y in rows])
    exp = expect[list(rows)]
    off = seen - exp
    assert (off <= 3).mean() > 0.98 and (off >= -2).mean() > 0.98, (off.min(), off.max(), np.percentile(off, (1, 50, 99)))
    # at the tabs (below the rounded corner) the black print reaches the edge: opaque and dark 3 px in
    tab = slice(int(hh * 0.06), int(hh * 0.14))
    assert (alpha[tab, ww - 4] == 255).mean() > 0.98 and lab[tab, ww - 4, 0].mean() < 60


def test_pink_halftone_art_at_a_lit_edge_keeps_its_halftone(tmp_path: Path):
    # a checkerboard of pink (the backing's own hue, darker than the sheet) and white, 2 px cells, over the left 15 %
    # of a card: print of the backing's hue at a lit edge. The rim repaint of thick pieces, applied to a card, took it
    # for rim and overwrote 9 px of it (at 600 dpi) with copies of the pixel further in, row by row: the halftone's
    # variation across the band vanished. Here it must stay as strong as deeper in
    face = card(crimson="none", halftone_left=False)
    h, w = face.shape[:2]
    pink = lab_bgr(100, 40, 10)
    for y in range(int(h * 0.2), int(h * 0.8)):
        for x in range(0, int(w * 0.15)):
            face[y, x, :3] = pink if ((x // 2 + y // 2) % 2 == 0) else (235, 235, 235)
    it = scan(tmp_path, crisp_sheet(face))
    assert it["kind"] == "card" and "CAST_SHADOW_KEPT" not in it["flags"]
    alpha, bgr, lab = crop_of(it)
    hh, ww = alpha.shape
    rows = slice(int(hh * 0.3), int(hh * 0.7))
    assert (alpha[rows, 1:12] == 255).all()
    band = lab[rows, 1:6, 0].std(axis=1).mean()           # the variation across the 5 px next to the edge, per row
    deep = lab[rows, 30:35, 0].std(axis=1).mean()         # the same, well inside
    assert band > 0.6 * deep, (band, deep)
    # and the art is still pink and white, not repainted into something else
    assert (lab[rows, 1:10, 1] - 128.0).mean() > 12 and lab[rows, 1:10, 0].mean() > 140


def test_a_light_edge_blended_with_the_sheet_is_unmixed(tmp_path: Path):
    # a white-edged card whose four outermost columns the sheet blends into (60, 40, 25 and 10 % sheet, the blur of a
    # scan): the crop's opaque edge pixels come out white, not pink. The body is cut a pixel inside the card and its
    # outermost pixel is soft, so the first opaque column is the third (25 % sheet, chroma about 15 as scanned)
    face = card(crimson="none", halftone_left=False)
    h, w = face.shape[:2]
    face[:, : int(w * 0.15), :3] = (235, 235, 235)
    mag = np.array(MAGENTA_BGR, np.float32)
    for x, f in ((0, 0.6), (1, 0.4), (2, 0.25), (3, 0.1)):
        face[:, x, :3] = (face[:, x, :3].astype(np.float32) * (1 - f) + mag * f).astype(np.uint8)
    it = scan(tmp_path, crisp_sheet(face))
    alpha, bgr, lab = crop_of(it)
    hh, ww = alpha.shape
    rows = slice(int(hh * 0.2), int(hh * 0.8))
    seen = 0
    for x in range(0, 5):
        col = alpha[rows, x] == 255
        if col.any():
            seen += 1
            chroma = np.hypot(lab[rows, x, 1][col] - 128.0, lab[rows, x, 2][col] - 128.0)
            assert chroma.mean() < 10, (x, chroma.mean())
    assert seen >= 2, seen                                 # the blended columns are in the crop, opaque


def test_the_shadow_kept_at_a_lifted_corner_is_removed_without_a_cast_of_its_own(tmp_path: Path):
    # light print over the top of a card whose two top corners are cut a little rounder (3.15 mm) than the lit corners
    # the fit measures its radius on (3 mm): the fitted outline keeps a sliver of the shadow at the shadow side's
    # corners, 1-3 px of the umbra's near-black floor and the blend of floor and print, with the penumbra just outside
    # lighter and redder than the floor (Lab 80, 36, 10, as at the owner's lifted corners). Those pixels are not blends
    # of the print with the colour outside, and unmixing them as if they were leaves the backing's complement: the
    # corners came out green (3 % of the corners' pixels). They must come out as the print: none greener than it by
    # 15 a*, and at most 2 % darker by 40 L (at 300 dpi the corner depth is 3.5 px and the sliver's blurred inner
    # edge sits on it: a few blends of print, floor and penumbra there are left as they are, a little grey)
    face = card(crimson="none", halftone_left=False)
    h, w = face.shape[:2]
    face[:, :, :3][: int(h * 0.3)] = (235, 235, 235)
    R = int(round(3.15 * PX))
    a = face[:, :, 3]
    for cx, x0, x1 in ((R, 0, R), (w - 1 - R, w - 1 - R, w)):
        big = np.zeros_like(a)
        cv2.circle(big, (cx, R), R, 255, cv2.FILLED)
        a[:R, x0:x1] = np.minimum(a[:R, x0:x1], big[:R, x0:x1])
    it = scan(tmp_path, crisp_sheet(face, umbra_mm=0.2, right_mm=1.8, top_mm=0.8, deep=(80, 36, 10), blur=0.7))
    assert it["kind"] == "card" and "CAST_SHADOW_KEPT" not in it["flags"], it["flags"]
    alpha, bgr, lab = crop_of(it)
    hh, ww = alpha.shape
    yy, xx = np.mgrid[0:hh, 0:ww]
    corners = (np.hypot(yy, xx) <= 4 * PX) | (np.hypot(yy, xx - ww) <= 4 * PX)
    opaque = alpha == 255
    print_a = np.median(lab[..., 1][opaque & (yy < hh * 0.3) & (yy > 12) & (xx > 12) & (xx < ww - 12)]) - 128.0
    sel = corners & opaque & (yy < hh * 0.3)
    green = (lab[..., 1][sel] - 128.0 < print_a - 15).mean()
    dark = (lab[..., 0][sel] < 235 - 40).mean()
    assert green < 0.005, green
    assert dark < 0.02, dark


def test_black_print_tinted_by_the_glare_is_kept_by_the_anchors(tmp_path: Path):
    # the right edge carries a light edge line (the card's bevel) 3 px wide, interrupted over 60 % of the side where
    # black print runs to the edge and is tinted by the glare off the sheet over its last 6 px (Lab 48, 12, 4: the
    # shadow's own colour, so the band runs on into the print there). Most positions then agree on an edge 6 px inside
    # the card; the positions that end on the light line are the anchors that move it out
    face = card(crimson="none", halftone_left=False)
    h, w = face.shape[:2]
    face[:, w - 3:, :3] = 235
    dark = np.zeros(h, bool)
    for y0, y1 in ((0.0, 0.2), (0.3, 0.6), (0.7, 1.0)):
        dark[int(h * y0):int(h * y1)] = True
    face[dark, w - 6:, :3] = lab_bgr(48, 12, 4)
    it = scan(tmp_path, crisp_sheet(face))
    assert it["kind"] == "card" and "CAST_SHADOW_KEPT" not in it["flags"], it["flags"]
    w_mm, h_mm = it["sizeMm"]
    assert abs(w_mm - CARD_MM[0]) < 0.2 and abs(h_mm - CARD_MM[1]) < 0.2, it["sizeMm"]
    alpha, bgr, lab = crop_of(it)
    hh, ww = alpha.shape
    # the tinted print is kept to the edge: opaque and dark 3 px in, over the middle dark stretch
    rows_dark = slice(int(hh * 0.32), int(hh * 0.58))
    assert (alpha[rows_dark, ww - 4] == 255).mean() > 0.98, (alpha[rows_dark, ww - 4] == 255).mean()
    assert lab[rows_dark, ww - 4, 0].mean() < 60
    # and the light edge line where it runs to the edge
    rows_light = slice(int(hh * 0.62), int(hh * 0.68))
    assert (alpha[rows_light, ww - 3] == 255).mean() > 0.98 and lab[rows_light, ww - 3, 0].mean() > 150
