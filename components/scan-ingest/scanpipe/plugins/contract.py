"""What a game's plug-in must provide, as a check a game runs on its own plug-in in a test:
``assert contract.problems(MyGame()) == []``."""
from __future__ import annotations

import json
import tempfile
from pathlib import Path

import numpy as np

from .. import silhouette
from .base import Orientation, Plugin


def problems(p: Plugin) -> list[str]:
    out = []
    if not isinstance(p, Plugin):
        return ["not a subclass of scanpipe.plugins.base.Plugin"]
    if not isinstance(p.name, str) or not p.name or p.name == Plugin.name:
        out.append("name: give the project's own name")
    sizes = p.item_sizes_mm
    if not isinstance(sizes, dict) or not sizes:
        return out + ["item_sizes_mm: at least one kind"]
    for kind, size in sizes.items():
        if not (isinstance(kind, str) and isinstance(size, tuple) and len(size) == 2 and 0 < size[0] <= size[1]):
            out.append(f"item_sizes_mm[{kind!r}]: (short, long) in millimetres, short <= long")
        elif p.classify(*size) is None:
            out.append(f"classify: {kind!r} at its own size is no kind")
    for attr in ("shaped_kinds", "thick_kinds", "printed_edge_kinds", "cast_kinds", "corner_radius_mm"):
        for kind in set(getattr(p, attr)) - set(sizes):
            out.append(f"{attr}: {kind!r} is not in item_sizes_mm")
    for kind in set(p.silhouette_kinds) - set(sizes):
        out.append(f"silhouette_kinds: {kind!r} is not in item_sizes_mm")
    for k in set(p.silhouette_spec) - set(silhouette.DEFAULT_SPEC):
        out.append(f"silhouette_spec: {k!r} is not a key of silhouette.DEFAULT_SPEC")
    lo_hi = p.sleeve_plain_long_mm
    if p.sleeve_min_short_mm is not None and p.sleeve_min_short_mm <= 0 or lo_hi is not None and not (
            isinstance(lo_hi, tuple) and len(lo_hi) == 2 and 0 < lo_hi[0] < lo_hi[1]):
        out.append("sleeve_min_short_mm, sleeve_plain_long_mm: millimetres above 0, (lo, hi) with lo < hi, or None")
    for attr in ("thick_kinds", "cast_kinds", "corner_radius_mm"):
        v = getattr(p, attr)
        if not isinstance(v, dict) or any(not isinstance(x, (int, float)) or x <= 0 for x in v.values()):
            out.append(f"{attr}: kind -> millimetres above 0")
    for kind in set(p.printed_edge_kinds) - set(p.thick_kinds):
        out.append(f"printed_edge_kinds: {kind!r} is not in thick_kinds")
    for kind in set(p.cast_kinds) & set(p.thick_kinds):
        out.append(f"{kind!r} is in both cast_kinds (thin) and thick_kinds")
    if p.card_kind is not None and p.card_kind not in sizes:
        out.append(f"card_kind: {p.card_kind!r} is not in item_sizes_mm")
    if not 0 < p.size_tolerance < 0.5:
        out.append("size_tolerance: a fraction between 0 and 0.5")
    if p.out_dpi is not None and p.out_dpi <= 0:
        out.append("out_dpi: above 0, or None to keep the scan's")
    if not 1 <= p.jpeg_quality <= 100:
        out.append("jpeg_quality: 1 to 100")
    if p.classify(1.0, 1.0) is not None:
        out.append("classify: a 1 x 1 mm speck is a kind")
    crop = np.full((40, 30, 3), 128, np.uint8)
    for kind in [*sizes, None]:
        o = p.orient(crop, kind)
        if not (isinstance(o, Orientation) and o.turn in (0, 90, 180, 270) and isinstance(o.confident, bool)
                and isinstance(o.why, str)):
            out.append(f"orient({kind!r}): an Orientation with turn 0, 90, 180 or 270, confident and why")
    for kind in p.cast_kinds:
        if not isinstance(p.cast_for(kind, None, np.zeros((40, 30, 4), np.uint8)), bool):
            out.append(f"cast_for({kind!r}): True or False")
    project = Path("project")
    d = p.default_out(project)
    if not isinstance(d, Path) or project not in d.parents:
        out.append("default_out: a folder inside the project")
    for ext in ("jpg", "png"):
        f = p.file_for(Path("out"), "b001-s01-a", ext)
        if not isinstance(f, Path) or Path("out") not in f.parents or f.suffix != f".{ext}":
            out.append(f"file_for: a .{ext} file inside the output folder")
    if p.file_for(Path("out"), "a", "png") == p.file_for(Path("out"), "b", "png"):
        out.append("file_for: two names give the same file")
    if not isinstance(p.preflight(None, [], []), list):
        out.append("preflight: a list of reasons (empty when the run may start)")
    if not isinstance(p.descreen_mm, (int, float)) or not 0 <= p.descreen_mm < 1:
        out.append("descreen_mm: millimetres, 0 (off) up to 1")
    for attr in ("pair_backs", "rescans"):
        if not isinstance(getattr(p, attr), bool):
            out.append(f"{attr}: True or False")
    if not isinstance(p.back_suffix, str) or not p.back_suffix or \
            p.file_for(Path("out"), "a" + p.back_suffix, "png") == p.file_for(Path("out"), "a", "png"):
        out.append("back_suffix: a non-empty text that gives a back its own file")
    item = {"n": 1, "name": "b001-s01-a", "file": "out/b001-s01-a.png", "kind": next(iter(sizes)),
            "sizeMm": list(next(iter(sizes.values()))), "turn": 0, "orientation": "", "pixels": [30, 40], "flags": [],
            "region": {"cx": 20.0, "cy": 20.0, "w": 30.0, "h": 40.0}}
    back = {**item, "n": 2, "name": "b001-s01-a" + str(p.back_suffix), "file": "out/b001-s01-a-b.png",
            "pairOf": item["name"]}
    entries = []
    for b in (None, back):
        man = {"scan": "s.tif", "dpi": 600.0, "plugin": p.name, "items": [{**item, **({"back": b["name"]} if b else {})}]}
        try:
            e = p.entry(man["items"][0], b, man)
            if e is not None and not isinstance(e, dict):
                out.append("entry: a dict (the content-pack entry) or None")
            elif e is not None:
                json.dumps(e)
                entries.append(e)
        except (TypeError, ValueError) as ex:
            out.append(f"entry: not JSON ({ex})")
        except Exception as ex:
            out.append(f"entry: raised {type(ex).__name__}: {ex} on an item {'with' if b else 'without'} a back")
    with tempfile.TemporaryDirectory() as d:
        try:
            if not isinstance(p.write_entries(None, Path(d), entries or [{"id": "x"}]), list):
                out.append("write_entries: a list of problems")
        except Exception as ex:
            out.append(f"write_entries: raised {type(ex).__name__}: {ex}")
    return out
