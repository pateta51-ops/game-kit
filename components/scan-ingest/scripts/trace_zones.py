"""Trace zone rects of a scanned map or board into board-layout ZoneLayout JSON (see scanpipe/zones.py).

    python -I trace_zones.py SCAN --out OUT.json [--config cfg.json] [--colour "#ff0000"]... [--name id]... (--help)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scanpipe.zones import main  # noqa: E402

sys.exit(main())
