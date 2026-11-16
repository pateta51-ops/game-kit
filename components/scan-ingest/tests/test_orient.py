"""orient.py: which way up a plain rectangle lies, read from its print (OSD, page flip)."""
from __future__ import annotations

import cv2
import numpy as np
import pytest

from scanpipe import orient, tess
from tests.synth_cards import CHART_H, CHART_W, MM, chart_face

needs_ocr = pytest.mark.skipif(not tess.available(), reason="Tesseract is not installed")


def test_page_flip_rule():
    assert [orient.page_flip(r, "portrait") for r in (0, 180)] == [0, 180]
    assert [orient.page_flip(r, "landscape") for r in (90, 270)] == [270, 90]
    assert orient.page_flip(None, "portrait") is None


def test_a_reading_taken_from_the_other_face_is_one_level_less_sure():
    assert [orient._downgrade(x) for x in orient.LEVELS] == ["none", "low", "low", "medium"]


def test_without_tesseract_osd_reads_nothing(monkeypatch):
    tess.reset()
    monkeypatch.setenv("TESSERACT_CMD", "no-such-tesseract-program")
    assert orient.osd_rotation(np.zeros((40, 30, 3), np.uint8)) is None
    tess.reset()


@needs_ocr
@pytest.mark.parametrize("turn", [90, 270])
def test_osd_decides_the_turn_of_a_chart(turn):
    import random
    px = 300 * MM
    face = chart_face(int(CHART_H * px), int(CHART_W * px), random.Random(1), "S")      # landscape, upright
    crop = cv2.rotate(face, cv2.ROTATE_90_COUNTERCLOCKWISE if turn == 90 else cv2.ROTATE_90_CLOCKWISE)
    rot, conf = orient.osd_rotation(crop)
    assert rot == turn and rot in orient.ROTATIONS["landscape"] and conf >= orient.OSD_MIN_CONF
