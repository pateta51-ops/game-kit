"""Which reference image (the game's built card faces) a crop shows (K784): a perceptual hash at 4 turns picks the
closest references, then SIFT feature matches with a RANSAC homography count inliers for each; the best count wins.
Also: whether a paired back belongs to its front, and the manifest wiring (plug-in ``identify_refs``, off by default)."""
from __future__ import annotations

import math
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from . import images
from .detect import rotate_quarter

EXTS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}
TURNS = (0, 90, 180, 270)
SIDE = 480  # both sides are matched at this long side in pixels
_sift = cv2.SIFT_create(nfeatures=1500)
_bf = cv2.BFMatcher(cv2.NORM_L2)


def load(path) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None:
        return images.load_bgr(Path(path))
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    return images.flatten(img[:, :, :4])


def _grey(img: np.ndarray) -> np.ndarray:
    if img.ndim == 3:
        img = cv2.cvtColor(images.flatten(img), cv2.COLOR_BGR2GRAY)
    s = SIDE / max(img.shape)
    return cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR)


def phash(grey: np.ndarray) -> np.ndarray:
    d = cv2.dct(np.float32(cv2.resize(grey, (32, 32), interpolation=cv2.INTER_AREA)))[:8, :8].ravel()
    return d > np.median(d[1:])


def _features(grey: np.ndarray):
    return _sift.detectAndCompute(grey, None)


class Refs:
    """Reference images by id, hashed and with their features computed once."""

    def __init__(self, imgs: dict):
        if not imgs:
            raise ValueError("no reference images")
        self.ids, self.hash, self.feat = [], [], []
        for k, v in imgs.items():
            g = _grey(v if isinstance(v, np.ndarray) else load(v))
            self.ids.append(str(k))
            self.hash.append(phash(g))
            self.feat.append(_features(g))

    @classmethod
    def load(cls, src) -> "Refs":
        """A Refs, {id: image or file}, a folder, a file, or a list of files and folders (id = the file's stem)."""
        if isinstance(src, Refs):
            return src
        if isinstance(src, dict):
            return cls(src)
        return cls({Path(p).stem: p for p in files(src)})


def files(src) -> list[Path]:
    out = []
    for p in [src] if isinstance(src, (str, Path)) else src:
        p = Path(p)
        out += sorted(q for q in p.iterdir() if q.suffix.lower() in EXTS) if p.is_dir() else [p]
    return out


def _inliers(fa, fb):
    (ka, da), (kb, db) = fa, fb
    if da is None or db is None or len(ka) < 4 or len(kb) < 4:
        return 0, None
    m = [p[0] for p in _bf.knnMatch(da, db, k=2) if len(p) == 2 and p[0].distance < 0.75 * p[1].distance]
    if len(m) < 4:
        return 0, None
    H, mask = cv2.findHomography(np.float32([ka[x.queryIdx].pt for x in m]), np.float32([kb[x.trainIdx].pt for x in m]),
                                 cv2.RANSAC, 5.0)
    return (int(mask.sum()), H) if H is not None else (0, None)


def _turn(H, shape) -> int:
    """The clockwise turn of the crop that matches the reference, read from the homography."""
    c = np.float32([[[shape[1] / 2, shape[0] / 2], [shape[1] / 2 + 10, shape[0] / 2]]])
    (a, b), = [cv2.perspectiveTransform(c, H)[0]]
    return round(math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) / 90) % 4 * 90


def identify(crop: np.ndarray, refs, top: int = 8, min_inliers: int = 40, margin: float = 1.5) -> dict:
    """The reference the crop shows: ``ref``, ``turn`` (clockwise, to read like it), ``inliers``, ``hash`` (bits apart
    at that turn), ``runnerUp``, ``runnerUpInliers``, ``confidence`` (1 - runner-up / best inliers) and ``ambiguous``
    (fewer than ``min_inliers``, or the best not ``margin`` times the runner-up). Only the ``top`` references closest
    by hash are feature-matched."""
    refs = Refs.load(refs)
    g = _grey(crop)
    f = _features(g)
    hs = [phash(rotate_quarter(g, t)) for t in TURNS]
    dist = [min((int((h != r).sum()), t) for h, t in zip(hs, TURNS)) for r in refs.hash]
    cand = sorted(range(len(refs.ids)), key=lambda i: dist[i])[:max(1, top)]
    scored = sorted(((*_inliers(f, refs.feat[i]), i) for i in cand), key=lambda x: -x[0])
    n, H, i = scored[0]
    n2, _, j = scored[1] if len(scored) > 1 else (0, None, None)
    return {"ref": refs.ids[i], "turn": _turn(H, g.shape) if H is not None else dist[i][1], "inliers": n,
            "hash": dist[i][0], "runnerUp": None if j is None else refs.ids[j], "runnerUpInliers": n2,
            "confidence": round(1 - n2 / n, 3) if n else 0.0, "ambiguous": n < min_inliers or n < margin * n2}


def check_back(front_id: Optional[str], back_crop: np.ndarray, back_refs, back_map: Optional[dict] = None, **kw) -> dict:
    """Whether a paired back belongs to its front: the back is identified among ``back_refs``; the expected back is
    ``back_map[front_id]`` (an id or a list of ids), or, with no map, the back reference with the front's id.
    ``matches`` is True or False, or None when the back is ambiguous or no back is expected."""
    want = back_map.get(front_id) if back_map else front_id
    want = None if want is None else [want] if isinstance(want, str) else list(want)
    r = identify(back_crop, back_refs, **kw)
    return {**r, "expected": want, "matches": None if r["ambiguous"] or want is None else r["ref"] in want}


def annotate(man: dict, plugin, refs, back: Optional[dict] = None, back_refs=None) -> None:
    """Record ``identity`` on each item of a manifest (and, with its paired back manifest, on each back, checked
    against its front). Flags: IDENTITY_AMBIGUOUS (on the item), BACK_IDENTITY_MISMATCH (on the front)."""
    kw = {"min_inliers": plugin.identify_min_inliers}
    backs = {b["name"]: b for b in back["items"]} if back else {}
    for it in man["items"]:
        r = it["identity"] = identify(load(it["file"]), refs, **kw)
        if r["ambiguous"]:
            it["flags"].append("IDENTITY_AMBIGUOUS")
        b = backs.get(it.get("back"))
        if b is None:
            continue
        c = b["identity"] = check_back(None if r["ambiguous"] else r["ref"], load(b["file"]), back_refs or refs,
                                       plugin.back_map, **kw)
        if c["ambiguous"]:
            b["flags"].append("IDENTITY_AMBIGUOUS")
        if c["matches"] is False:
            it["flags"].append("BACK_IDENTITY_MISMATCH")
