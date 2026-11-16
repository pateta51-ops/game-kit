"""Cards in clear sleeves on a light backing (optional step, plug-in ``unsleeve = True``).

Ported from Unstoppable's ufp_ingest/detect.py (``unsleeve``). The sleeve itself is nearly invisible, but its edge
lines, its welded seam (up to ~0.5 mm wide) and its faint tint make detection take the whole sleeve as the item: crops
carry 1.5-3 mm of white margin and the outline is the sleeve's rectangle, so die-cut notches are lost. Inside the
sleeve, the card is everything clearly different from the backing."""
from __future__ import annotations

from typing import Optional

import cv2
import numpy as np

from .detect import (Background, DetectParams, Region, _roi_bounds, fill_holes, flag_scan_edge, odd,
                     region_from_contour, shape_stats)

# Distance from the backing surface (Lab, OpenCV 8-bit) above which a pixel is card: white through a sleeve is 0-8
# from a white backing, the sleeve's edge lines 10-45 but a few px wide (the opening removes them), the palest card
# edge 25-40. On a noisier backing: the backing's own threshold plus what a sleeve adds on top of it.
SLEEVE_MIN_DIST = 20.0
SLEEVE_TINT_DIST = 12.0
# Once the card is found, its outline is completed this much lower, inside the card's own convex hull only.
SLEEVE_FILL_MARGIN = 6.0
SLEEVE_OPEN_MM = 0.6  # the opening that removes the sleeve's lines and seam
SLEEVE_BLUR_MM = 0.1  # a pale area printed as a dot screen reads as its tone
SLEEVE_ROI_GROW = (0.08, 0.20)  # ROI margin, x the region's long side; the wider one if the card runs past
CARD_SHORT_RANGE = (0.94, 1.04)  # accepted card size, x the expected card's short side ...
CARD_LONG_RANGE = (0.94, 1.12)  # ... and long side (a card with a tab is longer)
# Defaults when the plug-in gives none, from the card's size: a sleeve is at least this much wider than the card, or
# this much longer (and narrower).
SLEEVE_MIN_SHORT_EXTRA_MM = 0.2
SLEEVE_PLAIN_LONG_EXTRA_MM = (0.1, 4.1)
SLEEVE_MAX = (1.25, 1.35)  # beyond this (x the card) a region is two items or a mat, not a sleeve
SLEEVE_MIN_TRIM_MM = 0.75  # a smaller change is not a trimmed sleeve: the region already was the card
LIGHT_BACKING_L = 150.0  # 8-bit Lab L; on a dark backing a dark card is not "clearly different"
FROM_PRIOR_FLAGS = ("BACK_FROM_PRIOR_CHECK_CROP", "FOUND_NEAR_PRIOR", "FOUND_BY_EDGES", "REFINE_DISAGREES")
EDGE_FLAGS = ("CUT_OFF_AT_SCAN_EDGE", "NEAR_SCAN_EDGE")


def sleeve_sized(w: float, h: float, card_px: tuple, px_mm: float, min_short_mm: Optional[float] = None,
                 plain_long_mm: Optional[tuple] = None) -> bool:
    """True when a region (short side w, long side h, px) is larger than a card the way a sleeve is: at least
    ``min_short_mm`` wide, or ``plain_long_mm`` long (a card with a tab, longer still, is not a sleeve)."""
    cw, ch = card_px
    if min_short_mm is None:
        min_short_mm = cw / px_mm + SLEEVE_MIN_SHORT_EXTRA_MM
    if plain_long_mm is None:
        plain_long_mm = tuple(ch / px_mm + e for e in SLEEVE_PLAIN_LONG_EXTRA_MM)
    if w > SLEEVE_MAX[0] * cw or h > SLEEVE_MAX[1] * ch or h < CARD_LONG_RANGE[0] * ch:
        return False
    if w >= min_short_mm * px_mm:
        return True
    return plain_long_mm[0] * px_mm < h < plain_long_mm[1] * px_mm


def _component_at(m: np.ndarray, region_mask: np.ndarray, cx: float, cy: float) -> Optional[np.ndarray]:
    """External contour containing (cx, cy); else the one overlapping the region most; else None."""
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        return None
    cnts = sorted(cnts, key=cv2.contourArea, reverse=True)
    for c in cnts:
        if cv2.pointPolygonTest(c, (float(cx), float(cy)), False) >= 0:
            return c
    best, best_overlap = None, 0
    for c in cnts[:20]:
        filled = np.zeros_like(m)
        cv2.drawContours(filled, [c], -1, 255, cv2.FILLED)
        overlap = cv2.countNonZero(cv2.bitwise_and(filled, region_mask))
        if overlap > best_overlap:
            best, best_overlap = c, overlap
    return best


def _card_in_sleeve(full: np.ndarray, r: Region, bgm: Background, card_px: tuple, px_mm: float,
                    params: DetectParams) -> Optional[Region]:
    """The card-sized item inside a region (full-res coordinates, with its mask), or None."""
    H, W = full.shape[:2]
    thr = max(SLEEVE_MIN_DIST, bgm.t_dist + SLEEVE_TINT_DIST)
    k = odd(SLEEVE_OPEN_MM * px_mm)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    sigma = max(0.7, SLEEVE_BLUR_MM * px_mm)
    cw, ch = card_px
    for grow in SLEEVE_ROI_GROW:
        x0, y0, x1, y1 = _roi_bounds(full.shape, r.corners, grow * max(r.w, r.h))
        roi = full[y0:y1, x0:x1]
        if roi.shape[0] < 3 or roi.shape[1] < 3:
            return None
        lab = cv2.cvtColor(roi, cv2.COLOR_BGR2LAB).astype(np.float32)
        d = np.sqrt(((lab - bgm.surface(roi.shape, (float(x0), float(y0)), 1.0)) ** 2).sum(axis=2))
        d = cv2.GaussianBlur(d, (0, 0), sigma)
        m = cv2.morphologyEx((d > thr).astype(np.uint8) * 255, cv2.MORPH_OPEN, kernel)  # sleeve lines go
        region_mask = np.zeros_like(m)
        cv2.fillPoly(region_mask, [np.round(np.array(r.corners) - [x0, y0]).astype(np.int32)], 255)
        c = _component_at(m, region_mask, r.cx - x0, r.cy - y0)
        if c is None:
            return None
        bx, by, bw, bh = cv2.boundingRect(c)
        if (bx == 0 and x0 > 0) or (by == 0 and y0 > 0) or (bx + bw >= m.shape[1] and x1 < W) \
                or (by + bh >= m.shape[0] and y1 < H):
            continue  # the card runs past the ROI (a crop that cut it short): look wider
        single = np.zeros_like(m)
        cv2.drawContours(single, [c], -1, 255, cv2.FILLED)
        hull = np.zeros_like(m)
        cv2.drawContours(hull, [cv2.convexHull(c)], -1, 255, cv2.FILLED)
        pale = ((d > thr - SLEEVE_FILL_MARGIN) & (hull > 0)).astype(np.uint8) * 255
        single = cv2.bitwise_or(single, cv2.morphologyEx(pale, cv2.MORPH_OPEN, kernel))
        single = fill_holes(cv2.morphologyEx(single, cv2.MORPH_CLOSE, kernel))
        cs, _ = cv2.findContours(single, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        c = max(cs, key=cv2.contourArea)
        fill, solidity = shape_stats(c)
        found = region_from_contour(c, source="refined")
        if not (CARD_SHORT_RANGE[0] * cw <= found.w <= CARD_SHORT_RANGE[1] * cw
                and CARD_LONG_RANGE[0] * ch <= found.h <= CARD_LONG_RANGE[1] * ch
                and fill >= params.min_fill and solidity >= params.min_solidity):
            return None
        found.cx += x0
        found.cy += y0
        found.corners = [[x + x0, y + y0] for x, y in found.corners]
        single = np.zeros_like(m)
        cv2.drawContours(single, [c], -1, 255, cv2.FILLED)
        found._mask = single
        found._origin = (x0, y0)
        return found
    return None


def unsleeve(full: np.ndarray, r: Region, bgm: Optional[Background], params: DetectParams, px_mm: float,
             min_short_mm: Optional[float] = None, plain_long_mm: Optional[tuple] = None) -> Region:
    """Replace a sleeve-sized region by the card inside it (``params.card_px``); return any other region unchanged.

    Applies on a light backing, to regions that are sleeve-sized or came from a prior (``FROM_PRIOR_FLAGS``, source
    "prior"). The result keeps the mask, so ``detect.rectify`` gives the die-cut outline. Flags: ``SLEEVE_TRIMMED``
    when a margin was removed; ``BACK_FROM_PRIOR_CHECK_CROP`` becomes ``RECOVERED_FROM_PRIOR``; scan-edge flags are
    measured again on the card."""
    if not params.card_px or bgm is None or float(bgm.lab[0]) < LIGHT_BACKING_L:
        return r
    from_prior = r.source == "prior" or any(f in r.flags for f in FROM_PRIOR_FLAGS)
    if not (from_prior or sleeve_sized(r.w, r.h, params.card_px, px_mm, min_short_mm, plain_long_mm)):
        return r
    found = _card_in_sleeve(full, r, bgm, params.card_px, px_mm, params)
    if found is None:
        return r
    trimmed = r.w - found.w >= SLEEVE_MIN_TRIM_MM * px_mm or r.h - found.h >= SLEEVE_MIN_TRIM_MM * px_mm
    if not (trimmed or from_prior):
        return r
    found.flags = [f for f in r.flags if f not in EDGE_FLAGS and f != "BACK_FROM_PRIOR_CHECK_CROP"]
    if trimmed:
        found.flags.append("SLEEVE_TRIMMED")
    if "BACK_FROM_PRIOR_CHECK_CROP" in r.flags:
        found.flags.append("RECOVERED_FROM_PRIOR")
    flag_scan_edge(found, full.shape)
    return found
