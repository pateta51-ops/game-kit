"""Zone rectangles of a scanned map or board, as board-layout's ZoneLayout JSON: {w, h, zones: {id: {r: [x, y, w, h]}}}."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


def hex_bgr(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return int(c[4:6], 16), int(c[2:4], 16), int(c[0:2], 16)


def find(img: np.ndarray, colours: list[str], tol: int = 40, min_area: float = 0.0005) -> list[list[int]]:
    """Bounding rects [x, y, w, h] of the blobs of each marker colour, in reading order (rows top to bottom, then left to right)."""
    H, W = img.shape[:2]
    out = []
    for c in colours:
        d = np.abs(img.astype(np.int16) - np.array(hex_bgr(c), np.int16)).max(axis=2)
        n, _, st, _ = cv2.connectedComponentsWithStats((d <= tol).astype(np.uint8), connectivity=8)
        out += [[int(v) for v in st[i, :4]] for i in range(1, n) if st[i, 2] * st[i, 3] >= min_area * W * H]
    out.sort(key=lambda r: r[1] + r[3] / 2)
    rows, row = [], []
    for r in out:
        if row and r[1] + r[3] / 2 - (row[0][1] + row[0][3] / 2) > min(row[0][3], r[3]) / 2:
            rows.append(row)
            row = []
        row.append(r)
    if row:
        rows.append(row)
    return [r for row in rows for r in sorted(row, key=lambda r: r[0])]


def layout(W: int, H: int, rects: dict, size=None, digits: int = 4) -> dict:
    """ZoneLayout of the rects (scan px); size rescales to the game's units (1, 1 gives fractions of the scan)."""
    sw, sh = size or (W, H)

    def f(v, s):
        v = v * s
        return int(v) if float(v).is_integer() else round(v, digits)
    return {"w": sw, "h": sh, "zones": {k: {"r": [f(x, sw / W), f(y, sh / H), f(w, sw / W), f(h, sh / H)]} for k, (x, y, w, h) in rects.items()}}


def trace(img: np.ndarray, colours=(), names=(), zones: dict | None = None, tol: int = 40, min_area: float = 0.0005,
          prefix: str = "zone", size=None) -> dict:
    """Found blobs named in order (names, else prefix1..N; a count that differs from names raises), plus hand rects in zones
    ([x, y, w, h], or {"c": [cx, cy], "s": [w, h]}) that win on the same id."""
    H, W = img.shape[:2]
    found = find(img, list(colours), tol, min_area) if colours else []
    if names and len(names) != len(found):
        raise ValueError(f"found {len(found)} zones, names lists {len(names)}")
    rects = {(names[i] if names else f"{prefix}{i + 1}"): r for i, r in enumerate(found)}
    for k, r in (zones or {}).items():
        rects[k] = [r["c"][0] - r["s"][0] / 2, r["c"][1] - r["s"][1] / 2, *r["s"]] if isinstance(r, dict) else list(r)
    for k, (x, y, w, h) in rects.items():
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > W or y + h > H:
            raise ValueError(f"zone {k} {[x, y, w, h]} lies outside the {W}x{H} scan")
    return layout(W, H, rects, size)


def overlay(img: np.ndarray, L: dict) -> np.ndarray:
    o = img.copy()
    sx, sy = img.shape[1] / L["w"], img.shape[0] / L["h"]
    for k, z in L["zones"].items():
        x, y, w, h = z["r"]
        p = (int(x * sx), int(y * sy))
        cv2.rectangle(o, p, (int((x + w) * sx), int((y + h) * sy)), (40, 40, 255), 3)
        cv2.putText(o, k, (p[0] + 4, p[1] + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
    return o


KEYS = ("colours", "names", "zones", "tol", "min_area", "prefix", "size")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="trace_zones", description="trace zone rects of a map scan into ZoneLayout JSON")
    ap.add_argument("scan", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--config", type=Path, help="JSON with any of: colours, names, zones, tol, min_area, prefix, size (flags win)")
    ap.add_argument("--colour", action="append", help="marker colour #rrggbb (repeat)")
    ap.add_argument("--name", action="append", help="zone id per found blob, in reading order (repeat)")
    ap.add_argument("--tol", type=int)
    ap.add_argument("--min-area", type=float, help="smallest blob as a fraction of the scan (default 0.0005)")
    ap.add_argument("--prefix", help="id stem when no names are given (default zone)")
    ap.add_argument("--size", type=float, nargs=2, help="output units W H (1 1 = fractions of the scan; default scan px)")
    ap.add_argument("--overlay", type=Path, help="also write the scan with the rects drawn")
    a = ap.parse_args(argv)
    cfg = json.loads(a.config.read_text(encoding="utf-8")) if a.config else {}
    for k, v in zip(KEYS, (a.colour, a.name, None, a.tol, a.min_area, a.prefix, a.size)):
        if v is not None:
            cfg[k] = v
    img = cv2.imread(str(a.scan), cv2.IMREAD_COLOR)
    if img is None:
        print(f"cannot read {a.scan}")
        return 2
    try:
        L = trace(img, **{k: cfg[k] for k in KEYS if k in cfg})
    except ValueError as e:
        print(e)
        return 1
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(L, indent=1), encoding="utf-8")
    if a.overlay:
        cv2.imwrite(str(a.overlay), overlay(img, L))
    print(f"{len(L['zones'])} zones -> {a.out}")
    return 0
