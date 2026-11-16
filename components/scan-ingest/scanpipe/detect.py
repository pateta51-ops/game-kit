"""Detect, refine, and rectify cards and components on flatbed scans (and, less reliably, photos).

Designed for scans on a uniform backing (dark recommended, any uniform colour works):

1. Work on a downscaled copy (long edge WORK_PX) for speed.
2. Model the backing as a smooth colour *surface*: a robust low-order polynomial in Lab,
   fitted in two passes to pixels that look like backing, optionally with smooth decays along
   each scan edge (the soft shadow a white scanner lid casts along its hinge or a glass edge).
   Lighting gradients and scanner vignetting therefore do not matter, on a dark cloth or on the
   white lid alike. The model is chosen from the data, so a uniform flatbed backing yields a flat
   colour (degree 0 or 1) and nothing is over-fitted.
3. Foreground = distance from the surface above a robust threshold OR local texture above
   the backing's own texture level (catches dark printed card backs on dark cloth).
   On a dark backing (black paper or cloth) a third cue joins them: the same distance, capped
   and blurred over about a millimetre, above a threshold set by the backing's own blurred
   noise. Black print that runs to an item's edge differs from black backing by only a few Lab
   units per pixel, far below the per-pixel threshold, but consistently, so the blurred cue
   finds the whole item while lint and dust specks on the backing stay below it (see
   ``faint_cue``).
4. Morphology, then hole filling, except for holes that look like backing: a gap enclosed
   between two touching items stays open, which lets the splitter separate them.
5. Connected components -> candidate items. Oversized or irregular blobs (touching items)
   are split with a distance-transform watershed; blobs that cannot be split are reported
   as rejected (drawn on the review sheet), never dropped silently.
6. Each item = minimum-area rectangle of its silhouette's convex hull, so rotation and small
   misplacement do not matter. The outline polygon is still recorded (it shows a clipped corner
   or a neighbour that leaked in). Which way up an item lies is read from its print, not its
   outline (each project's plug-in decides).
7. Each item is refined at full resolution inside its own ROI, constrained to its own
   silhouette so a neighbour inside the ROI cannot leak in.
8. Items are numbered in reading order (rows top to bottom, then left to right).

A region can also be recovered from a *prior* (the matching front-scan region) when a card
back is too dark to separate from the backing (see ``refine_with_prior``).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

WORK_PX = 1600


# --------------------------------------------------------------------------- data


@dataclass
class Region:
    """A detected item in full-resolution pixel coordinates (portrait-normalised)."""

    cx: float
    cy: float
    w: float  # short side
    h: float  # long side
    angle: float  # degrees between the region's "down" axis and the image +y axis
    corners: list  # [[x, y]] * 4 in order tl, tr, br, bl (portrait-normalised)
    area: float  # silhouette area, px^2
    fill: float  # silhouette area / rectangle area (1.0 = perfect rectangle)
    source: str = "detected"  # detected | refined | prior
    flags: list = field(default_factory=list)
    outline: Optional[list] = None  # silhouette polygon, normalised 0..1 in the crop frame
    # In-memory only (not serialised): full-res ROI mask and its origin, and the coarse
    # silhouette (full-res coordinates) used to constrain refinement.
    _mask: Optional[np.ndarray] = field(default=None, repr=False)
    _origin: tuple = field(default=(0, 0), repr=False)
    _sil: Optional[np.ndarray] = field(default=None, repr=False)
    _sil_tol: float = field(default=0.0, repr=False)

    def to_json(self) -> dict:
        return {
            "cx": round(self.cx, 1),
            "cy": round(self.cy, 1),
            "w": round(self.w, 1),
            "h": round(self.h, 1),
            "angle": round(self.angle, 2),
            "corners": [[round(float(x), 1), round(float(y), 1)] for x, y in self.corners],
            "area": round(self.area, 0),
            "fill": round(self.fill, 4),
            "source": self.source,
            "flags": list(self.flags),
        }


@dataclass
class DetectParams:
    min_area_frac: float = 0.0008  # smallest item (~7 x 7 mm on an A4 bed), fraction of scan area
    min_fill: float = 0.55  # silhouette / rectangle
    min_solidity: float = 0.80  # silhouette / convex hull
    merge_ratio: float = 1.75  # area > ratio x median -> try to split
    texture: bool = True  # use the local-texture cue (dark backs on dark cloth)
    surface_degree: int = 3  # highest polynomial degree tried for the background surface (0 = flat colour)
    card_px: Optional[tuple] = None  # expected standard card (short, long) side in full-res px, when the DPI is known
    # Every item size the scans may hold, (short, long) in full-res px, from the project's plug-in. An item that
    # matches one of them is never split as "touching items".
    item_px: tuple = ()
    # Item sizes, (short, long) full-res px, of components that are irregular by design (deep notches, tabs), from
    # the plug-in. A blob of one of these sizes is that component: it is kept whole, never rejected or split.
    shaped_px: tuple = ()
    # Backing median lightness (OpenCV 8-bit L, 0..255) below which the backing counts as dark and the faint
    # cue is used. Black paper scans at about 3-15, black cloth at about 15-35; a white lid at about 230.
    dark_l: float = 60.0


@dataclass
class Background:
    lab: list  # median backing colour (OpenCV 8-bit Lab)
    t_dist: float  # threshold on the Lab distance from the background surface
    t_tex: float  # local-std threshold at work resolution
    t_tex_full: float  # local-std threshold at full resolution
    scale: float  # work / full
    full_shape: tuple = (0, 0)  # (H, W) of the full-resolution image
    deg: int = 0  # degree of the surface polynomial (0 = flat colour)
    coef: Optional[list] = None  # per Lab channel, a (deg+1) x (deg+1) matrix C[i][j] for x^i * y^j
    # Edge-shadow terms: per Lab channel, coefficients of exp(-d / s) where d is the distance from the left,
    # right, top and bottom scan edges, for each scale s in edge_scales (fractions of the scan's short side).
    edge: Optional[list] = None
    edge_scales: tuple = (0.02, 0.06)
    spread: float = 0.0  # robust spread of the backing's residual distance (Lab units)
    t_chroma: float = 6.0  # chroma (a, b) distance below which an enclosed hole still looks like backing
    # Dark backing (black paper or cloth): the faint cue is on, with its threshold and blur (work pixels).
    dark: bool = False
    t_faint: float = 0.0
    faint_sigma: float = 3.0

    def surface(self, shape, origin=(0.0, 0.0), px: float = 1.0) -> np.ndarray:
        """Backing colour (Lab, float32, shape h x w x 3) for an image patch.

        ``origin`` is the full-res position of the patch's top-left pixel and ``px`` the number
        of full-res pixels per patch pixel (1 for full-res ROIs, 1/scale for the work image).
        """
        h, w = shape[:2]
        if not self.coef or self.deg == 0:
            flat = np.array([c[0][0] for c in self.coef] if self.coef else self.lab, np.float32)
            if not self.edge:
                return np.broadcast_to(flat.reshape(1, 1, 3), (h, w, 3))
            out = np.empty((h, w, 3), np.float32)
            out[...] = flat.reshape(1, 1, 3)
        else:
            Hf, Wf = self.full_shape
            xn = 2.0 * (origin[0] + np.arange(w) * px) / max(Wf - 1, 1) - 1.0
            yn = 2.0 * (origin[1] + np.arange(h) * px) / max(Hf - 1, 1) - 1.0
            Xp = np.stack([xn ** i for i in range(self.deg + 1)], axis=1)  # (w, d+1)
            Yp = np.stack([yn ** j for j in range(self.deg + 1)], axis=1)  # (h, d+1)
            out = np.empty((h, w, 3), np.float32)
            for ch in range(3):
                C = np.asarray(self.coef[ch], np.float64)
                out[..., ch] = Yp @ C.T @ Xp.T
        if self.edge:
            ex, ey = _edge_basis(origin[0] + np.arange(w) * px, origin[1] + np.arange(h) * px, self.full_shape,
                                 self.edge_scales)
            k = ex.shape[1]
            for ch in range(3):
                c = np.asarray(self.edge[ch], np.float64)
                out[..., ch] += (ey @ c[k:])[:, None] + (ex @ c[:k])[None, :]
        return out

    def summary(self) -> dict:
        return {
            "lab": [round(float(v), 1) for v in self.lab],
            "t_dist": round(self.t_dist, 2),
            "t_tex": round(self.t_tex, 2),
            "t_tex_full": round(self.t_tex_full, 2),
            "surfaceDegree": self.deg,
            "edgeShadow": bool(self.edge),
            "spread": round(self.spread, 2),
            "t_chroma": round(self.t_chroma, 2),
            "dark": self.dark,
            "t_faint": round(self.t_faint, 2),
        }


@dataclass
class Detection:
    regions: list  # list[Region], full resolution, reading order
    background: Background
    rejected: list  # [{"cx","cy","w","h","corners","reason"}] full resolution


# --------------------------------------------------------------------- utilities


def odd(n: float) -> int:
    n = max(3, int(round(n)))
    return n if n % 2 == 1 else n + 1


def border_ring(a: np.ndarray, frac: float = 0.025) -> np.ndarray:
    """Pixels of the outer ring of an image, flattened to (N, C) or (N,)."""
    h, w = a.shape[:2]
    t = max(2, int(min(h, w) * frac))
    parts = [a[:t], a[-t:], a[:, :t], a[:, -t:]]
    if a.ndim == 2:
        return np.concatenate([p.reshape(-1) for p in parts])
    return np.concatenate([p.reshape(-1, a.shape[2]) for p in parts])


def lab_distance(img_bgr: np.ndarray, bg_lab: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    bg = np.asarray(bg_lab, np.float32)
    if bg.ndim == 1:
        bg = bg.reshape(1, 1, 3)
    return np.sqrt(((lab - bg) ** 2).sum(axis=2))


def local_std(gray: np.ndarray, k: int) -> np.ndarray:
    g = gray.astype(np.float32)
    mu = cv2.blur(g, (k, k))
    mu2 = cv2.blur(g * g, (k, k))
    return np.sqrt(np.maximum(mu2 - mu * mu, 0.0))


def robust_upper(values: np.ndarray, k: float) -> float:
    """median + k * 1.4826 * MAD — an outlier-resistant 'top of the background' level."""
    v = values.astype(np.float64).reshape(-1)
    if v.size == 0:
        return 0.0
    med = float(np.median(v))
    mad = float(np.median(np.abs(v - med))) * 1.4826
    return med + k * max(mad, 0.5)


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """Fill every enclosed hole in a binary (0/255) mask."""
    h, w = mask.shape
    padded = cv2.copyMakeBorder(mask, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    ffmask = np.zeros((h + 4, w + 4), np.uint8)
    cv2.floodFill(padded, ffmask, (0, 0), 255)  # outside background -> 255
    holes = cv2.bitwise_not(padded)[1:-1, 1:-1]  # only unreachable background stays 255
    return cv2.bitwise_or(mask, holes)


def fill_holes_except_backing(mask: np.ndarray, d: np.ndarray, dab: np.ndarray, s: np.ndarray, t_d: float,
                              t_ab: float, t_s: float, min_keep_px: int) -> np.ndarray:
    """Fill enclosed holes, except holes that look like backing.

    A hole looks like backing when its mean distance from the backing surface, its mean chroma
    distance and its mean texture are all backing-like. Chroma is the decisive cue: lighting
    shifts lightness, not chroma, so dark print (neutral grey or black) on coloured cloth fails it.
    A gap enclosed between touching items stays open; dark print inside a card is filled.
    """
    inv = (mask == 0).astype(np.uint8)
    n, lbl, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    if n <= 1:
        return mask
    outside = np.unique(np.concatenate([lbl[0], lbl[-1], lbl[:, 0], lbl[:, -1]]))
    flat = lbl.reshape(-1)
    cnt = np.bincount(flat, minlength=n).astype(np.float64)
    mean_d = np.bincount(flat, weights=d.reshape(-1).astype(np.float64), minlength=n) / np.maximum(cnt, 1)
    mean_s = np.bincount(flat, weights=s.reshape(-1).astype(np.float64), minlength=n) / np.maximum(cnt, 1)
    mean_ab = np.bincount(flat, weights=dab.reshape(-1).astype(np.float64), minlength=n) / np.maximum(cnt, 1)
    fill = np.ones(n, bool)
    fill[0] = False  # label 0 = the foreground itself
    fill[outside] = False
    keep_open = (cnt >= min_keep_px) & (mean_d < 0.85 * t_d) & (mean_ab < t_ab) & (mean_s < t_s)
    fill &= ~keep_open
    out = mask.copy()
    out[fill[lbl]] = 255
    return out


def portrait_corners(rect) -> tuple[list, float, float, float]:
    """Corners tl, tr, br, bl of a minAreaRect with the long side as 'down'.

    Returns (corners, w, h, angle_deg). Deterministic for near-axis-aligned rects.
    """
    pts = cv2.boxPoints(rect).astype(np.float64)
    v1 = pts[1] - pts[0]
    v2 = pts[3] - pts[0]
    l1, l2 = float(np.hypot(*v1)), float(np.hypot(*v2))
    if l1 >= l2:
        long_vec, h, w = v1, l1, l2
    else:
        long_vec, h, w = v2, l2, l1
    down = long_vec / max(h, 1e-9)
    if down[1] < -1e-3 or (abs(down[1]) <= 1e-3 and down[0] < 0):
        down = -down
    right = np.array([down[1], -down[0]])  # down=(0,1) -> right=(1,0)
    c = np.array(rect[0], dtype=np.float64)
    tl = c - right * w / 2 - down * h / 2
    tr = c + right * w / 2 - down * h / 2
    br = c + right * w / 2 + down * h / 2
    bl = c - right * w / 2 + down * h / 2
    # Tilt of the item's long axis, in degrees; positive = item turned clockwise as displayed.
    angle = -math.degrees(math.atan2(down[0], down[1]))
    return [tl.tolist(), tr.tolist(), br.tolist(), bl.tolist()], w, h, angle


def shape_stats(cnt: np.ndarray) -> tuple[float, float]:
    """(fill, solidity) of a contour: area / min-area-rect area, area / convex-hull area."""
    hull = cv2.convexHull(cnt)
    rect = cv2.minAreaRect(hull)
    area = float(cv2.contourArea(cnt))
    rw, rh = rect[1]
    return area / max(rw * rh, 1.0), area / max(float(cv2.contourArea(hull)), 1.0)


def region_from_contour(cnt: np.ndarray, flags: Optional[list] = None, source: str = "detected") -> Region:
    hull = cv2.convexHull(cnt)
    rect = cv2.minAreaRect(hull)
    corners, w, h, angle = portrait_corners(rect)
    area = float(cv2.contourArea(cnt))
    fill = area / max(w * h, 1.0)
    return Region(
        cx=float(rect[0][0]),
        cy=float(rect[0][1]),
        w=w,
        h=h,
        angle=angle,
        corners=corners,
        area=area,
        fill=fill,
        source=source,
        flags=list(flags or []),
    )


# ------------------------------------------------------------------ background


def _edge_basis(xf: np.ndarray, yf: np.ndarray, full_shape: tuple, scales: tuple) -> tuple[np.ndarray, np.ndarray]:
    """Edge-shadow basis: (columns over x: left then right decays; columns over y: top then bottom decays)."""
    Hf, Wf = full_shape
    sp = [max(1.0, f * min(Hf, Wf)) for f in scales]
    ex = np.stack([np.exp(-np.clip(xf, 0, None) / s) for s in sp] + [np.exp(-np.clip(Wf - 1 - xf, 0, None) / s) for s in sp], axis=1)
    ey = np.stack([np.exp(-np.clip(yf, 0, None) / s) for s in sp] + [np.exp(-np.clip(Hf - 1 - yf, 0, None) / s) for s in sp], axis=1)
    return ex, ey


def _poly_terms(deg: int) -> list[tuple[int, int]]:
    return [(i, j) for i in range(deg + 1) for j in range(deg + 1 - i)]


def _irls(X: np.ndarray, y: np.ndarray, iters: int = 8) -> tuple[np.ndarray, np.ndarray]:
    """Robust least squares (Tukey biweight): outliers such as missed card pixels get weight 0."""
    coef = np.linalg.lstsq(X, y, rcond=None)[0]
    for _ in range(iters):
        r = y - X @ coef
        s = max(1.4826 * float(np.median(np.abs(r))), 0.5)
        u = r / (4.685 * s)
        w = np.where(np.abs(u) < 1.0, (1.0 - u * u) ** 2, 0.0)
        if w.sum() < 3 * X.shape[1]:
            break
        sw = np.sqrt(w)
        coef = np.linalg.lstsq(X * sw[:, None], y * sw, rcond=None)[0]
    return coef, y - X @ coef


def _fit_surface(lab: np.ndarray, sel: np.ndarray, scale: float, full_shape: tuple, max_deg: int,
                 max_samples: int = 40000, edge_scales: tuple = (0.02, 0.06)) -> tuple[int, list, float, Optional[list]]:
    """Fit the backing surface to the selected work-image pixels.

    Tries degrees 0..max_deg. Each fit is scored by its median residual on the image's border
    ring (mostly backing), so a fit bent by card pixels that slipped into the selection scores
    badly. The lowest degree within 10 % (+0.3) of the best score wins, so a uniform backing is
    modelled as a flat colour.

    Then edge-shadow terms are tried on top of that polynomial: a white lid often darkens a band
    along its hinge or along a glass edge, which no low-degree polynomial follows and which would
    otherwise merge with the nearest card. They are kept only when they cut the ring's 80th-percentile
    residual by a third and by at least 2 Lab units, so a backing without such a band (black cloth,
    an even lid) keeps exactly the polynomial model.
    Returns (degree, coefficient matrices per channel, robust residual spread, edge coefficients or None).
    """
    ys, xs = np.nonzero(sel)
    if xs.size < 200:
        med = np.median(lab.reshape(-1, 3), axis=0)
        return 0, [[[float(m)]] for m in med], 0.0, None
    if xs.size > max_samples:
        pick = np.random.default_rng(0).choice(xs.size, max_samples, replace=False)
        ys, xs = ys[pick], xs[pick]
    vals = lab[ys, xs].astype(np.float64)
    Hf, Wf = full_shape
    h, w = lab.shape[:2]

    def norm(px, py):
        return 2.0 * (px / scale) / max(Wf - 1, 1) - 1.0, 2.0 * (py / scale) / max(Hf - 1, 1) - 1.0

    xn, yn = norm(xs, ys)
    t = max(2, int(min(h, w) * 0.025))
    ring = np.zeros((h, w), bool)
    ring[:t], ring[-t:], ring[:, :t], ring[:, -t:] = True, True, True, True
    ry, rx = np.nonzero(ring)
    if rx.size > 20000:
        pick = np.random.default_rng(1).choice(rx.size, 20000, replace=False)
        ry, rx = ry[pick], rx[pick]
    rvals = lab[ry, rx].astype(np.float64)
    rxn, ryn = norm(rx, ry)
    fits = []
    for deg in range(max_deg + 1):
        terms = _poly_terms(deg)
        X = np.stack([xn ** i * yn ** j for i, j in terms], axis=1)
        XR = np.stack([rxn ** i * ryn ** j for i, j in terms], axis=1)
        coefs, resid = [], np.zeros_like(vals)
        rres = np.zeros_like(rvals)
        for ch in range(3):
            c, r = _irls(X, vals[:, ch])
            coefs.append(c)
            resid[:, ch] = r
            rres[:, ch] = rvals[:, ch] - XR @ c
        dist = np.sqrt((resid ** 2).sum(axis=1))
        ring_score = float(np.median(np.sqrt((rres ** 2).sum(axis=1))))
        fits.append((deg, terms, coefs, ring_score, dist))
    best = min(f[3] for f in fits)
    deg, terms, coefs, _, dist = next(f for f in fits if f[3] <= best * 1.10 + 0.3)

    # Edge-shadow terms on top of the chosen polynomial.
    edge = None
    X = np.stack([xn ** i * yn ** j for i, j in terms], axis=1)
    XR = np.stack([rxn ** i * ryn ** j for i, j in terms], axis=1)
    ex, ey = _edge_basis(xs / scale, ys / scale, full_shape, edge_scales)
    rex, rey = _edge_basis(rx / scale, ry / scale, full_shape, edge_scales)
    XE, XRE = np.hstack([X, ex, ey]), np.hstack([XR, rex, rey])
    rres0 = np.stack([rvals[:, ch] - XR @ coefs[ch] for ch in range(3)], axis=1)
    p80_0 = float(np.percentile(np.sqrt((rres0 ** 2).sum(axis=1)), 80))
    ecoefs, eresid, rres1 = [], np.zeros_like(vals), np.zeros_like(rvals)
    for ch in range(3):
        c, r = _irls(XE, vals[:, ch])
        ecoefs.append(c)
        eresid[:, ch] = r
        rres1[:, ch] = rvals[:, ch] - XRE @ c
    p80_1 = float(np.percentile(np.sqrt((rres1 ** 2).sum(axis=1)), 80))
    if p80_1 < 0.67 * p80_0 and p80_0 - p80_1 >= 2.0:
        n = len(terms)
        coefs = [c[:n] for c in ecoefs]
        edge = [c[n:].tolist() for c in ecoefs]
        dist = np.sqrt((eresid ** 2).sum(axis=1))

    mats = []
    for ch in range(3):
        C = np.zeros((deg + 1, deg + 1))
        for (i, j), v in zip(terms, coefs[ch]):
            C[i, j] = v
        mats.append(C.tolist())
    med = float(np.median(dist))
    spread = 1.4826 * float(np.median(np.abs(dist - med)))
    return deg, mats, spread, edge


def _connected_to_border(sel: np.ndarray) -> np.ndarray:
    """Keep the parts of a backing-candidate mask that reach the image border.

    The backing surrounds the items; a dark card interior that happens to pass the colour and
    texture gates is an island (its printed border or cut edge separates it) and is dropped.
    """
    n, lbl = cv2.connectedComponents(sel.astype(np.uint8), connectivity=4)
    if n <= 1:
        return sel
    edge = np.unique(np.concatenate([lbl[0], lbl[-1], lbl[:, 0], lbl[:, -1]]))
    edge = edge[edge > 0]
    return np.isin(lbl, edge)


def _dist_threshold(values: np.ndarray) -> float:
    return float(np.clip(robust_upper(values, 6.0) + 4.0, 8.0, 60.0))


def estimate_background(full: np.ndarray, params: DetectParams) -> tuple[Background, np.ndarray]:
    """Return the background model and the downscaled work image."""
    H, W = full.shape[:2]
    scale = WORK_PX / max(H, W) if max(H, W) > WORK_PX else 1.0
    work = cv2.resize(full, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else full.copy()
    h, w = work.shape[:2]

    lab = cv2.cvtColor(work, cv2.COLOR_BGR2LAB).astype(np.float32)
    g = np.median(border_ring(lab), axis=0)

    gray = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY)
    s = local_std(gray, 7)
    t_s = float(np.clip(robust_upper(border_ring(s), 8.0) + 3.0, 4.0, 40.0))

    # Texture threshold at full resolution, measured on full-res border strips only.
    t = max(4, int(min(H, W) * 0.02))
    k_full = odd(7 / max(scale, 1e-6))
    vals = []
    for strip in (full[:t], full[-t:], full[:, :t], full[:, -t:]):
        vals.append(local_std(cv2.cvtColor(strip, cv2.COLOR_BGR2GRAY), k_full).reshape(-1))
    t_s_full = float(np.clip(robust_upper(np.concatenate(vals), 8.0) + 3.0, 4.0, 40.0))

    def model(sel: np.ndarray) -> tuple[Background, np.ndarray]:
        deg, coef, spread, edge = _fit_surface(lab, sel, scale, (H, W), max(0, params.surface_degree))
        bgm = Background(lab=g.tolist(), t_dist=0.0, t_tex=t_s, t_tex_full=t_s_full, scale=scale,
                         full_shape=(H, W), deg=deg, coef=coef, spread=spread, edge=edge)
        d = np.sqrt(((lab - bgm.surface(work.shape, (0.0, 0.0), 1.0 / scale)) ** 2).sum(axis=2))
        return bgm, cv2.GaussianBlur(d, (0, 0), 1.0)

    # Pass 1: pixels that look like backing — low texture and backing-like chroma (lighting
    # changes lightness far more than chroma, so chroma is safe to compare globally).
    dab = np.sqrt(((lab[..., 1:] - g[1:]) ** 2).sum(axis=2))
    t_ab = float(np.clip(robust_upper(border_ring(dab), 6.0) + 3.0, 4.0, 30.0))
    dl = np.abs(lab[..., 0] - g[0])  # lightness may drift with lighting, but not arbitrarily far
    t_l = float(np.clip(robust_upper(border_ring(dl), 6.0) + 10.0, 20.0, 60.0))
    gates = (s < t_s) & (dab < t_ab) & (dl < t_l)
    sel1 = _connected_to_border(gates)
    if sel1.mean() < 0.02:  # nothing usable: fall back to the border ring
        sel1 = np.zeros((h, w), bool)
        rt = max(2, int(min(h, w) * 0.025))
        sel1[:rt], sel1[-rt:], sel1[:, :rt], sel1[:, -rt:] = True, True, True, True
    bgm, d = model(sel1)
    t1 = _dist_threshold(d[sel1])

    # Pass 2: refit on pixels well away from everything pass 1 found.
    m1 = ((d > t1) | (s > t_s)).astype(np.uint8) * 255
    m1 = cv2.morphologyEx(m1, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m1 = cv2.dilate(m1, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (odd(min(h, w) * 0.015),) * 2))
    sel2 = _connected_to_border((m1 == 0) & gates)
    if sel2.sum() >= 2000:
        bgm, d = model(sel2)
        bgm.t_dist = _dist_threshold(d[sel2])
    else:
        sel2 = sel1
        bgm.t_dist = t1
    surf_ab = bgm.surface(work.shape, (0.0, 0.0), 1.0 / scale)[..., 1:]
    dab2 = np.sqrt(((lab[..., 1:] - surf_ab) ** 2).sum(axis=2))
    bgm.t_chroma = float(np.clip(robust_upper(dab2[sel2], 6.0) + 2.0, 3.0, 30.0))

    # Dark backing: black print at an item's edge is a few Lab units off the backing, under t_dist. Measure the
    # backing's own blurred noise and set the faint cue's threshold just above it.
    if float(np.median(lab[..., 0][sel2])) < params.dark_l:
        surf = bgm.surface(work.shape, (0.0, 0.0), 1.0 / scale)
        d_raw = np.sqrt(((lab - surf) ** 2).sum(axis=2))
        db = cv2.GaussianBlur(np.minimum(d_raw, 2.0 * bgm.t_dist), (0, 0), bgm.faint_sigma)
        bgm.dark = True
        bgm.t_faint = float(np.clip(robust_upper(db[sel2], 6.0) + 1.0, 2.0, bgm.t_dist))
    return bgm, work


def faint_cue(d_raw: np.ndarray, bgm: Background, full_res: bool) -> np.ndarray:
    """Dark backing only: pixels whose neighbourhood sits consistently, if slightly, off the backing.

    The per-pixel distance is capped at twice the threshold before blurring, so a bright edge does
    not bleed outward through the blur (the mask's edge stays where the item's edge is), then an
    opening removes specks (lint, dust) that survive the blur. Returns a 0/255 mask.
    """
    sigma = bgm.faint_sigma / (max(bgm.scale, 1e-6) if full_res else 1.0)
    db = cv2.GaussianBlur(np.minimum(d_raw, 2.0 * bgm.t_faint), (0, 0), sigma)
    m = (db > bgm.t_faint).astype(np.uint8) * 255
    k = odd(2 * sigma)
    return cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))


def _foreground_raw(img: np.ndarray, bgm: Background, full_res: bool, params: DetectParams, origin: tuple):
    """Closed (not yet hole-filled or opened) foreground mask plus the cues the hole test needs."""
    px = 1.0 if full_res else 1.0 / max(bgm.scale, 1e-9)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    surf = bgm.surface(img.shape, origin, px)
    d = np.sqrt(((lab - surf) ** 2).sum(axis=2))
    faint = faint_cue(d, bgm, full_res) if bgm.dark and bgm.t_faint > 0 else None
    dab = np.sqrt(((lab[..., 1:] - surf[..., 1:]) ** 2).sum(axis=2))
    sigma = 1.0 if not full_res else max(1.0, 1.0 / max(bgm.scale, 1e-6) * 0.5)
    d = cv2.GaussianBlur(d, (0, 0), sigma)
    m = (d > bgm.t_dist).astype(np.uint8) * 255
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    k = odd(7 / max(bgm.scale, 1e-6)) if full_res else 7
    s = local_std(gray, k)
    t_tex = bgm.t_tex_full if full_res else bgm.t_tex
    if params.texture:
        tex = (s > t_tex).astype(np.uint8) * 255
        # The std window straddles item edges and spreads the texture mask outward by
        # about half a window; erode it back so measured sizes stay true.
        tex = cv2.erode(tex, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        m = cv2.bitwise_or(m, tex)
    if faint is not None:
        m = cv2.bitwise_or(m, faint)
    short = min(img.shape[:2])
    kc = odd(short * (0.006 if full_res else 0.008))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kc, kc)), iterations=1)
    return m, d, dab, s, t_tex


def _finish(m: np.ndarray, img_shape, bgm: Background, full_res: bool, holes: str, cues=None) -> np.ndarray:
    """Fill holes (all, or all but backing-like ones), then open to remove speckle.

    Filling comes first, so a dark card whose printed border is all that stands out from the
    backing becomes solid before the opening could break that thin border.
    """
    short = min(img_shape[:2])
    if holes == "all":
        m = fill_holes(m)
    else:
        d, dab, s, t_tex = cues
        # Holes smaller than ~1.2 % of the scan's short side across are always filled.
        scan_short = min(bgm.full_shape) * (1.0 if full_res else bgm.scale) if bgm.full_shape[0] else short
        keep_px = max(9, int((0.012 * scan_short) ** 2))
        m = fill_holes_except_backing(m, d, dab, s, bgm.t_dist, bgm.t_chroma, t_tex, keep_px)
    ko = odd(short * (0.003 if full_res else 0.004))
    return cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ko, ko)))


def foreground(img: np.ndarray, bgm: Background, full_res: bool, params: DetectParams,
               origin: tuple = (0.0, 0.0)) -> np.ndarray:
    """Binary foreground mask (0/255), every hole filled, for the work image or a full-res ROI at ``origin``."""
    m, *_ = _foreground_raw(img, bgm, full_res, params, origin)
    return _finish(m, img.shape, bgm, full_res, "all")


def foreground_pair(img: np.ndarray, bgm: Background, full_res: bool, params: DetectParams,
                    origin: tuple = (0.0, 0.0)) -> tuple[np.ndarray, np.ndarray]:
    """(mask with every hole filled, mask with backing-like holes left open)."""
    m, d, dab, s, t_tex = _foreground_raw(img, bgm, full_res, params, origin)
    return (_finish(m, img.shape, bgm, full_res, "all"),
            _finish(m, img.shape, bgm, full_res, "backing", (d, dab, s, t_tex)))


# ------------------------------------------------------------------- detection


def _watershed(dist: np.ndarray, markers: np.ndarray, comp: np.ndarray) -> np.ndarray:
    """Marker-controlled watershed of -dist inside comp (scikit-image; OpenCV fallback)."""
    try:
        from skimage.segmentation import watershed
        return watershed(-dist, markers, mask=comp > 0)
    except ImportError:  # pragma: no cover - scikit-image is in requirements.txt
        img = cv2.cvtColor((255 - dist / max(float(dist.max()), 1e-6) * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)
        mk = markers.astype(np.int32).copy()
        ws = cv2.watershed(img, mk)
        ws[comp == 0] = 0
        return np.maximum(ws, 0)


def _split_component(mask: np.ndarray, cnt: np.ndarray, min_part_area: float, min_short: float,
                     params: DetectParams) -> list[tuple[np.ndarray, bool]]:
    """Split a blob of touching items with a watershed on its distance transform.

    With ``mask`` = the open-hole mask, holes that look like backing stay open, so items that
    touch along short stretches meet at a narrow neck. Parts smaller than ``min_part_area`` or
    thinner than ``min_short`` are slivers and are dropped. Returns [(contour, card_like)] for
    >= 2 parts, or [] when the blob does not split. The core level that yields the most
    card-like parts wins.
    """
    x, y, w, h = cv2.boundingRect(cnt)
    pad = 2
    off = np.array([[x - pad, y - pad]], dtype=np.int32)
    region = np.zeros((h + 2 * pad, w + 2 * pad), np.uint8)
    cv2.drawContours(region, [cnt - off], -1, 255, cv2.FILLED)
    sub = np.zeros_like(region)
    sub[pad:pad + h, pad:pad + w] = mask[y:y + h, x:x + w]
    comp = cv2.bitwise_and(sub, region)
    dist = cv2.distanceTransform(comp, cv2.DIST_L2, 5)
    dmax = float(dist.max())
    if dmax <= 0:
        return []
    comp_area = float((comp > 0).sum())
    best: list[tuple[np.ndarray, bool]] = []
    best_good = 0
    for level in (0.75, 0.65, 0.55, 0.45, 0.35):
        cores = (dist > level * dmax).astype(np.uint8)
        n, lbl, stats, _ = cv2.connectedComponentsWithStats(cores, connectivity=8)
        keep = [k for k in range(1, n) if stats[k, cv2.CC_STAT_AREA] >= 0.002 * comp_area]
        if len(keep) < 2:
            continue
        markers = np.zeros(comp.shape, np.int32)
        for idx, k in enumerate(keep, 1):
            markers[lbl == k] = idx
        ws = _watershed(dist, markers, comp)
        parts: list[tuple[np.ndarray, bool]] = []
        for idx in range(1, len(keep) + 1):
            part = ((ws == idx) & (comp > 0)).astype(np.uint8) * 255
            part = cv2.morphologyEx(part, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
            cs, _ = cv2.findContours(part, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            if not cs:
                continue
            c = max(cs, key=cv2.contourArea)
            if cv2.contourArea(c) < min_part_area or min(cv2.minAreaRect(c)[1]) < min_short:
                continue  # a sliver left over at a neck, or a thin line
            fill, sol = shape_stats(c)
            parts.append((c + off, fill >= params.min_fill and sol >= params.min_solidity))
        good = sum(1 for _, ok in parts if ok)
        if len(parts) >= 2 and good > best_good:
            best, best_good = parts, good
    return best


def detect(full: np.ndarray, params: Optional[DetectParams] = None) -> Detection:
    """Detect items on a scan: regions (full-res, reading order), background model, rejected blobs."""
    params = params or DetectParams()
    bgm, work = estimate_background(full, params)
    # Two masks: holes that look like backing stay open in ``mask_open`` (only the splitter uses
    # it, so touching items meet at a narrow neck); ``mask`` has every hole filled, so a dark card
    # whose border is all that stands out from the backing is still one solid item.
    mask, mask_open = foreground_pair(work, bgm, full_res=False, params=params)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    img_area = float(work.shape[0] * work.shape[1])
    min_short = 0.012 * min(work.shape[:2])  # thinner than ~2.6 mm on an A4 bed: a line, not an item
    cands = [c for c in cnts if cv2.contourArea(c) >= params.min_area_frac * img_area
             and min(cv2.minAreaRect(c)[1]) >= min_short]
    med = float(np.median([cv2.contourArea(c) for c in cands])) if len(cands) >= 3 else None
    s = bgm.scale
    min_item_area = params.min_area_frac * img_area

    def known_size(c) -> bool:
        """Within 8 % of a calibrated item size (needs the DPI)."""
        sw, lw = sorted(v / s for v in cv2.minAreaRect(c)[1])
        return any(abs(sw - kw) <= 0.08 * kw and abs(lw - kh) <= 0.08 * kh for kw, kh in params.item_px)

    def odd_size(c) -> bool:
        """Too wide or too long for one card, yet far smaller than a mat, and no known item size (needs the DPI)."""
        if not params.card_px or known_size(c):
            return False
        cw, ch = params.card_px
        sw, lw = sorted(v / s for v in cv2.minAreaRect(c)[1])
        return (1.2 * cw < sw < 1.75 * cw and lw < 2.4 * ch) or (sw < 1.2 * cw and lw > 1.3 * ch)

    def shaped_size(c) -> bool:
        """Within 8 % of a component that is irregular by design (needs the DPI). The blob is measured before the cut-out,
        so it may still include the item's rim and shadow (about 1.5 mm on a 30 mm board piece)."""
        sw, lw = sorted(v / s for v in cv2.minAreaRect(c)[1])
        return any(abs(sw - kw) <= 0.08 * kw and abs(lw - kh) <= 0.08 * kh for kw, kh in params.shaped_px)

    kept: list[tuple[np.ndarray, list]] = []
    rejected: list[dict] = []
    for c in cands:
        area = float(cv2.contourArea(c))
        fill, sol = shape_stats(c)
        good = fill >= params.min_fill and sol >= params.min_solidity
        if not good and shaped_size(c):
            kept.append((c, []))  # its notches are its shape, not a gap between touching items
            continue
        odd = odd_size(c)
        # An item of a known size is never split, whatever the median area says.
        big = (med is not None and area > params.merge_ratio * med and not known_size(c)) or odd
        if big or not good:
            ref = med if med is not None else area / 2.0
            min_part = max(min_item_area, 0.3 * min(ref, area / 2.0))
            parts = _split_component(mask_open, c, min_part, min_short, params)
            if sum(ok for _, ok in parts) == 0:
                # Dark print can look like backing and fragment the open-hole mask: retry solid.
                alt = _split_component(mask, c, min_part, min_short, params)
                if sum(ok for _, ok in alt) > 0:
                    parts = alt
            if parts:
                for p, ok in parts:
                    if ok:
                        kept.append((p, ["SPLIT_FROM_TOUCHING_ITEMS"]))
                    else:
                        rejected.append(_rejected(p, s, "irregular shape after separating touching items "
                                                        "(overlapping or fanned cards?)"))
                continue
            if not good:
                rejected.append(_rejected(c, s, "irregular shape: touching or overlapping items? "
                                                "Leave a gap and re-scan"))
                continue
            round_item = 0.72 <= fill <= 0.84 and sol >= 0.97  # a big disc is one disc
            kept.append((c, [] if round_item else ["MAY_BE_SEVERAL_ITEMS"]))
            continue
        kept.append((c, []))

    regions: list[Region] = []
    for c, flags in kept:
        r = region_from_contour(c, flags=flags)
        r.cx, r.cy, r.w, r.h = r.cx / s, r.cy / s, r.w / s, r.h / s
        r.corners = [[x / s, y / s] for x, y in r.corners]
        r.area = r.area / (s * s)
        r._sil = c.reshape(-1, 2).astype(np.float64) / s
        r._sil_tol = 3.0 / s  # coarse silhouette accuracy: about 3 work pixels
        regions.append(r)

    regions = [refine(full, r, bgm, params) for r in regions]
    if not coloured_backing(bgm):  # a coloured backing loses no pale edge: the cut-out (key.py) measures the item
        regions, rejected = complete_to_known_size(full, regions, rejected, bgm, params)
    for r in regions:
        flag_scan_edge(r, full.shape)
    return Detection(regions=order_regions(regions), background=bgm, rejected=rejected)


COLOURED_BACKING_CHROMA = 25.0  # backing chroma (OpenCV Lab a, b) from which a scan is cut out by colour (key.py)


def coloured_backing(bgm: Background) -> bool:
    """A backing of a strong colour (magenta reads about 61): every item differs from it, pale edges included."""
    return bool(np.hypot(bgm.lab[1] - 128.0, bgm.lab[2] - 128.0) >= COLOURED_BACKING_CHROMA)


# ------------------------------------------------------------------ size prior (light backings)

EXTEND_FLAG = "EXTENDED_TO_CARD_SIZE_CHECK_CROP"


def _unit(v) -> np.ndarray:
    v = np.asarray(v, np.float64)
    return v / max(float(np.hypot(*v)), 1e-9)


def _strip_evidence(full: np.ndarray, poly: np.ndarray, bgm: Background, params: DetectParams) -> float:
    """Share of a strip's pixels that look printed (colour off the backing surface, or texture).

    The thresholds are fractions of the detection thresholds, so a pale print that just failed them
    (near-white sky, a white banner with its title) still counts, while bare backing does not.
    """
    H, W = full.shape[:2]
    x0, y0 = np.floor(poly.min(axis=0)).astype(int)
    x1, y1 = np.ceil(poly.max(axis=0)).astype(int)
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1 + 1), min(H, y1 + 1)
    if x1 - x0 < 3 or y1 - y0 < 3:
        return 0.0
    roi = full[y0:y1, x0:x1]
    _m, d, _dab, s, t_tex = _foreground_raw(roi, bgm, True, params, (float(x0), float(y0)))
    inside = np.zeros(roi.shape[:2], np.uint8)
    cv2.fillPoly(inside, [np.round(poly - [x0, y0]).astype(np.int32)], 1)
    if inside.sum() == 0:
        return 0.0
    printed = (d > 0.55 * bgm.t_dist) | (s > 0.6 * t_tex)
    return float(printed[inside > 0].mean())


def _known(r: Region, sizes: list, tol: float = 0.03) -> bool:
    return any(abs(r.w - kw) <= tol * kw and abs(r.h - kh) <= tol * kh for kw, kh in sizes)


def complete_to_known_size(full: np.ndarray, regions: list, rejected: list, bgm: Background,
                           params: DetectParams) -> tuple[list, list]:
    """Grow items that came out short of a calibrated size, and drop the fragments they absorb.

    On a white lid, a card whose edge is as pale as the lid (a white banner, near-white sky) loses that
    strip: the item is found narrower or shorter than a card, and its pale part may leave a fragment (the
    title text) as a separate item. When the DPI is known and one side of an item matches a calibrated size
    while the other falls short, the item is extended to the full size on the end whose strip shows more
    print, and flagged ``EXTENDED_TO_CARD_SIZE_CHECK_CROP`` so the crop is checked. Fragments and rejected
    blobs inside an item of a calibrated size disappear (they are part of it); any other thin fragment is
    reported as rejected (red on the overlay), never passed on as a card. Nothing changes for items that already measure a calibrated size.
    """
    if not params.item_px:
        return regions, rejected
    sizes = list(params.item_px)
    big = [r for r in regions if r.w * r.h >= 0.3 * min(kw * kh for kw, kh in sizes)]
    extended: list = []
    for r in big:
        if _known(r, sizes, 0.015):
            continue  # already one known size: never grow it into another (a strip into a wider board piece)
        best = None
        for kw, kh in sizes:
            if abs(r.w - kw) <= 0.04 * kw and 0.55 * kh <= r.h < 0.985 * kh:
                cand = ("long", kh - r.h, abs(r.w - kw) / kw)
            elif abs(r.h - kh) <= 0.04 * kh and 0.55 * kw <= r.w < 0.97 * kw:
                cand = ("short", kw - r.w, abs(r.h - kh) / kh)
            elif abs(r.h - kw) <= 0.04 * kw and 0.55 * kh <= r.w < 0.985 * kh:
                # the missing part made the item's long side the card's short one: grow across
                cand = ("short", kh - r.w, abs(r.h - kw) / kw)
            else:
                continue
            if best is None or cand[2] < best[2]:
                best = cand
        if best is None:
            continue
        axis, delta, _err = best
        tl, tr, br, bl = (np.asarray(p, np.float64) for p in r.corners)
        down, right = _unit(bl - tl), _unit(tr - tl)
        if axis == "long":
            ends = {"top": (tl - down * delta, tr - down * delta, tr, tl),
                    "bottom": (bl, br, br + down * delta, bl + down * delta)}
        else:
            ends = {"left": (tl - right * delta, tl, bl, bl - right * delta),
                    "right": (tr, tr + right * delta, br + right * delta, br)}
        others = [q for q in big if q is not r]
        scores = {}
        for end, strip in ends.items():
            poly = np.array(strip)
            hits_other = any(cv2.pointPolygonTest(np.float32(q.corners).reshape(-1, 1, 2),
                                                  (float(poly[:, 0].mean()), float(poly[:, 1].mean())), False) >= 0
                             for q in others)
            if hits_other:
                continue
            scores[end] = _strip_evidence(full, poly, bgm, params)
        if not scores:
            r.flags.append("SIZE_OFF_CHECK_CROP")
            continue
        end = max(scores, key=scores.get)
        strip = ends[end]
        if axis == "long":
            corners = [strip[0], strip[1], br, bl] if end == "top" else [tl, tr, strip[2], strip[3]]
        else:
            corners = [strip[0], tr, br, strip[3]] if end == "left" else [tl, strip[1], strip[2], bl]
        c = np.mean(np.array(corners), axis=0)
        r.corners = [list(map(float, p)) for p in corners]
        r.cx, r.cy = float(c[0]), float(c[1])
        if axis == "long":
            r.h += delta
        else:
            r.w += delta
            if r.w > r.h:  # keep the portrait convention: w is the short side
                r.w, r.h = r.h, r.w
                r.corners = [r.corners[1], r.corners[2], r.corners[3], r.corners[0]]
                if np.asarray(r.corners)[3][1] < np.asarray(r.corners)[0][1]:
                    r.corners = [r.corners[2], r.corners[3], r.corners[0], r.corners[1]]
        r.area = r.w * r.h
        r.fill = 1.0
        r.source = "extended"
        r._mask = None
        r.flags.append(EXTEND_FLAG)
        extended.append(r)

    def inside_extended(cx: float, cy: float) -> bool:
        """Inside an item that measures a calibrated size (extended or not): a fragment of that card."""
        return any(cv2.pointPolygonTest(np.float32(q.corners).reshape(-1, 1, 2), (float(cx), float(cy)), False) >= 0
                   for q in big if q in extended or _known(q, sizes))

    keep: list = []
    kw0, kh0 = min(sizes, key=lambda k: k[0] * k[1])
    for r in regions:
        if r in big:
            keep.append(r)
            continue
        if inside_extended(r.cx, r.cy):
            continue  # a fragment of a pale card, now inside it
        if min(r.w, r.h) < 0.25 * kw0 and max(r.w, r.h) < 0.75 * kh0:
            rejected.append({"cx": round(r.cx, 1), "cy": round(r.cy, 1), "w": round(r.w, 1), "h": round(r.h, 1),
                             "corners": [[round(float(x), 1), round(float(y), 1)] for x, y in r.corners],
                             "reason": "a thin fragment, not a whole card (part of a pale-edged card?): check the overlay; "
                                       "if a card was cut short, re-scan it on black paper"})
            continue
        keep.append(r)
    rejected = [rj for rj in rejected if not inside_extended(rj["cx"], rj["cy"])]
    return keep, rejected


def _rejected(cnt: np.ndarray, s: float, reason: str) -> dict:
    r = region_from_contour(cnt)
    return {
        "cx": round(r.cx / s, 1), "cy": round(r.cy / s, 1), "w": round(r.w / s, 1), "h": round(r.h / s, 1),
        "corners": [[round(x / s, 1), round(y / s, 1)] for x, y in r.corners],
        "reason": reason,
    }


def flag_scan_edge(r: Region, shape) -> None:
    """Flag items cut off by the scan edge (re-scan needed) or very close to it."""
    H, W = shape[:2]
    pts = np.array(r.corners)
    gap = float(min(pts[:, 0].min(), pts[:, 1].min(), W - 1 - pts[:, 0].max(), H - 1 - pts[:, 1].max()))
    if gap < 1.0:
        r.flags.append("CUT_OFF_AT_SCAN_EDGE")
    elif gap < 0.004 * min(H, W):
        r.flags.append("NEAR_SCAN_EDGE")


def _roi_bounds(full_shape, corners, margin: float) -> tuple[int, int, int, int]:
    pts = np.array(corners, dtype=np.float64)
    x0, y0 = pts.min(axis=0) - margin
    x1, y1 = pts.max(axis=0) + margin
    H, W = full_shape[:2]
    return int(max(0, math.floor(x0))), int(max(0, math.floor(y0))), int(min(W, math.ceil(x1))), int(min(H, math.ceil(y1)))


def _pick_component(m: np.ndarray, cx: float, cy: float) -> Optional[np.ndarray]:
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        return None
    for c in sorted(cnts, key=cv2.contourArea, reverse=True):
        if cv2.pointPolygonTest(c, (float(cx), float(cy)), False) >= 0:
            return c
    return max(cnts, key=cv2.contourArea)


def refine(full: np.ndarray, coarse: Region, bgm: Background, params: DetectParams) -> Region:
    """Re-measure a region at full resolution inside its ROI; keep the coarse one if it disagrees.

    The full-res mask is first used as is; if that disagrees with the coarse region (a neighbour
    inside the ROI, typically) or the region came from a split, it is constrained to the coarse
    silhouette grown by its accuracy margin.
    """
    margin = 0.06 * coarse.h
    x0, y0, x1, y1 = _roi_bounds(full.shape, coarse.corners, margin)
    roi = full[y0:y1, x0:x1]
    m = foreground(roi, bgm, full_res=True, params=params, origin=(float(x0), float(y0)))
    attempts = [m]
    if coarse._sil is not None:
        cm = np.zeros_like(m)
        pts = np.round(coarse._sil - [x0, y0]).astype(np.int32).reshape(-1, 1, 2)
        cv2.drawContours(cm, [pts], -1, 255, cv2.FILLED)
        k = odd(2 * coarse._sil_tol + 1)
        cm = cv2.dilate(cm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        constrained = cv2.bitwise_and(m, cm)
        attempts = [constrained] if "SPLIT_FROM_TOUCHING_ITEMS" in coarse.flags else [m, constrained]
    ccx, ccy = coarse.cx - x0, coarse.cy - y0
    found_any = False
    for mm in attempts:
        best = _pick_component(mm, ccx, ccy)
        if best is None:
            continue
        found_any = True
        r = region_from_contour(best, flags=coarse.flags, source="refined")
        ratio = (r.w * r.h) / max(coarse.w * coarse.h, 1.0)
        if not (0.8 <= ratio <= 1.25):
            continue
        r.cx += x0
        r.cy += y0
        r.corners = [[x + x0, y + y0] for x, y in r.corners]
        single = np.zeros_like(mm)
        cv2.drawContours(single, [best], -1, 255, cv2.FILLED)
        r._mask = single
        r._origin = (x0, y0)
        return r
    coarse.flags.append("REFINE_DISAGREES" if found_any else "REFINE_FAILED")
    return coarse


def _canny_thresholds(gray: np.ndarray) -> tuple[float, float]:
    """Canny thresholds from the gradient noise of the ROI's border (mostly backing), not from its brightness.

    Scaling them with the grey level (as a dark-backing heuristic would) makes them far too high on a white
    lid, where a pale card's cut edge is a small step on a bright surface.
    """
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    noise = robust_upper(border_ring(np.abs(gx) + np.abs(gy)), 6.0)
    low = float(np.clip(noise + 4.0, 6.0, 80.0))
    return low, 2.5 * low


def refine_with_prior(full: np.ndarray, prior: Region, bgm: Background, params: Optional[DetectParams] = None) -> Region:
    """Find an item near a known position (e.g., a dark card back at its front's position).

    Strategy: (1) local foreground mask in an enlarged ROI; (2) edge map; (3) the prior itself.
    """
    params = params or DetectParams()
    margin = 0.15 * prior.h
    x0, y0, x1, y1 = _roi_bounds(full.shape, prior.corners, margin)
    roi = full[y0:y1, x0:x1]
    pcx, pcy = prior.cx - x0, prior.cy - y0
    target = prior.w * prior.h

    def accept(c) -> Optional[Region]:
        r = region_from_contour(c, source="refined")
        ratio = (r.w * r.h) / max(target, 1.0)
        shift = math.hypot(r.cx - pcx, r.cy - pcy)
        if 0.8 <= ratio <= 1.25 and shift <= 0.3 * prior.w:
            r.cx += x0
            r.cy += y0
            r.corners = [[x + x0, y + y0] for x, y in r.corners]
            single = np.zeros(roi.shape[:2], np.uint8)
            cv2.drawContours(single, [c], -1, 255, cv2.FILLED)
            r._mask = single
            r._origin = (x0, y0)
            return r
        return None

    # (1) Distance from the backing surface + texture inside the ROI.
    m = foreground(roi, bgm, full_res=True, params=params, origin=(float(x0), float(y0)))
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:3]:
        r = accept(c)
        if r:
            r.flags.append("FOUND_NEAR_PRIOR")
            return r

    # (2) Edges: the cut edge of a card is usually visible even on a dark backing or a white lid.
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (0, 0), 1.5)
    low, high = _canny_thresholds(gray)
    edges = cv2.Canny(gray, low, high)
    k = odd(min(roi.shape[:2]) * 0.01)
    edges = cv2.dilate(edges, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    edges = fill_holes(edges)
    cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:3]:
        r = accept(c)
        if r:
            r.flags.append("FOUND_BY_EDGES")
            return r

    # (3) Fall back to the prior geometry.
    return Region(
        cx=prior.cx, cy=prior.cy, w=prior.w, h=prior.h, angle=prior.angle,
        corners=[list(p) for p in prior.corners], area=prior.w * prior.h, fill=1.0,
        source="prior", flags=["BACK_FROM_PRIOR_CHECK_CROP"],
    )


def order_regions(regions: list[Region]) -> list[Region]:
    """Reading order: cluster into rows by centre y, then sort each row by x."""
    if not regions:
        return regions
    med_h = float(np.median([min(r.w, r.h) for r in regions]))
    rows: list[list[Region]] = []
    for r in sorted(regions, key=lambda r: r.cy):
        if rows and abs(r.cy - np.mean([q.cy for q in rows[-1]])) < 0.5 * med_h:
            rows[-1].append(r)
        else:
            rows.append([r])
    return [r for row in rows for r in sorted(row, key=lambda r: r.cx)]


# ---------------------------------------------------------------- rectification


def rectify(full: np.ndarray, r: Region) -> tuple[np.ndarray, Optional[list]]:
    """Warp a region to an upright-rectangle crop (portrait). Returns (BGR crop, outline).

    The outline is the silhouette polygon (normalised 0..1) when a clean mask exists,
    so the game can clip die-cut notches and tabs if it wants to.
    """
    W, H = max(1, int(round(r.w))), max(1, int(round(r.h)))
    src = np.float32(r.corners)
    dst = np.float32([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]])
    M = cv2.getPerspectiveTransform(src, dst)
    crop = cv2.warpPerspective(full, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    outline = None
    if r._mask is not None:
        ox, oy = r._origin
        T = np.array([[1, 0, ox], [0, 1, oy], [0, 0, 1]], dtype=np.float64)
        Mm = M @ T
        mm = cv2.warpPerspective(r._mask, Mm, (W, H), flags=cv2.INTER_NEAREST)
        cnts, _ = cv2.findContours(mm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        if cnts:
            c = max(cnts, key=cv2.contourArea)
            coverage = cv2.contourArea(c) / float(W * H)
            if coverage > 0.6:
                eps = 0.002 * cv2.arcLength(c, True)
                poly = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
                outline = [[round(float(x) / W, 4), round(float(y) / H, 4)] for x, y in poly]
    return crop, outline


def rotate_quarter(img: np.ndarray, degrees_cw: int) -> np.ndarray:
    d = degrees_cw % 360
    if d == 0:
        return img
    if d == 90:
        return cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    if d == 180:
        return cv2.rotate(img, cv2.ROTATE_180)
    if d == 270:
        return cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    return rotate_any(img, d)


def rotate_any(img: np.ndarray, degrees_cw: float) -> np.ndarray:
    """Turn by any angle (for round pieces, whose rectangle says nothing about which way up they lie): the canvas
    grows to hold the whole piece, and the new corners are transparent (an alpha channel is added if there is none)."""
    if img.ndim == 2 or img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA if img.ndim == 2 else cv2.COLOR_BGR2BGRA)
    h, w = img.shape[:2]
    m = cv2.getRotationMatrix2D(((w - 1) / 2.0, (h - 1) / 2.0), -float(degrees_cw), 1.0)
    c, s = abs(m[0, 0]), abs(m[0, 1])
    nw, nh = int(np.ceil(h * s + w * c - 1e-6)), int(np.ceil(h * c + w * s - 1e-6))
    m[0, 2] += (nw - w) / 2.0
    m[1, 2] += (nh - h) / 2.0
    return cv2.warpAffine(img, m, (nw, nh), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


def rotate_outline(outline: Optional[list], degrees_cw: int) -> Optional[list]:
    if outline is None:
        return None
    d = degrees_cw % 360
    out = []
    for x, y in outline:
        if d == 0:
            nx, ny = x, y
        elif d == 90:
            nx, ny = 1 - y, x
        elif d == 180:
            nx, ny = 1 - x, 1 - y
        else:  # 270
            nx, ny = y, 1 - x
        out.append([round(nx, 4), round(ny, 4)])
    return out
