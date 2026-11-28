"""Zone rects traced from a synthetic map into ZoneLayout JSON (scanpipe/zones.py, K427)."""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import pytest

from scanpipe import zones
from tests.synth_zones import BLUE, RED, boxes, ground, map_scan

HERE = Path(__file__).parent
CLI = [sys.executable, "-I", str(HERE.parent / "scripts" / "trace_zones.py")]


def test_marker_blobs_come_back_in_reading_order_as_x_y_w_h():
    assert zones.find(map_scan(), ["#dc1e1e"]) == [list(r) for r in RED]
    assert zones.find(map_scan(), ["#dc1e1e", "#145ac8"]) == [list(r) for r in RED] + [list(BLUE)]


def test_a_skewed_row_keeps_its_order_by_the_running_mean_of_its_centres():
    row = [(100, 104, 40, 40), (300, 92, 40, 40), (500, 80, 40, 40)]
    below = [(100, 300, 40, 40)]
    assert zones.find(boxes(ground(), row + below), ["#dc1e1e"]) == [list(r) for r in row + below]


def test_a_marker_split_by_a_printed_label_stays_one_blob():
    img = boxes(ground(), [(100, 100, 80, 60)])
    cv2.line(img, (100, 128), (179, 128), (240, 240, 240), 2)
    cv2.line(img, (140, 100), (140, 159), (240, 240, 240), 2)
    assert zones.find(img, ["#dc1e1e"]) == [[100, 100, 80, 60]]
    assert len(zones.find(img, ["#dc1e1e"], close=0)) == 4


def test_two_near_colours_give_each_pixel_to_the_nearest_only():
    img = boxes(boxes(ground(), [(100, 100, 50, 50)]), [(300, 100, 50, 50)], (50, 50, 200))
    assert zones.find(img, ["#dc1e1e", "#c83232"]) == [[100, 100, 50, 50], [300, 100, 50, 50]]


def test_names_hand_rects_and_size_make_the_fixture_the_ts_test_merges():
    L = zones.trace(map_scan(), ["#dc1e1e", "#145ac8"], names=["a", "b", "c", "d", "e", "f"],
                    zones={"g": {"c": [50, 380], "s": [41, 21]}, "h": [10, 10, 20, 20], "i": {"c": [100, 200], "s": [30]}}, size=(1, 1))
    assert L == json.loads((HERE / "zones.fixture.json").read_text())
    assert L["zones"]["a"]["r"] == [round(100 / 700, 4), round(80 / 420, 4), round(60 / 700, 4), round(60 / 420, 4)]
    assert L["zones"]["f"]["r"] == [round(v / s, 4) for v, s in zip(BLUE, (700, 420, 700, 420))]
    px = zones.trace(map_scan(), zones={"g": {"c": [50, 380], "s": [41, 21]}, "i": {"c": [100, 200], "s": [30]}})
    assert px["zones"] == {"g": {"r": [30, 370, 41, 21]}, "i": {"r": [85, 185, 30, 30]}}


def test_names_with_hand_rects_and_no_colours_are_not_a_count():
    assert zones.trace(map_scan(), names=["a"], zones={"a": [1, 2, 3, 4]})["zones"] == {"a": {"r": [1, 2, 3, 4]}}


def test_a_count_that_differs_from_the_names_or_a_rect_off_the_scan_is_refused():
    with pytest.raises(ValueError, match="found 5 zones, names lists 2"):
        zones.trace(map_scan(), ["#dc1e1e"], names=["a", "b"])
    with pytest.raises(ValueError, match="outside"):
        zones.trace(map_scan(), zones={"x": [690, 0, 20, 20]})


def test_cli_writes_px_layout_and_overlay_and_exits_1_on_a_bad_count(tmp_path):
    scan = tmp_path / "map.png"
    cv2.imwrite(str(scan), map_scan())
    (tmp_path / "cfg.json").write_text(json.dumps({"colours": ["#145ac8"], "prefix": "tile"}))
    r = subprocess.run(CLI + [str(scan), "--config", str(tmp_path / "cfg.json"), "--out", str(tmp_path / "o.json"), "--overlay", str(tmp_path / "o.png")])
    assert r.returncode == 0
    assert json.loads((tmp_path / "o.json").read_text()) == {"w": 700, "h": 420, "zones": {"tile1": {"r": list(BLUE)}}}
    assert cv2.imread(str(tmp_path / "o.png")).shape == (420, 700, 3)
    r = subprocess.run(CLI + [str(scan), "--colour", "#dc1e1e", "--name", "a", "--out", str(tmp_path / "p.json")])
    assert r.returncode == 1 and not (tmp_path / "p.json").exists()


@pytest.mark.parametrize("case", ["no scan", "no config", "bad json", "hand rect without s", "bad colour"])
def test_cli_bad_input_prints_one_line_and_exits_2(tmp_path, case):
    scan = tmp_path / "map.png"
    cv2.imwrite(str(scan), map_scan())
    cfg = tmp_path / "cfg.json"
    cfg.write_text({"bad json": "{", "hand rect without s": json.dumps({"zones": {"a": {"c": [5, 5]}}})}.get(case, "{}"))
    args = {"no scan": [str(tmp_path / "missing.png")], "no config": [str(scan), "--config", str(tmp_path / "none.json")],
            "bad colour": [str(scan), "--colour", "red"]}.get(case, [str(scan), "--config", str(cfg)])
    r = subprocess.run(CLI + args + ["--out", str(tmp_path / "o.json")], capture_output=True, text=True)
    assert r.returncode == 2 and "Traceback" not in r.stderr + r.stdout and len(r.stdout.strip().splitlines()) == 1
    assert not (tmp_path / "o.json").exists()
