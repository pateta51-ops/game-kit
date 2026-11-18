"""Align a rendered face with a reference picture: normalised cross-correlation (NCC) of each named element's box.

Ported from the face tools of a card game (measure.py ncc_map/smooth1d/edge/runs, iconfit.py ncc_all/best_shift, the
gradient and blurred-luminance methods of its difference check, evaluate.ts TOLERANCE/RADIUS and policy tables); the game's
element names, patterns and numbers are parameters here.

    python align.py --render r.png --reference ref.png --boxes boxes.json [--policy policy.json] [--out diff.json]

boxes.json is {name: [x0, y0, x1, y1]} on the render. policy.json (all optional):
  {"radius": 12, "radii": [[pattern, r]], "methods": [[pattern, "grad"|"lum"]], "scales": [0.8, ..., 1.2]}
First matching pattern wins (policy_value). The result is {radius, elements: {name: {dx, dy, ncc, scale, box, radius, edge}},
unmatched: [names]}: dx, dy is how far the reference's content lies from the render's box centre (so a render drawn 3 px
left of the reference gives dx 3). `edge` is true when the best match lies at the search edge (a match there is not a
measurement: trust() refuses it). Text is matched by its strokes ('grad'), icons and shapes by blurred luminance ('lum').
"""
import argparse
import json
import re

import numpy as np
from PIL import Image, ImageFilter

RADIUS = 12
TOLERANCE = 6


def smooth1d(arr, k):
    """Moving average along axis 0 with edge padding (k = half width)."""
    if k <= 0:
        return arr
    pad = np.concatenate([np.repeat(arr[:1], k, 0), arr, np.repeat(arr[-1:], k, 0)])
    ker = np.ones(2 * k + 1) / (2 * k + 1)
    return np.stack([np.convolve(pad[:, i], ker, mode='valid') for i in range(arr.shape[1])], 1)


def runs(mask, gap=0):
    """(start, end) of the True runs, gaps of up to `gap` False entries bridged."""
    out, start, last = [], None, None
    for i, v in enumerate(mask):
        if v:
            if start is None:
                start = i
            elif i - last - 1 > gap:
                out.append((start, last))
                start = i
            last = i
    if start is not None:
        out.append((start, last))
    return out


def edge(profile, approx, span=8):
    """The position of the strongest step of a 1-D profile within +-span of approx (a boundary between two rows), and its size."""
    a = max(1, int(approx) - span)
    b = min(len(profile) - 1, int(approx) + span)
    d = np.abs(np.diff(profile[a - 1:b + 1]))
    i = int(np.argmax(d))
    return a - 1 + i + 1, float(d[i])


def policy_value(table, name, default=None):
    """The value of the first [pattern, value] row whose regular expression matches name."""
    return next((v for pat, v in table or [] if re.search(pat, name)), default)


def blur(im, r):
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), dtype=np.float32)


def grad(im, r=1.2):
    """Stroke map: gradient magnitude of the blurred luminance (matches text by its strokes)."""
    gy, gx = np.gradient(blur(im.convert('L'), r))
    return np.hypot(gx, gy).astype(np.float32)


def lum(im, r=2.0):
    """Shape map: blurred luminance (matches icons, chips, badges, whose fine print has edges the drawn art lacks)."""
    return blur(im.convert('L'), r)


MAPS = {'grad': grad, 'lum': lum}


def ncc_all(P, T):
    """The NCC of template T at every place in P (valid positions), as an array; None when it cannot be computed."""
    from numpy.lib.stride_tricks import sliding_window_view
    th, tw = T.shape
    if P.shape[0] < th or P.shape[1] < tw:
        return None
    t = T - T.mean()
    tn = np.sqrt((t * t).sum())
    if tn < 1e-3:
        return None
    win = sliding_window_view(P, (th, tw))
    mean = win.mean(axis=(2, 3))
    num = np.einsum('ijkl,kl->ij', win, t)
    sq = np.einsum('ijkl,ijkl->ij', win, win) - th * tw * mean * mean
    return num / (tn * np.sqrt(np.maximum(sq, 1e-6)))


def best_shift(P, D, box, r=RADIUS, scale=(1.0, 1.0)):
    """(dx, dy, ncc) of the box's content of D (scaled about the box centre by scale = (sx, sy)) found in P within +-r px:
    the shift of the box centre. None when the search window leaves the picture or the box is flat."""
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    T = D[int(round(y0)):int(round(y1)), int(round(x0)):int(round(x1))]
    if T.size == 0:
        return None
    sx, sy = scale
    if sx != 1 or sy != 1:
        tw, th = max(4, int(round(T.shape[1] * sx))), max(4, int(round(T.shape[0] * sy)))
        T = np.asarray(Image.fromarray(T).resize((tw, th), Image.BILINEAR), dtype=np.float32)
    th, tw = T.shape
    px0, py0 = int(round(cx - tw / 2)) - r, int(round(cy - th / 2)) - r
    if px0 < 0 or py0 < 0 or px0 + tw + 2 * r > P.shape[1] or py0 + th + 2 * r > P.shape[0]:
        return None
    m = ncc_all(P[py0:py0 + th + 2 * r, px0:px0 + tw + 2 * r], T)
    if m is None:
        return None
    iy, ix = np.unravel_index(int(np.argmax(m)), m.shape)
    return float(px0 + ix + tw / 2 - cx), float(py0 + iy + th / 2 - cy), float(m[iy, ix])


def ncc_at(gp, t, x0, y0, r, where=False):
    """The best NCC of template t against gp near (x0, y0) within +-r px (with where: (ncc, dx, dy))."""
    h, w = t.shape
    t = t - t.mean()
    tn = np.sqrt((t * t).sum())
    if tn < 1e-3 or h < 4 or w < 4:
        return None
    best = None
    H, W = gp.shape
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            ya, xa = int(round(y0)) + dy, int(round(x0)) + dx
            if ya < 0 or xa < 0 or ya + h > H or xa + w > W:
                continue
            p = gp[ya:ya + h, xa:xa + w]
            p = p - p.mean()
            pn = np.sqrt((p * p).sum())
            if pn < 1e-3:
                continue
            c = float((t * p).sum() / (tn * pn))
            if best is None or c > best[0]:
                best = (c, dx, dy)
    if best is None:
        return None
    return best if where else best[0]


def compare(render, reference, boxes, policy=None):
    """The diff of a render against its reference picture, per named box (see the module text)."""
    policy = policy or {}
    radius = policy.get('radius', RADIUS)
    scales = policy.get('scales') or [1.0]
    if render.size != reference.size:
        reference = reference.resize(render.size, Image.LANCZOS)
    maps = {k: (f(reference), f(render)) for k, f in MAPS.items()}
    out, unmatched = {}, []
    for name, box in boxes.items():
        r = policy_value(policy.get('radii'), name, radius)
        ref_map, ren_map = maps[policy_value(policy.get('methods'), name, 'lum')]
        best = None
        for s in scales:
            f = best_shift(ref_map, ren_map, box, r, (s, s))
            if f is not None and (best is None or f[2] > best[0][2]):
                best = (f, s)
        if best is None:
            unmatched.append(name)
            continue
        (dx, dy, ncc), s = best
        out[name] = {'dx': dx, 'dy': dy, 'ncc': round(ncc, 4), 'scale': s, 'box': list(box), 'radius': r,
                     'edge': max(abs(dx), abs(dy)) >= r}
    return {'radius': radius, 'elements': out, 'unmatched': unmatched}


def trust(name, e, policy=None, weak=0.5):
    """Whether an element's match is a measurement: its NCC reaches the policy's least (minNcc, default `weak`) and it is
    short of its search edge."""
    need = policy_value((policy or {}).get('minNcc'), name, weak)
    return e['ncc'] >= need and not e.get('edge', False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', required=True)
    ap.add_argument('--reference', required=True)
    ap.add_argument('--boxes', required=True)
    ap.add_argument('--policy')
    ap.add_argument('--out')
    a = ap.parse_args()
    policy = json.load(open(a.policy, encoding='utf-8')) if a.policy else None
    res = compare(Image.open(a.render), Image.open(a.reference), json.load(open(a.boxes, encoding='utf-8')), policy)
    text = json.dumps(res, indent=1)
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(text + '\n')
    print(text)


if __name__ == '__main__':
    main()
