"""Trace scan crops to SVG, retrace an SVG, proof sheet, black-and-white render (see scanpipe/vector.py).

    python -I vtrace.py trace|retrace|proof|bw ...    (--help on each)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scanpipe.vector import main  # noqa: E402

sys.exit(main())
