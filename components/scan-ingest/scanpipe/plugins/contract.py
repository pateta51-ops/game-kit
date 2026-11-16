"""What a game's plug-in must provide, as a check a game runs on its own plug-in in a test:
``assert contract.problems(MyGame()) == []``."""
from __future__ import annotations

from pathlib import Path

import numpy as np

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
    return out
