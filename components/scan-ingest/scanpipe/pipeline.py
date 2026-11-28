"""Scan -> items: detect, measure, classify, crop upright, write one image per item plus review files.

On a coloured backing (magenta, `key.keyable`) each item is cut out of it by colour: the crop is tightened to the item
and written as a PNG with transparency, with the scanner's tone curve applied (README, *Magenta backing*). On a white
lid or black paper the crop is a plain JPEG, as before."""
from __future__ import annotations

import dataclasses
import json
from pathlib import Path
from typing import Optional

import numpy as np

from . import detect, images, key, review, silhouette, sleeves, tone
from .plugins.base import Orientation, Plugin

MM_PER_IN = 25.4


def params_for(plugin: Plugin, dpi: float) -> detect.DetectParams:
    """Detection parameters with the plug-in's item sizes in pixels, so a known item is never split."""
    px = dpi / MM_PER_IN
    sizes = sorted(plugin.item_sizes_mm.values(), key=lambda s: s[0] * s[1])
    # a thick item is detected with its cut side and shadow, before the cut-out removes them: about that much larger
    seen = [(w + plugin.thick_kinds[k], h + plugin.thick_kinds[k]) for k, (w, h) in plugin.item_sizes_mm.items()
            if plugin.thick_kinds.get(k)]
    items = tuple((w * px, h * px) for w, h in sizes + seen)
    shaped = tuple((w * px, h * px) for k, (w, h) in plugin.item_sizes_mm.items() if k in plugin.shaped_kinds)
    card = plugin.item_sizes_mm.get(plugin.card_kind) if plugin.card_kind else None
    card_px = (card[0] * px, card[1] * px) if card else (items[0] if items else None)
    return dataclasses.replace(detect.DetectParams(), card_px=card_px, item_px=items,
                               shaped_px=shaped)


def process_scan(scan: Path, plugin: Plugin, out_dir: Path, review_dir: Path, names: Optional[list[str]] = None,
                 dpi: Optional[float] = None, turns: Optional[list[Optional[int]]] = None,
                 tone_name: Optional[str] = "auto") -> dict:
    """Process one scan file. ``names`` and ``turns`` go to the items in reading order (top to bottom, then
    left to right); a missing name falls back to ``<scan stem>-<n>``, a missing turn to the plug-in's reading.
    ``tone_name`` is the tone curve for the crops: "auto" (the default curve on a keyed scan, none otherwise), "none",
    or a name in `tones/`.
    Returns the manifest (also written to ``review_dir/<stem>.json``)."""
    if dpi is None:
        read = images.read_dpi(scan)
        if not read:
            raise SystemExit(f"{scan.name} does not record its resolution: add --dpi (e.g. --dpi 600).")
        dpi = read[0]
    full = images.load_bgr(scan)
    params = params_for(plugin, dpi)
    det = detect.detect(full, params)
    keyed = key.keyable(det.background)
    curve = tone.resolve(tone_name, keyed)
    px_per_mm = dpi / MM_PER_IN
    names = list(names or [])
    turns = list(turns or [])
    items, labels = [], []
    regions = []
    for i, r in enumerate(det.regions):
        if plugin.unsleeve and not keyed:
            r = sleeves.unsleeve(full, r, det.background, params, px_per_mm, plugin.sleeve_min_short_mm,
                                 plugin.sleeve_plain_long_mm)
        flags = list(r.flags)
        outline = None
        k = key.key_region(full, r, det.background, px_per_mm) if keyed else None
        if k is not None:
            r = k.region
            crop, _ = detect.rectify(k.roi_bgra, key.shifted(k.region, k.origin))
        else:
            if keyed:
                flags.append("KEY_FAILED")
            crop, outline = detect.rectify(full, r)
        w_mm, h_mm = r.w / dpi * MM_PER_IN, r.h / dpi * MM_PER_IN
        kind = plugin.classify(w_mm, h_mm)
        thick_cut, thick_cands, plain_mm = None, [], [round(w_mm, 1), round(h_mm, 1)]
        if k is not None and (plugin.thick_kinds.get(kind) or (kind is None and plugin.thick_kinds)):
            # thick board: cut again without its cut side and shadow (an unknown size may be one with its shadow)
            def mode(kd):
                return plugin.thick_kinds[kd], kd not in plugin.printed_edge_kinds
            modes = [mode(kind)] if kind else sorted({mode(kd) for kd in plugin.thick_kinds})
            # the plain cut a drop_light cut is judged against is without the mark too (None: no mark)
            ref_drop = key.key_region(full, det.regions[i], det.background, px_per_mm, drop_light=True)
            for shadow_mm, neutral in modes:
                # K792: the colour rule, and the shadow as the backing darkened (a black, red or coloured piece is
                # not); the cut nearest the kind's size wins, a plausible one first in printed_edge mode
                best = None
                # K794: each cut again without a lighter-than-backing mark touching the piece (drop_light)
                for drop in (False, True):
                    ref = ref_drop if drop else k
                    if ref is None:
                        continue
                    for tinted in (False, True):
                        k2 = key.key_region(full, det.regions[i], det.background, px_per_mm, shadow_mm, neutral,
                                            tinted_shadow=tinted, drop_light=drop)
                        if k2 is None:
                            continue
                        wh = (k2.region.w / dpi * MM_PER_IN, k2.region.h / dpi * MM_PER_IN)
                        kind2 = plugin.classify(*wh)
                        name2 = "tinted" if tinted else "colour"
                        thick_cands.append({"mode": [shadow_mm, "plain" if neutral else "printed_edge"], "cut": name2,
                                            "sizeMm": [round(wh[0], 1), round(wh[1], 1)], "kind": kind2,
                                            **({"dropLight": True} if drop else {})})
                        if kind2 is None or kind2 not in plugin.thick_kinds or mode(kind2) != (shadow_mm, neutral):
                            continue
                        sz = plugin.item_sizes_mm.get(kind2)
                        if drop and sz and any(a < b * (1 - plugin.size_tolerance) for a, b in zip(sorted(wh), sorted(sz))):
                            continue   # dropping the mark never leaves less than the kind
                        # K794: a wide shadow takes more of the plain cut than REMOVED_MAX: the pixel share of the
                        # plain cut beyond the kind's size (the cut's pixels scaled to the kind's size) is allowed on
                        # top, at most REMOVED_EXTRA_MAX, and only when what is removed is the backing darkened
                        extra = 0.0
                        if sz and not neutral:
                            a1, a0 = (k2.roi_bgra[..., 3] > 128).sum(), (ref.roi_bgra[..., 3] > 128).sum()
                            extra = min(key.REMOVED_EXTRA_MAX, max(0.0, 1 - a1 * sz[0] * sz[1] / (wh[0] * wh[1]) / a0))
                            if extra and key.removed_tinted(full, ref, k2, det.background) < key.TINTED_REMOVED:
                                extra = 0.0
                        ok = neutral or key.plausible_shadow(ref, k2, key.REMOVED_MAX + float(extra))
                        thick_cands[-1].update(oneSided=[round(v, 2) for v in key.one_sided(ref, k2)], plausible=ok)
                        off = max(abs(a - b) for a, b in zip(sorted(wh), sorted(sz))) if sz else 0.0
                        if best is None or (not best[0] and ok) or (ok == best[0] and off < best[1]):
                            best = (ok, off, k2, kind2, name2 + ("+dropLight" if drop else ""))
                if best is None:
                    continue
                _ok, _off, k2, kind2, name2 = best
                if not neutral and not _ok:
                    # the piece's own edge colour was taken for shadow all round: keep the plain cut-out
                    flags.append("SHADOW_KEPT_CHECK_CROP")
                    break
                k, r, kind = k2, k2.region, kind2
                thick_cut = name2
                crop, _ = detect.rectify(k.roi_bgra, key.shifted(k.region, k.origin))
                w_mm, h_mm = r.w / dpi * MM_PER_IN, r.h / dpi * MM_PER_IN
                break
        sil, cast_skip, sides_cast = None, None, None
        if k is not None and (plugin.cast_kinds.get(kind) or (kind is None and plugin.cast_kinds)):
            # a card: cut again with its outline from geometry, without the shadow it casts (README, *Magenta backing*);
            # an unknown size may be a card with a shadow too wide for its size to be recognised
            cks = [kind] if kind else sorted(plugin.cast_kinds)
            # K789: the fit is chosen per item, from the silhouette of the plain cut (a notch would be filled by it)
            if any(c in plugin.silhouette_kinds for c in cks) and crop.ndim == 3 and crop.shape[2] == 4:
                sil = silhouette.read(silhouette.outline_of(crop[:, :, 3]), crop.shape[1], crop.shape[0],
                                      silhouette.spec_for(plugin.silhouette_spec))
            for ck in cks:
                if not plugin.cast_for(ck, sil if ck in plugin.silhouette_kinds else None, crop):
                    cast_skip = f"cast_for({ck}): no (silhouette {sil['shape'] if sil else 'not read'})"
                    continue
                k2 = key.key_region(full, det.regions[i], det.background, px_per_mm, cast_mm=plugin.cast_kinds[ck],
                                    cast_size_mm=plugin.item_sizes_mm.get(ck), cast_size_tol_mm=plugin.cast_size_tol_mm,
                                    cast_radius_mm=plugin.corner_radius_mm.get(ck))
                if k2 is not None and plugin.classify(k2.region.w / dpi * MM_PER_IN, k2.region.h / dpi * MM_PER_IN) == ck:
                    k, r, kind = k2, k2.region, ck
                    # the crop's border runs along the fitted edges' straight envelope, not the item's rectangle
                    crop = key.cast.rectify(k.roi_bgra, k.fit, r.corners, k.origin)
                    w_mm, h_mm = crop.shape[1] / dpi * MM_PER_IN, crop.shape[0] / dpi * MM_PER_IN
                    flags.extend(f for f in k.cast["flags"] if f not in flags)
                    sil, cast_skip = None, None
                    break
            shape_names = silhouette.spec_for(plugin.silhouette_spec)["names"]
            if cast_skip and plugin.cast_skip_mode == "sides" and sil and crop.ndim == 3 and crop.shape[2] == 4 \
                    and sil["shape"] in {shape_names.get(s, s) for s in ("notched", "tabbed")}:
                size = plugin.item_sizes_mm.get(kind) if kind else None
                (oy, ox), (rh, rw) = k.origin[::-1], k.roi_bgra.shape[:2]   # K793: the shadow's profile, before the repaint
                raw = detect.rectify(np.dstack([full[oy:oy + rh, ox:ox + rw], k.roi_bgra[:, :, 3]]), key.shifted(k.region, k.origin))[0]
                crop, sides_cast = key.cast.trim_sides(crop, px_per_mm, sil, (size[0] * px_per_mm, size[1] * px_per_mm) if size else None,
                                                     plugin.cast_size_tol_mm * px_per_mm, raw)
                if any(sides_cast["removedMm"].values()):
                    # the silhouette of the final crop: notchSpan, tabX and the turn refer to it
                    sil = silhouette.read(silhouette.outline_of(crop[:, :, 3]), crop.shape[1], crop.shape[0],
                                          silhouette.spec_for(plugin.silhouette_spec))
                w_mm, h_mm = crop.shape[1] / dpi * MM_PER_IN, crop.shape[0] / dpi * MM_PER_IN
            if kind not in plugin.silhouette_kinds:
                sil = None
        regions.append(r)
        if kind is None:
            flags.append("UNKNOWN_SIZE")
        if kind in plugin.silhouette_kinds and sil is None:
            if crop.ndim == 3 and crop.shape[2] == 4:
                outline = silhouette.outline_of(crop[:, :, 3])
            sil = silhouette.read(outline, crop.shape[1], crop.shape[0], silhouette.spec_for(plugin.silhouette_spec))
        if sil:
            flags.extend(f for f in sil["flags"] if f not in flags)
        o = plugin.orient(images.flatten(crop), kind)
        if not o.confident and sil and sil["rotate"] is not None and sil["confidence"] in ("high", "medium"):
            o = Orientation(sil["rotate"], True, f"silhouette: {sil['shape']} {sil['face'] or ''}".strip())
        turn = turns[i] if i < len(turns) and turns[i] is not None else o.turn
        if i < len(turns) and turns[i] is not None:
            why = "given with --turn"
        else:
            why = o.why
            if not o.confident:
                flags.append("ORIENTATION_UNREAD")
        name = names[i] if i < len(names) else f"{scan.stem}-{i + 1}"
        upright = detect.rotate_quarter(crop, turn)
        if plugin.descreen_mm:
            upright = images.descreen(upright, plugin.descreen_mm * px_per_mm)
        upright = tone.apply(images.resize_to_dpi(upright, dpi, plugin.out_dpi), curve)
        if k is not None:
            out = plugin.file_for(out_dir, name, "png")
            images.save_png(upright, out, plugin.out_dpi or dpi)
        else:
            out = plugin.file_for(out_dir, name, "jpg")
            images.save_jpeg(upright, out, plugin.jpeg_quality, plugin.out_dpi or dpi)
        items.append({
            "n": i + 1, "name": name, "file": str(out), "kind": kind,
            "sizeMm": [round(w_mm, 1), round(h_mm, 1)], "turn": turn, "orientation": why,
            "pixels": [upright.shape[1], upright.shape[0]], "flags": flags, "region": r.to_json(),
            **({"keyed": True, "rimPx": k.rim_px} if k is not None else {}),
            **({"silhouette": sil} if sil else {}),
            **({"castSkipped": cast_skip} if cast_skip else {}),
            **({"thickCut": thick_cut} if thick_cut else {}),
            **({"thickCuts": thick_cands, "thickPlainMm": plain_mm} if thick_cands else {}),
            **({"cast": {kk: v for kk, v in k.cast.items() if kk != "flags"}} if k is not None and k.cast else {}),
            **({"cast": sides_cast} if sides_cast else {}),
        })
        labels.append(str(i + 1))
    review_dir.mkdir(parents=True, exist_ok=True)
    review.overlay(full, regions, labels, review_dir / f"{scan.stem}-overlay.jpg", rejected=det.rejected,
                   notes=[f"{it['name']} {it['kind'] or '?'}" for it in items])
    manifest = {
        "scan": scan.name, "pixels": [int(full.shape[1]), int(full.shape[0])], "sha256": images.sha256_file(scan), "dpi": dpi, "plugin": plugin.name,
        "background": {**det.background.summary(), **({"keyed": True} if keyed else {})},
        **({"tone": curve} if curve else {}), **({"descreenMm": plugin.descreen_mm} if plugin.descreen_mm else {}),
        "items": items, "rejected": det.rejected,
    }
    with open(review_dir / f"{scan.stem}.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    return manifest
