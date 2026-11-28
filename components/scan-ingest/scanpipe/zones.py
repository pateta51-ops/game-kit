"""Zone rectangles of a scanned map or board, as board-layout's ZoneLayout JSON: {w, h, zones: {id: {r: [x, y, w, h]}}}."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import cv2
import numpy as np


class Bad(ValueError):
    """A bad input (colour, hand rect, config): the CLI exits 2."""


def hex_bgr(c: str) -> tuple[int, int, int]:
    if not re.fullmatch(r"#?[0-9a-fA-F]{6}", c):
        raise Bad(f"bad colour {c!r}: want #rrggbb")
    c = c.lstrip("#")
    return int(c[4:6], 16), int(c[2:4], 16), int(c[0:2], 16)


def find(img: np.ndarray, colours: list[str], tol: int = 40, min_area: float = 0.0005, close: int = 5) -> list[list[int]]:
    """Bounding rects [x, y, w, h] of the blobs of each marker colour, in reading order (rows top to bottom, then left to right).
    Each pixel goes to its nearest colour only; gaps up to close px (a printed label, a JPEG fringe) are closed first."""
    H, W = img.shape[:2]
    d = np.stack([np.abs(img.astype(np.int16) - np.array(hex_bgr(c), np.int16)).max(axis=2) for c in colours])
    near = d.argmin(axis=0)
    out = []
    for i in range(len(colours)):
        m = ((near == i) & (d[i] <= tol)).astype(np.uint8)
        if close > 1:
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((close, close), np.uint8))
        n, _, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
        out += [[int(v) for v in st[j, :4]] for j in range(1, n) if st[j, 2] * st[j, 3] >= min_area * W * H]
    out.sort(key=lambda r: r[1] + r[3] / 2)
    rows, row = [], []
    for r in out:
        if row and abs(r[1] + r[3] / 2 - sum(q[1] + q[3] / 2 for q in row) / len(row)) > min(min(q[3] for q in row), r[3]) / 2:
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
          prefix: str = "zone", size=None, close: int = 5) -> dict:
    """Found blobs named in order (names, else prefix1..N; a count that differs from names raises), plus hand rects in zones
    ([x, y, w, h], or {"c": [cx, cy], "s": [w, h]}) that win on the same id."""
    H, W = img.shape[:2]
    found = find(img, list(colours), tol, min_area, close) if colours else []
    if colours and names and len(names) != len(found):
        raise ValueError(f"found {len(found)} zones, names lists {len(names)}")
    rects = {(names[i] if names else f"{prefix}{i + 1}"): r for i, r in enumerate(found)}
    for k, r in (zones or {}).items():
        if isinstance(r, dict):
            if not (isinstance(r.get("c"), list) and len(r["c"]) == 2 and isinstance(r.get("s"), list) and len(r["s"]) in (1, 2)):
                raise Bad(f"zone {k}: want {{\"c\": [cx, cy], \"s\": [w, h] or [w]}}")
            w, h = r["s"][0], r["s"][-1]
            r = [r["c"][0] - w // 2, r["c"][1] - h // 2, w, h]
        elif not (isinstance(r, list) and len(r) == 4):
            raise Bad(f"zone {k}: want [x, y, w, h]")
        rects[k] = list(r)
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


KEYS = ("colours", "names", "zones", "tol", "min_area", "prefix", "size", "close")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="trace_zones", description="trace zone rects of a map scan into ZoneLayout JSON")
    ap.add_argument("scan", type=Path)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--config", type=Path, help="JSON with any of: colours, names, zones, tol, min_area, prefix, size, close (flags win)")
    ap.add_argument("--colour", action="append", help="marker colour #rrggbb (repeat)")
    ap.add_argument("--name", action="append", help="zone id per found blob, in reading order (repeat)")
    ap.add_argument("--tol", type=int)
    ap.add_argument("--min-area", type=float, help="smallest blob as a fraction of the scan (default 0.0005)")
    ap.add_argument("--prefix", help="id stem when no names are given (default zone)")
    ap.add_argument("--size", type=float, nargs=2, help="output units W H (1 1 = fractions of the scan; default scan px)")
    ap.add_argument("--close", type=int, help="close gaps up to this many px inside a marker first (default 5; 0 off)")
    ap.add_argument("--overlay", type=Path, help="also write the scan with the rects drawn")
    a = ap.parse_args(argv)
    try:
        cfg = json.loads(a.config.read_text(encoding="utf-8")) if a.config else {}
        if not isinstance(cfg, dict):
            raise ValueError("not a JSON object")
    except (OSError, ValueError) as e:
        print(f"bad config {a.config}: {e}")
        return 2
    for k, v in zip(KEYS, (a.colour, a.name, None, a.tol, a.min_area, a.prefix, a.size, a.close)):
        if v is not None:
            cfg[k] = v
    img = cv2.imread(str(a.scan), cv2.IMREAD_COLOR)
    if img is None:
        print(f"cannot read {a.scan}")
        return 2
    try:
        L = trace(img, **{k: cfg[k] for k in KEYS if k in cfg})
    except Bad as e:
        print(e)
        return 2
    except ValueError as e:
        print(e)
        return 1
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(L, indent=1), encoding="utf-8")
    if a.overlay:
        cv2.imwrite(str(a.overlay), overlay(img, L))
    print(f"{len(L['zones'])} zones -> {a.out}")
    return 0
