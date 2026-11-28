"""K794: thick wooden pieces with a wide soft shadow (shadow_mm 8). In printed_edge mode the cut that removes it is
kept although it takes more than a fifth of the plain cut; a pale mark on the backing that touches a piece is not cut
with it, in either mode. Synthetic shapes only."""
import json
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from PIL import Image

from scanpipe.__main__ import main
from scanpipe.plugins.base import Plugin
from tests.synth import MM, magenta_sheet

DPI = 300
PX = DPI / 25.4
BED = (200.0, 110.0)
PALE = (200, 195, 235)


class Wood(Plugin):
    name = "wood"
    out_dpi = None
    item_sizes_mm = {"disc15": (15.0, 15.0), "token17": (17.0, 19.0), "marker11": (11.0, 11.0), "disc18": (18.0, 18.0)}
    thick_kinds = {k: 8.0 for k in item_sizes_mm}


class WoodEdge(Wood):
    printed_edge_kinds = frozenset(Wood.item_sizes_mm)


def disc(bgr: tuple, w: float, h: float, shadow_mm: float = 3.0, mark: Optional[tuple] = None,
         ring: Optional[tuple] = None) -> np.ndarray:
    """An elliptic piece (BGRA) and its soft shadow down and to the right: black at partial alpha, the backing
    darkened. ``mark`` (dx, dy, rx, ry mm from the centre) is a pale blot on the backing under it; ``ring`` (BGR, mm)
    a band of that colour along its edge."""
    d = (int(round(w * PX)), int(round(h * PX)))
    s = int(round(shadow_mm * PX))
    pad = s + int(5 * PX) + 4
    m = np.zeros((d[1] + 2 * pad, d[0] + 2 * pad), np.uint8)
    c = (pad + d[0] // 2, pad + d[1] // 2)
    cv2.ellipse(m, c, (d[0] // 2, d[1] // 2), 0, 0, 360, 255, -1)
    sh = np.zeros(m.shape, np.float32)
    for i in range(s + 1):
        sh = np.maximum(sh, np.roll(np.roll(m, int(i * 0.8), 0), int(i * 0.6), 1) / 255.0)
    img = np.zeros((*m.shape, 4), np.uint8)
    img[..., 3] = np.clip(cv2.GaussianBlur(sh, (0, 0), PX / 2) * 0.85 * 255, 0, 255)
    if mark:
        cv2.ellipse(img, (c[0] + int(mark[0] * PX), c[1] + int(mark[1] * PX)), (int(mark[2] * PX), int(mark[3] * PX)),
                    0, 0, 360, (*PALE, 255), -1)
    img[m > 0] = (*bgr, 255)
    if ring:
        b = int(round(ring[1] * PX))
        img[m > 0] = (*ring[0], 255)
        inner = np.zeros(m.shape, np.uint8)
        cv2.ellipse(inner, c, (d[0] // 2 - b, d[1] // 2 - b), 0, 0, 360, 255, -1)
        img[inner > 0] = (*bgr, 255)
    return img


def scan(tmp_path: Path, items: list, plugin: str) -> list:
    sheet = magenta_sheet(items, DPI, bed_mm=BED)
    tmp_path.mkdir(parents=True, exist_ok=True)
    f = tmp_path / "w.tif"
    Image.fromarray(cv2.cvtColor(sheet, cv2.COLOR_BGR2RGB)).save(f, dpi=(DPI, DPI))
    main(["scan", "--plugin", f"tests.test_thick_wood:{plugin}", "--out", str(tmp_path / "out"), str(f),
          *["--turn", "0"] * len(items)])
    its = json.loads((tmp_path / "scan-review" / "w.json").read_text(encoding="utf-8"))["items"]
    return sorted(its, key=lambda it: it["region"]["cx"])


def clean(it: dict, kind: str, fx: float, fy: float = 0.5) -> None:
    """No flag, the kind's size within 0.4 mm, and the cut's alpha centred on the drawn piece within 0.3 mm."""
    assert it["kind"] == kind and not it["flags"], it
    assert max(abs(a - b) for a, b in zip(sorted(it["sizeMm"]), sorted(Wood.item_sizes_mm[kind]))) <= 0.4, it
    a = np.array(Image.open(it["file"]))[..., 3] > 128
    ys, xs = np.nonzero(a)
    assert abs(xs.mean() - (xs.min() + xs.max()) / 2) <= 0.3 * PX and abs(ys.mean() - (ys.min() + ys.max()) / 2) <= 0.3 * PX, it
    W, H = int(BED[0] * MM * DPI), int(BED[1] * MM * DPI)
    assert np.hypot(it["region"]["cx"] - fx * W, it["region"]["cy"] - fy * H) <= 0.3 * PX, it


PIECES = [((200, 120, 40), 15, 15, "disc15"), ((30, 130, 240), 17, 19, "token17"), ((40, 40, 190), 11, 11, "marker11")]


def test_k794_printed_edge_wooden_pieces_with_a_wide_shadow_lose_it(tmp_path: Path):
    items = [(disc(c, w, h, 4.5), 0.2 + 0.3 * i, 0.5, 0.0) for i, (c, w, h, _k) in enumerate(PIECES)]
    for plugin in ("WoodEdge", "Wood"):
        got = scan(tmp_path / plugin, items, plugin)
        for i, (it, (_c, _w, _h, kind)) in enumerate(zip(got, PIECES)):
            clean(it, kind, 0.2 + 0.3 * i)
            # the manifest records the plain cut and each candidate, the chosen one among them
            assert it["thickPlainMm"][1] > Wood.item_sizes_mm[kind][1] + 2 and len(it["thickCuts"]) >= 2, it
            assert it["sizeMm"] in [c["sizeMm"] for c in it["thickCuts"]], it


def test_k794_a_pale_mark_touching_a_black_disc_is_not_cut_with_it(tmp_path: Path):
    black, purple = (25, 25, 25), (140, 50, 110)
    items = [(disc(black, 18, 18, mark=(-10, -5, 4, 3)), 0.2, 0.5, 0.0), (disc(black, 18, 18, mark=(10, 3, 4, 3)), 0.5, 0.5, 0.0),
             (disc(purple, 18, 18, mark=(0, 11, 4, 3)), 0.8, 0.5, 0.0)]
    for plugin in ("Wood", "WoodEdge"):
        got = scan(tmp_path / plugin, items, plugin)
        for it, fx in zip(got, (0.2, 0.5, 0.8)):
            clean(it, "disc18", fx)
            assert it["thickCut"].endswith("+dropLight"), it


def test_k794_a_black_disc_with_a_pale_edge_ring_keeps_its_ring(tmp_path: Path):
    it = scan(tmp_path, [(disc((25, 25, 25), 18, 18, ring=(PALE, 1.0)), 0.5, 0.5, 0.0)], "Wood")[0]
    clean(it, "disc18", 0.5)
    assert not it["thickCut"].endswith("+dropLight"), it
