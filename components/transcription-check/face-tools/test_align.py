import json
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import align
import autotune
import calibrate
import cropsheet

HERE = __file__.rsplit('test_align.py', 1)[0]
FONT = ImageFont.load_default(18)


def texture(seed=1, size=(240, 160)):
    """A noisy picture: unique everywhere, so a template has one place only."""
    rng = np.random.default_rng(seed)
    return Image.fromarray((rng.random((size[1], size[0])) * 255).astype(np.uint8)).convert('RGB')


def shifted(im, dx, dy):
    out = Image.new('RGB', im.size, (128, 128, 128))
    out.paste(im, (dx, dy))
    return out


def test_ncc_all_peaks_at_the_template_place_with_value_one():
    img = np.asarray(texture().convert('L'), dtype=np.float32)
    m = align.ncc_all(img, img[40:60, 50:90])
    assert np.unravel_index(int(np.argmax(m)), m.shape) == (40, 50)
    assert abs(m.max() - 1) < 1e-4
    assert align.ncc_all(np.zeros((30, 30), np.float32), np.zeros((5, 5), np.float32)) is None


def test_best_shift_finds_the_offset_within_the_radius():
    ref = np.asarray(texture().convert('L'), dtype=np.float32)
    ren = np.asarray(shifted(texture(), 3, -2).convert('L'), dtype=np.float32)
    dx, dy, ncc = align.best_shift(ref, ren, (60, 60, 120, 100), r=8)
    assert (dx, dy) == (-3, 2) and ncc > 0.99
    assert align.best_shift(ref, ren, (2, 2, 40, 40), r=8) is None


def test_scale_search_picks_the_matching_scale():
    from PIL import ImageFilter
    ref_im = texture().filter(ImageFilter.GaussianBlur(1.5))
    ren_im = ref_im.copy()
    patch = ref_im.crop((60, 60, 120, 100))  # the render draws this patch 1.25x too big, about the same centre
    ren_im.paste(patch.resize((75, 50)), (53, 55))
    ref, ren = (np.asarray(i.convert('L'), dtype=np.float32) for i in (ref_im, ren_im))
    res = {s: align.best_shift(ref, ren, (53, 55, 128, 105), 4, (s, s)) for s in (0.8, 1.0, 1.2)}
    assert max(res, key=lambda s: res[s][2]) == 0.8 and res[0.8][2] > 0.9 and abs(res[0.8][0]) <= 1 and abs(res[0.8][1]) <= 1


def test_compare_reports_offset_scale_edge_and_unmatched():
    ref = texture()
    ren = shifted(ref, 4, 0)
    d = align.compare(ren, ref, {'a': [60, 60, 120, 100], 'off': [0, 0, 30, 30], 'far': [60, 60, 120, 100]}, {'radius': 8, 'radii': [['^far', 3]], 'methods': [['.*', 'lum']]})
    assert (d['elements']['a']['dx'], d['elements']['a']['dy']) == (-4, 0)
    assert d['elements']['a']['edge'] is False
    assert d['elements']['far']['edge'] is True and d['elements']['far']['radius'] == 3
    assert d['unmatched'] == ['off']
    assert align.trust('a', d['elements']['a'], {'minNcc': [['.*', 0.3]]})
    assert not align.trust('far', d['elements']['far'])


def test_grad_matches_strokes_lum_matches_shapes():
    im = Image.new('RGB', (100, 60), 'white')
    ImageDraw.Draw(im).text((10, 20), 'Ab', fill='black', font=FONT)
    assert align.grad(im).max() > 5 and align.lum(im).min() < 255


def test_smooth1d_edge_runs():
    a = np.array([[0.0], [0.0], [9.0], [0.0], [0.0]])
    s = align.smooth1d(a, 1)
    assert s.shape == a.shape and abs(s[2, 0] - 3) < 1e-9 and align.smooth1d(a, 0) is a
    assert align.edge(np.array([0, 0, 0, 10, 10, 10, 10, 10.0]), 4, span=3) == (3, 10.0)
    assert align.runs([0, 1, 1, 0, 0, 1, 0, 1], gap=1) == [(1, 2), (5, 7)]
    assert align.runs([1, 0, 0, 1], gap=0) == [(0, 0), (3, 3)]


def test_policy_value_first_match_wins():
    assert align.policy_value([['^a', 1], ['.*', 2]], 'ab') == 1
    assert align.policy_value([['^a', 1]], 'b', 9) == 9


def test_tune_round_clamps_rounds_to_half_ignores_edge_and_weak():
    diff = {'elements': {
        'a': {'dx': 20.0, 'dy': 1.3, 'ncc': 0.9, 'edge': False},
        'b': {'dx': 3.0, 'dy': 0.1, 'ncc': 0.9, 'edge': True},
        'c': {'dx': 3.0, 'dy': 3.0, 'ncc': 0.2, 'edge': False},
    }}
    t = {}
    log = autotune.tune_round(t, diff, {'minNcc': [['.*', 0.5]]})
    assert t == {'a': {'dx': 6, 'dy': 1.5}} and len(log) == 2
    autotune.tune_round(t, {'elements': {'a': {'dx': 0.2, 'dy': -0.7, 'ncc': 0.9}}})
    assert t['a'] == {'dx': 6, 'dy': 1.0}


def test_fit_lines_recovers_baseline_pitch_and_gap():
    rows = [(n, p, 2.0 + 0.5 * n + 1.5 * p) for n, p in [(0, 0), (1, 0), (2, 1), (3, 1), (4, 2)]]
    f = autotune.fit_lines(rows)
    assert abs(f['first'] - 2) < 1e-6 and abs(f['pitch'] - 0.5) < 1e-6 and abs(f['para_gap'] - 1.5) < 1e-6
    g = autotune.fit_lines([(0, 0, 3.0), (1, 0, 3.0)])
    assert abs(g['first'] - 3) < 1e-9 and g['pitch'] == 0.0 and g['para_gap'] == 0.0


def test_median_by_token():
    assert autotune.median_by([('i-a-1', 1), ('i-a-2', 5), ('i-a-3', 3), ('i-b-1', 2)], lambda t: t.split('-')[1]) == {'a': 3, 'b': 2}


def test_calibrate_summarize_and_suggest():
    r = calibrate.summarize([0.9, 0.85, 0.8, 0.95], [0.1, 0.2, 0.3, 0.15])
    assert r['correct'][0] == 0.8 and r['wrong'][0] == 0.3 and r['suggest'] == 0.55
    assert calibrate.summarize([0.5, 0.6], [0.55, 0.7])['suggest'] is None
    assert calibrate.kind_of([['line', '^l']], 'l1') == 'line' and calibrate.kind_of([], 'x') == 'other'


def test_calibrate_collect_wrong_below_correct_on_distinct_elements():
    ref = texture()
    boxes = {'t0': [20, 20, 80, 60], 't1': [100, 20, 160, 60], 't2': [20, 90, 80, 130]}
    rec = calibrate.collect(ref, ref, boxes, [['t', '^t']], {'radius': 4})
    assert min(rec['t']['correct']) > 0.99 and max(rec['t']['wrong']) < 0.5


def test_cropsheet_grid_pixels_are_exact():
    im = Image.new('RGB', (200, 100), (255, 255, 255))
    s = cropsheet.crop_sheet([('a', im), ('b', im)], (0, 0, 1, 1), cols=2, thumb=100, grid=0.25)
    assert s.size == (200, 50 + 16)
    blue, red = (0, 0, 255), (255, 0, 0)
    assert s.getpixel((25, 5)) == blue and s.getpixel((50, 5)) == red and s.getpixel((75, 5)) == blue
    assert s.getpixel((5, 12)) == blue and s.getpixel((5, 25)) == red
    assert s.getpixel((125, 5)) == blue  # the second tile's grid is offset by the tile's x
    assert s.getpixel((26, 5)) == (255, 255, 255)


def test_align_cli_writes_diff(tmp_path):
    ref = texture()
    ref.save(tmp_path / 'ref.png')
    shifted(ref, 2, 0).save(tmp_path / 'ren.png')
    (tmp_path / 'b.json').write_text(json.dumps({'a': [60, 60, 120, 100]}))
    r = subprocess.run([sys.executable, HERE + 'align.py', '--render', str(tmp_path / 'ren.png'), '--reference', str(tmp_path / 'ref.png'), '--boxes', str(tmp_path / 'b.json'), '--out', str(tmp_path / 'd.json')], capture_output=True, text=True)
    assert r.returncode == 0 and json.loads((tmp_path / 'd.json').read_text())['elements']['a']['dx'] == -2
