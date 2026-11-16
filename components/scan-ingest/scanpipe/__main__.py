"""Command line: python -m scanpipe scan --plugin MODULE:CLASS SCAN [SCAN ...] [options]."""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

from . import pairs, plugins, rescan
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
    rs = sub.add_parser("rescan", help="list the items worth scanning again (replaced items left out)")
    rs.add_argument("review", type=Path, help="the folder of the manifests")
    rs.add_argument("--write", type=Path, help="also write the report to this file (e.g. RESCAN.md)")
    a = ap.parse_args(argv)
    if a.cmd == "rescan":
        text, n = rescan.report(a.review)
        print(text)
        if a.write:
            a.write.write_text(text, encoding="utf-8")
        return 1 if n else 0

    plugin = plugins.get(a.plugin)
    out = a.out if a.out else plugin.default_out(a.project)
    review = a.review or out.parent / "scan-review"
    names = list(a.name)
    turns = [None if t == "auto" else int(t) for t in a.turn]
    refused = plugin.preflight(a.project, names, list(a.scans))
    if plugin.pair_backs and len(a.scans) % 2:
        refused = refused + ["pair_backs: give the scans as front, back, front, back... (an even number)"]
    if refused:
        for msg in refused:
            print(msg, file=sys.stderr)
        return 1
    problems = 0
    manifests = []

    def show(man) -> int:
        n = 0
        bg = man["background"]
        backing = "coloured, cut out by colour" if bg.get("keyed") else "dark" if bg["dark"] else "light"
        tone_note = f"; tone curve {man['tone']}" if man.get("tone") else ""
        print(f"{man['scan']}: {len(man['items'])} item(s), backing {backing}{tone_note}")
        for it in man["items"]:
            flags = f"  [{', '.join(it['flags'])}]" if it["flags"] else ""
            print(f"  {it['n']}. {Path(it['file']).name}  {it['kind'] or '?'}  {it['sizeMm'][0]} x {it['sizeMm'][1]} mm"
                  f"  turn {it['turn']}{flags}")
            n += needs_attention(it["flags"])
        for rj in man["rejected"]:
            print(f"  not used: {rj['reason']}")
            n += 1
        return n

    # with re-scans, crops are written to a staging folder and moved only after the plug-in has its entries
    dest = out / ".staging" if plugin.rescans else out
    if plugin.rescans:
        shutil.rmtree(dest, ignore_errors=True)
    for k, scan in enumerate(a.scans):
        back = plugin.pair_backs and k % 2 == 1
        man = process_scan(scan, plugin, dest, review, None if back else names, a.dpi, None if back else turns, a.tone)
        manifests.append(man)
        if back:
            pairs.pair_manifests(manifests[-2], man, plugin, dest)
            rescan.write(review, manifests[-2])
            rescan.write(review, man)
            if not plugin.rescans:
                problems += show(manifests[-2]) + show(man)
        else:
            used = len(man["items"])
            names, turns = names[used:], turns[used:]
            if not (plugin.pair_backs or plugin.rescans):
                problems += show(man)
    every, ops, changed = rescan.plan(review, manifests, plugin, out) if plugin.rescans else (manifests, [], [])
    pool = [(m, it) for m in every for it in m["items"] if not it.get("replacedBy") and not it.get("heldFor")]
    byname = {it["name"]: it for _, it in pool}
    entries = [e for m, it in pool if "pairOf" not in it
               for e in [plugin.entry(it, byname.get(it.get("back")), m)] if e is not None]
    for msg in plugin.write_entries(a.project, out, entries) if entries else []:
        print(msg)
        problems += 1
    if plugin.rescans:
        rescan.apply(review, ops, changed)
        shutil.rmtree(dest, ignore_errors=True)
        for man in manifests:
            problems += show(man)
    for msg in plugin.finish(a.project, out, manifests):
        print(msg)
        problems += 1
    print(f"Review: {review}")
    if names:
        print(f"warning: {len(names)} --name value(s) not used: {', '.join(names)}", file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
