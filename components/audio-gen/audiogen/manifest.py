"""The output manifest: one entry per generated file, merged by (id, variation) so reruns replace their own rows.

`files` lists what shipped; `failed` lists the files the last run of their cue could not make, with the reason.
A loader reads `files` only."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

VERSION = 2


def load(path: Path) -> dict[str, Any]:
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("files"), list):
            data.setdefault("failed", [])
            return data
    return {"version": VERSION, "generator": "audiogen", "files": [], "failed": []}


def merge(data: dict[str, Any], entries: list[dict[str, Any]]) -> dict[str, Any]:
    rows = {(r["id"], r["variation"]): r for r in data["files"]}
    for e in entries:
        rows[(e["id"], e["variation"])] = e
    data["files"] = sorted(rows.values(), key=lambda r: (r.get("category", ""), r["id"], r["variation"]))
    return data


def set_failures(data: dict[str, Any], made: list[tuple[str, int]], failures: list[dict[str, Any]]) -> None:
    """Drop old failures of files made now or failed again, then add this run's failures."""
    gone = set(made) | {(f["id"], f["variation"]) for f in failures}
    keep = [f for f in data.get("failed", []) if (f["id"], f["variation"]) not in gone]
    data["failed"] = sorted(keep + failures, key=lambda f: (f["id"], f["variation"]))


def prune(data: dict[str, Any], cue_id: str, keep: int) -> None:
    """Drop rows of `cue_id` beyond `keep` variations (a spec that now asks for fewer)."""
    data["files"] = [r for r in data["files"] if r["id"] != cue_id or r["variation"] <= keep]


def save(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data["version"] = VERSION
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
