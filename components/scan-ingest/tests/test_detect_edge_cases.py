"""Detection edge cases: touching cards, a stray thread, an oversized Bot State card among standard cards, and the
white scanner lid (its hinge shadow, pale-edged cards, the back-from-prior search)."""
from __future__ import annotations

import dataclasses
import random

import cv2
import numpy as np

from scanpipe import detect as D
from tests.synth_cards import CARD_H, CARD_W, CHART_H, CHART_W, MM, _paste, _rounded_alpha, backing, card_back, card_front, chart_face

DPI = 300
PX = DPI * MM
CW, CH = int(round(CARD_W * PX)), int(round(CARD_H * PX))
PARAMS = dataclasses.replace(D.DetectParams(), card_px=(CARD_W * PX, CARD_H * PX),
                             item_px=((CARD_W * PX, CARD_H * PX), (CHART_W * PX, CHART_H * PX)))


def _card(seed: int, pale: bool = False):
    face = card_front(CW, CH, "1ROM1/23", random.Random(seed), pale=pale)
    return face, _rounded_alpha(CW, CH, int(3 * PX))


def _bed(kind: str = "dark") -> np.ndarray:
    return backing(int(297 * PX), int(216 * PX), np.random.default_rng(0), kind)


def test_touching_pair_is_flagged_not_misread():
    img = _bed()
    y = 15 * PX + CH / 2
    _paste(img, *_card(1), 12 * PX + CW / 2, y, 0.0)
    _paste(img, *_card(2), 12 * PX + CW / 2 + CW - 2, y, 0.0)  # touching along the long edge
    _paste(img, *_card(3), 12 * PX + CW / 2, y + CH + 15 * PX, 0.0)
    det = D.detect(img, PARAMS)
    assert len(det.regions) == 2, [r.to_json() for r in det.regions]
    merged = max(det.regions, key=lambda r: r.w * r.h)
    assert merged.flags, merged.flags        # MAY_BE_SEVERAL_ITEMS or SPLIT_FROM_TOUCHING_ITEMS: never silent


def test_stray_thread_is_not_an_item():
    img = _bed()
    _paste(img, *_card(1), 12 * PX + CW / 2, 15 * PX + CH / 2, 2.0)
    t = max(1, int(0.5 * PX))  # a 0.5 mm light thread, L-shaped, 40 mm legs
    x0, y0 = int(120 * PX), int(200 * PX)
    cv2.line(img, (x0, y0), (x0 + int(40 * PX), y0), (200, 200, 200), t)
    cv2.line(img, (x0, y0), (x0, y0 + int(40 * PX)), (200, 200, 200), t)
    det = D.detect(img, PARAMS)
    assert len(det.regions) == 1, [r.to_json() for r in det.regions]


def test_an_oversized_chart_among_cards_is_one_item_not_two():
    """A Bot State card is ~1.7 standard cards in area: both calibrated sizes keep it whole (§12.10)."""
    for kind in ("dark", "white"):
        img = _bed(kind)
        for k in range(3):
            _paste(img, *_card(k), (8 + k * 70) * PX + CW / 2, 10 * PX + CH / 2, 1.5)
        chart = chart_face(int(CHART_H * PX), int(CHART_W * PX), random.Random(2), "S")
        _paste(img, chart, _rounded_alpha(chart.shape[1], chart.shape[0], int(3 * PX)), 108 * PX, 160 * PX, 2.0)
        det = D.detect(img, PARAMS)
        sizes = sorted((round(r.w / PX), round(r.h / PX)) for r in det.regions)
        assert len(det.regions) == 4, (kind, sizes)
        assert (80, 120) in [(w, h) for w, h in sizes] or any(abs(w - 80) <= 1 and abs(h - 120) <= 1 for w, h in sizes), sizes
        assert not any("SPLIT_FROM_TOUCHING_ITEMS" in r.flags for r in det.regions)


def test_white_lid_hinge_shadow_is_modelled_not_detected():
    img = _bed("white")                         # an 18-level soft shadow along the left edge
    _paste(img, *_card(4), 8 * PX + CW / 2, 20 * PX + CH / 2, 1.0)   # a card inside the shadow band
    det = D.detect(img, PARAMS)
    assert det.background.edge, "the edge-shadow terms should be used on a lid with a hinge shadow"
    assert len(det.regions) == 1 and not det.rejected, ([r.to_json() for r in det.regions], det.rejected)
    r = det.regions[0]
    assert abs(r.w - CW) / PX < 1.5 and abs(r.h - CH) / PX < 1.5


def test_dark_backing_keeps_the_plain_polynomial_model():
    img = _bed("dark")
    _paste(img, *_card(5), 40 * PX + CW / 2, 30 * PX + CH / 2, 1.0)
    det = D.detect(img, PARAMS)
    assert det.background.edge is None and len(det.regions) == 1


def test_pale_edged_card_on_a_white_lid_is_grown_back_and_flagged():
    img = _bed("white")
    cx, cy = 60 * PX + CW / 2, 40 * PX + CH / 2
    _paste(img, *_card(6, pale=True), cx, cy, 1.5)
    det = D.detect(img, PARAMS)
    assert len(det.regions) == 1 and not det.rejected, ([r.to_json() for r in det.regions], det.rejected)
    r = det.regions[0]
    assert D.EXTEND_FLAG in r.flags
    assert abs(r.h - CH) / PX < 1.5 and abs(r.cy - cy) / PX < 1.5 and abs(r.cx - cx) / PX < 1.5


def test_pale_card_without_the_size_prior_is_never_silently_cut():
    """Without a known DPI there is no size to grow to: the short crop must at least not pass as a clean card."""
    img = _bed("white")
    _paste(img, *_card(7, pale=True), 60 * PX + CW / 2, 40 * PX + CH / 2, 1.5)
    det = D.detect(img, D.DetectParams())
    big = [r for r in det.regions if r.w * r.h > 0.3 * CW * CH]
    assert len(big) == 1
    assert abs(big[0].h - CH) / PX > 5          # it did lose its pale top …
    # … which the game's own size check reports


def test_back_from_prior_on_a_white_lid_uses_backing_noise_thresholds():
    """A back that global detection missed is searched at its front's position; on a white lid the edge
    thresholds must come from the lid's noise, not from its brightness."""
    img = _bed("white")
    back = card_back(CW, CH)
    cx, cy = 60 * PX + CW / 2, 40 * PX + CH / 2
    _paste(img, back, _rounded_alpha(CW, CH, int(3 * PX)), cx, cy, 1.0)
    det = D.detect(img, PARAMS)
    prior = D.Region(cx=cx, cy=cy, w=CW, h=CH, angle=0.0,
                     corners=[[cx - CW / 2, cy - CH / 2], [cx + CW / 2, cy - CH / 2], [cx + CW / 2, cy + CH / 2],
                              [cx - CW / 2, cy + CH / 2]], area=CW * CH, fill=1.0)
    r = D.refine_with_prior(img, prior, det.background, PARAMS)
    assert r.source != "prior" and abs(r.w - CW) / PX < 1.5
    low, high = D._canny_thresholds(cv2.GaussianBlur(cv2.cvtColor(img[:400, :400], cv2.COLOR_BGR2GRAY), (0, 0), 1.5))
    assert low < 40 and high == 2.5 * low        # brightness-scaled thresholds would be about 96 / 288 here
