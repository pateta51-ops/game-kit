"""Find and run the Tesseract OCR binary. Tesseract is optional: without it, scanning still works.

Lookup order:
1. the ``TESSERACT_CMD`` environment variable (a full path to ``tesseract.exe`` or a command name);
2. ``tesseract`` on the PATH;
3. the default Windows install folders of the UB Mannheim build, whose installer does not add itself
   to the PATH (``C:\\Program Files\\Tesseract-OCR\\tesseract.exe`` and the per-user folder).

When none is found, every caller gets ``None`` and one clear warning is printed (once per run):
card codes and orientation hints are then skipped, nothing crashes.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

_WARNED: set = set()
_CACHE: dict = {}

INSTALL_HINT = ("Install Tesseract (Windows: the UB Mannheim build, see the scan-ingest README) or set the "
                "TESSERACT_CMD environment variable to the full path of tesseract.exe.")


def _on_windows() -> bool:
    return os.name == "nt"


def _windows_candidates() -> list[Path]:
    out = []
    for var in ("ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"):
        base = os.environ.get(var)
        if base:
            out.append(Path(base) / "Tesseract-OCR" / "tesseract.exe")
    local = os.environ.get("LOCALAPPDATA")
    if local:
        out.append(Path(local) / "Programs" / "Tesseract-OCR" / "tesseract.exe")
    out += [Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"), Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe")]
    return out


def find() -> Optional[str]:
    """Path of the tesseract binary, or None. The answer is cached for the run (keyed on TESSERACT_CMD)."""
    env = os.environ.get("TESSERACT_CMD", "").strip().strip('"')
    if env in _CACHE:
        return _CACHE[env]
    found: Optional[str] = None
    if env:
        if Path(env).is_file():
            found = env
        else:
            found = shutil.which(env)
            if found is None:
                warn_once("cmd", f"TESSERACT_CMD is set to '{env}', but no such program exists. {INSTALL_HINT}")
    else:
        found = shutil.which("tesseract")
        if found is None and _on_windows():
            found = next((str(p) for p in _windows_candidates() if p.is_file()), None)
    _CACHE[env] = found
    return found


def available() -> bool:
    return find() is not None


def warn_once(key: str, message: str) -> None:
    if key in _WARNED:
        return
    _WARNED.add(key)
    print(f"WARNING: {message}", file=sys.stderr)


def warn_missing() -> None:
    warn_once("missing", "Tesseract OCR was not found: card codes and orientation hints are skipped (the scan itself "
                         "is fine; faces are left as scanned). " + INSTALL_HINT)


def reset() -> None:
    """Forget the cached lookup and the warnings already printed (tests)."""
    _CACHE.clear()
    _WARNED.clear()


def run(args: list[str], timeout: float = 30.0) -> Optional[subprocess.CompletedProcess]:
    """Run tesseract with ``args`` (everything after the program name). None when it is missing or fails to start."""
    exe = find()
    if exe is None:
        warn_missing()
        return None
    try:
        # One thread per call: these images are small, and Tesseract's OpenMP threads only contend with each other.
        env = {**os.environ, "OMP_THREAD_LIMIT": os.environ.get("OMP_THREAD_LIMIT", "1")}
        return subprocess.run([exe, *args], capture_output=True, text=True, encoding="utf-8", errors="replace",
                              timeout=timeout, env=env)
    except (OSError, subprocess.TimeoutExpired) as ex:
        warn_once("run", f"Tesseract could not be run ({ex}); card codes and orientation hints are skipped. {INSTALL_HINT}")
        return None
