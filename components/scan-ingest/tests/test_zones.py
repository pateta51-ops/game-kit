"""Zone rects traced from a synthetic map into ZoneLayout JSON (scanpipe/zones.py, K427)."""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import pytest

from scanpipe import zones
from tests.synth_zones import BLUE, RED, map_scan

HERE = Path(__file__).parent


def test_marker_blobs_come_back_in_reading_order_as_x_y_w_h():
    assert zones.find(map_scan(), ["#dc1e1e"]) == [list(r) for r in RED]


def test_names_hand_rects_and_size_make_the_fixture_the_ts_test_merges():
    L = zones.trace(map_scan(), ["#dc1e1e", "#145ac8"], names=["a", "b", "c", "d", "e", "f"],
                    zones={"g": {"c": [50, 380], "s": [40, 20]}, "f": [10, 10, 20, 20]}, size=(1, 1))
    assert L == json.loads((HERE / "zones.fixture.json").read_text())
    assert L["zones"]["a"]["r"] == [round(100 / 700, 4), round(80 / 420, 4), round(60 / 700, 4), round(60 / 420, 4)]


def test_a_count_that_differs_from_the_names_or_a_rect_off_the_scan_is_refused():
    with pytest.raises(ValueError, match="found 5 zones, names lists 2"):
        zones.trace(map_scan(), ["#dc1e1e"], names=["a", "b"])
    with pytest.raises(ValueError, match="outside"):
        zones.trace(map_scan(), zones={"x": [690, 0, 20, 20]})


def test_cli_writes_px_layout_and_overlay_and_exits_1_on_a_bad_count(tmp_path):
    scan = tmp_path / "map.png"
    cv2.imwrite(str(scan), map_scan())
    (tmp_path / "cfg.json").write_text(json.dumps({"colours": ["#145ac8"], "prefix": "tile"}))
    cli = [sys.executable, "-I", str(HERE.parent / "scripts" / "trace_zones.py"), str(scan)]
    r = subprocess.run(cli + ["--config", str(tmp_path / "cfg.json"), "--out", str(tmp_path / "o.json"), "--overlay", str(tmp_path / "o.png")])
    assert r.returncode == 0
    assert json.loads((tmp_path / "o.json").read_text()) == {"w": 700, "h": 420, "zones": {"tile1": {"r": list(BLUE)}}}
    assert cv2.imread(str(tmp_path / "o.png")).shape == (420, 700, 3)
    r = subprocess.run(cli + ["--colour", "#dc1e1e", "--name", "a", "--out", str(tmp_path / "p.json")])
    assert r.returncode == 1 and not (tmp_path / "p.json").exists()
