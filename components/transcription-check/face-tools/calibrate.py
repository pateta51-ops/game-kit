"""Calibrate the least NCC per element kind from correct and wrong matches.

    python calibrate.py --render r.png --reference ref.png --boxes boxes.json --kinds kinds.json [--policy p.json]

kinds.json is [[kind, pattern]] (the game's element names; first match wins, else "other"). For every element the diff
(align.compare) gives its `correct` NCC; its `wrong` NCC is the same drawn element matched, with the same method and radius,
against the reference where ANOTHER element of its kind lies (what a face with another element's content would score;
another element that draws the same thing, NCC above SAME, is skipped). The result per kind: correct min/p5/p25, wrong
max/p95/p75 and a suggested floor: halfway between the correct p5 and the wrong p95. Pick a least NCC that keeps wrong below
it and correct above it; where they overlap (suggest is null) the kind cannot be judged by NCC.
"""
import argparse
import json
import re

from PIL import Image

from align import MAPS, compare, ncc_at, policy_value

SAME = 0.8


def kind_of(kinds, name):
    return next((k for k, p in kinds if re.search(p, name)), 'other')


def percentile(sorted_vals, q):
    """The value at fraction q of an ascending list (q 0 = least, 1 = greatest)."""
    return sorted_vals[min(len(sorted_vals) - 1, int(len(sorted_vals) * q))]


def summarize(correct, wrong):
    """{correct: [min, p5, p25], wrong: [max, p95, p75], suggest} from two lists of NCC values."""
    c, w = sorted(correct), sorted(wrong)
    pc = [percentile(c, q) for q in (0, 0.05, 0.25)] if c else []
    pw = [percentile(w, 1 - q) for q in (0, 0.05, 0.25)] if w else []
    suggest = None
    if pc and pw and pw[1] < pc[1]:
        suggest = round((pc[1] + pw[1]) / 2, 2)
    return {'n_correct': len(c), 'n_wrong': len(w), 'correct': pc, 'wrong': pw, 'suggest': suggest}


def collect(render, reference, boxes, kinds, policy=None, diff=None, out=None):
    """Add this picture's correct and wrong values to out ({kind: {correct: [], wrong: []}}) and return it."""
    policy = policy or {}
    out = {} if out is None else out
    diff = diff or compare(render, reference, boxes, policy)
    if render.size != reference.size:
        reference = reference.resize(render.size, Image.LANCZOS)
    els = diff['elements']
    by_kind = {}
    for name in els:
        by_kind.setdefault(kind_of(kinds, name), []).append(name)
    for name, e in els.items():
        k = kind_of(kinds, name)
        rec = out.setdefault(k, {'correct': [], 'wrong': []})
        rec['correct'].append(e['ncc'])
        m = policy_value(policy.get('methods'), name, 'lum')
        mp, md = MAPS[m](reference), MAPS[m](render)
        x0, y0, x1, y1 = boxes[name]
        t = md[int(round(y0)):int(round(y1)), int(round(x0)):int(round(x1))]
        best = None
        for other in by_kind[k]:
            if other == name:
                continue
            same = ncc_at(md, t, boxes[other][0], boxes[other][1], 2)
            if same is not None and same > SAME:
                continue
            ox, oy = boxes[other][0] + els[other]['dx'], boxes[other][1] + els[other]['dy']
            v = ncc_at(mp, t, ox, oy, e['radius'])
            if v is not None and (best is None or v > best):
                best = v
        if best is not None:
            rec['wrong'].append(best)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', required=True)
    ap.add_argument('--reference', required=True)
    ap.add_argument('--boxes', required=True)
    ap.add_argument('--kinds', required=True)
    ap.add_argument('--policy')
    a = ap.parse_args()
    policy = json.load(open(a.policy, encoding='utf-8')) if a.policy else None
    rec = collect(Image.open(a.render).convert('RGB'), Image.open(a.reference).convert('RGB'),
                  json.load(open(a.boxes, encoding='utf-8')), json.load(open(a.kinds, encoding='utf-8')), policy)
    print(json.dumps({k: summarize(v['correct'], v['wrong']) for k, v in sorted(rec.items())}, indent=1))


if __name__ == '__main__':
    main()
