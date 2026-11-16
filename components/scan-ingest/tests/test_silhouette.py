"""Silhouette reading (ported from Unstoppable's test_silhouette.py): shape, face and the quarter turn upright, on
die-cut masks, each face in the four poses a flatbed crop can show it in."""
from __future__ import annotations

import cv2
import numpy as np

from scanpipe import silhouette as S
from tests.synth_sleeves import CARD_H, CARD_W, TAB_MM, silhouette_mask

PX = 300 / 25.4
# Unstoppable's die-cuts, as its plug-in gives them
SPEC = S.spec_for({"notchCentre": 0.57, "notchVariants": {"high": [0.26, 0.53], "low": [0.59, 0.87]}})

POSES = {
    "upright": (lambda m: m, 0, "front"),
    "upside-down": (lambda m: m[::-1, ::-1], 180, "front"),
    "page-flip": (lambda m: m[:, ::-1], 0, "back"),
    "tumble": (lambda m: m[::-1, :], 180, "back"),
}
SHAPES = {"core": "notched", "upgrade": "tabbed", "plain": "plain"}


def read(mask: np.ndarray, expected=None, spec=SPEC):
    h, w = mask.shape
    sil = S.analyze(S.outline_of(mask), w, h, spec)
    return sil, S.orient(sil, expected, spec)


def _mask(shape: str, variant: str = "high") -> np.ndarray:
    w = int(round(CARD_W * PX))
    h = int(round((CARD_H + (TAB_MM if shape == "upgrade" else 0)) * PX))
    return np.ascontiguousarray(silhouette_mask(shape, w, h, variant))


def test_notched_and_tabbed_poses():
    for shape, variant in (("core", "high"), ("upgrade", "high"), ("upgrade", "low")):
        base = _mask(shape, variant)
        for pose, (tf, rot, face) in POSES.items():
            m = np.ascontiguousarray(tf(base))
            for expected in ("front", "back"):
                sil, o = read(m, expected)
                assert sil.shape == SHAPES[shape], (shape, variant, pose, sil.to_json())
                assert o.rotate == rot and o.face == face, (shape, pose, expected, o.to_json())
                assert ("FACE_NOT_EXPECTED" in o.flags) == (face != expected), (pose, expected, o.to_json())
                if shape == "core":
                    assert o.confidence == "medium", o.to_json()
                else:
                    assert o.variant == variant, (variant, pose, o.to_json())


def test_default_spec_cannot_tell_a_notched_card_upside_down():
    sil, o = read(np.ascontiguousarray(_mask("core")[::-1, ::-1]), None, S.DEFAULT_SPEC)
    assert sil.shape == "notched" and o.confidence == "low" and "SILHOUETTE_ROTATION_GUESSED" in o.flags


def test_plain_and_round():
    sil, o = read(_mask("plain"))
    assert sil.shape == "plain" and o.rotate is None and not o.flags
    d = int(25 * PX)
    disc = np.zeros((d, d), np.uint8)
    cv2.circle(disc, (d // 2, d // 2), d // 2 - 1, 255, cv2.FILLED)
    sil, o = read(disc)
    assert sil.shape == "round" and o.rotate is None and not o.flags


def test_read_gives_the_games_names():
    m = _mask("upgrade", "low")
    r = S.read(S.outline_of(m), m.shape[1], m.shape[0], S.spec_for({**SPEC, "names": {"tabbed": "upgrade"}}))
    assert r["shape"] == "upgrade" and r["variant"] == "low" and r["rotate"] == 0
    assert S.read(None, 10, 10)["shape"] == "unknown"
