"""Which flags make a run exit with 1 (scanpipe/flags.py)."""
from scanpipe.flags import INFORMATIONAL, is_glass_strip, needs_attention


def test_only_flags_that_ask_for_a_look_count():
    assert not needs_attention([])
    for f in INFORMATIONAL:
        assert not needs_attention([f])
    for f in ("UNKNOWN_SIZE", "ORIENTATION_UNREAD", "KEY_FAILED", "SHADOW_KEPT_CHECK_CROP", "CAST_SHADOW_KEPT",
              "CUT_OFF_AT_SCAN_EDGE", "MAY_BE_SEVERAL_ITEMS"):
        assert needs_attention([f]), f
        assert needs_attention(["SPLIT_FROM_TOUCHING_ITEMS", f]), f


def test_the_uncovered_strip_of_glass_counts_for_nothing():
    # the real strips along the bed's edge, as the owner's sheets report them
    strip = ["MAY_BE_SEVERAL_ITEMS", "CUT_OFF_AT_SCAN_EDGE", "UNKNOWN_SIZE", "ORIENTATION_UNREAD"]
    assert is_glass_strip(strip) and not needs_attention(strip)
    assert not is_glass_strip(["UNKNOWN_SIZE"]) and not is_glass_strip(["CUT_OFF_AT_SCAN_EDGE"])
