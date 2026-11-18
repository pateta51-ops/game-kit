"""Measure the printed text on a rendered card face: the ink box and the text lines of each named region.

    python measure.py --image face.png --regions regions.json [--thresh 40] [--out measured.json]

regions.json is {name: [x0, y0, x1, y1]} in pixels (the game's boxes). Per region the tool prints
{name: {ink: [x0, y0, x1, y1] | null, lines: [[y0, y1], ...], size_hint}}: the bounding box of the pixels that differ from the
region's background (its median colour) by more than --thresh, and the text lines (runs of rows with ink). `size_hint` is
the median line height. Feed the ink box to fontfit.py or compare it with the box the game gave the text.
"""
import argparse
import json

import numpy as np
from PIL import Image


def runs(mask, gap=0):
    """Runs of True in a 1-D mask as [start, end) pairs; runs closer than `gap` merge."""
    out = []
    start = None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append([start, i])
            start = None
    if start is not None:
        out.append([start, len(mask)])
    merged = []
    for r in out:
        if merged and r[0] - merged[-1][1] <= gap:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    return merged


def ink_mask(arr, thresh=40):
    """Pixels that differ from the array's median colour by more than thresh (max over channels)."""
    flat = arr.reshape(-1, arr.shape[2]) if arr.ndim == 3 else arr.reshape(-1, 1)
    bg = np.median(flat, axis=0)
    d = np.abs(arr.astype(float) - bg)
    return (d.max(axis=2) if arr.ndim == 3 else d) > thresh


def measure_region(img, box, thresh=40, line_gap=1):
    x0, y0, x1, y1 = (int(round(v)) for v in box)
    arr = np.asarray(img.convert('RGB'))[y0:y1, x0:x1]
    if arr.size == 0:
        return {'ink': None, 'lines': [], 'size_hint': None}
    m = ink_mask(arr, thresh)
    if not m.any():
        return {'ink': None, 'lines': [], 'size_hint': None}
    ys, xs = np.where(m)
    lines = [[y0 + a, y0 + b] for a, b in runs(m.any(axis=1), line_gap)]
    heights = sorted(b - a for a, b in lines)
    return {
        'ink': [x0 + int(xs.min()), y0 + int(ys.min()), x0 + int(xs.max()) + 1, y0 + int(ys.max()) + 1],
        'lines': lines,
        'size_hint': heights[len(heights) // 2],
    }


def measure(img, regions, thresh=40):
    return {name: measure_region(img, box, thresh) for name, box in regions.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--image', required=True)
    ap.add_argument('--regions', required=True)
    ap.add_argument('--thresh', type=int, default=40)
    ap.add_argument('--out')
    a = ap.parse_args()
    res = measure(Image.open(a.image), json.load(open(a.regions, encoding='utf-8')), a.thresh)
    text = json.dumps(res, indent=1)
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(text + '\n')
    print(text)


if __name__ == '__main__':
    main()
