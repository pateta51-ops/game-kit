"""Command line: python -m scanpipe scan --plugin MODULE:CLASS SCAN [SCAN ...] [options]."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import plugins
from .flags import needs_attention
from .pipeline import process_scan

def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="scanpipe")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sc = sub.add_parser("scan", help="find, crop and turn upright every item on one or more scans")
    sc.add_argument("scans", nargs="+", type=Path)
    sc.add_argument("--plugin", required=True, help="the game's plug-in as module:Class (a scanpipe.plugins.base.Plugin subclass, importable from where this runs)")
    where = sc.add_mutually_exclusive_group(required=True)
    where.add_argument("--project", type=Path, help="the project's checkout: crops go where its plug-in says")
    where.add_argument("--out", type=Path, help="write the crops to this folder instead")
    sc.add_argument("--review", type=Path, help="overlay and manifest folder (default: <out>/../scan-review)")
    sc.add_argument("--name", action="append", default=[],
                    help="output name per item, in order across all scans (items in reading order per scan)")
    sc.add_argument("--turn", action="append", default=[],
                    help="clockwise turn per item in degrees (0/90/180/270; any angle for round pieces), or 'auto', "
                         "in the same order as --name")
    sc.add_argument("--dpi", type=float, help="the scans' resolution, when a file does not record it (or records it wrong)")
    sc.add_argument("--tone", default="auto",
                    help="tone curve for the crops: a name from scanpipe/tones, or none (default: the owner's scanner "
                         "curve on a magenta backing, none otherwise)")
    a = ap.parse_args(argv)

    plugin = plugins.get(a.plugin)
    out = a.out if a.out else plugin.default_out(a.project)
    review = a.review or out.parent / "scan-review"
    names = list(a.name)
    turns = [None if t == "auto" else int(t) for t in a.turn]
    refused = plugin.preflight(a.project, names, list(a.scans))
    if refused:
        for msg in refused:
            print(msg, file=sys.stderr)
        return 1
    problems = 0
    manifests = []
    for scan in a.scans:
        man = process_scan(scan, plugin, out, review, names, a.dpi, turns, a.tone)
        manifests.append(man)
        used = len(man["items"])
        names, turns = names[used:], turns[used:]
        bg = man["background"]
        backing = "coloured, cut out by colour" if bg.get("keyed") else "dark" if bg["dark"] else "light"
        tone_note = f"; tone curve {man['tone']}" if man.get("tone") else ""
        print(f"{scan.name}: {used} item(s), backing {backing}{tone_note}")
        for it in man["items"]:
            flags = f"  [{', '.join(it['flags'])}]" if it["flags"] else ""
            print(f"  {it['n']}. {Path(it['file']).name}  {it['kind'] or '?'}  {it['sizeMm'][0]} x {it['sizeMm'][1]} mm"
                  f"  turn {it['turn']}{flags}")
            problems += needs_attention(it["flags"])
        for rj in man["rejected"]:
            print(f"  not used: {rj['reason']}")
            problems += 1
    for msg in plugin.finish(a.project, out, manifests):
        print(msg)
        problems += 1
    print(f"Review: {review}")
    if names:
        print(f"warning: {len(names)} --name value(s) not used: {', '.join(names)}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
