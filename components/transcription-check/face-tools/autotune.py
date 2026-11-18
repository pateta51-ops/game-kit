"""Autotune: font sizes across a set of faces, and position rounds from an align.py diff.

Rounds (tune_round, fit_lines, median_by): each trusted element's offset (align.trust: NCC reaches the policy's least and the
match is short of the search edge) becomes a correction in `tuning[name] = {dx, dy}`. One round moves an element at most
CLAMP px, values are rounded to half pixels, a correction under 0.25 px is ignored. Text lines of a strip are fitted together
by least squares (fit_lines: first baseline, line pitch, paragraph gap); elements of one kind sharing a token take the median
of their offsets (median_by). Repeat render, align, tune_round until nothing moves. Sizes:

    python autotune.py --faces faces.json --floor 12 [--font face.ttf] [--ceil 200] [--out tuned.json]

faces.json is {card: {field: {text, box: [w, h], font?: path, floor?: px, line_height?: 1.2}}} (the game's fields and boxes).
Each field gets the largest size that fits (fontfit.fit_size); --out writes {card: {field: size}} for the game to apply. The
exit code is 1 when any field does not fit at its floor (listed as card.field: text needs ... ), 0 otherwise.
"""
import argparse
import json
import sys

import statistics

import numpy as np

from align import trust
from fontfit import fit_size

CLAMP = 6


def half(v):
    return round(v * 2) / 2


def clamp(v, lim=CLAMP):
    return max(-lim, min(lim, v))


def tune_round(tuning, diff, policy=None, lim=CLAMP):
    """Apply one round to tuning ({name: {dx, dy}}, edited in place); returns the log lines."""
    log = []
    for name, e in diff['elements'].items():
        if not trust(name, e, policy):
            continue
        cur = tuning.setdefault(name, {'dx': 0.0, 'dy': 0.0})
        for axis in ('dx', 'dy'):
            d = clamp(e[axis], lim)
            if abs(d) < 0.25:
                continue
            new = half(cur[axis] + d)
            log.append(f'{name}.{axis} {d:+.1f} -> {new}')
            cur[axis] = new
    return log


def fit_lines(rows):
    """Least-squares fit of text lines' vertical offsets. rows = [(line_no, para_no, dy)] -> {first, pitch, para_gap}: the
    offset of the first line, the change per line and per paragraph; pitch needs 3 distinct line numbers and the gap 2
    paragraphs, else it is 0."""
    dys = np.array([r[2] for r in rows], float)
    use_pitch = len({r[0] for r in rows}) >= 3
    use_gap = len({r[1] for r in rows}) >= 2
    cols = [lambda r: 1.0] + ([lambda r: r[0]] if use_pitch else []) + ([lambda r: r[1]] if use_gap else [])
    sol, *_ = np.linalg.lstsq(np.array([[c(r) for c in cols] for r in rows], float), dys, rcond=None)
    it = iter(sol)
    first = next(it)
    return {'first': float(first), 'pitch': float(next(it)) if use_pitch else 0.0, 'para_gap': float(next(it)) if use_gap else 0.0}


def median_by(records, key):
    """records = [(token, value)] -> {key(token): median of values}: every element of a kind shares one correction."""
    groups = {}
    for tok, v in records:
        groups.setdefault(key(tok), []).append(v)
    return {k: statistics.median(v) for k, v in groups.items()}


def autotune(faces, floor, font=None, ceil=200):
    sizes, failed = {}, []
    for card, fields in faces.items():
        for name, f in fields.items():
            fl = f.get('floor', floor)
            r = fit_size(f['text'], f.get('font', font), f['box'][0], f['box'][1], fl, ceil, f.get('line_height', 1.2))
            sizes.setdefault(card, {})[name] = r['size']
            if not r['fits'] or r['below_floor']:
                failed.append(f"{card}.{name}: text needs {r['w']} x {r['h']} px at the floor of {fl} px but the box is {f['box'][0]} x {f['box'][1]} px")
    return sizes, failed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--faces', required=True)
    ap.add_argument('--floor', type=int, required=True)
    ap.add_argument('--font')
    ap.add_argument('--ceil', type=int, default=200)
    ap.add_argument('--out')
    a = ap.parse_args()
    sizes, failed = autotune(json.load(open(a.faces, encoding='utf-8')), a.floor, a.font, a.ceil)
    if a.out:
        open(a.out, 'w', encoding='utf-8').write(json.dumps(sizes, indent=1) + '\n')
    print(json.dumps(sizes))
    for line in failed:
        print(line, file=sys.stderr)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
