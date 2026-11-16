"""Front/back pairing (optional, plug-in ``pair_backs``): the items of a back scan, every item flipped in place like a
page, matched to the front scan's items by centre, then by size for an item that moved as it was flipped. Ported from
Unstoppable's ufp_ingest/batch.py (pair_regions, pair_leftovers)."""
from __future__ import annotations

import math
import os
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment

FAR_PAIR_SIZE_TOL = 0.06  # leftover items pair only when both sides agree within 6 %
SIZE_MISMATCH = 0.04


def pair_regions(a: list[dict], b: list[dict]) -> tuple[dict[int, int], list[int], list[int]]:
    """Regions (``cx, cy, w, h``) of side A matched to side B by centre distance: (a -> b, unmatched A, unmatched B)."""
    if not a or not b:
        return {}, list(range(len(a))), list(range(len(b)))
    cost = np.array([[math.hypot(ra["cx"] - rb["cx"], ra["cy"] - rb["cy"]) for rb in b] for ra in a])
    rows, cols = linear_sum_assignment(cost)
    limit = 0.35 * float(np.median([min(r["w"], r["h"]) for r in a]))
    matches = {int(i): int(j) for i, j in zip(rows, cols) if cost[i, j] <= limit}
    return matches, [i for i in range(len(a)) if i not in matches], [j for j in range(len(b)) if j not in matches.values()]


def pair_leftovers(a: list[dict], b: list[dict], ua: list[int], ub: list[int]) -> dict[int, int]:
    """The leftovers of `pair_regions` paired when both sides have the same size, closest first."""
    if not ua or not ub:
        return {}

    def same(ra, rb):
        return abs(ra["w"] - rb["w"]) <= FAR_PAIR_SIZE_TOL * max(ra["w"], 1) and \
            abs(ra["h"] - rb["h"]) <= FAR_PAIR_SIZE_TOL * max(ra["h"], 1)

    big = 1e12
    cost = np.array([[math.hypot(a[i]["cx"] - b[j]["cx"], a[i]["cy"] - b[j]["cy"]) if same(a[i], b[j]) else big
                      for j in ub] for i in ua])
    rows, cols = linear_sum_assignment(cost)
    return {ua[r]: ub[c] for r, c in zip(rows, cols) if cost[r, c] < big}


def pair_manifests(front: dict, back: dict, plugin, out_dir: Path) -> None:
    """Pair the two manifests in place: each back crop is renamed to its front's name plus ``plugin.back_suffix``;
    the front item records ``back`` and ``pairDistancePx``, the back item ``pairOf``. Flags: PAIRED_FAR (matched by
    size, not place), NO_BACK_FOUND, A_B_SIZE_MISMATCH, NO_FRONT_MATCH (on a back item)."""
    fa, fb = front["items"], back["items"]
    ra, rb = [it["region"] for it in fa], [it["region"] for it in fb]
    matches, ua, ub = pair_regions(ra, rb)
    far = pair_leftovers(ra, rb, ua, ub)
    matches.update(far)
    for i, it in enumerate(fa):
        if i not in matches:
            it["flags"].append("NO_BACK_FOUND")
            continue
        b = fb[matches[i]]
        if i in far:
            it["flags"].append("PAIRED_FAR")
        if max(abs(ra[i]["w"] - b["region"]["w"]) / max(ra[i]["w"], 1),
               abs(ra[i]["h"] - b["region"]["h"]) / max(ra[i]["h"], 1)) > SIZE_MISMATCH:
            it["flags"].append("A_B_SIZE_MISMATCH")
        name = it["name"] + plugin.back_suffix
        old = Path(b["file"])
        new = plugin.file_for(out_dir, name, old.suffix[1:])
        if old != new and new.exists():
            # a back crop of another run already has this name: never overwritten; the back keeps its own name
            b["flags"].append("BACK_NAME_TAKEN")
            name, new = b["name"], old
        if old != new:
            new.parent.mkdir(parents=True, exist_ok=True)
            os.replace(old, new)
        b.update(name=name, file=str(new), pairOf=it["name"])
        it["back"] = name
        it["pairDistancePx"] = round(math.hypot(ra[i]["cx"] - b["region"]["cx"], ra[i]["cy"] - b["region"]["cy"]), 1)
    for b in fb:
        if "pairOf" not in b:
            b["flags"].append("NO_FRONT_MATCH")
    front["backScan"], back["frontScan"] = back["scan"], front["scan"]
