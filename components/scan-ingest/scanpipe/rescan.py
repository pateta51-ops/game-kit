"""Re-scans (optional, plug-in ``rescans``): a later scan of an item supersedes its earlier crop, and a report names the
items worth scanning again, by sheet and place on the glass. Ported from the bookkeeping of Unstoppable's
ufp_ingest/rescan.py and build.replaced_slots; transcript verdicts and die-cut sizes stay in the game."""
from __future__ import annotations

import json
import os
import statistics
from pathlib import Path
from typing import Optional

from .flags import needs_attention

OFF_GLASS_RESCAN_MM = 0.5  # this much of an item off the glass is worth a re-scan; less is a sliver of border


def manifests(review_dir: Path) -> dict[str, dict]:
    out = {}
    for p in sorted(Path(review_dir).glob("*.json")):
        try:
            m = json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if isinstance(m, dict) and "scan" in m and "items" in m:
            out[p.stem] = m
    return out


def write(review_dir: Path, m: dict) -> None:
    with open(Path(review_dir) / f"{Path(m['scan']).stem}.json", "w", encoding="utf-8") as f:
        json.dump(m, f, indent=2)
        f.write("\n")


def plan(review_dir: Path, run: list[dict], plugin, out_dir: Path) -> tuple[list[dict], list, list[dict]]:
    """The run's crops (written to a staging folder) against the earlier scans, by item name, without touching a file:
    a clean re-scan marks the earlier item ``replacedBy`` (its crop deleted, or overwritten) and records ``replaces``;
    a re-scan with a flag that asks for a look is ``heldFor`` the earlier scans, written beside the earlier crop as
    ``<name>.held-<scan>``, and the earlier crop stays. Returns (every manifest, file moves (src, dst or None to
    delete), the manifests to write)."""
    ours = {m["scan"] for m in run}
    every = [m for m in manifests(review_dir).values() if m["scan"] not in ours]
    ops, changed = [], {m["scan"]: m for m in run}
    olds_of = lambda name: [(e, it) for e in every for it in e["items"] if it["name"] == name and not it.get("replacedBy")]
    held = {n["name"] for m in run for n in m["items"] if needs_attention(n["flags"]) and olds_of(n["name"])}
    for m in run:
        stem = Path(m["scan"]).stem
        for n in m["items"]:
            staged = Path(n["file"])
            olds = [(e, it) for e in every for it in e["items"] if it["name"] == n["name"] and not it.get("replacedBy")]
            if olds and (n["name"] in held or n.get("pairOf") in held):
                n["heldFor"] = [e["scan"] for e, _ in olds]
                final = plugin.file_for(out_dir, f"{n['name']}.held-{stem}", staged.suffix[1:])
            else:
                final = plugin.file_for(out_dir, n["name"], staged.suffix[1:])
                for e, it in olds:
                    it["replacedBy"] = m["scan"]
                    n.setdefault("replaces", []).append(e["scan"])
                    changed[e["scan"]] = e
                    if Path(it["file"]) != final:
                        ops.insert(0, (Path(it["file"]), None))
            ops.append((staged, final))
            n["file"] = str(final)
        every.append(m)
    return every, ops, list(changed.values())


def apply(review_dir: Path, ops: list, changed: list[dict]) -> None:
    """Carry out `plan`: deletions first, then the moves out of staging; then the manifests are written."""
    for src, dst in ops:
        if dst is None:
            src.unlink(missing_ok=True)
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            os.replace(src, dst)
    for m in changed:
        write(review_dir, m)


def current(review_dir: Path) -> list[tuple[dict, dict]]:
    """(manifest, item) for every item no later scan replaced, held re-scans left out."""
    return [(m, it) for m in manifests(review_dir).values() for it in m["items"]
            if not it.get("replacedBy") and not it.get("heldFor")]


def grid(items: list[dict]) -> dict[str, str]:
    """Each item's row and column on its sheet, in words (rows by clustering centres)."""
    if not items:
        return {}
    gap = statistics.median([it["region"]["h"] for it in items]) * 0.5
    rows: list[list[dict]] = []
    for it in sorted(items, key=lambda it: it["region"]["cy"]):
        if rows and it["region"]["cy"] - rows[-1][0]["region"]["cy"] <= gap:
            rows[-1].append(it)
        else:
            rows.append([it])
    out = {}
    for r, row in enumerate(rows, 1):
        row.sort(key=lambda it: it["region"]["cx"])
        for c, it in enumerate(row, 1):
            where = f"row {r} of {len(rows)}" if len(rows) > 1 else "single row"
            out[it["name"]] = where + (f", column {c} of {len(row)}" if len(row) > 1 else "")
    return out


def off_glass_mm(item: dict, manifest: dict) -> Optional[float]:
    """How far, in mm, the item's rectangle runs past the edge of the scan (0 when it is inside)."""
    corners = item.get("region", {}).get("corners")
    if not corners:
        return None
    w, h = manifest["pixels"]
    xs, ys = [c[0] for c in corners], [c[1] for c in corners]
    return max(0.0, -min(xs), -min(ys), max(xs) - w, max(ys) - h) / manifest["dpi"] * 25.4


def report(review_dir: Path) -> tuple[str, int]:
    """RESCAN.md text and the number of items to scan again or look at; replaced items are left out."""
    lines, n = ["# Re-scan report (generated)", ""], 0
    for m in manifests(review_dir).values():
        where = grid(m["items"])
        rows = []
        for it in m["items"]:
            if it.get("replacedBy"):
                continue
            issues = []
            off = off_glass_mm(it, m)
            if off and off > 0.01:
                issues.append(f"{'RE-SCAN' if off >= OFF_GLASS_RESCAN_MM else 'CHECK'}: {off:.2f} mm ran off the glass")
            if needs_attention(it["flags"]):
                issues.append(f"CHECK: {', '.join(it['flags'])}")
            if issues:
                n += 1
                rows.append(f"- **{it['name']}** ({it['kind'] or '?'}) on the sheet: {where[it['name']]}")
                rows += [f"  - {x}" for x in issues]
        if rows:
            lines += [f"## {m['scan']}", "", *rows, ""]
    lines += ["Scan the items again with the same --name: the new crop replaces the old one.", ""] if n else \
        ["Nothing to re-scan.", ""]
    return "\n".join(lines), n
