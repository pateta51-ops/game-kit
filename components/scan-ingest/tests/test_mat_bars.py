"""K433: playmat spaces from bars (LCARS-style): open-sided panels between thick bars, labels in bar gaps, panels to the edge."""
import cv2
import numpy as np

from scanpipe import playmats as P

BAR = (150, 110, 100)


def lcars():
    """600 x 360 black mat: a column, two bars (one with a label in a gap, one in segments), stars and a dashed grid."""
    img = np.zeros((360, 600, 3), np.uint8)
    cv2.rectangle(img, (250, 0), (290, 359), BAR, -1)                  # column, top edge to bottom edge
    cv2.rectangle(img, (0, 150), (55, 165), BAR, -1)                   # bar, label gap 56..144
    for x in range(60, 140, 12):
        cv2.rectangle(img, (x, 152), (x + 7, 163), (90, 150, 240), -1)  # label letters in the gap
    cv2.rectangle(img, (145, 150), (250, 165), BAR, -1)
    for x in range(290, 600, 80):
        cv2.rectangle(img, (x, 250), (x + 76, 262), BAR, -1)            # bar in segments with 3 px gaps
    rng = np.random.default_rng(3)
    for _ in range(120):
        x, y = int(rng.integers(300, 590)), int(rng.integers(5, 240))
        cv2.circle(img, (x, y), 1, (220, 220, 200), -1)                  # stars
    for x in range(300, 595, 9):
        cv2.line(img, (x, 120), (x + 5, 120), (120, 80, 40), 1)          # dashed grid line across the panel
    cv2.rectangle(img, (330, 280), (560, 340), (200, 120, 40), 1)       # an outline inside a panel (ship window)
    return img


PANELS = [(0, 0, 250, 150), (291, 0, 600, 250), (0, 166, 250, 360), (291, 263, 600, 360)]


def test_K433_spaces_from_bars_finds_every_panel():
    ink = P.ink_by_ground(lcars()[:, :, ::-1])
    found = P.detect_boxes(ink, (0.2, 1.0), ratio=(0.3, 5), bars=(0.01, 0.01), edge=True)
    assert len(found) == 4
    for b, (x0, y0, x1, y1) in zip(found, PANELS):
        assert abs(b["x"] * 600 - x0) <= 4 and abs(b["y"] * 360 - y0) <= 4
        assert abs((b["x"] + b["w"]) * 600 - x1) <= 4 and abs((b["y"] + b["h"]) * 360 - y1) <= 4


def test_K433_boxed_mat_unchanged_at_close_6_and_2():
    img = np.full((800, 1200, 3), (170, 210, 225), np.uint8)
    for r in range(3):
        for c in range(4):
            x, y = 150 + c * 250, 120 + r * 220
            cv2.rectangle(img, (x, y), (x + 100, y + 100), (40, 30, 30), 6)
    cv2.rectangle(img, (100, 20), (700, 70), (40, 30, 30), 4)
    ink = P.ink_by_ground(img[:, :, ::-1])
    assert len(P.detect_boxes(ink, (0.05, 0.12), close=6)) == 12
    wide = P.detect_boxes(ink, (0.4, 0.6), ratio=(5, 15), close=2)
    assert len(wide) == 1 and abs(wide[0]["w"] * 1200 - 592) <= 6
