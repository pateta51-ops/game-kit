"""The sound player's file check, applied to a manifest: the formats and byte limits the game's check expects."""
from __future__ import annotations

import os
from pathlib import Path

FORMATS = (".ogg", ".opus", ".webm", ".mp3", ".m4a")
MAX_CUE_BYTES = 400_000
MAX_LOOP_BYTES = 4_000_000


def check_manifest(manifest: dict, base: Path, max_cue: int = MAX_CUE_BYTES, max_loop: int = MAX_LOOP_BYTES) -> list[str]:
    bad = []
    for r in manifest.get("files", []):
        loop = r.get("mode") == "loop" or r.get("kind") == "music"
        for key in ("file", "fileFallback"):
            f = r.get(key)
            if not f:
                continue
            p = base / f
            name = f"{r['id']}-{r['variation']}"
            if os.path.splitext(f)[1].lower() not in FORMATS:
                bad.append(f"{name}: {f} is not one of {' '.join(FORMATS)}")
            if not p.exists():
                bad.append(f"{name}: file not found: {f}")
                continue
            n = p.stat().st_size
            if n == 0:
                bad.append(f"{name}: {f} is empty")
            elif n > (max_loop if loop else max_cue):
                bad.append(f"{name}: {f} is {n} bytes, over {max_loop if loop else max_cue}")
    return bad
