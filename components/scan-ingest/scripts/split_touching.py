"""Split two touching items of a magenta scan into two scan files (a scanning aid, not part of the pipeline).

    python -I split_touching.py <SCAN> <OUT_A> <OUT_B> h|v <x0> <y0> <x1> <y1>
    python -I split_touching.py <SCAN> <OUT_A> <OUT_B> point <x> <y>

scanning-pipeline cuts items out by colour, but two cards laid less than about 2 mm apart can come out as one item
(MAY_BE_SEVERAL_ITEMS). When the gap between them is clean backing, this script separates them without a re-scan:
inside the box (x0, y0)-(x1, y1), in scan pixels, it follows the backing gap across the box (axis "h": a gap running
left to right, one card above it and one below; "v": top to bottom, one card left and one right). OUT_A is the scan
with the part below (h) or right of (v) the gap filled with the backing's colour; OUT_B is only that part. Only
backing pixels lie on the cut, so no card pixel changes. Then run scanpipe on OUT_A and OUT_B instead of SCAN.

Axis "point" is for small thick pieces (tokens) whose shadows join them to a neighbour lying diagonally, where no
straight gap runs between them: OUT_B keeps only the piece under scan pixel (x, y), that is every non-backing pixel
connected to it, its enclosed holes, and the backing within 0.5 mm of it, with the rest filled with the backing's
colour; OUT_A is the scan with that piece filled with the colour of the backing around it. The pieces must not touch
(refused otherwise). Chain it to take out several pieces.
"""
import sys

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def backing_mask(rgb: np.ndarray) -> np.ndarray:
    """Magenta backing: red well above green and blue (the sheet reads about R 212, G 65, B 97)."""
    r, g, b = (rgb[..., i].astype(np.int16) for i in range(3))
    return (r - g > 90) & (r - b > 60)


def local_fill(rgb: np.ndarray, back: np.ndarray, part: np.ndarray) -> np.ndarray:
    """The backing's colour around each pixel of part (mean of the backing pixels within the piece's size), so the
    filled hole does not show as a lighter or darker patch that the detector would take for an item. The backing within
    about 1 mm of the piece (its darker rim and shadow) is left out of the mean."""
    from scipy import ndimage
    ys, xs = np.where(part)
    m = int(max(ys.max() - ys.min(), xs.max() - xs.min())) + 25
    y0, y1 = max(0, ys.min() - m), min(part.shape[0], ys.max() + m + 1)
    x0, x1 = max(0, xs.min() - m), min(part.shape[1], xs.max() + m + 1)
    near = ndimage.binary_dilation(part[y0:y1, x0:x1], structure=np.ones((3, 3), bool), iterations=25)
    w = (back[y0:y1, x0:x1] & ~near).astype(np.float64)
    den = ndimage.uniform_filter(w, size=2 * m + 1)
    out = np.empty((len(ys), 3), np.uint8)
    for c in range(3):
        num = ndimage.uniform_filter(rgb[y0:y1, x0:x1, c] * w, size=2 * m + 1)
        out[:, c] = np.clip(num / np.maximum(den, 1e-9), 0, 255)[ys - y0, xs - x0].round()
    return out


def split(src: str, out_a: str, out_b: str, axis: str, x0: int, y0: int, x1: int, y1: int) -> int:
    im = Image.open(src)
    dpi = im.info.get("dpi", (600, 600))
    a = np.array(im.convert("RGB"))
    back = backing_mask(a)
    fill = np.median(a[back][::50], axis=0).astype(np.uint8)
    part = np.zeros(back.shape, dtype=bool)
    if axis == "h":
        mid = (y0 + y1) // 2
        for x in range(x0, x1):
            rows = np.where(back[y0:y1, x])[0]
            if len(rows) == 0:
                raise SystemExit(f"column {x}: no backing between y {y0} and {y1}: the items touch; re-scan them apart")
            part[rows[np.argmin(abs(rows + y0 - mid))] + y0 + 1:, x] = True
    elif axis == "v":
        mid = (x0 + x1) // 2
        for y in range(y0, y1):
            cols = np.where(back[y, x0:x1])[0]
            if len(cols) == 0:
                raise SystemExit(f"row {y}: no backing between x {x0} and {x1}: the items touch; re-scan them apart")
            part[y, cols[np.argmin(abs(cols + x0 - mid))] + x0 + 1:] = True
    elif axis == "point":
        from scipy import ndimage
        x, y = x0, y0
        if back[y, x]:
            raise SystemExit(f"pixel ({x}, {y}) is backing, not a piece")
        labels, _ = ndimage.label(~back)
        piece = labels == labels[y, x]
        ys, xs = np.where(piece)
        if xs.min() == 0 or ys.min() == 0 or xs.max() == back.shape[1] - 1 or ys.max() == back.shape[0] - 1:
            raise SystemExit("the piece reaches the scan edge (or touches the edge strip): re-scan it apart")
        size = max(xs.max() - xs.min(), ys.max() - ys.min()) / (dpi[0] / 25.4)
        if size > 60:
            raise SystemExit(f"the piece measures {size:.0f} mm: it touches others; re-scan them apart")
        r = max(1, round(0.5 / 25.4 * dpi[0]))
        grown = ndimage.binary_dilation(piece, structure=np.ones((3, 3), bool), iterations=r)
        part = ndimage.binary_fill_holes(piece) | (grown & back)   # dark-red print can read as backing
    else:
        raise SystemExit("axis must be h, v or point")
    first, second = a.copy(), a.copy()
    if axis == "point":
        first[part] = local_fill(a, back, part)
    else:
        first[part] = fill
    second[~part] = fill
    for arr, out in ((first, out_a), (second, out_b)):
        Image.fromarray(arr).save(out, dpi=dpi, compression="tiff_lzw")
    return int(part.sum())


if __name__ == "__main__":
    if len(sys.argv) == 7 and sys.argv[4] == "point":
        n = split(*sys.argv[1:5], int(sys.argv[5]), int(sys.argv[6]), 0, 0)
    elif len(sys.argv) == 9:
        n = split(*sys.argv[1:5], *map(int, sys.argv[5:9]))
    else:
        raise SystemExit(__doc__)
    print(f"split: {n} pixels moved to {sys.argv[3]}")
