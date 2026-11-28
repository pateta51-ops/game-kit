"""Which reference face (the game's built card images) a crop shows (K784): a perceptual hash at 4 quarter turns against
every reference face and generic back, then SIFT with a RANSAC homography on the nearest faces by hash; the score is
the inlier count. Also: whether the two faces of a paired item belong to one card, the same card found twice, and the
manifest wiring (plug-in ``identify_refs``, off by default). Numbers in PARAMS; a plug-in changes them with
``identify_params``."""
from __future__ import annotations

import math
from collections import OrderedDict
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from . import images
from .detect import rotate_quarter

EXTS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}
TURNS = (0, 90, 180, 270)
PARAMS = {"hash_size": 16, "thumb": 512, "top": 10, "side": 900, "nfeatures": 3000, "ratio": 0.75, "ransac": 6.0,
          "min_inliers": 120, "margin": 1.4, "other_face_inliers": 40, "back_hash_margin": 4, "cache": 64}
SURE = ("high", "medium")


def load(path) -> np.ndarray:
    if isinstance(path, np.ndarray):
        return path
    img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None:
        return images.load_bgr(Path(path))
    return cv2.cvtColor(img, cv2.COLOR_GRAY2BGR) if img.ndim == 2 else images.flatten(img[:, :, :4])


def _grey(img: np.ndarray, side: int) -> np.ndarray:
    if img.ndim == 3:
        img = cv2.cvtColor(images.flatten(img), cv2.COLOR_BGR2GRAY)
    s = side / max(img.shape)
    return cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_LINEAR)


def phash(grey: np.ndarray, hash_size: int = 16) -> np.ndarray:
    n = hash_size * 4
    d = cv2.dct(np.float32(cv2.resize(grey, (n, n), interpolation=cv2.INTER_AREA)))[:hash_size, :hash_size]
    return (d > np.median(d)).ravel()


def _hashes(img, p) -> list:
    g = _grey(img, p["thumb"])
    return [phash(rotate_quarter(g, t), p["hash_size"]) for t in TURNS]


def features(img, p=PARAMS):
    g = cv2.equalizeHist(_grey(img, p["side"]))
    return (*cv2.SIFT_create(nfeatures=p["nfeatures"]).detectAndCompute(g, None), g.shape)


def _inliers(fa, fb, p=PARAMS):
    (ka, da, _), (kb, db, _) = fa, fb
    if da is None or db is None or len(ka) < 4 or len(kb) < 4:
        return 0, None
    m = [x[0] for x in cv2.BFMatcher(cv2.NORM_L2).knnMatch(da, db, k=2)
         if len(x) == 2 and x[0].distance < p["ratio"] * x[1].distance]
    if len(m) < 4:
        return 0, None
    H, mask = cv2.findHomography(np.float32([ka[x.queryIdx].pt for x in m]), np.float32([kb[x.trainIdx].pt for x in m]),
                                 cv2.RANSAC, p["ransac"])
    return (int(mask.sum()), H) if H is not None else (0, None)


def _turn(H, shape) -> int:
    """The clockwise turn of the crop that reads like the reference, from the homography."""
    a, b = cv2.perspectiveTransform(np.float32([[[shape[1] / 2, shape[0] / 2], [shape[1] / 2 + 10, shape[0] / 2]]]), H)[0]
    return round(math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])) / 90) % 4 * 90


def files(src) -> list[Path]:
    out = []
    for p in [src] if isinstance(src, (str, Path)) else src:
        p = Path(p)
        out += sorted(q for q in p.iterdir() if q.suffix.lower() in EXTS) if p.is_dir() else [p]
    return out


def _imgs(src) -> dict:
    if not src:
        return {}
    if isinstance(src, dict):
        return {str(k): v for k, v in src.items()}
    out = {}
    for p in files(src):
        if p.stem in out:
            raise ValueError(f"two reference images have the id {p.stem}: {out[p.stem]} and {p}")
        out[p.stem] = p
    return out


class Refs:
    """The reference faces: ``fronts`` and ``backs`` (a card's own back image) by card id, ``generic`` back designs by
    design id (each a dict of images or files, a folder, or a list; id = the file's stem), ``back_map`` card id ->
    its generic design, ``family`` card id -> family key (die-cuts of one card), ``variants`` card id -> the
    silhouette variant that tells cards sharing art apart. Hashed at once; SIFT features computed when first needed."""

    def __init__(self, fronts, backs=None, generic=None, back_map=None, family=None, variants=None, params=None):
        self.p = {**PARAMS, **(params or {})}
        self.faces = {**{(k, "front"): v for k, v in _imgs(fronts).items()},
                      **{(k, "back"): v for k, v in _imgs(backs).items()},
                      **{(k, "generic"): v for k, v in _imgs(generic).items()}}
        if not any(f != "generic" for _, f in self.faces):
            raise ValueError("no reference faces")
        self.back_map, self.family, self.variants = back_map or {}, family or {}, variants or {}
        self.hash = {k: _hashes(load(v), self.p)[0] for k, v in self.faces.items()}
        self._feat = OrderedDict()

    def feat(self, k):
        if k in self._feat:
            self._feat.move_to_end(k)
        else:
            self._feat[k] = features(load(self.faces[k]), self.p)
            if len(self._feat) > self.p["cache"]:
                self._feat.popitem(last=False)
        return self._feat[k]

    def fam(self, card):
        return self.family.get(card, card)

    @classmethod
    def load(cls, src) -> "Refs":
        return src if isinstance(src, Refs) else cls(src)


def _identify(crop, refs: Refs, item: Optional[dict] = None):
    p = refs.p
    hs = _hashes(crop, p)
    dist = {k: min((int((h != r).sum()), t) for h, t in zip(hs, TURNS)) for k, r in refs.hash.items()}
    f = features(crop, p)
    # the nearest by hash taken per kind of face, so generic backs never crowd out a card's faces
    sc = {k: _inliers(f, refs.feat(k), p) for face in ("front", "back", "generic")
          for k in sorted((k for k in dist if k[1] == face), key=dist.get)[:p["top"]]}
    gen = sorted((k for k in dist if k[1] == "generic"), key=dist.get)
    out = {"generic": {"design": gen[0][0], "bits": dist[gen[0]][0],
                       "margin": dist[gen[1]][0] - dist[gen[0]][0] if len(gen) > 1 else None}} if gen else {}
    best = sorted(sc, key=lambda k: -sc[k][0])
    top = best[0]
    n, H = sc[top]
    # the next best skips the same card's other die-cuts, and a generic back after a generic back
    rest = [k for k in best[1:] if (refs.fam(k[0]), k[1]) != (refs.fam(top[0]), top[1])
            and not (k[1] == top[1] == "generic")]
    n2 = sc[rest[0]][0] if rest else 0
    ok = n >= p["min_inliers"] and n >= p["margin"] * max(n2, 1)
    out.update(ref=top[0], face=top[1], turn=_turn(H, f[2]) if H is not None else dist[top][1], inliers=n,
               hash=dist[top][0], runnerUp=rest[0][0] if rest else None, runnerUpInliers=n2,
               confidence=round(1 - n2 / n, 3) if n else 0.0, ambiguous=not ok,
               held=None if ok else f"best {top[0]} {top[1]}: {n} inliers, next {n2}")
    twins = sorted(c for c in refs.variants if refs.fam(c) == refs.fam(top[0]) and (c, top[1]) in refs.faces)
    if ok and top[1] != "generic" and len(twins) > 1:
        # die-cuts sharing art: the variant comes from the silhouette, never from the image
        s = (item or {}).get("silhouette") or {}
        pick = [c for c in twins if s.get("confidence") in SURE and s.get("variant") and refs.variants[c] == s["variant"]]
        if len(pick) == 1:
            out["ref"] = pick[0]
        else:
            out.update(ambiguous=True, variantUnread=True, held=f"{', '.join(twins)} share art; no confident silhouette variant")
    return out, f, dist


def identify(crop: np.ndarray, refs, item: Optional[dict] = None) -> dict:
    """The face the crop shows: ``ref`` (card id), ``face`` (front or back), ``turn`` (clockwise, to read like it),
    ``inliers``, ``hash`` (bits apart), ``runnerUp`` and ``runnerUpInliers`` (the best of another family),
    ``confidence`` (1 - runner-up / best), ``ambiguous`` with ``held`` (the reason), and ``generic`` (the nearest
    generic back by hash: design, bits, margin to the next). ``item`` (a manifest item) gives the silhouette that
    picks between cards sharing art."""
    return _identify(crop, Refs.load(refs), item)[0]


def check_pair(a: np.ndarray, b: np.ndarray, refs, items=(None, None)) -> dict:
    """Whether the two faces of one item (``a`` the front crop, ``b`` its paired back) are one card: one face is
    confidently card X and the other fits X's other face (its own image by at least ``other_face_inliers``; its
    generic design as the nearest back by hash by ``back_hash_margin`` bits, or by SIFT: ``other_face_inliers`` and
    ``margin`` times any other design). ``matches`` True, False (the faces disagree), or None (no face identified, or
    no other face known); ``held`` says why when not True."""
    refs = Refs.load(refs)
    p = refs.p
    (ra, fa, da), (rb, fb, db) = _identify(a, refs, items[0]), _identify(b, refs, items[1])
    res = {"front": ra, "back": rb, "card": None, "matches": None, "total": ra["inliers"] + rb["inliers"]}
    sa, sb = (not r["ambiguous"] and r["face"] != "generic" for r in (ra, rb))
    if sa and sb and ra["ref"] != rb["ref"]:
        return {**res, "matches": False, "held": f"the faces show {ra['ref']} and {rb['ref']}"}
    if not sa and not sb:
        return {**res, "held": "neither face identified"}
    x, of, od = (ra, fb, db) if sa else (rb, fa, da)
    X = x["ref"]
    want = (X, "front") if x["face"] == "back" else (X, "back") if (X, "back") in refs.faces else \
        (refs.back_map[X], "generic") if X in refs.back_map else None
    if want is None or want not in refs.faces:
        return {**res, "card": X, "held": f"no other face known for {X}"}
    if want[1] == "generic":
        gen = sorted((k for k in od if k[1] == "generic"), key=od.get)
        by_hash = gen[0] == want and (len(gen) < 2 or od[gen[1]][0] - od[gen[0]][0] >= p["back_hash_margin"])
        n = _inliers(of, refs.feat(want), p)[0]
        n2 = max((_inliers(of, refs.feat(k), p)[0] for k in gen if k != want), default=0)
        ok = by_hash or n >= p["other_face_inliers"] and n >= p["margin"] * max(n2, 1)
        other = {"ref": want[0], "face": "generic", "bits": od[want][0], "inliers": n, "nextInliers": n2}
    else:
        n = _inliers(of, refs.feat(want), p)[0]
        ok = n >= p["other_face_inliers"]
        other = {"ref": want[0], "face": want[1], "inliers": n}
    return {**res, "card": X, "matches": ok, "otherFace": other,
            "held": None if ok else f"the other face does not fit {X}'s {want[1]} {want[0]}"}


def refs_for(plugin) -> Refs:
    return Refs(plugin.identify_refs, plugin.identify_back_refs, plugin.identify_generic_backs, plugin.back_map,
                plugin.identify_family, plugin.identify_variants, plugin.identify_params)


def _flag(it, f):
    if f not in it["flags"]:
        it["flags"].append(f)


def annotate(man: dict, refs, back: Optional[dict] = None, min_area_mm2: float = 0.0) -> None:
    """Record ``identity`` on each item of a manifest (with its paired back manifest: the pair check, and each back's
    own face). An item cut off at the scan's edge, or under ``min_area_mm2``, is not matched (``skipped``). Flags:
    IDENTITY_AMBIGUOUS (held, nothing contradicts), VARIANT_UNREAD (cards sharing art, no confident silhouette
    variant), BACK_IDENTITY_MISMATCH (the faces disagree)."""
    backs = {b["name"]: b for b in back["items"]} if back else {}
    for it in man["items"]:
        b = backs.get(it.get("back"))
        if "CUT_OFF_AT_SCAN_EDGE" in it["flags"] or it["sizeMm"][0] * it["sizeMm"][1] < min_area_mm2:
            it["identity"] = {"card": None, "ambiguous": True, "skipped": True,
                              "held": "cut off at the scan's edge or smaller than any card"}
            _flag(it, "IDENTITY_AMBIGUOUS")
            continue
        if b is None:
            r = it["identity"] = identify(load(it["file"]), refs, it)
            r.update(card=None if r["ambiguous"] or r["face"] == "generic" else r["ref"], total=r["inliers"])
            c = {"matches": None if r["card"] is None else True, "front": r}
        else:
            c = check_pair(load(it["file"]), load(b["file"]), refs, (it, b))
            it["identity"] = {**c["front"], **{k: v for k, v in c.items() if k not in ("front", "back")}}
            b["identity"] = c["back"]
        if c["matches"] is False:
            _flag(it, "BACK_IDENTITY_MISMATCH")
        elif not c["matches"]:
            _flag(it, "VARIANT_UNREAD" if c["front"].get("variantUnread") else "IDENTITY_AMBIGUOUS")


def dedupe(manifests: list[dict]) -> int:
    """The same card found in two items of a run (items a re-scan replaced or holds left out): the one with more
    front inliers stays (both faces' inliers break a tie), the other is held (flag IDENTITY_DUPLICATE). Returns how
    many were held."""
    seen, held = {}, 0
    for m in manifests:
        for it in m["items"]:
            r = it.get("identity")
            if r and "pairOf" not in it and r.get("card") and not r.get("held") and not it.get("replacedBy") \
                    and not it.get("heldFor"):
                seen.setdefault(r["card"], []).append(it)
    for card, its in seen.items():
        keep = max(its, key=lambda it: (it["identity"]["inliers"], it["identity"]["total"]))
        for it in its:
            if it is not keep:
                it["identity"]["held"] = f"same card as {keep['name']}"
                _flag(it, "IDENTITY_DUPLICATE")
                held += 1
    return held
