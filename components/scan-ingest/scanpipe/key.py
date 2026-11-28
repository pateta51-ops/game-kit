"""Coloured-backing scans: each item cut out of its backing by colour (README, *Magenta backing*).

On a backing of a strong colour that no component shares (a magenta sheet, RGB about 216, 68, 101 as scanned), the item
is everything that is not that colour. `process_scan` then:

- cuts each item out of the backing by its colour distance from the backing surface (`Background.surface`, so uneven
  lighting does not matter), with an edge about a pixel soft;
- fills the piece's holes, so print inside the item that happens to be close to the backing colour stays opaque;
- removes the rim: the item's cut side reflects the backing, which leaves a thin band of backing-coloured pixels along
  the edge; pixels near the edge whose hue is the backing's, and darker than it, are dropped (never inside the item);
- for a card (``cast_mm``), takes the shadow it casts on the sheet instead by geometry (`cast.py`): the card is the
  rounded rectangle whose sides (gently bowed where a lifted edge images blurred) are fitted to where the
  backing-coloured band ends, so dark red print at the edge is not bitten into and the shadow not kept; a card has
  no reflecting cut side, so along its edge only the pixels the sheet (or the shadow) actually blends into are
  corrected, by unmixing (`decontaminate`), and print of the backing's hue keeps its halftone;
- tightens the item's rectangle to the piece, so the crop and its measured size are the item, not the item plus its rim.

The crop keeps this alpha channel over the untouched scan pixels and is written as a PNG with transparency.
Light (white lid) and dark (black paper) backings are not keyed: their colour is shared by item edges.

Ported from unstoppable-fan-prototype `tools/ingest/ufp_ingest/key.py` (D-162 there), where it was proven on the
owner's magenta re-scans of 2026-10-14.
"""
from __future__ import annotations

import dataclasses
from typing import Optional

import cv2
import numpy as np
from scipy import ndimage

from . import cast
from .detect import COLOURED_BACKING_CHROMA, Background, Region, coloured_backing, region_from_contour

KEY_MIN_CHROMA = COLOURED_BACKING_CHROMA   # backing chroma (OpenCV Lab a, b) from which a scan is keyed
SOFT_LO = 2.0           # alpha starts this far (Lab units) above the backing's own threshold `t_dist` ...
SOFT_HI = 16.0          # ... and is full this far above it
SOLID = 6.0             # a pixel this far above `t_dist` is card (the red tabs sit only ~23 from the owner's magenta)
RIM_BAND_MM = 0.4       # the rim is looked for this close to the edge (measured about 0.3 mm wide at 600 dpi)
RIM_TINT_MM = 0.15      # along the very edge, any backing-hued pixel is repainted (the raw rim is about 3 px at 600 dpi)
RIM_HUE_DEG = 30.0      # a rim pixel's hue is within this of the backing's
RIM_MIN_CHROMA = 10.0   # ... and it is coloured at least this much (grey and white edges are card)
RIM_MAX_DIST = 60.0     # ... and it is still this close to the backing colour
RIM_DARKER = 8.0        # ... and darker than the backing by this much (OpenCV L): the rim is the backing in shadow,
                        # a red tab of nearly the backing's hue is about as light as the backing (L 124 against 130)
MARGIN_MM = 3.0         # the search window around a detected item

DECON_SIGMA_MM = 0.1    # cards (decontaminate): colours are smoothed over this before the blend with the outside is
                        # estimated (a halftone's dots are about 0.2 mm apart) ...
DECON_REF_MM = 0.5      # ... the card's own colour is taken this far inside the edge (past the blur of a lifted corner) ...
DECON_MIN = 0.15        # ... and a pixel pulled at least this fraction of the way from it toward the colour outside is
DECON_MAX = 0.85        # unmixed; pulled further than this, it is the outside's and takes the nearest card pixel's colour
DECON_MIN_CONTRAST = 20.0  # the outside colour must differ from the card's by this much (BGR distance) to tell a blend
DECON_OFF_LINE = 0.2    # a blend is explained by the card's colour and the outside's: a pixel off that by more than this
DECON_OFF_LINE_PX = 8.0  # fraction of their distance plus this (BGR units) is print of its own (a light edge line) ...
DECON_OFF_SMOOTH = 0.1  # ... and the colours smoothed over the halftone, which should sit on the model exactly, by this
DECON_OFF_SMOOTH_PX = 6.0  # fraction plus this (also the pixel's own bound in the corner zone, past the band)
DECON_FLOOR_LAB = (44.0, 8.0, 2.0)  # the outside in shadow runs from the colour just past the body down to the near-black
                        # floor of a lifted card's umbra (OpenCV Lab, the owner's scans) ...
DECON_FLOOR_CHROMA = 5.0  # ... which still carries a trace of the backing's colour: a pixel with less is dark print
DECON_CORNER_ZONE_MM = 4.0  # within this of a fitted corner the cut-out keeps the shadow deeper (a lifted corner): there a
DECON_CORNER_MM = 0.3       # ... pixel up to this far in is judged on its own colour, with no halftone to allow for
SHADOW_DARKER = 25.0    # thick items (shadow_mm > 0): a shadow pixel is this much darker than the backing (OpenCV L) ...
SHADOW_NEUTRAL = 12.0   # ... and either has the backing's hue or is nearly grey (chroma under this): the cut side
SHADOW_HUE_DEG = 60.0   # the dark cut side of a magenta-backed board reads dark red, 35-45 degrees from the magenta
MARK_LIGHTER = 15.0     # drop_light: a mark is this much lighter than the backing (OpenCV L) ...
MARK_MAX_SHARE = 0.25   # ... and smaller than this share of the piece it touches
REMOVED_EXTRA_MAX = 0.2   # plausible_shadow: at most this much on top of REMOVED_MAX for a wide shadow (pipeline)
TINTED_REMOVED = 0.5    # ... and only when this share of what is removed is the backing darkened
SHADOW_TINT_DEG = 8.0   # tinted_shadow: a shadow pixel's BGR is within this angle of the backing's (a red piece: about 14)


CUT_L_MAX = 60.0        # printed-edge tokens: the cut side's near-black line (OpenCV L about 41-50, blurred) is removed when it
CUT_MARGIN = 25.0       # ... is darker than this and this much darker than the median of the token's own edge band
TOKEN_SHADOW_CHROMA = 22.0  # ... and the shadow's red ramp is this coloured, blurred (34-54; the Exhaustion token's brown ~13)
ONE_SIDED_MIN = 0.5     # a cut side and shadow lie on the side away from the lamp: the removed band's centre is at least
                        # this far (in piece radii) from the piece's centre (2026-10-15 tokens: 0.64-0.82; a band
                        # eaten all round, as a token's own edge taken for shadow, about 0.3) ...
REMOVED_MAX = 0.2       # ... and it is at most this share of the piece (those tokens: 4-15 %; an eaten ring, 25 %)


def backing_chroma(bgm: Background) -> float:
    return float(np.hypot(bgm.lab[1] - 128.0, bgm.lab[2] - 128.0))


def keyable(bgm: Optional[Background]) -> bool:
    """A scan is keyed when its backing is a strong colour."""
    return bgm is not None and coloured_backing(bgm)


@dataclasses.dataclass
class Keyed:
    region: Region          # tightened to the piece
    roi_bgra: np.ndarray    # the scan around the item, with the item's alpha
    origin: tuple           # full-resolution position of roi_bgra's top-left pixel
    rim_px: int             # pixels removed as rim (and as cast shadow)
    cast: Optional[dict] = None   # cards: per side the shadow removed (mm), the corner radius (mm) and the flags
    fit: Optional[cast.CastFit] = None   # cards: the fitted outline, for the crop that follows it (cast.rectify)


def _hue_deg(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.degrees(np.arctan2(b, a))


def key_region(full: np.ndarray, r: Region, bgm: Background, px_per_mm: float, shadow_mm: float = 0.0,
               neutral_shadow: bool = True, cast_mm: float = 0.0, cast_size_mm: Optional[tuple] = None,
               cast_size_tol_mm: float = 0.0, cast_radius_mm: Optional[float] = None,
               tinted_shadow: bool = False, drop_light: bool = False) -> Optional[Keyed]:
    """Cut one detected item out of a coloured backing; None when no piece is found under the item's centre.

    ``shadow_mm`` is for thick items (board pieces about 2 mm thick): on the side away from the scanner's lamp they show
    their dark cut side and cast a shadow on the sheet, a band up to about 1.3 mm wide that runs from black into dark
    backing colour. Dark pixels of the backing's hue, or nearly grey, within that distance of the edge and connected to
    the outside, are removed with it. Print inside the item is never touched (it is not connected to the outside).
    With ``neutral_shadow=False`` (tokens whose print runs to a dark grey or black edge) only the backing-hued part is
    removed: on magenta that is the dark-red shadow, while the token's own dark edge is nearly grey and stays.

    ``cast_mm`` is for cards: thin, but they cast a shadow too, dark red along the sides away from the lamp, up to about
    1 mm where the card's edge print is dark and 2 mm where the card lies lifted, which the cut-out keeps as card. Dark
    red print at the edge has the shadow's colour, so the card's outline is taken from geometry instead (`cast.fit`):
    each side is a gently bowed edge fitted to where the backing-coloured band ends, searched this deep, bounded at
    every position by that end, and the corners are rounded to the radius the lit corners show (``cast_radius_mm``
    when none does). A side whose line is not
    supported by most of its length, or that would put the item's size further than ``cast_size_tol_mm`` from
    ``cast_size_mm`` (short, long), keeps its outer edge and the item is flagged ``CAST_SHADOW_KEPT``."""
    H, W = full.shape[:2]
    m = int(round(MARGIN_MM * px_per_mm))
    xs = [p[0] for p in r.corners]
    ys = [p[1] for p in r.corners]
    x0, y0 = max(0, int(min(xs)) - m), max(0, int(min(ys)) - m)
    x1, y1 = min(W, int(max(xs)) + m + 1), min(H, int(max(ys)) + m + 1)
    roi = full[y0:y1, x0:x1]
    lab = cv2.cvtColor(roi, cv2.COLOR_BGR2LAB).astype(np.float32)
    surf = bgm.surface(roi.shape, (float(x0), float(y0)), 1.0)
    d = cv2.GaussianBlur(np.sqrt(((lab - surf) ** 2).sum(axis=2)), (0, 0), 0.8)
    lo, hi = bgm.t_dist + SOFT_LO, bgm.t_dist + SOFT_HI

    solid = (d > bgm.t_dist + SOLID).astype(np.uint8)
    solid = cv2.morphologyEx(solid, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    solid = _filled(solid)   # before picking the piece: the item's centre may be print close to the backing colour
    n, lbl, _st, _ = cv2.connectedComponentsWithStats(solid)
    cx, cy = int(round(r.cx)) - x0, int(round(r.cy)) - y0
    if not (0 <= cy < lbl.shape[0] and 0 <= cx < lbl.shape[1]) or lbl[cy, cx] == 0:
        return None
    piece = (lbl == lbl[cy, cx]).astype(np.uint8)
    if drop_light:
        # K794: a mark on the backing lighter than it (pale ink, a scuff) touching the piece is not the piece: a light
        # blob reaching the piece's outer edge, away from its centre and small beside it (MARK_MAX_SHARE; a light piece
        # with a dark centre is its own light body), is dropped
        light = ((piece > 0) & (lab[..., 0] > surf[..., 0] + MARK_LIGHTER)).astype(np.uint8)
        _n, ll, lst, _ = cv2.connectedComponentsWithStats(light)
        rim0 = (piece > 0) & (cv2.erode(piece, np.ones((5, 5), np.uint8)) == 0)
        drop = np.unique(ll[rim0 & (light > 0)])
        drop = [j for j in drop if j > 0 and j != ll[cy, cx] and lst[j, cv2.CC_STAT_AREA] < MARK_MAX_SHARE * piece.sum()]
        if not drop:
            return None
        piece[np.isin(ll, drop)] = 0
        piece = cv2.morphologyEx(piece, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        _n, lbl = cv2.connectedComponents(piece)
        if lbl[cy, cx] == 0:
            return None
        piece = (lbl == lbl[cy, cx]).astype(np.uint8)

    band_k = 2 * max(1, int(round(RIM_BAND_MM * px_per_mm))) + 1
    a, b = lab[..., 1] - 128.0, lab[..., 2] - 128.0
    chroma = np.hypot(a, b)
    dh = np.abs(((_hue_deg(a, b) - _hue_deg(np.float32(bgm.lab[1] - 128.0), np.float32(bgm.lab[2] - 128.0))) + 180) % 360 - 180)
    darker = lab[..., 0] < surf[..., 0] - RIM_DARKER
    cast_info = None
    if cast_mm > 0:
        # a card: its outline from geometry, the rim and the cast shadow both outside it (the rim rule is not used:
        # on a card it bit into red print at the edge)
        fit = cast.fit(piece, lab, surf, bgm.lab, px_per_mm, cast_mm, cast_size_mm, cast_size_tol_mm, cast_radius_mm)
        if fit is None:
            return None
        body = fit.body
        cast_info = {"removedMm": fit.removed_mm, "radiusMm": round(fit.radius_px / px_per_mm, 2), "flags": fit.flags}
    else:
        # the rim: backing-hued pixels in a band along the edge, removed only where they connect to the outside
        band = (piece > 0) & (cv2.erode(piece, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (band_k, band_k))) == 0)
        rim = band & (chroma > RIM_MIN_CHROMA) & (dh < RIM_HUE_DEG) & (d < RIM_MAX_DIST) & darker
        body = piece.copy()
        body[rim] = 0
    if shadow_mm > 0:
        k = 2 * max(1, int(round(shadow_mm * px_per_mm))) + 1
        deep = (piece > 0) & (cv2.erode(piece, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))) == 0)
        dark = lab[..., 0] < surf[..., 0] - SHADOW_DARKER
        hued = (chroma > RIM_MIN_CHROMA) & (dh < RIM_HUE_DEG)
        # the dark core of the band, and the backing-hued ramp between it and the sheet (what links it to the outside)
        dark_hued = (chroma > RIM_MIN_CHROMA) & (dh < SHADOW_HUE_DEG)
        if tinted_shadow:
            # K792: the shadow as the backing darkened, its colour (BGR) in the backing's proportions: a black or red
            # piece, or a coloured one, is not, whatever its darkness or hue
            sb = cv2.cvtColor(np.clip(surf, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)
            p = roi.astype(np.float32)
            cos = (p * sb).sum(axis=2) / (np.linalg.norm(p, axis=2) * np.linalg.norm(sb, axis=2) + 1e-6)
            shadow = (deep & darker & (cos > np.cos(np.radians(SHADOW_TINT_DEG)))).astype(np.uint8)
        elif neutral_shadow:
            shadow = (deep & ((dark & (dark_hued | (chroma < SHADOW_NEUTRAL))) | (hued & darker))).astype(np.uint8)
        else:
            # a token printed to its edge: measured beyond the halftone, the shadow's red is clearly coloured (a brown
            # edge print is not), and the cut side is a near-black line, whatever its tint, much darker than the token's
            # own edge (a black printed ring is as dark as it, and is kept)
            Lb = cv2.GaussianBlur(lab[..., 0], (0, 0), 2.0)
            cb = cv2.GaussianBlur(chroma, (0, 0), 2.0)
            edge_band = (piece > 0) & (cv2.erode(piece, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (band_k * 3, band_k * 3))) == 0)
            ref = edge_band & (cb <= TOKEN_SHADOW_CHROMA)   # the token's own edge, not the red shadow beside it
            edge_L = float(np.median(Lb[ref])) if ref.any() else 0.0
            cut = Lb < min(CUT_L_MAX, edge_L - CUT_MARGIN)
            red = cb > TOKEN_SHADOW_CHROMA
            shadow = (deep & ((dark & dark_hued & red) | cut | (hued & darker & red))).astype(np.uint8)
        outer = (piece > 0) & (cv2.erode(piece, np.ones((5, 5), np.uint8)) == 0)
        n_s, lbl_s = cv2.connectedComponents(shadow)
        touching = np.unique(lbl_s[outer & (shadow > 0)])
        body[np.isin(lbl_s, touching[touching > 0])] = 0
    n, lbl, st, _ = cv2.connectedComponentsWithStats(body)
    if n < 2:
        return None
    body = _filled((lbl == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8))
    body = cv2.morphologyEx(body, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    body = cv2.erode(body, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    rim_px = int(piece.sum() - body.sum())

    # soft edge: the colour ramp where it is inside the body's 1-px border, the body's own edge elsewhere
    soft = np.clip((d - lo) / (hi - lo), 0.0, 1.0)
    edge = cv2.GaussianBlur(body.astype(np.float32), (0, 0), 0.8)
    alpha = np.where(cv2.erode(body, np.ones((3, 3), np.uint8)) > 0, 1.0, np.minimum(edge, np.maximum(soft, edge * 0.5)))
    alpha = (np.clip(alpha, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
    # the soft edge, the transparent margin and the pixels along the edge that still have the backing's hue take the
    # colour of the nearest pixel well inside the item, so no backing colour is left along the edge (it would show as a
    # pink line on any background): any such pixel within RIM_TINT_MM of the edge (the sheet's tint on a light edge is
    # lighter than the sheet), and deeper in, up to the rim band, only one darker than the backing (the cut side in
    # shadow). Print of the backing's hue deeper in is as light as the sheet or lighter and is kept: repainting it
    # smeared the pixels outward into streaks on cards with pink or red art at the edge
    full_alpha = (alpha == 255).astype(np.uint8)
    if cast_mm > 0:
        # a card has no cut side to reflect the backing: its edge pixels are the card's own, blended with the sheet (or
        # the shadow) over a pixel or two. The rule below took every darker pixel of the backing's hue within the rim
        # band for rim and overwrote it with a pixel from further in, which smeared the halftone of pink or red art,
        # and of dark print with red dots, into streaks up to 0.4 mm wide along every edge
        roi = decontaminate(roi, alpha, body, px_per_mm, fit.corners, surf[..., 0])
    else:
        inner = cv2.erode(full_alpha, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (band_k, band_k))) > 0
        tint_k = 2 * max(1, int(round(RIM_TINT_MM * px_per_mm))) + 1
        tint = cv2.erode(full_alpha, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (tint_k, tint_k))) == 0
        hued = (chroma > RIM_MIN_CHROMA) & (dh < RIM_HUE_DEG)
        target = (alpha < 255) | (~inner & hued & (darker | tint))
        if inner.any():
            _dist, (iy, ix) = ndimage.distance_transform_edt(~inner, return_indices=True)
            roi = np.where(target[..., None], roi[iy, ix], roi)

    cnts, _ = cv2.findContours(body, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    tight = region_from_contour(c + np.array([[x0, y0]], np.int32), flags=r.flags, source=r.source)
    tight._mask = body * 255
    tight._origin = (x0, y0)
    return Keyed(region=tight, roi_bgra=np.dstack([roi, alpha]), origin=(x0, y0), rim_px=rim_px, cast=cast_info,
                 fit=fit if cast_mm > 0 else None)


def decontaminate(roi: np.ndarray, alpha: np.ndarray, body: np.ndarray, px_per_mm: float, corners: Optional[list] = None,
                  sheet_L: Optional[np.ndarray] = None) -> np.ndarray:
    """A card's edge colours corrected without touching its print. An opaque pixel within RIM_TINT_MM of the edge, or
    within DECON_CORNER_MM of it near a fitted corner (``corners``, ROI pixels, where the cut-out keeps the shadow of a
    lifted corner up to that deep), is taken for a blend of the card and the outside when its colour is explained by
    the card's own colour DECON_REF_MM inside, ``r``, and the colour just outside the body, ``g``:

    - where that outside is in shadow (darker than the sheet, ``sheet_L``, by RIM_DARKER), the shadow runs from ``g``
      down to the umbra's near-black floor ``f`` (DECON_FLOOR_LAB): ``r + p * (g - r) + b * (f - g)``, with the floor's
      share ``b`` at most the outside's ``p``; a pixel with less colour than the floor keeps (DECON_FLOOR_CHROMA) is
      dark print, not shadow;
    - on the lit sheet the paper's white cut edge shows along the edge too: ``r + a * (g - r) + w * (W - r)``, the
      sheet's share ``a`` and the white's ``w`` adding up to one at most; on a shadow side this explanation is tried as
      well and taken when it fits better.

    The outside's share is taken off, ``observed - p * (g - r) - b * (f - g)`` (or ``- a * (g - r)``: the white edge
    is the card's), which keeps the halftone's own variation, or past DECON_MAX the pixel is the outside's and takes
    the nearest clean pixel's colour past the band (in the corner zone, the card's own colour ``r``). The shares are
    read from colours smoothed over the halftone (DECON_SIGMA_MM), which must sit on the model within DECON_OFF_SMOOTH,
    the pixel itself within DECON_OFF_LINE; on the outermost ring and in the corner zone the pixel is judged on its own
    where that shows more of the outside, or of the white edge, and so is a pixel of the band that is plainly the
    outside's own on a shadow side (the floor the cut-out keeps a few pixels deep). Print of the backing's hue sits at the card's own
    colour (share about 0), a light or dark edge line off the model, and both are left alone; the backing's hue is
    not asked of a pixel (a shadow blended into a green card has neither's hue), the model is. Every pixel that is
    not fully opaque (the soft ring and the transparent margin) then takes the corrected colour of the nearest opaque
    pixel, so no backing colour rides on the crop's edge."""
    opaque = alpha == 255
    if not opaque.any():
        return roi
    bgr = roi.astype(np.float32)
    out = bgr.copy()
    sig = max(1.0, DECON_SIGMA_MM * px_per_mm)

    def smooth(mask: np.ndarray) -> np.ndarray:
        m = mask.astype(np.float32)
        num = cv2.GaussianBlur(bgr * m[..., None], (0, 0), sig)
        den = cv2.GaussianBlur(m, (0, 0), sig)
        return num / np.maximum(den, 1e-6)[..., None]

    def lab(x: np.ndarray) -> np.ndarray:
        return cv2.cvtColor(np.ascontiguousarray(x).clip(0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)

    ref_k = 2 * max(1, int(round(DECON_REF_MM * px_per_mm))) + 1
    deep = cv2.erode(opaque.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ref_k, ref_k))) > 0
    outside = body == 0
    if deep.any() and outside.any():
        depth = ndimage.distance_transform_edt(opaque)
        tint_d, zone_d = max(1.0, RIM_TINT_MM * px_per_mm), max(1.0, DECON_CORNER_MM * px_per_mm)
        tint = opaque & (depth <= tint_d)
        ring = opaque & (depth <= 1.5)
        near = np.zeros(opaque.shape, bool)
        if corners is not None:
            yy, xx = np.mgrid[0:opaque.shape[0], 0:opaque.shape[1]]
            for cx, cy in corners:
                near |= (xx - float(cx)) ** 2 + (yy - float(cy)) ** 2 <= (DECON_CORNER_ZONE_MM * px_per_mm) ** 2
        zone = near & opaque & (depth <= zone_d)
        card_s, outside_s = smooth(opaque), smooth(outside)
        _d, (ry, rx) = ndimage.distance_transform_edt(~deep, return_indices=True)
        _d, (oy, ox) = ndimage.distance_transform_edt(~outside, return_indices=True)
        # the pixels in question (the band and the corner zone), as rows: the card's own colour inside, the colour
        # outside, the pixel and its smoothed colour
        sel = tint | zone
        iy, ix = np.nonzero(sel)
        r, g = card_s[ry[iy, ix], rx[iy, ix]], outside_s[oy[iy, ix], ox[iy, ix]]
        c_s, c_p = card_s[iy, ix], bgr[iy, ix]
        if corners is not None and sheet_L is not None:
            # a cast shadow wraps round a corner onto the end of the lit side, inside the fitted arc (which runs a pixel
            # or two outside the card's own): the outside nearest to that sliver is the lit sheet, and no blend of the
            # card and the lit sheet is darker than both, so on a light-edged card it passed for print. Such a pixel
            # in the corner zone is read against the nearest outside in shadow instead
            dark_out = outside & (lab(outside_s)[..., 0] < sheet_L - RIM_DARKER)
            if dark_out.any():
                ds, (sy, sx) = ndimage.distance_transform_edt(~dark_out, return_indices=True)
                wrap = zone[iy, ix] & (ds[iy, ix] <= DECON_CORNER_ZONE_MM * px_per_mm) & \
                    (lab(c_p[None])[0][:, 0] < np.minimum(lab(r[None])[0][:, 0], lab(g[None])[0][:, 0]) - RIM_DARKER)
                g = np.where(wrap[:, None], outside_s[sy[iy, ix], sx[iy, ix]], g)
        v = g - r
        vv = (v * v).sum(axis=1)
        absv = np.sqrt(vv)
        if sheet_L is None:
            far = outside & (ndimage.distance_transform_edt(outside) > 3 * sig)
            sheet = float(np.median(lab(bgr)[..., 0][far])) if far.any() else 255.0
        else:
            sheet = sheet_L[iy, ix]
        lab_g = lab(g[None])[0]
        shadow = lab_g[:, 0] < sheet - RIM_DARKER
        chroma_g = np.hypot(lab_g[:, 1] - 128.0, lab_g[:, 2] - 128.0)
        f = cv2.cvtColor(np.array([[[DECON_FLOOR_LAB[0], DECON_FLOOR_LAB[1] + 128, DECON_FLOOR_LAB[2] + 128]]], np.uint8),
                         cv2.COLOR_LAB2BGR)[0, 0].astype(np.float32)[None, :]
        floor_dir, white_dir = f - g, 255.0 - r

        def explain(c: np.ndarray) -> tuple:
            """The colours ``c`` as blends: the outside's share, what is taken off, the white edge's share and the
            residual off the model (inf where a gate rules the model out)."""
            y = c - r
            lc = lab(c[None])[0]
            neutral = (np.hypot(lc[:, 1] - 128.0, lc[:, 2] - 128.0) < DECON_FLOOR_CHROMA) & (chroma_g > RIM_MIN_CHROMA)
            p_d, b_d, res_d = _blend_fit(y, v, floor_dir, nested=True)
            res_d = np.where(neutral & ((b_d > 0.3 * p_d) | (p_d >= DECON_MAX)), np.inf, res_d)
            a_w, w_w, res_w = _blend_fit(y, v, white_dir, nested=False)
            res_w = np.where(neutral & (a_w >= DECON_MAX), np.inf, res_w)
            use_d = shadow & ~(res_w < res_d)
            share = np.where(use_d, p_d, a_w)
            taken = np.where(use_d[:, None], p_d[:, None] * v + b_d[:, None] * floor_dir, a_w[:, None] * v)
            kept = np.where(use_d[:, None], 0.0, w_w[:, None] * white_dir)
            return share, taken, kept, np.where(use_d, 0.0, w_w), np.where(use_d, res_d, res_w)

        p_s, taken_s, kept_s, w_s, res_s = explain(c_s)
        p_p, taken_p, kept_p, w_p, res_p = explain(c_p)
        # the blend on the outermost ring is a single pixel, and at a corner the kept shadow is the pixel's own:
        # judged on its own where that shows more of the outside, or the paper's white edge, than the smoothed colour
        own = (ring[iy, ix] | zone[iy, ix]) & ((p_p > p_s) | (w_p > w_s + 0.05))
        # past the ring on a shadow side, a pixel that is plainly the outside's own (the floor the cut-out keeps 2-3 px
        # deep: its own fit tight and past DECON_MAX) is judged on its own too; the smoothed colour, averaged with the
        # card behind it, would read it as a half blend and leave a dark line
        own |= tint[iy, ix] & ~ring[iy, ix] & shadow & (res_p <= DECON_OFF_SMOOTH * absv + DECON_OFF_SMOOTH_PX) & (p_p >= DECON_MAX)
        p = np.where(own, p_p, p_s)
        taken = np.where(own[:, None], taken_p, taken_s)
        kept = np.where(own[:, None], kept_p, kept_s)
        contrast = vv >= DECON_MIN_CONTRAST ** 2
        p = np.where(contrast, p, 0.0)
        resid = np.linalg.norm((c_p - r) - taken - kept, axis=1)
        fits = resid <= DECON_OFF_LINE * absv + DECON_OFF_LINE_PX
        fits &= (res_s <= DECON_OFF_SMOOTH * absv + DECON_OFF_SMOOTH_PX) | own
        fits &= np.isfinite(np.where(own, res_p, res_s))
        past = zone[iy, ix] & ~tint[iy, ix]
        fits = np.where(past, resid <= DECON_OFF_SMOOTH * absv + DECON_OFF_SMOOTH_PX, fits)
        cand = fits & contrast
        mix = cand & (p >= DECON_MIN) & (p < DECON_MAX)
        gone = np.zeros(opaque.shape, bool)
        gone[iy, ix] = cand & (p >= DECON_MAX)
        if gone.any():
            # the outside's own pixels run in from the edge: an island deeper in is print
            _n, lbl = cv2.connectedComponents(gone.astype(np.uint8), connectivity=8)
            touching = np.unique(lbl[gone & ring])
            gone &= np.isin(lbl, touching[touching > 0])
        # the blend's share is taken off (not divided out: dividing by 1 - p would amplify whatever the pixel carries
        # off the model, noise and halftone alike)
        out[iy[mix], ix[mix]] = c_p[mix] - taken[mix]
        if gone.any():
            # along a side the nearest clean pixel past the band (a halftone keeps its texture); at a corner, where the
            # kept shadow is a sliver up to DECON_CORNER_MM wide, the card's own colour (copies from further in made
            # blocks of the halftone's cells there)
            cand_img = np.zeros(opaque.shape, bool)
            cand_img[iy, ix] = cand
            keep = opaque & ~cand_img & (depth > tint_d) & ~near
            if keep.any():
                _d, (ky, kx) = ndimage.distance_transform_edt(~keep, return_indices=True)
                out[gone] = out[ky, kx][gone]
            own_colour = np.zeros(bgr.shape, np.float32)
            own_colour[iy, ix] = r
            gz = gone & near
            out[gz] = own_colour[gz]
    _d, (iy, ix) = ndimage.distance_transform_edt(~opaque, return_indices=True)
    out[~opaque] = out[iy, ix][~opaque]
    return out.clip(0, 255).astype(np.uint8)


def _blend_fit(y: np.ndarray, u: np.ndarray, t: np.ndarray, nested: bool) -> tuple:
    """Per pixel (rows of 3), ``y`` as ``c1 * u + c2 * t`` by least squares under ``0 <= c2 <= c1 <= 1`` (``nested``: the second
    colour is a darkening of the first, the floor of the outside) or ``c1, c2 >= 0, c1 + c2 <= 1`` (two colours added
    to the card's). The minimum over a triangle lies inside it or on an edge: each is solved and the best taken.
    Returns c1, c2 and the residual's norm."""
    A11, A12, A22 = (u * u).sum(axis=1), (u * t).sum(axis=1), (t * t).sum(axis=1)
    b1, b2 = (y * u).sum(axis=1), (y * t).sum(axis=1)
    det = A11 * A22 - A12 * A12
    ok = det > 1e-3
    dets = np.where(ok, det, 1.0)
    c1, c2 = (b1 * A22 - A12 * b2) / dets, (A11 * b2 - A12 * b1) / dets
    feasible = ok & (c1 >= 0) & (c2 >= 0) & (c1 <= 1) & ((c2 <= c1) if nested else (c1 + c2 <= 1))

    def res(x1: np.ndarray, x2: np.ndarray) -> np.ndarray:
        return np.linalg.norm(y - x1[:, None] * u - x2[:, None] * t, axis=1)

    zero = np.zeros_like(c1)
    cands = [(np.where(feasible, c1, 0.0), np.where(feasible, c2, 0.0), np.where(feasible, res(c1, c2), np.inf))]
    e = (b1 / np.maximum(A11, 1e-6)).clip(0.0, 1.0)                     # c2 = 0: the plain blend line
    cands.append((e, zero, res(e, zero)))
    if nested:
        d = u + t                                                          # c2 = c1
        e = ((y * d).sum(axis=1) / np.maximum((d * d).sum(axis=1), 1e-6)).clip(0.0, 1.0)
        cands.append((e, e, res(e, e)))
        e = (((y - u) * t).sum(axis=1) / np.maximum(A22, 1e-6)).clip(0.0, 1.0)   # c1 = 1
        cands.append((zero + 1.0, e, res(zero + 1.0, e)))
    else:
        e = (b2 / np.maximum(A22, 1e-6)).clip(0.0, 1.0)                 # c1 = 0
        cands.append((zero, e, res(zero, e)))
        d = u - t                                                          # c1 + c2 = 1
        e = (((y - t) * d).sum(axis=1) / np.maximum((d * d).sum(axis=1), 1e-6)).clip(0.0, 1.0)
        cands.append((e, 1.0 - e, res(e, 1.0 - e)))
    C1, C2, R = (np.stack([c[k] for c in cands]) for k in range(3))
    k = R.argmin(axis=0)
    i = np.arange(k.shape[0])
    return C1[k, i], C2[k, i], R[k, i]


def _filled(mask: np.ndarray) -> np.ndarray:
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = np.zeros_like(mask)
    cv2.drawContours(out, cnts, -1, 1, -1)
    return out


def shifted(r: Region, origin: tuple) -> Region:
    """The same region in the coordinates of a patch whose top-left pixel is at ``origin``."""
    ox, oy = origin
    s = dataclasses.replace(r, cx=r.cx - ox, cy=r.cy - oy, corners=[[x - ox, y - oy] for x, y in r.corners])
    s._mask, s._origin = r._mask, (r._origin[0] - ox, r._origin[1] - oy)
    return s


def plausible_shadow(plain: Keyed, cut: Keyed, max_share: float = REMOVED_MAX) -> bool:
    """Whether what ``cut`` removed from ``plain`` looks like a cut side and shadow: on one side, and not too much."""
    side, share = one_sided(plain, cut)
    return side >= ONE_SIDED_MIN and share <= max_share


def _removed(plain: Keyed, cut: Keyed) -> tuple:
    def mask(k: Keyed, origin, shape):
        out = np.zeros(shape, bool)
        a = k.roi_bgra[..., 3] > 128
        oy, ox = k.origin[1] - origin[1], k.origin[0] - origin[0]
        ys, xs = np.nonzero(a)
        ys, xs = ys + oy, xs + ox
        ok = (ys >= 0) & (xs >= 0) & (ys < shape[0]) & (xs < shape[1])
        out[ys[ok], xs[ok]] = True
        return out
    origin = (min(plain.origin[0], cut.origin[0]), min(plain.origin[1], cut.origin[1]))
    shape = (max(plain.origin[1] + plain.roi_bgra.shape[0], cut.origin[1] + cut.roi_bgra.shape[0]) - origin[1],
             max(plain.origin[0] + plain.roi_bgra.shape[1], cut.origin[0] + cut.roi_bgra.shape[1]) - origin[0])
    a0, a1 = mask(plain, origin, shape), mask(cut, origin, shape)
    return origin, a0, a1, a0 & ~a1


def removed_tinted(full: np.ndarray, plain: Keyed, cut: Keyed, bgm: Background) -> float:
    """K794: the share of the pixels ``cut`` removed from ``plain`` that are the backing darkened (as the tinted cut
    reads a shadow) in the scan ``full``."""
    (ox, oy), _a0, _a1, removed = _removed(plain, cut)
    ys, xs = np.nonzero(removed)
    ok = (ys + oy < full.shape[0]) & (xs + ox < full.shape[1])
    ys, xs = ys[ok], xs[ok]
    if not len(ys):
        return 0.0
    surf = bgm.surface(removed.shape, (float(ox), float(oy)), 1.0)[ys, xs]
    sb = cv2.cvtColor(np.clip(surf, 0, 255).astype(np.uint8)[None], cv2.COLOR_LAB2BGR)[0].astype(np.float32)
    p = full[ys + oy, xs + ox].astype(np.float32)
    L = cv2.cvtColor(p.astype(np.uint8)[None], cv2.COLOR_BGR2LAB)[0][:, 0].astype(np.float32)
    cos = (p * sb).sum(axis=1) / (np.linalg.norm(p, axis=1) * np.linalg.norm(sb, axis=1) + 1e-6)
    return float(((cos > np.cos(np.radians(SHADOW_TINT_DEG))) & (L < surf[:, 0] - RIM_DARKER)).mean())


def one_sided(plain: Keyed, cut: Keyed) -> tuple:
    """How far the pixels ``cut`` removed from ``plain`` lie to one side, in radii of the plain piece (0: evenly all
    round; about 0.65-0.8: a crescent on one side, as a cut side and shadow are), and their share of the piece."""
    _o, a0, _a1, removed = _removed(plain, cut)
    if not removed.any() or not a0.any():
        return 1.0, 0.0
    ys, xs = np.nonzero(a0)
    ry, rx = np.nonzero(removed)
    radius = np.sqrt(len(ys) / np.pi)
    return float(np.hypot(ry.mean() - ys.mean(), rx.mean() - xs.mean()) / radius), float(len(ry) / len(ys))
