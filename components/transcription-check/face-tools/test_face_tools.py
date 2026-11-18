import json
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

import autotune
import cropsheet
import fontfit
import measure

HERE = __file__.rsplit('test_face_tools.py', 1)[0]


def face():
    im = Image.new('RGB', (200, 100), (240, 240, 240))
    d = ImageDraw.Draw(im)
    d.rectangle((20, 20, 99, 29), fill=(0, 0, 0))
    d.rectangle((20, 40, 69, 49), fill=(0, 0, 0))
    return im


def test_measure_finds_ink_box_and_lines():
    r = measure.measure(face(), {'body': [10, 10, 150, 60], 'empty': [120, 70, 190, 95]})
    assert r['body']['ink'] == [20, 20, 100, 50]
    assert r['body']['lines'] == [[20, 30], [40, 50]]
    assert r['body']['size_hint'] == 10
    assert r['empty']['ink'] is None


def test_fit_size_is_largest_fitting_and_monotone():
    wide = fontfit.fit_size('some words in a box', None, 200, 60)
    narrow = fontfit.fit_size('some words in a box', None, 100, 60)
    assert wide['fits'] and narrow['fits']
    assert wide['size'] >= narrow['size']
    assert wide['h'] <= 60 and wide['w'] <= 200
    bigger = fontfit.layout('some words in a box', None, wide['size'] + 1, 200)
    assert bigger[1] > 200 or bigger[2] > 60 or wide['size'] == 200


def test_fit_size_reports_below_floor_and_unfittable():
    r = fontfit.fit_size('a long text that cannot be small enough', None, 40, 10, floor=12)
    assert r['below_floor'] and not r['fits']
    assert fontfit.size_from_ink(7, 0.7) == 10


def test_autotune_lists_each_failing_card_and_field():
    faces = {'ok': {'name': {'text': 'Hi', 'box': [100, 30]}}, 'bad': {'name': {'text': 'Far too long a name for it', 'box': [30, 12]}}}
    sizes, failed = autotune.autotune(faces, 10)
    assert sizes['ok']['name'] >= 10
    assert len(failed) == 1 and failed[0].startswith('bad.name:')


def test_cropsheet_size_and_grid():
    items = [(f'c{i}', face()) for i in range(3)]
    s = cropsheet.crop_sheet(items, (0, 0, 0.5, 0.5), cols=2, thumb=100, grid=0.25)
    assert s.size == (200, 2 * (50 + 16))
    assert s.getpixel((25, 10)) in ((0, 0, 255), (255, 0, 0)) or s.getpixel((25, 25)) in ((0, 0, 255), (255, 0, 0))


def test_autotune_cli_exit_code(tmp_path):
    p = tmp_path / 'f.json'
    p.write_text(json.dumps({'c': {'n': {'text': 'Hello there friend', 'box': [20, 8]}}}))
    r = subprocess.run([sys.executable, HERE + 'autotune.py', '--faces', str(p), '--floor', '12'], capture_output=True, text=True)
    assert r.returncode == 1 and 'c.n:' in r.stderr
