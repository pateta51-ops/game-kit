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
    # Optional: halftone removal, the Gaussian sigma in mm at the scan's resolution (Unstoppable uses 0.05); 0 is off.
    descreen_mm = 0.0
    # Optional: scans come as front, back, front, back...; each back scan's items (flipped in place like a page) are
    # paired to the front's (scanpipe/pairs.py) and their crops named after the front's name plus back_suffix.
    pair_backs = False
    back_suffix = "-b"
    # Optional: a later scan of an item with the same name supersedes the earlier crop (scanpipe/rescan.py).
    rescans = False
    # Optional (scanpipe/identify.py): the game's built card fronts by card id (a folder, a list of files, or
    # {id: file}); each item then records ``identity``. Own back images by card id, generic back designs by design id,
    # back_map card id -> design, identify_family card id -> family key (die-cuts of one card, never each other's
    # runner-up), identify_variants card id -> the silhouette variant telling cards that share art apart,
    # identify_params overrides identify.PARAMS. Flags IDENTITY_AMBIGUOUS, BACK_IDENTITY_MISMATCH, IDENTITY_DUPLICATE.
    identify_refs = None
    identify_back_refs = None
    identify_generic_backs = None
    back_map: dict = {}
    identify_family: dict = {}
    identify_variants: dict = {}
    identify_params: dict = {}
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

    def entry(self, item: dict, back: Optional[dict], manifest: dict) -> Optional[dict]:
        """Optional: the game's content-pack entry for one crop (``back`` is its paired back item, if any); None skips
        it. Called after a run for every item of the run (every item no re-scan replaced, with ``rescans``)."""
        return None

    def write_entries(self, project: Optional[Path], out_dir: Path, entries: list[dict]) -> list[str]:
        """Write the entries `entry` gave (only called when there is at least one). Returns problems to report."""
        return []
