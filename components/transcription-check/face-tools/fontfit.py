"""Fit a font size to a box: the largest size at which the text, word-wrapped, fits the box.

    python fontfit.py --font face.ttf --text "Some words" --box 300x120 [--floor 12] [--ceil 200] [--line-height 1.2]

Prints {size, lines, w, h, fits, below_floor}. `fits` is False when even the floor size overflows (or one word is wider than
the box); `below_floor` is True when the largest fitting size is under --floor. A game takes the size, or lowers the text.
"""
import argparse
import json

from PIL import ImageFont


def wrap(text, font, max_w):
    """Greedy word wrap with a PIL font; returns the lines."""
    lines, cur = [], ''
    for word in text.split():
        nxt = word if not cur else cur + ' ' + word
        if cur and font.getlength(nxt) > max_w:
            lines.append(cur)
            cur = word
        else:
            cur = nxt
    if cur or not lines:
        lines.append(cur)
    return lines


def layout(text, font_path, size, box_w, line_height=1.2):
    font = ImageFont.truetype(font_path, size) if font_path else ImageFont.load_default(size)
    lines = wrap(text, font, box_w)
    return lines, max(font.getlength(l) for l in lines), len(lines) * size * line_height


def fit_size(text, font_path, box_w, box_h, floor=1, ceil=200, line_height=1.2):
    """Largest integer size in [floor, ceil] at which the wrapped text fits (box_w x box_h); the floor size if none does."""
    def fits(s):
        _, w, h = layout(text, font_path, s, box_w, line_height)
        return w <= box_w and h <= box_h
    lo, hi, best = int(floor), int(ceil), None
    while lo <= hi:
        mid = (lo + hi) // 2
        if fits(mid):
            best, lo = mid, mid + 1
        else:
            hi = mid - 1
    size = best if best is not None else int(floor)
    lines, w, h = layout(text, font_path, size, box_w, line_height)
    return {'size': size, 'lines': lines, 'w': round(w, 1), 'h': round(h, 1), 'fits': best is not None, 'below_floor': best is None}


def size_from_ink(ink_height, cap_ratio):
    """A font size from a measured ink height (a line of capitals) and the font's cap height / em ratio."""
    return ink_height / cap_ratio


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--font')
    ap.add_argument('--text', required=True)
    ap.add_argument('--box', required=True, help='WxH in px')
    ap.add_argument('--floor', type=int, default=1)
    ap.add_argument('--ceil', type=int, default=200)
    ap.add_argument('--line-height', type=float, default=1.2)
    a = ap.parse_args()
    w, h = (float(v) for v in a.box.lower().split('x'))
    r = fit_size(a.text, a.font, w, h, a.floor, a.ceil, a.line_height)
    print(json.dumps(r))


if __name__ == '__main__':
    main()
