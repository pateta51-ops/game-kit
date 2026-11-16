"""Read a die-cut silhouette: what shape it is and which way up it lies (optional step, plug-in ``silhouette_kinds``).

Ported from Unstoppable's ufp_ingest/silhouette.py. Shapes: "notched" (a deep notch in one long side), "tabbed" (a
narrow tab on one short edge and a notch), "plain", "round", "irregular", "unknown"; a plug-in names them its own way
with ``silhouette_spec["names"]``. A back shows the silhouette mirrored: flipped like a page the notch changes side,
flipped top over bottom the tab moves to the bottom, so the silhouette alone says which quarter turn brings a face
upright and which face is showing, except for plain and round items (their print decides).

Everything is measured on the outline polygon ``detect.rectify`` gives (crop frame, portrait, normalised 0..1),
rasterised to a fixed grid. The numbers in ``DEFAULT_SPEC`` are Unstoppable's die-cuts; a game overrides any of them
with ``silhouette_spec``."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

GRID_W, GRID_H = 240, 336

DEFAULT_SPEC: dict = {
    "canonical": {"front": {"notch": "right", "tab": "top"}, "back": {"notch": "left", "tab": "top"}},
    "cardAspect": [0.58, 0.85],  # width / height of a die-cut card crop
    "notchMinDepth": 0.06,
    "notchMinSpan": 0.12,
    "tabMinHeight": 0.02,
    "tabWidth": [0.06, 0.5],
    "notchCentre": 0.5,  # where a notched card's notch is centred when upright (0.5: it cannot tell 0 from 180)
    "centreMargin": 0.03,
    "bevel": None,  # "bottom" | "top" | None: where the notch side's cut corner is when upright
    "cornerCut": 0.15,
    "notchVariants": {},  # tabbed cards: variant -> [y0, y1] of the notch when upright
    "names": {},  # shape -> the game's own name for it
}


def _merge(base: dict, over: dict) -> dict:
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict) and k not in ("notchVariants", "names"):
            _merge(base[k], v)
        else:
            base[k] = v
    return base


def spec_for(over) -> dict:
    """DEFAULT_SPEC overlaid key by key (nested dicts merged) with a plug-in's ``silhouette_spec``."""
    return _merge(json.loads(json.dumps(DEFAULT_SPEC)), over or {})


@dataclass
class Silhouette:
    """Shape features in the crop frame (portrait, as cropped; not yet rotated)."""

    shape: str
    tab: Optional[str] = None  # top | bottom
    tab_x: Optional[list] = None  # [x0, x1] fractions of the width
    tab_height: float = 0.0  # fraction of the height
    notch: Optional[str] = None  # left | right
    notch_span: Optional[list] = None  # [y0, y1] fractions of the height
    notch_depth: float = 0.0  # fraction of the width
    notch_square: float = 0.0  # share of notch rows at the median depth (1.0 = clean rectangular notch)
    corner_cuts: dict = field(default_factory=dict)  # tl/tr/br/bl -> empty share of the corner square
    fill: float = 0.0
    aspect: float = 0.0  # w / h of the crop

    def to_json(self) -> dict:
        out = {"shape": self.shape, "fill": round(self.fill, 3), "aspect": round(self.aspect, 3)}
        if self.tab:
            out.update(tab=self.tab, tabX=[round(v, 3) for v in self.tab_x], tabHeight=round(self.tab_height, 3))
        if self.notch:
            out.update(notch=self.notch, notchSpan=[round(v, 3) for v in self.notch_span],
                       notchDepth=round(self.notch_depth, 3), notchSquare=round(self.notch_square, 2))
        if self.corner_cuts:
            out["cornerCuts"] = {k: round(v, 2) for k, v in self.corner_cuts.items()}
        return out


@dataclass
class Orientation:
    rotate: Optional[int]  # clockwise quarter turn that brings the face upright; None = cannot tell
    face: Optional[str]  # front | back; None = cannot tell
    confidence: str  # high | medium | low | none
    flags: list = field(default_factory=list)
    variant: Optional[str] = None  # tabbed cards: which notch position, read upright

    def to_json(self) -> dict:
        out = {"rotate": self.rotate, "face": self.face, "confidence": self.confidence, "flags": list(self.flags)}
        if self.variant:
            out["variant"] = self.variant
        return out


def outline_of(mask: np.ndarray) -> Optional[list]:
    """Normalised outline polygon of a crop's mask (alpha > 127), as ``detect.rectify`` gives it."""
    h, w = mask.shape[:2]
    cnts, _ = cv2.findContours((mask > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        return None
    c = max(cnts, key=cv2.contourArea)
    poly = cv2.approxPolyDP(c, 0.002 * cv2.arcLength(c, True), True).reshape(-1, 2)
    return [[float(x) / w, float(y) / h] for x, y in poly]


def rasterize(outline: list, w: int = GRID_W, h: int = GRID_H) -> np.ndarray:
    m = np.zeros((h, w), np.uint8)
    pts = np.round(np.asarray(outline, np.float64) * [w, h] - 0.5).astype(np.int32)
    cv2.fillPoly(m, [pts], 255)
    return m


def _runs(flags: np.ndarray) -> list[tuple[int, int]]:
    """Half-open [start, end) runs of True."""
    out, start = [], None
    for i, f in enumerate(flags):
        if f and start is None:
            start = i
        elif not f and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(flags)))
    return out


def _profiles(filled: np.ndarray) -> dict:
    h, w = filled.shape
    rows, cols = filled.any(axis=1), filled.any(axis=0)
    left = np.where(rows, filled.argmax(axis=1), w) / w
    right = np.where(rows, filled[:, ::-1].argmax(axis=1), w) / w
    top = np.where(cols, filled.argmax(axis=0), h) / h
    bottom = np.where(cols, filled[::-1, :].argmax(axis=0), h) / h
    return {"left": left, "right": right, "top": top, "bottom": bottom}


def _theil_sen(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """Robust line y = a*x + b (tolerates ~25 % outliers, e.g. a tab's columns)."""
    idx = np.arange(0, len(x), max(1, len(x) // 60))  # subsample: pairwise slopes stay cheap
    xs, ys = x[idx], y[idx]
    i, j = np.triu_indices(len(xs), k=1)
    dx = xs[j] - xs[i]
    ok = dx != 0
    a = float(np.median((ys[j] - ys[i])[ok] / dx[ok])) if ok.any() else 0.0
    b = float(np.median(y - a * x))
    inl = np.abs(y - (a * x + b)) < 0.015
    if inl.sum() >= 10:
        a, b = (float(v) for v in np.polyfit(x[inl], y[inl], 1))
    return a, b


def _lower_envelope(x: np.ndarray, y: np.ndarray, iters: int = 4) -> tuple[float, float]:
    """Line along the least-indented points (a side's straight edge; notch rows lie above it)."""
    keep = np.ones(len(x), bool)
    a, b = 0.0, float(np.min(y))
    for _ in range(iters):
        if keep.sum() < 10:
            break
        a, b = (float(v) for v in np.polyfit(x[keep], y[keep], 1))
        keep = y - (a * x + b) <= 0.01
    return a, b


def _find_tab(edge: np.ndarray, spec: dict) -> Optional[tuple[list, float]]:
    """A narrow protrusion on one edge, measured against the edge's own (possibly slanted) line."""
    w = len(edge)
    lo, hi = int(0.08 * w), int(0.92 * w)
    x = np.arange(lo, hi, dtype=np.float64) / w
    core = edge[lo:hi].astype(np.float64)
    a, b = _theil_sen(x, core)
    res = core - (a * x + b)  # negative = sticks out beyond the edge line
    runs = _runs(res < -spec["tabMinHeight"])
    if not runs:
        return None
    s, e = max(runs, key=lambda r: r[1] - r[0])
    width = (e - s) / w
    wmin, wmax = spec["tabWidth"]
    centre = (s + e) / 2.0 / (hi - lo)
    if not (wmin <= width <= wmax) or not (0.15 <= centre <= 0.85):
        return None
    height = float(-np.median(res[s:e]))
    # Steep sides: just outside the run the edge is back on its line.
    pad = max(2, int(0.04 * w))
    outside = np.concatenate([res[max(0, s - 2 * pad):max(0, s - pad)], res[e + pad:e + 2 * pad]])
    if outside.size and np.median(np.abs(outside)) > 0.4 * height:
        return None
    return [(s + lo) / w, (e + lo) / w], height


def _find_notch(prof: np.ndarray, y0: int, y1: int, spec: dict) -> Optional[tuple[list, float, float]]:
    """The longest run of body rows indented by at least notchMinDepth beyond the side's straight edge."""
    h = len(prof)
    seg = prof[y0:y1].astype(np.float64)
    if seg.size < 10:
        return None
    y = np.arange(y0, y1, dtype=np.float64) / h
    a, b = _lower_envelope(y, seg)
    ind = seg - (a * y + b)
    runs = _runs(ind > spec["notchMinDepth"])
    if not runs:
        return None
    s, e = max(runs, key=lambda r: r[1] - r[0])
    if (e - s) / h < spec["notchMinSpan"]:
        return None
    if s == 0 or e == len(seg):
        return None  # a step running off the end of the side, not a notch with card on both ends
    depth = float(np.median(ind[s:e]))
    square = float(np.mean(np.abs(ind[s:e] - depth) < 0.04))
    return [(y0 + s) / h, (y0 + e) / h], depth, square


def _corner_cuts(filled: np.ndarray, y0: int, y1: int) -> dict:
    """Empty share of a square (10 % of the width) in each corner of the body."""
    h, w = filled.shape
    c = max(4, int(0.10 * w))
    sq = {
        "tl": filled[y0:y0 + c, :c], "tr": filled[y0:y0 + c, w - c:],
        "bl": filled[y1 - c:y1, :c], "br": filled[y1 - c:y1, w - c:],
    }
    return {k: float(1.0 - v.mean()) if v.size else 0.0 for k, v in sq.items()}


def analyze(outline: Optional[list], w_px: float, h_px: float, spec: Optional[dict] = None) -> Silhouette:
    """Measure a silhouette (outline from ``detect.rectify``; crop size in pixels)."""
    spec = spec or DEFAULT_SPEC
    aspect = float(w_px) / max(float(h_px), 1.0)
    if not outline or len(outline) < 3:
        return Silhouette(shape="unknown", aspect=aspect)
    filled = rasterize(outline) > 0
    fill = float(filled.mean())
    sil = Silhouette(shape="unknown", fill=fill, aspect=aspect)

    # Round items: square-ish crop whose silhouette matches the inscribed ellipse.
    if aspect >= 0.75:
        ell = np.zeros((GRID_H, GRID_W), np.uint8)
        cv2.ellipse(ell, (GRID_W // 2, GRID_H // 2), (GRID_W // 2 - 1, GRID_H // 2 - 1), 0, 0, 360, 255, cv2.FILLED)
        e = ell > 0
        iou = float((filled & e).sum()) / max(float((filled | e).sum()), 1.0)
        if iou >= 0.85:
            sil.shape = "round"
            return sil

    prof = _profiles(filled)
    tab_top = _find_tab(prof["top"], spec)
    tab_bottom = _find_tab(prof["bottom"], spec)
    y0, y1 = 0, GRID_H
    if tab_top and not tab_bottom:
        sil.tab, (sil.tab_x, sil.tab_height) = "top", tab_top
        y0 = int(round(sil.tab_height * GRID_H))
    elif tab_bottom and not tab_top:
        sil.tab, (sil.tab_x, sil.tab_height) = "bottom", tab_bottom
        y1 = GRID_H - int(round(sil.tab_height * GRID_H))
    elif tab_top and tab_bottom:
        sil.shape = "irregular"
        return sil

    body_h = y1 - y0
    margin = int(0.06 * body_h)  # rounded and bevelled corners are not notches
    notches = {}
    for side in ("left", "right"):
        n = _find_notch(prof[side], y0 + margin, y1 - margin, spec)
        if n:
            notches[side] = n
    sil.corner_cuts = _corner_cuts(filled, y0, y1)
    if len(notches) == 2:
        sil.shape = "irregular"
        return sil
    if notches:
        side, (span, depth, square) = next(iter(notches.items()))
        sil.notch, sil.notch_span, sil.notch_depth, sil.notch_square = side, span, depth, square
        amin, amax = spec["cardAspect"]
        if not (amin <= aspect <= amax):
            sil.shape = "irregular"  # a notch-like step on something that is not card-shaped
            return sil
        sil.shape = "tabbed" if sil.tab else "notched"
        return sil
    if sil.tab:
        sil.shape = "irregular"  # a tab without a notch: not a known card shape
        return sil
    sil.shape = "plain" if fill >= 0.9 else "irregular"
    return sil


def _mirror_side(side: str) -> str:
    return {"left": "right", "right": "left"}[side]


def orient(sil: Silhouette, expected: Optional[str] = None, spec: Optional[dict] = None) -> Orientation:
    """Clockwise quarter turn that brings this face upright, and which face it is. ``expected`` is the face the scan
    should show ("front" / "back"), or None when either may."""
    spec = spec or DEFAULT_SPEC
    canon = spec["canonical"]
    if sil.shape in ("plain", "round", "unknown", "irregular"):
        return Orientation(rotate=None, face=None, confidence="none",
                           flags=[] if sil.shape in ("plain", "round") else ["SILHOUETTE_UNREADABLE"])

    def unexpected(face):
        return ["FACE_NOT_EXPECTED"] if expected and face != expected else []

    if sil.shape == "tabbed":
        rot = 0 if sil.tab == canon["front"]["tab"] else 180
        notch_after = sil.notch if rot == 0 else _mirror_side(sil.notch)
        face = next((f for f in ("front", "back") if canon[f]["notch"] == notch_after), None)
        centre = (sil.notch_span[0] + sil.notch_span[1]) / 2.0
        centre = centre if rot == 0 else 1.0 - centre
        variants = spec.get("notchVariants") or {}
        variant = min(variants, key=lambda k: abs(sum(variants[k]) / 2.0 - centre)) if variants else None
        return Orientation(rotate=rot, face=face, confidence="high", flags=unexpected(face), variant=variant)
    # Notched: 0 vs 180 from the notch's vertical position and the bevelled corner.
    centre = (sil.notch_span[0] + sil.notch_span[1]) / 2.0
    exp_c = spec["notchCentre"]
    votes = []
    if abs(centre - 0.5) >= spec["centreMargin"] and abs(exp_c - 0.5) >= spec["centreMargin"]:
        votes.append(0 if (centre > 0.5) == (exp_c > 0.5) else 180)
    bevel = spec.get("bevel")
    cuts = sil.corner_cuts or {}
    near, far = {"left": (("tl", "bl"), ("tr", "br")), "right": (("tr", "br"), ("tl", "bl"))}[sil.notch]
    top_cut, bottom_cut = cuts.get(near[0], 0.0), cuts.get(near[1], 0.0)
    clean_far = max(cuts.get(far[0], 1.0), cuts.get(far[1], 1.0)) < 0.12
    if bevel in ("top", "bottom") and clean_far and max(top_cut, bottom_cut) >= spec["cornerCut"] \
            and abs(top_cut - bottom_cut) >= 0.08:
        votes.append(0 if (bottom_cut > top_cut) == (bevel == "bottom") else 180)
    flags: list[str] = []
    if votes and all(v == votes[0] for v in votes):
        rot = votes[0]
        confidence = "high" if len(votes) == 2 else "medium"
    else:
        # No clear vertical cue: assume the face the scan should show.
        rot = 0 if canon[expected or "front"]["notch"] == sil.notch else 180
        confidence = "low"
        flags.append("SILHOUETTE_ROTATION_GUESSED" if not votes else "SILHOUETTE_CUES_DISAGREE")
    notch_after = sil.notch if rot == 0 else _mirror_side(sil.notch)
    face = next((f for f in ("front", "back") if canon[f]["notch"] == notch_after), None)
    return Orientation(rotate=rot, face=face, confidence=confidence, flags=flags + unexpected(face))


def read(outline: Optional[list], w_px: float, h_px: float, spec: Optional[dict] = None,
         expected: Optional[str] = None) -> dict:
    """Silhouette and orientation of one crop, as the manifest records it (shape in the game's own names)."""
    spec = spec or DEFAULT_SPEC
    sil = analyze(outline, w_px, h_px, spec)
    out = {**sil.to_json(), **orient(sil, expected, spec).to_json()}
    out["shape"] = spec.get("names", {}).get(out["shape"], out["shape"])
    return out
