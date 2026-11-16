"""The flags an item can carry, and which of them ask the owner to look at the crop."""
from __future__ import annotations

# Flags that only tell how an item was found; they do not make the run a problem.
INFORMATIONAL = {"SPLIT_FROM_TOUCHING_ITEMS", "NEAR_SCAN_EDGE", "FOUND_NEAR_PRIOR", "FOUND_BY_EDGES",
                 "SLEEVE_TRIMMED", "RECOVERED_FROM_PRIOR"}

# An unknown size cut off by the scan's edge is the uncovered strip of glass along the edge of the bed, not an item.
GLASS = {"UNKNOWN_SIZE", "CUT_OFF_AT_SCAN_EDGE"}


def is_glass_strip(flags) -> bool:
    return GLASS <= set(flags)


def needs_attention(flags) -> bool:
    """Whether the item's flags ask the owner to look at the crop: anything but how the item was found (an unreadable
    orientation, a kept shadow, an unknown size, an item cut off by the scan's edge), except the strip of glass."""
    if is_glass_strip(flags):
        return False
    return bool(set(flags) - INFORMATIONAL)
