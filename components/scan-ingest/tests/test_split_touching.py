"""scripts/split_touching.py, axis "point": one token taken out of a magenta scan (synthetic shapes only)."""
import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "split_touching.py"
MAGENTA = (212, 65, 97)


def _load():
    spec = importlib.util.spec_from_file_location("split_touching", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _disc(a, cx, cy, r, colour):
    yy, xx = np.mgrid[:a.shape[0], :a.shape[1]]
    a[(xx - cx) ** 2 + (yy - cy) ** 2 <= r * r] = colour


def test_point_keeps_one_token_and_fills_its_hole_with_the_backing_around_it(tmp_path):
    a = np.zeros((400, 600, 3), np.uint8)
    a[:] = MAGENTA
    a[:, 300:] = (200, 60, 92)                      # uneven light: the right half of the sheet is darker
    _disc(a, 400, 200, 100, (30, 30, 30))           # token 1: dark rim ...
    _disc(a, 400, 200, 70, (140, 30, 40))           # ... dark-red centre, which reads as backing
    _disc(a, 160, 200, 100, (40, 40, 40))           # token 2, 40 px away
    src = tmp_path / "scan.tif"
    Image.fromarray(a).save(src, dpi=(600, 600))
    moved = _load().split(str(src), str(tmp_path / "a.tif"), str(tmp_path / "b.tif"), "point", 400, 120, 0, 0)
    first = np.array(Image.open(tmp_path / "a.tif").convert("RGB")).astype(int)
    second = np.array(Image.open(tmp_path / "b.tif").convert("RGB")).astype(int)
    assert moved > np.pi * 100 * 100 * 0.95
    assert (second[200, 400] == (140, 30, 40)).all()           # the dark-red centre stays in the token
    assert (second[200, 160] != (40, 40, 40)).any()            # token 2 is not in OUT_B
    assert (first[200, 160] == (40, 40, 40)).all()             # ... and untouched in OUT_A
    hole = first[200, 400]                                     # the hole takes the (darker) backing around it,
    assert np.abs(hole - (200, 60, 92)).max() < np.abs(hole - MAGENTA).max()   # not the sheet's overall colour


def test_point_on_backing_is_refused(tmp_path):
    a = np.zeros((100, 100, 3), np.uint8)
    a[:] = MAGENTA
    src = tmp_path / "scan.tif"
    Image.fromarray(a).save(src, dpi=(600, 600))
    try:
        _load().split(str(src), str(tmp_path / "a.tif"), str(tmp_path / "b.tif"), "point", 50, 50, 0, 0)
    except SystemExit as e:
        assert "backing" in str(e)
    else:
        raise AssertionError("expected a refusal")
