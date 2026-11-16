"""The outline of a thin item (a card) on a coloured backing, from geometry: four sides fitted robustly to where the
backing-coloured band along each side ends, joined by rounded corners of the radius the lit corners show.

A card casts a shadow on the sheet along the sides away from the scanner's lamp. The shadow is the backing in shadow
(its hue, darker), about 0.2 mm wide where the card's edge print is light and up to 1-2 mm where it is dark or the
card lies lifted, and the cut-out by colour (`key.key_region`) keeps it as card: a dark red band along those sides
that also makes the card measure too large. Dark red print at the edge (crimson art) has the same colour, so no
per-pixel colour rule can take the shadow without biting into that print. What tells them apart is geometry: the
card's edge is a line, or the gentle curve the band's end follows where a lifted edge images blurred, and the
shadow ends on it everywhere, while print of the shadow's colour reaches past it only in places.

So, per side, the end of the backing-hued dark band is measured at every position along the side (walking inward
from the outside), a gently bowed edge (a parabola, at most FIT_MAX_BOW_PX off a straight line over the side) is
fitted to those points robustly (the largest set agreeing within a pixel or two wins; positions where print carried
the band deeper are outliers and are ignored), and the card is everything inside the four edges, with corners rounded
to the radius measured on the corners the lamp lights. Where the band's end lies clearly outside the fitted edge over
a stretch (a curled corner the curve cannot follow), the band's end is the cut there, so no print is lost to the fit.
A side whose edge is not supported by most of its positions, or that would make the card's size disagree with the
plug-in's size for the kind, keeps its outer edge instead (nothing of the item removed there) and the item is flagged
``CAST_SHADOW_KEPT``.

A pixel is removed only where the fitted edge and the band both say shadow: pixels inside the fitted edge are never
removed, whatever their colour, nor pixels more than PROTECT_MIN_PX inside the band's end. What this cannot tell
apart is a uniform border of the shadow's colour, narrower than the size tolerance, along most of a side: it is
taken for shadow.

The crop is a perspective warp from the straight border lines along the four fitted edges (`rectify`), as any
other item's crop. Where a cut side's fitted edge bows inward (the blur of a lifted edge puts the band's end deeper
in the middle of the side while the print behind it stays straight), a transparent crescent at most the bow deep is
left inside the straight border; the print is never bent to the fit."""
from __future__ import annotations

import dataclasses
from typing import Optional

import cv2
import numpy as np
from scipy import ndimage

CAST_MIN_CHROMA = 8.0    # a cast-shadow pixel keeps at least this much of the backing's colour (OpenCV Lab chroma):
                         # the deepest shadow of a lifted card is nearly black with a trace of magenta (chroma 6-16 on
                         # the owner's scans); the card's black print is nearly grey, chroma under 6 but for odd pixels
CAST_HUE_DEG = 15.0      # ... and the backing's hue within this, on colour smoothed over CAST_SIGMA_MM (the shadow is
CAST_SIGMA_MM = 0.06     # the backing darkened, within about 12 degrees of it; red or brown print at a card's edge is
                         # a halftone 20-40 degrees off it on average)
CAST_DARKER = 8.0        # ... and darker than the backing by this much (OpenCV L), as the rim rule
CAST_RISE = 10.0         # the shadow darkens all the way to the card: the band ends where L rises this much above the
                         # darkest pixel so far (the card's own light edge line, or its print), whatever the colour
ANCHOR_L = 70.0          # a band that ends on a pixel at least this light and not of the backing's colour (chroma
ANCHOR_MAX_CHROMA = 20.0 # under this, or hue ANCHOR_HUE_DEG or more off the backing's) ends on the card for sure: an
ANCHOR_HUE_DEG = 25.0    # anchor. A band that ends by colour on a dark pixel may have run a few pixels into black
                         # print tinted by the glare off the sheet (L 43-65, chroma 9-15, the backing's hue), which
                         # happens where a card's light edge line is worn away
ANCHOR_MIN = 40          # the edge is moved out to its anchors when at least this many positions, and ANCHOR_MIN_FRAC
ANCHOR_MIN_FRAC = 0.1    # of them, have one ...
ANCHOR_MAX_PX = 10.0     # ... and they lie at most this far outside the edge most positions agree on
SMOOTH_POS = 9           # band ends are median-filtered over this many positions before they bound the cut ...
PROTECT_MIN_PX = 2.5     # ... and bound it only where they lie this far outside the fitted edge (a curled corner
                         # the curve cannot follow); nearer the edge, the fitted curve is the cut
UMBRA_L = 50.0           # a shadow that gets this dark (a lifted card) ends in a floor of near-black pixels whose
UMBRA_MIN_CHROMA = 4.0   # colour fades to a trace of the backing's (chroma 4-8, within UMBRA_HUE_DEG): the band goes on
UMBRA_HUE_DEG = 30.0     # through them while they stay within UMBRA_FLAT of the darkest pixel so far
UMBRA_FLAT = 6.0
OUTSIDE_MM = 1.0         # the band is looked for from this far outside the item's outer edge ...
CORNER_MM = 4.5          # ... along each side except this much at both ends (the rounded corner and the shadow's corner)
FIT_TOL_PX = 2.0         # a position supports a fitted edge when its band end lies within this of it
FIT_MIN_SUPPORT = 0.5    # a side's edge is accepted when at least this fraction of its positions support it
FIT_MAX_TILT = 0.03      # a side's edge may tilt this much (tangent) against the item's rectangle
FIT_MAX_BOW_PX = 12.0    # ... and bow this much over the side's length (the band's end along a lifted, blurred edge bows)
FIT_GRID = 30            # candidate edges run through triples of band ends taken at this many positions along the side
FIT_MIN_SPAN_MM = 8.0    # ... at least this far apart
RADIUS_DEFAULT_MM = 3.0  # corner radius when no lit corner shows one
RADIUS_RANGE_MM = (1.0, 6.0)
CORNER_TOL_PX = 4.0      # a lit corner's circle may be centred this far from where it would be tangent to both edges
LIT_DEPTH_MM = 0.1       # a side whose median band is at most this deep is lit: nothing is cut there and its corners
                         # show the card's own radius
EDGE_MARGIN_PX = 1.0     # the cut stays this far outside the fitted edge (the pixel of blend a lit edge keeps too)
ERODE_PX = 1.0           # the cut-out's final erosion (key.key_region, a 3 x 3 kernel), which the crop's border follows
BORDER_SMOOTH_MM = 2.0   # the body's outer edge is smoothed over this length before the crop's border envelops it: lint
                         # and fuzz protruding from a worn edge (a fraction of a millimetre wide) do not push it out,
                         # a tab of the card's edge (millimetres long) does


@dataclasses.dataclass
class Side:
    name: str                # top, right, bottom, left (in scan coordinates, of the item's rectangle)
    origin: np.ndarray       # one end of the rectangle's side (ROI pixels)
    t: np.ndarray            # unit vector along the side
    n: np.ndarray            # unit outward normal
    length: float
    s: np.ndarray = None     # positions along the side where the band end was measured
    d_out: np.ndarray = None  # the item's outer edge at each position (signed distance from the side, + outward)
    d_in: np.ndarray = None   # where the band ends (the card's edge as colour sees it)
    light: np.ndarray = None  # the band ended on a light pixel that is not the backing's colour: an anchor
    line: tuple = None       # (c, a, b): the fitted edge, d = c * s^2 + a * s + b (c = 0: a straight line)
    support: float = 0.0     # fraction of positions within FIT_TOL_PX of the line
    depth_mm: float = 0.0    # median band depth (d_out - d_in)
    kept: bool = False       # the fit was rejected: the outer edge is used instead

    def point(self, s: float, d: float) -> np.ndarray:
        return self.origin + self.t * s + self.n * d

    def edge(self, s) -> np.ndarray:
        """The fitted edge's signed distance from the rectangle's side at position(s) ``s``."""
        c, a, b = self.line
        return c * np.asarray(s, np.float64) ** 2 + a * np.asarray(s, np.float64) + b

    def tangent(self, s: float) -> tuple[np.ndarray, np.ndarray]:
        """(point, unit direction) of the fitted edge's tangent at ``s``."""
        c, a, _ = self.line
        u = self.t + self.n * (2 * c * s + a)
        return self.point(s, float(self.edge(s))), u / max(np.hypot(*u), 1e-9)


@dataclasses.dataclass
class CastFit:
    body: np.ndarray                 # the item inside the fitted outline (uint8 0/1, ROI)
    sides: list                      # four Side
    corners: list                    # the four line intersections, tl, tr, br, bl (ROI pixels)
    radius_px: float
    removed_mm: dict                 # per side, the median band depth removed (0 on a lit side)
    flags: list
    quad: list = None                # the crop's corners, tl, tr, br, bl: the body's straight envelope (`rectify`)


def band_colour(lab: np.ndarray, surf: np.ndarray, bgm_lab: list, px_per_mm: float) -> tuple[np.ndarray, np.ndarray]:
    """(shadow, trace): pixels coloured like the backing in shadow (its hue, still coloured, darker than it), and
    pixels with only a trace of that colour (the floor of a deep shadow, or dark print: the walk tells them apart)."""
    a, b = lab[..., 1] - 128.0, lab[..., 2] - 128.0
    chroma = np.hypot(a, b)
    sig = max(0.5, CAST_SIGMA_MM * px_per_mm)
    sa, sb = cv2.GaussianBlur(a, (0, 0), sig), cv2.GaussianBlur(b, (0, 0), sig)
    bh = np.degrees(np.arctan2(np.float32(bgm_lab[2] - 128.0), np.float32(bgm_lab[1] - 128.0)))
    dh = np.abs(((np.degrees(np.arctan2(sb, sa)) - bh) + 180.0) % 360.0 - 180.0)
    darker = lab[..., 0] < surf[..., 0] - CAST_DARKER
    shadow = (chroma > CAST_MIN_CHROMA) & (dh < CAST_HUE_DEG) & darker
    trace = (chroma > UMBRA_MIN_CHROMA) & (dh < UMBRA_HUE_DEG) & darker
    plain = (chroma < ANCHOR_MAX_CHROMA) | (dh >= ANCHOR_HUE_DEG)   # not the backing's colour at all
    return shadow, trace, plain


def rect_sides(mask: np.ndarray) -> Optional[list]:
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    pts = cv2.boxPoints(cv2.minAreaRect(c)).astype(np.float64)
    ctr = pts.mean(axis=0)
    pts = pts[np.argsort(np.arctan2(pts[:, 1] - ctr[1], pts[:, 0] - ctr[0]))]   # tl, tr, br, bl (clockwise as displayed)
    sides = []
    for j, name in enumerate(("top", "right", "bottom", "left")):
        p, q = pts[j], pts[(j + 1) % 4]
        L = float(np.hypot(*(q - p)))
        t = (q - p) / max(L, 1e-9)
        n = np.array([-t[1], t[0]])
        if np.dot((p + q) / 2.0 - ctr, n) < 0:
            n = -n
        sides.append(Side(name, p, t, n, L))
    return sides


def measure_side(side: Side, body: np.ndarray, shadow: np.ndarray, trace: np.ndarray, plain: np.ndarray,
                 L: np.ndarray, px_per_mm: float, cast_mm: float) -> None:
    """At every position along the side, the item's outer edge and where the band ends inside it. Walking inward
    from the outer edge, the band goes on while the pixel is coloured like the backing in shadow, or (once the shadow
    has got darker than UMBRA_L) still has a trace of that colour and stays on the floor; it ends where L rises
    CAST_RISE above the darkest pixel so far (the card's light edge line or its print), or at a pixel of another
    colour (a single one is bridged when the two after it are band again)."""
    H, W = body.shape
    c = CORNER_MM * px_per_mm
    s = np.arange(c, side.length - c, 1.0)
    d = np.arange(OUTSIDE_MM * px_per_mm, -(cast_mm + OUTSIDE_MM) * px_per_mm, -1.0)   # outside -> inside
    if len(s) < 10 or len(d) < 3:
        side.s = side.d_out = side.d_in = np.zeros(0)
        return
    mx = (side.origin[0] + side.t[0] * s[None, :] + side.n[0] * d[:, None]).astype(np.float32)
    my = (side.origin[1] + side.t[1] * s[None, :] + side.n[1] * d[:, None]).astype(np.float32)
    inb = (mx >= 0) & (mx <= W - 1) & (my >= 0) & (my <= H - 1)
    sample = lambda m, fill: cv2.remap(m, mx, my, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=fill)
    bcol = (sample(body, 0) > 0) & inb
    scol = sample(shadow.astype(np.uint8), 0) > 0
    tcol = sample(trace.astype(np.uint8), 0) > 0
    pcol = sample(plain.astype(np.uint8), 0) > 0
    lcol = sample(L.astype(np.float32), 255.0)
    has = bcol.any(axis=0)
    i0 = np.argmax(bcol, axis=0)                      # first item pixel from the outside
    nd, ns = lcol.shape
    before = np.arange(nd)[:, None] < i0[None, :]
    darkest = np.minimum.accumulate(np.where(before, 999.0, lcol), axis=0)
    darkest = np.vstack([np.full((1, ns), 999.0), darkest[:-1]])   # the darkest pixel before this one
    floor = tcol & (darkest < UMBRA_L) & (lcol <= darkest + UMBRA_FLAT)
    inband = (scol | floor) & bcol & (lcol <= darkest + CAST_RISE)
    nxt1 = np.vstack([inband[1:], np.zeros((1, ns), bool)])
    nxt2 = np.vstack([inband[2:], np.zeros((2, ns), bool)])
    run = inband | (nxt1 & nxt2)
    stop = (~run) & ~before
    k = np.where(stop.any(axis=0), np.argmax(stop, axis=0), nd - 1)
    sel = has & (k > 0) & (k < nd - 1)                # a band that reaches the search depth has no end: left out
    cols = np.arange(ns)
    side.s = s[sel]
    side.d_out = d[i0[sel]] + 0.5
    side.d_in = d[k[sel]] + 0.5
    side.light = ((lcol[k, cols] >= ANCHOR_L) & pcol[k, cols])[sel]
    side.depth_mm = float(np.median(side.d_out - side.d_in)) / px_per_mm if sel.any() else 0.0


def fit_edge(s: np.ndarray, e: np.ndarray, px_per_mm: float, length: float) -> tuple[Optional[tuple], float]:
    """The gently bowed edge d = c * s^2 + a * s + b supported by most of the points (within FIT_TOL_PX), refitted on
    its supporters. Candidates run through triples of points at FIT_GRID positions (deterministic); the bow over the
    side is at most FIT_MAX_BOW_PX and the tilt at most FIT_MAX_TILT. Returns ((c, a, b), support fraction)."""
    n = len(s)
    if n < 10:
        return None, 0.0
    grid = np.unique(np.linspace(0, n - 1, FIT_GRID).round().astype(int))
    i, j, k = np.meshgrid(grid, grid, grid, indexing="ij")
    span = FIT_MIN_SPAN_MM * px_per_mm
    ok = ((s[j] - s[i]) > span) & ((s[k] - s[j]) > span)
    i, j, k = i[ok], j[ok], k[ok]
    if len(i) == 0:
        return None, 0.0
    # the parabola through three points, solved in closed form (divided differences)
    s1, s2, s3 = s[i], s[j], s[k]
    e1, e2, e3 = e[i], e[j], e[k]
    c = ((e3 - e2) / (s3 - s2) - (e2 - e1) / (s2 - s1)) / (s3 - s1)
    a = (e2 - e1) / (s2 - s1) - c * (s1 + s2)
    b = e1 - a * s1 - c * s1 * s1
    max_c = FIT_MAX_BOW_PX / max((length / 2.0) ** 2, 1.0)
    keep = (np.abs(c) <= max_c) & (np.abs(a) <= FIT_MAX_TILT) & (np.abs(2 * c * length + a) <= FIT_MAX_TILT)
    c, a, b = c[keep], a[keep], b[keep]
    if len(a) == 0:
        return None, 0.0
    res = np.abs(e[None, :] - (c[:, None] * s[None, :] ** 2 + a[:, None] * s[None, :] + b[:, None]))
    inl = res <= FIT_TOL_PX
    count = inl.sum(axis=1)
    best = np.flatnonzero(count == count.max())
    best = best[np.argmin(np.where(inl[best], res[best], 0.0).sum(axis=1))]
    coef, sup = (float(c[best]), float(a[best]), float(b[best])), inl[best]
    for _ in range(2):   # least squares on the supporters, then the supporters of that curve
        if sup.sum() < 3:
            break
        cc, aa, bb = np.polyfit(s[sup], e[sup], 2)
        if abs(cc) > max_c or abs(aa) > FIT_MAX_TILT or abs(2 * cc * length + aa) > FIT_MAX_TILT:
            break
        coef = (float(cc), float(aa), float(bb))
        sup = np.abs(e - (cc * s * s + aa * s + bb)) <= FIT_TOL_PX
    return coef, float(sup.sum()) / n


def _intersect(p1, u1, p2, u2) -> np.ndarray:
    A = np.array([[u1[0], -u2[0]], [u1[1], -u2[1]]], np.float64)
    if abs(np.linalg.det(A)) < 1e-9:
        return (p1 + p2) / 2.0
    t = np.linalg.solve(A, p2 - p1)
    return p1 + u1 * t[0]


def corner_radius(outline: np.ndarray, sides: list, px_per_mm: float) -> tuple[Optional[float], list]:
    """The corner radius from the lit corners: a circle fitted to the outline between the two tangent points, accepted
    when most of those points lie on it and it is centred where a circle tangent to both edges would be. The edges
    here are the outline's own near the corner (the fitted lines run a few pixels outside it on a lit side, and a
    lifted edge's band end bows). Returns (radius mm or None, per-corner radii mm or None)."""
    cnts, _ = cv2.findContours(outline, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        return None, [None] * 4
    pts = max(cnts, key=cv2.contourArea).reshape(-1, 2).astype(np.float64)
    lo, hi = RADIUS_RANGE_MM[0] * px_per_mm, RADIUS_RANGE_MM[1] * px_per_mm
    radii = []
    for k in range(4):
        prev, nxt = sides[(k - 1) % 4], sides[k]      # corner k joins side k-1 (ending there) and side k (starting there)
        if prev.depth_mm > LIT_DEPTH_MM or nxt.depth_mm > LIT_DEPTH_MM or prev.kept or nxt.kept \
                or len(prev.s) < 10 or len(nxt.s) < 10:
            radii.append(None)
            continue
        # each edge near the corner: the outer-edge samples closest to it (CORNER_MM to 2 * CORNER_MM away)
        e1 = float(np.median(prev.d_out[prev.s > prev.length - 2 * CORNER_MM * px_per_mm]))
        e2 = float(np.median(nxt.d_out[nxt.s < 2 * CORNER_MM * px_per_mm]))
        p1, p2 = prev.point(prev.length, e1), nxt.point(0.0, e2)
        C = _intersect(p1, prev.t, p2, nxt.t)
        u1, u2 = -prev.t, nxt.t      # from the corner along each edge
        rel = pts - C
        x1, x2 = rel @ u1, rel @ u2
        sel = (x1 > 2.5) & (x1 < hi) & (x2 > 2.5) & (x2 < hi)   # the arc: off both straight edges
        if sel.sum() < 10:
            radii.append(None)
            continue
        P = rel[sel]
        keep = np.ones(len(P), bool)
        r = cx = cy = 0.0
        for _ in range(3):   # least squares, then again on the points within 1.5 px of that circle
            Q = P[keep]
            if len(Q) < 10:
                break
            A = np.column_stack([Q[:, 0], Q[:, 1], np.ones(len(Q))])
            (D, E, F), *_ = np.linalg.lstsq(A, -(Q[:, 0] ** 2 + Q[:, 1] ** 2), rcond=None)
            cx, cy = -D / 2.0, -E / 2.0
            r = float(np.sqrt(max(cx * cx + cy * cy - F, 0.0)))
            keep = np.abs(np.hypot(P[:, 0] - cx, P[:, 1] - cy) - r) <= 1.5
        half = np.arccos(np.clip(u1 @ u2, -1.0, 1.0)) / 2.0
        exp = (u1 + u2) / max(np.hypot(*(u1 + u2)), 1e-9) * (r / max(np.sin(half), 1e-6))
        if lo <= r <= hi and keep.mean() >= 0.7 and np.hypot(cx - exp[0], cy - exp[1]) <= CORNER_TOL_PX:
            radii.append(r / px_per_mm)
        else:
            radii.append(None)
    good = [r for r in radii if r is not None]
    return (float(np.median(good)) if good else None), radii


def rounded_rect(shape: tuple, corners: list, sides: list, r: float, which: Optional[list] = None) -> np.ndarray:
    """The item's outline filled: each side's fitted edge (sampled along the side) joined at ``corners``, those in
    ``which`` (all by default) rounded to radius r (pixels), rasterised at 1/16 px."""
    SH = 4
    f = 1 << SH
    m = np.zeros(shape, np.uint8)
    poly = []
    for k, sd in enumerate(sides):
        poly.append(np.asarray(corners[k], np.float64))
        if sd.s is not None and len(sd.s):
            for si in np.linspace(float(sd.s[0]), float(sd.s[-1]), 48):
                poly.append(sd.point(si, float(sd.edge(si))))
    poly = np.array(poly) * f
    cv2.fillPoly(m, [poly.round().astype(np.int32)], 1, lineType=cv2.LINE_8, shift=SH)
    quad = m.copy()
    for k in range(4):
        if which is not None and not which[k]:
            continue
        C = np.asarray(corners[k], np.float64)
        u1 = -sides[(k - 1) % 4].tangent(sides[(k - 1) % 4].length)[1]   # from the corner back along the previous side
        u2 = sides[k].tangent(0.0)[1]                                     # from the corner along this side
        # the corner's circle is tangent to both sides at distance r from the corner (for any corner angle)
        half = np.arccos(np.clip(u1 @ u2, -1.0, 1.0)) / 2.0
        ctr = C + (u1 + u2) / max(np.hypot(*(u1 + u2)), 1e-9) * (r / max(np.sin(half), 1e-6))
        sq = np.array([C, C + u1 * r, ctr, C + u2 * r]) * f
        cv2.fillPoly(m, [sq.round().astype(np.int32)], 0, lineType=cv2.LINE_8, shift=SH)
        cv2.circle(m, (int(round(ctr[0] * f)), int(round(ctr[1] * f))), int(round(r * f)), 1, -1, cv2.LINE_8, SH)
    return m & quad


def envelope(sd: Side, px_per_mm: float, d: Optional[np.ndarray] = None) -> tuple:
    """A straight line along the side's outer edge (``d`` at the side's positions: the item's own outer edge when
    None) with (nearly) every edge point on or inside it. As a side's fitted line, nothing is cut on that side."""
    d = sd.d_out if d is None else d
    ln, _ = fit_edge(sd.s, d, px_per_mm, sd.length)
    if ln is None:
        return 0.0, 0.0, float(np.percentile(d, 99)) if len(d) else 0.0
    # the straight part only: the bow is dropped and the line pushed out over the points instead
    a = float(ln[1] + 2 * ln[0] * sd.length / 2.0)
    b = float(np.mean(d - a * sd.s))
    over = d - (a * sd.s + b)
    return 0.0, a, b + max(0.0, float(np.percentile(over, 99)))


def outer_edge(sd: Side, body: np.ndarray, px_per_mm: float, cast_mm: float) -> np.ndarray:
    """``body``'s outer edge at the side's positions (signed distance from the side, + outward), walking inward from
    outside as `measure_side` does; the item's own outer edge where the body has no pixel."""
    H, W = body.shape
    if sd.s is None or not len(sd.s):
        return np.zeros(0)
    d = np.arange(OUTSIDE_MM * px_per_mm, -(cast_mm + OUTSIDE_MM) * px_per_mm, -1.0)
    mx = (sd.origin[0] + sd.t[0] * sd.s[None, :] + sd.n[0] * d[:, None]).astype(np.float32)
    my = (sd.origin[1] + sd.t[1] * sd.s[None, :] + sd.n[1] * d[:, None]).astype(np.float32)
    inb = (mx >= 0) & (mx <= W - 1) & (my >= 0) & (my <= H - 1)
    bcol = (cv2.remap(body, mx, my, cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT, borderValue=0) > 0) & inb
    has = bcol.any(axis=0)
    return np.where(has, d[np.argmax(bcol, axis=0)] + 0.5, sd.d_out)


def fit(piece: np.ndarray, lab: np.ndarray, surf: np.ndarray, bgm_lab: list, px_per_mm: float, cast_mm: float,
        size_mm: Optional[tuple] = None, size_tol_mm: float = 0.0, radius_mm: Optional[float] = None) -> Optional[CastFit]:
    """``piece``: the filled item as cut out by colour (with its shadow), in a ROI whose Lab pixels and backing
    surface are ``lab`` and ``surf`` (``bgm_lab`` the backing's median Lab). ``size_mm`` (short, long) with
    ``size_tol_mm``: the kind's size; a side whose fitted line would put the item's size further off than that keeps
    its outer edge. ``radius_mm``: the kind's corner radius (measured on the lit corners when None)."""
    shadow, trace, plain = band_colour(lab, surf, bgm_lab, px_per_mm)
    sides = rect_sides(piece)
    if sides is None:
        return None
    flags = []
    for sd in sides:
        measure_side(sd, piece, shadow, trace, plain, lab[..., 0], px_per_mm, cast_mm)
        if len(sd.s) < 10:
            sd.kept, sd.line = True, (0.0, 0.0, 0.0)
            continue
        if sd.depth_mm <= LIT_DEPTH_MM:
            sd.line = envelope(sd, px_per_mm)      # a lit side: nothing is cut (the plain cut-out's edge)
            continue
        ln, sd.support = fit_edge(sd.s, sd.d_in, px_per_mm, sd.length)
        if ln is None or sd.support < FIT_MIN_SUPPORT:
            sd.kept, sd.line = True, envelope(sd, px_per_mm)
        else:
            c, a, b = ln
            # where the band ended on a light pixel of another colour the edge is certain; where it ended by colour on
            # a dark one it may lie a few pixels into black print tinted by the glare off the sheet. Most of a
            # dark-framed side with a worn light edge line ends the second way, so the edge most positions agree on can
            # run inside the card: move it out to the anchors
            n_anchor = int(sd.light.sum())
            if n_anchor >= ANCHOR_MIN and n_anchor >= ANCHOR_MIN_FRAC * len(sd.s):
                shift = float(np.median(sd.d_in[sd.light] - (c * sd.s[sd.light] ** 2 + a * sd.s[sd.light] + b)))
                if 0.0 < shift <= ANCHOR_MAX_PX:
                    b += shift
            sd.line = (c, a, b + EDGE_MARGIN_PX)   # the card's edge as the band ends, a pixel of blend kept
    if size_mm and size_tol_mm > 0:
        def size():   # (width, height) of the crop these edges give, in pixels
            return quad_size(quad(sides, _corners(sides)))
        w, h = size()
        exp_w, exp_h = (size_mm[0], size_mm[1]) if w <= h else (size_mm[1], size_mm[0])
        for exp, (i, j), axis in ((exp_w, (3, 1), 0), (exp_h, (0, 2), 1)):
            if abs(size()[axis] / px_per_mm - exp) <= size_tol_mm:
                continue
            # distrust the side with the deeper band first, then the other
            for sd in sorted((sides[i], sides[j]), key=lambda x: -x.depth_mm):
                if sd.kept or sd.depth_mm <= LIT_DEPTH_MM:
                    continue
                sd.kept, sd.line = True, envelope(sd, px_per_mm)
                if abs(size()[axis] / px_per_mm - exp) <= size_tol_mm:
                    break
    if any(sd.kept for sd in sides):
        flags.append("CAST_SHADOW_KEPT")
    corners = _corners(sides)
    measured, _radii = corner_radius(piece, sides, px_per_mm)
    r_px = (measured if measured is not None else radius_mm if radius_mm is not None else RADIUS_DEFAULT_MM) * px_per_mm
    shadowed = [sd.depth_mm > LIT_DEPTH_MM and not sd.kept for sd in sides]
    # only a corner next to a side that is cut is rounded (the shadow wraps around it); the others keep the item's own
    # outline, and the radius is a pixel under the measured one, so the arc never bites the card's corner
    round_corner = [shadowed[(k - 1) % 4] or shadowed[k] for k in range(4)]
    rr = rounded_rect(piece.shape, corners, sides, max(0.0, r_px - EDGE_MARGIN_PX), round_corner)
    # the line bounds the cut from inside (print of the shadow's colour past it is kept); the band end at each position
    # bounds it from outside (a light tab the line runs through is kept too): a pixel goes only when both say shadow
    body = (piece > 0).astype(np.uint8) & (rr | protected(piece.shape, sides, px_per_mm, cast_mm))
    # the crop's border: along each side a straight line enveloping the body's outer edge (as a lit side's line),
    # smoothed over BORDER_SMOOTH_MM, a pixel in for the cut-out's erosion, so the crop encloses everything the cut
    # kept (a tab the band's end protected included, not the lint on the edge) and leaves a transparent crescent only
    # where the fitted edge bows inward
    lines = []
    smooth = 2 * max(1, int(round(BORDER_SMOOTH_MM * px_per_mm / 2.0))) + 1
    for sd in sides:
        prof = outer_edge(sd, body, px_per_mm, cast_mm)
        if len(prof) >= 3:
            prof = ndimage.median_filter(prof, size=min(smooth, len(prof)), mode="nearest")
        _c, a, b = envelope(sd, px_per_mm, prof)
        u = sd.t + sd.n * a
        lines.append((sd.point(0.0, b - ERODE_PX), u / max(float(np.hypot(*u)), 1e-9)))
    crop = [_intersect(*lines[(k - 1) % 4], *lines[k]) for k in range(4)]
    removed = {sd.name: (0.0 if sd.kept or sd.depth_mm <= LIT_DEPTH_MM or sd.s is None or not len(sd.s) else
                         round(float(np.median(sd.d_out - sd.edge(sd.s))) / px_per_mm, 2))
               for sd in sides}
    return CastFit(body=body, sides=sides, corners=corners, radius_px=r_px, removed_mm=removed, flags=flags, quad=crop)


def protected(shape: tuple, sides: list, px_per_mm: float, cast_mm: float) -> np.ndarray:
    """Along each cut side, where the band's end (smoothed over SMOOTH_POS positions) lies PROTECT_MIN_PX or more
    outside the fitted line, the pixels from that end inward: never removed, whatever the line says. Elsewhere, at
    positions without a band end (the walk reached its depth) and at the corners, the line is the cut."""
    m = np.zeros(shape, np.uint8)
    depth = (cast_mm + OUTSIDE_MM) * px_per_mm
    for sd in sides:
        if sd.kept or sd.depth_mm <= LIT_DEPTH_MM or sd.s is None or len(sd.s) < SMOOTH_POS:
            continue
        d_f = ndimage.median_filter(sd.d_in, size=SMOOTH_POS, mode="nearest") + EDGE_MARGIN_PX
        keep = d_f - sd.edge(sd.s) >= PROTECT_MIN_PX
        for si, di in zip(sd.s[keep], d_f[keep]):
            x0, y0 = sd.point(si, di).round().astype(int)
            x1, y1 = sd.point(si, di - depth).round().astype(int)
            cv2.line(m, (int(x0), int(y0)), (int(x1), int(y1)), 1, 2)
    return m


def _corner_s(sides: list, corners: list) -> list:
    """For each corner k, (s on side k-1 where it ends, s on side k where it starts): the corner projected on each
    side's frame, so each side's curve is parametrised exactly from corner to corner."""
    out = []
    for k in range(4):
        prev, nxt = sides[(k - 1) % 4], sides[k]
        C = np.asarray(corners[k], np.float64)
        out.append((float((C - prev.origin) @ prev.t), float((C - nxt.origin) @ nxt.t)))
    return out


def _corners(sides: list) -> list:
    """The four corners of the fitted outline, tl, tr, br, bl: where the end tangents of consecutive edges meet."""
    out = []
    for k in range(4):
        (p1, u1), (p2, u2) = sides[(k - 1) % 4].tangent(sides[(k - 1) % 4].length), sides[k].tangent(0.0)
        out.append(_intersect(p1, u1, p2, u2))
    return out


def border(sd: Side, s0: float, s1: float, inset: float) -> tuple[np.ndarray, np.ndarray]:
    """The straight line the crop's border runs along on this side, as (point, unit direction): parallel to the chord
    between the fitted edge's ends at ``s0`` and ``s1`` (its corners), pushed out to the edge's outermost point
    between them, so the border never crosses the body (a concave edge keeps its chord), then ``inset`` inward."""
    d0, d1 = float(sd.edge(s0)), float(sd.edge(s1))
    slope = (d1 - d0) / (s1 - s0) if abs(s1 - s0) > 1e-9 else 0.0
    ss = np.linspace(s0, s1, 256)
    over = float(np.max(sd.edge(ss) - (d0 + slope * (ss - s0))))
    p = sd.point(s0, d0 + max(0.0, over) - inset)
    u = sd.t + sd.n * slope
    return p, u / max(float(np.hypot(*u)), 1e-9)


def quad(sides: list, corners: list) -> list:
    """The four corners, tl, tr, br, bl (the order of ``corners``), of the crop the fitted edges give before the body
    is cut (the size check): where the `border` lines of consecutive sides meet. The border hugs the body as it is
    after the cut-out's erosion: on a cut side, inside the pixel of blend the edge keeps; on a lit side, the erosion
    in from the line outside the item's outer edge."""
    cs = _corner_s(sides, corners)
    lines = []
    for k, sd in enumerate(sides):
        inset = ERODE_PX if (sd.kept or sd.depth_mm <= LIT_DEPTH_MM) else EDGE_MARGIN_PX
        lines.append(border(sd, cs[k][1], cs[(k + 1) % 4][0], inset))
    return [_intersect(*lines[(k - 1) % 4], *lines[k]) for k in range(4)]


def quad_size(q: list) -> tuple[float, float]:
    """(width, height) in pixels of the crop a quadrilateral tl, tr, br, bl gives: the mean length of its opposite
    edges (top and bottom; left and right)."""
    q = [np.asarray(c, np.float64) for c in q]
    w = (float(np.hypot(*(q[1] - q[0]))) + float(np.hypot(*(q[2] - q[3])))) / 2.0
    h = (float(np.hypot(*(q[3] - q[0]))) + float(np.hypot(*(q[2] - q[1])))) / 2.0
    return w, h


def rectify(roi_bgra: np.ndarray, fit: CastFit, portrait_corners: list, origin: tuple) -> np.ndarray:
    """The crop: the item warped upright by a perspective transform, as any other item's crop, from the quadrilateral
    of its body's straight envelope (``fit.quad``), portrait, with the corner that ``portrait_corners`` (the region's,
    full-resolution) puts top-left at the top-left. Where a cut side's fitted edge bows inward (the blur of a lifted
    edge puts the band's end deeper in the middle of the side while the print behind it is straight), a transparent
    crescent at most the bow deep is left inside the straight border: the print is never bent to the fit. The crop's
    size is the mean length of opposite border edges."""
    ox, oy = origin
    fc = np.array(fit.corners, np.float64)                    # ROI coordinates, clockwise from the scan's top-left
    pc = np.array(portrait_corners, np.float64) - [ox, oy]    # the region's tl, tr, br, bl
    m = int(np.argmin(np.hypot(*(fc - pc[0]).T)))             # the fitted corner that is the crop's top-left
    q = fit.quad if fit.quad is not None else quad(fit.sides, fit.corners)
    tl, tr, br, bl = (np.asarray(q[(m + k) % 4], np.float64) for k in range(4))
    w, h = quad_size([tl, tr, br, bl])
    W, H = max(1, int(round(w))), max(1, int(round(h)))
    # the border lines are pixel boundaries (a body's outer edge is its outer pixel's boundary, in the pixel-centre
    # coordinates everything here uses), so they map to the crop's outer boundary and the crop's edge pixels are the
    # body's outer pixels, as a plain crop's are
    src = np.float32([tl, tr, br, bl])
    dst = np.float32([[-0.5, -0.5], [W - 0.5, -0.5], [W - 0.5, H - 0.5], [-0.5, H - 0.5]])
    M = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(roi_bgra, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
