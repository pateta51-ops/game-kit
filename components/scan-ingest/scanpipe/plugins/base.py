"""The plug-in contract between the generic pipeline and one project."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np


@dataclass
class Orientation:
    """The clockwise turn (0/90/180/270) that makes a portrait crop read upright, and how sure that is."""

    turn: int
    confident: bool
    why: str


class Plugin:
    """Override what differs per project. Sizes are (short, long) in millimetres."""

    name = "generic"
    item_sizes_mm: dict[str, tuple[float, float]] = {}
    # Kinds in item_sizes_mm whose outline is irregular by design (deep notches): kept whole, never rejected as
    # "touching items". Name only components that really are shaped; everything else must stay a plain rectangle.
    shaped_kinds: frozenset = frozenset()
    # Kinds cut from thick board, with the width (mm) of the dark cut side and shadow they show on a coloured backing,
    # on the side away from the scanner's lamp; the cut-out removes that band (key.key_region ``shadow_mm``).
    thick_kinds: dict[str, float] = {}
    # Thick kinds whose own edge may be dark grey or black (tokens printed to the edge): only the backing-hued part of
    # the cut side and shadow is removed, never neutral pixels (key.key_region ``neutral_shadow=False``).
    printed_edge_kinds: frozenset = frozenset()
    # Thin kinds (cards) with the depth (mm) searched for the shadow they cast on a coloured backing along the sides
    # away from the lamp: the item's outline is then fitted by geometry, so the shadow goes and the card's print, dark
    # red at the edge or not, stays (key.key_region ``cast_mm``, scanpipe/cast.py).
    cast_kinds: dict[str, float] = {}
    cast_size_tol_mm = 0.5  # a fitted side that puts the item further than this from the kind's size is not trusted
    corner_radius_mm: dict[str, float] = {}  # per kind, the corner radius when none of an item's lit corners shows one
    card_kind: Optional[str] = None  # the standard card among the kinds (default: the smallest one)
    size_tolerance = 0.03  # a measured item within 3 % of a known size is that kind
    # Optional: cards scanned in clear sleeves on a light backing are cut to the card inside (scanpipe/sleeves.py). A
    # region is a sleeve when at least sleeve_min_short_mm wide, or sleeve_plain_long_mm (lo, hi) long; None takes
    # them from the card's size (card_kind).
    unsleeve = False
    sleeve_min_short_mm: Optional[float] = None
    sleeve_plain_long_mm: Optional[tuple[float, float]] = None
    # Optional: kinds whose die-cut silhouette is read (scanpipe/silhouette.py, recorded as the item's "silhouette");
    # silhouette_spec overrides silhouette.DEFAULT_SPEC (canonical notch and tab sides, notch centre, variants, names).
    silhouette_kinds: frozenset = frozenset()
    silhouette_spec: dict = {}
    out_dpi: Optional[float] = 300.0  # crops are downscaled to this resolution (None keeps the scan's)
    jpeg_quality = 92

    def classify(self, w_mm: float, h_mm: float) -> Optional[str]:
        best, err = None, None
        for kind, (kw, kh) in self.item_sizes_mm.items():
            e = max(abs(w_mm - kw) / kw, abs(h_mm - kh) / kh)
            if e <= self.size_tolerance and (err is None or e < err):
                best, err = kind, e
        return best

    def orient(self, crop: np.ndarray, kind: Optional[str]) -> Orientation:
        return Orientation(0, False, "no orientation rule")

    def default_out(self, project: Path) -> Path:
        """Where crops go inside the project's checkout (``--project``)."""
        return project / "scans"

    def file_for(self, out_dir: Path, name: str, ext: str) -> Path:
        """The file of one named crop (``ext`` is "jpg" or "png")."""
        return out_dir / f"{name}.{ext}"

    def preflight(self, project: Optional[Path], names: list[str], scans: list[Path]) -> list[str]:
        """Before any scan is processed: reasons to refuse the run (nothing has been written yet)."""
        return []

    def finish(self, project: Optional[Path], out_dir: Path, manifests: list[dict]) -> list[str]:
        """After every scan of a run: write whatever the project needs besides the crops. Returns problems to report."""
        return []
