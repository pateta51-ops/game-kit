"""K373: playmat box detection, the outline of a synthetic die-cut piece, and the scanner tone profile, on drawn images."""
import cv2
import numpy as np

from scanpipe import playmats as P
from scanpipe import silhouette as S
from scanpipe import tone as T


def mat():
    """A 1200 x 800 parchment mat with a 4 x 3 grid of printed square spaces (ink outlines) and one wide label."""
    img = np.full((800, 1200, 3), (170, 210, 225), np.uint8)
    boxes = []
    for r in range(3):
        for c in range(4):
            x, y = 150 + c * 250, 120 + r * 220
            cv2.rectangle(img, (x, y), (x + 100, y + 100), (40, 30, 30), 6)
            boxes.append((x, y))
    cv2.rectangle(img, (100, 20), (700, 70), (40, 30, 30), 4)   # a label: too wide to be a space
    return img, boxes


def test_detects_the_printed_spaces_in_rows():
    img, boxes = mat()
    found = P.detect_boxes(P.ink_by_ground(img[:, :, ::-1]), (0.05, 0.12))
    assert len(found) == 12
    rs = P.rows(found)
    assert [len(r) for r in rs] == [4, 4, 4]
    x, y = boxes[5]
    b = rs[1][1]
    assert abs(b["x"] * 1200 - (x + 3)) <= 3 and abs(b["y"] * 800 - (y + 3)) <= 3
    assert abs(b["w"] * 1200 - 94) <= 4


def test_fit_track_fills_hidden_spots_of_a_zigzag():
    pts = [(0.1 + 0.05 * k, 0.2 if k % 2 else 0.25) for k in range(2, 9)]
    track = P.fit_track(pts, list(range(2, 9)), 10)
    assert len(track) == 10
    assert track[0] == [0.15, 0.2] and track[9] == [0.6, 0.25]


def test_spaces_file_checks():
    mats = [{"id": "m", "aspect": 1.5, "spaces": {"a": {"x": 0.9, "y": 0, "w": 0.2, "h": 0.1}}},
            {"id": "m", "aspect": 1.5, "spaces": {}}]
    errs = P.check(mats)
    assert any("runs off" in e for e in errs) and any("twice" in e for e in errs)
    assert P.shape_problem(mats[0], 1500, 1000) is None
    assert P.shape_problem(mats[0], 1000, 1000)


def test_outline_of_a_synthetic_piece():
    m = np.zeros((300, 200), np.uint8)
    cv2.circle(m, (100, 150), 90, 255, -1)
    o = S.outline_of(m)
    pts = np.array(o)
    assert len(o) >= 12
    assert abs(pts[:, 0].min() - 10 / 200) < 0.02 and abs(pts[:, 1].max() - 240 / 300) < 0.02
    assert S.analyze(o, 200, 300).shape in ("round", "irregular", "plain")


def test_tone_profile_and_fit_recover_a_curve():
    rng = np.random.default_rng(1)
    ref = rng.integers(0, 256, (64, 64, 3), dtype=np.uint8)
    flat = (40 + ref.astype(np.float64) * 0.6).astype(np.uint8)   # a scanner without correction: grey blacks and whites
    p = T.profile(flat)
    assert 40 <= p["r"]["black"] < 50 and p["r"]["white"] < 200
    curve = T.fit([flat], [ref], "fake")
    assert all(curve[c][i] <= curve[c][i + 1] for c in "rgb" for i in range(255))
    assert T.delta_e(T.apply_curve(flat, curve), ref) < 1.5 < T.delta_e(flat, ref)
