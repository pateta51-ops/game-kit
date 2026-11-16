"""Cards in clear sleeves on a white backing (ported from Unstoppable's test_sleeves.py): the region is cut to the
card, not the sleeve; unsleeved items and plug-ins that leave the step off are unchanged. Synthetic scans, 300 dpi."""
from __future__ import annotations

import dataclasses
import math
import random
from pathlib import Path

import cv2
import numpy as np
import pytest

from scanpipe import detect as D
from scanpipe import pipeline, sleeves
from scanpipe.plugins.base import Plugin
from scanpipe.plugins.contract import problems
from tests.synth_sleeves import (CARD_H, CARD_W, MM, TAB_MM, _backing, _backing_white, _bordered_face, _paste, _rgba,
                                 _turn, silhouette_mask, sleeve, strip_px)

DPI = 300
PX = DPI * MM
PARAMS = dataclasses.replace(D.DetectParams(), card_px=(CARD_W * PX, CARD_H * PX))
TOL_MM = 1.0


def _bed_with_sleeved_card(at_mm=(55.0, 66.0), angle=1.5, offset=(0.4, 0.9), shape="core", strip=False,
                           pale_stretches=0, bed_mm=(110.0, 132.0), seed=3):
    rnd = random.Random(seed)
    W, H = int(bed_mm[0] * PX), int(bed_mm[1] * PX)
    img = _backing_white(H, W, np.random.default_rng(seed))
    cw, ch = int(round(CARD_W * PX)), int(round(CARD_H * PX))
    alpha = silhouette_mask(shape, cw, ch)
    face = _bordered_face(cw, ch, rnd, alpha, strip=strip)
    sw, run = strip_px(cw), int(round(6 * PX))
    for k in range(pale_stretches):  # stretches where the pale strip dips below the main threshold
        y0 = int((k + 1) / (pale_stretches + 1) * ch) - run // 2
        face[y0:y0 + run, :sw] = 228
    item, d = sleeve(_rgba(face, alpha), PX, offset)
    cx, cy = at_mm[0] * PX, at_mm[1] * PX
    _paste(img, item, cx, cy, angle)
    o = _turn(d, angle)
    return img, (cx + o[0], cy + o[1]), cw, ch


def _the_item(img):
    det = D.detect(img, PARAMS)
    assert len(det.regions) == 1, [r.to_json() for r in det.regions]
    return det.regions[0], det.background


@pytest.mark.parametrize("shift_mm", [(4.0, -3.0), (12.0, 5.0)])
def test_back_from_prior_with_offset_finds_the_whole_card(shift_mm):
    img, (ccx, ccy), cw, ch = _bed_with_sleeved_card()
    r, bgm = _the_item(img)
    dx, dy = shift_mm[0] * PX, shift_mm[1] * PX
    prior = D.Region(cx=r.cx + dx, cy=r.cy + dy, w=r.w, h=r.h, angle=r.angle,
                     corners=[[x + dx, y + dy] for x, y in r.corners], area=r.w * r.h, fill=1.0,
                     source="prior", flags=["BACK_FROM_PRIOR_CHECK_CROP"])
    out = sleeves.unsleeve(img, prior, bgm, PARAMS, PX)
    assert out is not prior
    assert abs(out.w - cw) / PX <= TOL_MM and abs(out.h - ch) / PX <= TOL_MM, (out.w / PX, out.h / PX)
    assert math.hypot(out.cx - ccx, out.cy - ccy) / PX < 0.5
    assert "RECOVERED_FROM_PRIOR" in out.flags and "SLEEVE_TRIMMED" in out.flags
    assert "BACK_FROM_PRIOR_CHECK_CROP" not in out.flags and out.source != "prior"
    _crop, outline = D.rectify(img, out)
    from scanpipe import silhouette as S
    assert S.analyze(outline, out.w, out.h).shape == "notched"


def test_sleeve_off_the_glass_with_the_card_inside():
    img, (ccx, ccy), cw, ch = _bed_with_sleeved_card(at_mm=(55.0, 45.0), angle=0.0, offset=(0.0, 1.0))
    assert ccy - ch / 2 > 1.4 * PX
    r, bgm = _the_item(img)
    assert "CUT_OFF_AT_SCAN_EDGE" in r.flags, r.flags
    out = sleeves.unsleeve(img, r, bgm, PARAMS, PX)
    assert "SLEEVE_TRIMMED" in out.flags
    assert not {"CUT_OFF_AT_SCAN_EDGE", "NEAR_SCAN_EDGE"} & set(out.flags), out.flags
    assert abs(out.w - cw) / PX <= TOL_MM and abs(out.h - ch) / PX <= TOL_MM


def test_pale_strip_keeps_its_outline(monkeypatch):
    from scanpipe import silhouette as S
    img, _c, cw, ch = _bed_with_sleeved_card(shape="plain", strip=True, pale_stretches=3, angle=0.8)
    r, bgm = _the_item(img)

    def fill_of_outline():
        out = sleeves.unsleeve(img, r, bgm, PARAMS, PX)
        if out is r:
            return None
        assert abs(out.w - cw) / PX <= TOL_MM and abs(out.h - ch) / PX <= TOL_MM, (out.w / PX, out.h / PX)
        _crop, outline = D.rectify(img, out)
        return S.analyze(outline, out.w, out.h).fill

    filled = fill_of_outline()
    assert filled is not None and filled > 0.97, filled
    monkeypatch.setattr(sleeves, "SLEEVE_FILL_MARGIN", 0.0)
    bitten = fill_of_outline()
    assert bitten is None or bitten < 0.95, bitten


def test_dark_backing_is_left_alone():
    W, H = int(110 * PX), int(132 * PX)
    img = _backing(H, W, np.random.default_rng(5))
    cw, ch = int(round(CARD_W * PX)), int(round(CARD_H * PX))
    alpha = silhouette_mask("core", cw, ch)
    _paste(img, _rgba(_bordered_face(cw, ch, random.Random(5), alpha), alpha), 55 * PX, 66 * PX, 1.0)
    r, bgm = _the_item(img)
    r.flags.append("BACK_FROM_PRIOR_CHECK_CROP")
    assert sleeves.unsleeve(img, r, bgm, PARAMS, PX) is r


def test_what_counts_as_sleeve_sized():
    def mm(w, h, **kw):
        return sleeves.sleeve_sized(w * PX, h * PX, PARAMS.card_px, PX, **kw)

    assert mm(66.0, 92.0) and mm(66.5, 89.5)
    assert mm(64.0, 91.5) and mm(64.0, 87.9) and mm(62.5, 89.5)
    assert not mm(61.7, 87.8) and not mm(63.4, 95.6) and not mm(62.0, 96.5)
    assert mm(72.0, 98.0)
    assert not mm(63.5, 88.9) and not mm(61.8, 88.4)
    assert not mm(63.5, 95.6) and not mm(62.9, 95.6)
    assert not mm(134.0, 92.0) and not mm(66.0, 186.0) and not mm(150.0, 250.0)
    assert not mm(64.0, 88.0, min_short_mm=65.0) and mm(62.0, 94.0, plain_long_mm=(93.5, 96.0))


# ------------------------------------------------------------------ through the pipeline, as a game turns it on

class SleevedGame(Plugin):
    name = "sleeved-game"
    item_sizes_mm = {"card": (CARD_W, CARD_H), "upgrade": (CARD_W, CARD_H + TAB_MM)}
    card_kind = "card"
    out_dpi = None
    unsleeve = True
    silhouette_kinds = frozenset({"card", "upgrade"})
    silhouette_spec = {"notchCentre": 0.57, "notchVariants": {"high": [0.26, 0.53], "low": [0.59, 0.87]},
                       "names": {"notched": "core", "tabbed": "upgrade"}}


class PlainGame(Plugin):
    name = "plain-game"
    item_sizes_mm = SleevedGame.item_sizes_mm
    card_kind = "card"
    out_dpi = None


def _sheet(tmp_path: Path) -> Path:
    """White bed: a core card upright and one upside down, a plain card (all sleeved), a bare upgrade."""
    rnd = random.Random(7)
    img = _backing_white(int(206 * PX), int(152 * PX), np.random.default_rng(7))
    cw, ch = int(round(CARD_W * PX)), int(round(CARD_H * PX))
    for shape, (x, y), angle in (("core", (38, 52), 1.0), ("core", (113, 52), 180.8), ("plain", (38, 154), -0.6)):
        alpha = silhouette_mask(shape, cw, ch)
        item, _d = sleeve(_rgba(_bordered_face(cw, ch, rnd, alpha), alpha), PX, (0.3, 0.8))
        _paste(img, item, x * PX, y * PX, angle)
    uh = int(round((CARD_H + TAB_MM) * PX))
    alpha = silhouette_mask("upgrade", cw, uh, "low")
    _paste(img, _rgba(_bordered_face(cw, uh, rnd, alpha), alpha), 113 * PX, 154 * PX, 0.7)
    p = tmp_path / "sheet.png"
    cv2.imwrite(str(p), img)
    return p


def test_a_sleeved_sheet_through_the_pipeline(tmp_path):
    scan = _sheet(tmp_path)
    m = pipeline.process_scan(scan, SleevedGame(), tmp_path / "out", tmp_path / "review", dpi=DPI)
    items = m["items"]
    assert [it["kind"] for it in items] == ["card", "card", "card", "upgrade"], [(it["kind"], it["sizeMm"]) for it in items]
    for it in items:
        want = (CARD_W, CARD_H + (TAB_MM if it["kind"] == "upgrade" else 0))
        assert abs(it["sizeMm"][0] - want[0]) <= TOL_MM and abs(it["sizeMm"][1] - want[1]) <= TOL_MM, it["sizeMm"]
        assert ("SLEEVE_TRIMMED" in it["flags"]) == (it["kind"] == "card"), it["flags"]
    got = [(it["silhouette"]["shape"], it["silhouette"]["rotate"], it["turn"]) for it in items]
    assert got == [("core", 0, 0), ("core", 180, 180), ("plain", None, 0), ("upgrade", 0, 0)], got
    assert items[3]["silhouette"]["variant"] == "low"
    assert "ORIENTATION_UNREAD" not in items[0]["flags"] and items[1]["orientation"].startswith("silhouette")


def test_the_steps_are_off_by_default(tmp_path):
    scan = _sheet(tmp_path)
    m = pipeline.process_scan(scan, PlainGame(), tmp_path / "out", tmp_path / "review", dpi=DPI)
    sleeved = [it for it in m["items"] if it["sizeMm"][0] > 65.0]
    assert len(sleeved) == 3, [it["sizeMm"] for it in m["items"]]
    assert all("silhouette" not in it and "SLEEVE_TRIMMED" not in it["flags"] for it in m["items"])


def test_the_contract_checks_the_new_attributes():
    assert problems(SleevedGame()) == []

    class Bad(SleevedGame):
        silhouette_kinds = frozenset({"mat"})
        silhouette_spec = {"notchCenter": 0.5}
        sleeve_plain_long_mm = (93.0, 89.0)

    assert len(problems(Bad())) == 3, problems(Bad())
