"""K164d optional steps, off by default: front/back pairing (scanpipe/pairs.py), descreen (images.descreen), re-scans
replacing earlier crops (scanpipe/rescan.py) and the plug-in's content-pack entries (Plugin.entry, write_entries).
Synthetic sheets only (tests/synth_cards.py: side B is side A with every card flipped in place)."""
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from scanpipe import images, pairs, rescan
from scanpipe.__main__ import main
from scanpipe.plugins.base import Orientation
from scanpipe.plugins.contract import problems
from tests.fake_game import FakeGame
from tests.synth_cards import Item, make_sheet

DPI = 200


class PairedGame(FakeGame):
    name = "paired-game"
    pair_backs = True
    rescans = True
    descreen_mm = 0.05

    def orient(self, crop, kind):
        return Orientation(0, True, "test: as found")

    def entry(self, item, back, manifest):
        return {"id": item["name"], "front": Path(item["file"]).name, "back": back and Path(back["file"]).name,
                "scan": manifest["scan"]}

    def write_entries(self, project, out_dir, entries):
        (out_dir / "pack.json").write_text(json.dumps(sorted(entries, key=lambda e: e["id"])), encoding="utf-8")
        return []


def save(img, path: Path) -> Path:
    Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).save(path, dpi=(DPI, DPI))
    return path


def sheets(tmp_path: Path, stem: str, n: int, seed: int) -> list[str]:
    a, b, _, _ = make_sheet(seed=seed, dpi=DPI, items=[Item("card", f"1ROM{k + 1}/23") for k in range(n)])
    return [str(save(a, tmp_path / f"{stem}-a.png")), str(save(b, tmp_path / f"{stem}-b.png"))]


def r(**kw):
    return {"cx": 0.0, "cy": 0.0, "w": 100.0, "h": 140.0, **kw}


def test_pairing_by_place_then_by_size_for_a_card_that_moved():
    a = [r(cx=100, cy=100), r(cx=400, cy=100), r(cx=700, cy=100, w=60, h=60)]
    b = [r(cx=105, cy=98), r(cx=420, cy=400), r(cx=700, cy=104, w=60, h=60)]
    m, ua, ub = pairs.pair_regions(a, b)
    assert m == {0: 0, 2: 2} and ua == [1] and ub == [1]
    assert pairs.pair_leftovers(a, b, ua, ub) == {1: 1}
    assert pairs.pair_leftovers(a, [r(cx=420, cy=400, w=60, h=60)], [1], [0]) == {}


def test_descreen_removes_the_dot_screen_and_keeps_the_alpha():
    yy, xx = np.mgrid[0:120, 0:120]
    dots = np.where((xx % 4 < 2) ^ (yy % 4 < 2), 40, 220).astype(np.uint8)
    img = cv2.merge([dots, dots, dots])
    assert images.descreen(img, 0.0) is img
    assert images.descreen(img, 0.05 * 600 / 25.4).std() < img.std() / 4
    bgra = np.dstack([np.full((60, 60, 3), 200, np.uint8), np.zeros((60, 60), np.uint8)])
    bgra[10:50, 10:50, 3] = 255
    bgra[bgra[..., 3] == 0, :3] = (255, 0, 255)          # the backing left under transparent pixels
    out = images.descreen(bgra, 2.0)
    assert (out[..., 3] == bgra[..., 3]).all()
    assert np.abs(out[10:50, 10:50, :3].astype(int) - 200).max() <= 1   # no magenta bled into the edge


def test_the_optional_steps_are_off_by_default_and_checked():
    g = FakeGame()
    assert (g.descreen_mm, g.pair_backs, g.rescans) == (0.0, False, False) and g.entry({}, None, {}) is None
    bad = PairedGame()
    bad.descreen_mm, bad.pair_backs, bad.back_suffix = -1, "yes", ""
    found = problems(bad)
    assert any(p.startswith("descreen_mm") for p in found) and any(p.startswith("pair_backs") for p in found)
    assert any(p.startswith("back_suffix") for p in found)
    assert problems(PairedGame()) == []


def test_fronts_and_backs_pair_a_rescan_replaces_and_entries_follow(tmp_path: Path):
    out, review = tmp_path / "out", tmp_path / "scan-review"
    args = ["scan", "--plugin", "tests.test_pairs_rescan:PairedGame", "--out", str(out)]
    assert main([*args, *sheets(tmp_path, "s1", 1, 3)[:1]]) == 1          # a front with no back is refused
    main([*args, "--name", "c1", "--name", "c2", "--name", "c3", *sheets(tmp_path, "s1", 3, 3)])
    front = json.loads((review / "s1-a.json").read_text(encoding="utf-8"))
    back = json.loads((review / "s1-b.json").read_text(encoding="utf-8"))
    assert [it["back"] for it in front["items"]] == ["c1-b", "c2-b", "c3-b"], front["items"]
    assert sorted(it["pairOf"] for it in back["items"]) == ["c1", "c2", "c3"]
    assert front["descreenMm"] == 0.05 and all(Path(it["file"]).exists() for it in back["items"])
    assert not any(f in it["flags"] for it in front["items"] for f in ("NO_BACK_FOUND", "PAIRED_FAR"))
    pack = json.loads((out / "pack.json").read_text(encoding="utf-8"))
    assert [(e["id"], e["back"]) for e in pack] == [("c1", "c1-b.jpg"), ("c2", "c2-b.jpg"), ("c3", "c3-b.jpg")]

    main([*args, "--name", "c2", *sheets(tmp_path, "s2", 1, 5)])           # one card scanned again
    front = json.loads((review / "s1-a.json").read_text(encoding="utf-8"))
    back = json.loads((review / "s1-b.json").read_text(encoding="utf-8"))
    assert [it.get("replacedBy") for it in front["items"]] == [None, "s2-a.png", None]
    assert [it.get("replacedBy") for it in back["items"] if it["pairOf"] == "c2"] == ["s2-b.png"]
    again = json.loads((review / "s2-a.json").read_text(encoding="utf-8"))
    assert again["items"][0]["replaces"] == ["s1-a.png"]
    pack = json.loads((out / "pack.json").read_text(encoding="utf-8"))
    assert [(e["id"], e["scan"]) for e in pack] == [("c1", "s1-a.png"), ("c2", "s2-a.png"), ("c3", "s1-a.png")]
    assert len(rescan.current(review)) == 6
    text, _ = rescan.report(review)
    assert "Re-scan report" in text and "**c2**" not in text.split("## s2-a.png")[0]


def test_the_rescan_report_names_an_item_off_the_glass_by_its_place(tmp_path: Path):
    def it(name, cx, cy, flags=()):
        corners = [[cx - 50, cy - 70], [cx + 50, cy - 70], [cx + 50, cy + 70], [cx - 50, cy + 70]]
        return {"name": name, "kind": "card", "flags": list(flags), "file": "x",
                "region": {"cx": cx, "cy": cy, "w": 100, "h": 140, "corners": corners}}
    m = {"scan": "s.tif", "dpi": 254.0, "pixels": [1000, 1000],
         "items": [it("a", 100, 100), it("b", 400, 100, ["ORIENTATION_UNREAD"]), it("c", 980, 500)]}
    rescan.write(tmp_path, m)
    text, n = rescan.report(tmp_path)
    assert n == 2 and "**b** (card) on the sheet: row 1 of 2, column 2 of 2" in text
    assert "RE-SCAN: 3.00 mm ran off the glass" in text and "**a**" not in text
    assert main(["rescan", str(tmp_path)]) == 1


def man(scan, items):
    return {"scan": scan, "dpi": 254.0, "pixels": [1000, 1000], "items": items}


def item(tmp_path, name, cx, cy, w=100.0, h=140.0, flags=(), ext="jpg", folder="out"):
    f = tmp_path / folder / f"{name}.{ext}"
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(name.encode())
    return {"n": 1, "name": name, "file": str(f), "kind": "card", "flags": list(flags),
            "region": {"cx": cx, "cy": cy, "w": w, "h": h}}


def test_pairing_flags_a_missing_back_a_far_pair_a_size_mismatch_and_a_stray_back(tmp_path: Path):
    out = tmp_path / "out"
    front = man("f.png", [item(tmp_path, "c1", 100, 100), item(tmp_path, "c2", 400, 100, w=120),
                          item(tmp_path, "c3", 700, 100, w=60, h=60), item(tmp_path, "c4", 100, 600, w=200, h=200)])
    back = man("b.png", [item(tmp_path, "b-1", 104, 101, w=110), item(tmp_path, "b-2", 405, 99, w=120),
                         item(tmp_path, "b-3", 700, 500, w=60, h=60), item(tmp_path, "b-4", 900, 900, w=30, h=30)])
    pairs.pair_manifests(front, back, FakeGame(), out)
    f = {it["name"]: it for it in front["items"]}
    assert f["c1"]["back"] == "c1-b" and "A_B_SIZE_MISMATCH" in f["c1"]["flags"]
    assert f["c2"]["flags"] == [] and f["c3"]["flags"] == ["PAIRED_FAR"] and f["c4"]["flags"] == ["NO_BACK_FOUND"]
    assert back["items"][3]["flags"] == ["NO_FRONT_MATCH"] and "pairOf" not in back["items"][3]
    assert (out / "c3-b.jpg").read_bytes() == b"b-3" and not (out / "b-3.jpg").exists()


def test_an_existing_back_crop_of_another_run_is_never_overwritten(tmp_path: Path):
    out = tmp_path / "out"
    (out / "c1-b.jpg").parent.mkdir(parents=True)
    (out / "c1-b.jpg").write_bytes(b"earlier")
    front, back = man("f.png", [item(tmp_path, "c1", 100, 100)]), man("b.png", [item(tmp_path, "b-1", 100, 100)])
    pairs.pair_manifests(front, back, FakeGame(), out)
    assert (out / "c1-b.jpg").read_bytes() == b"earlier" and back["items"][0]["flags"] == ["BACK_NAME_TAKEN"]
    assert front["items"][0]["back"] == "b-1" and (out / "b-1.jpg").exists()


def test_a_clean_rescan_deletes_the_earlier_crop_and_a_flagged_one_keeps_both(tmp_path: Path):
    out, review = tmp_path / "out", tmp_path / "review"
    review.mkdir()
    rescan.write(review, man("s1.png", [item(tmp_path, "c1", 100, 100, ext="png"), item(tmp_path, "c2", 400, 100)]))
    run = [man("s2.png", [item(tmp_path, "c1", 100, 100, folder="stage"),
                          item(tmp_path, "c2", 400, 100, flags=["UNKNOWN_SIZE"], folder="stage")])]
    every, ops, changed = rescan.plan(review, run, FakeGame(), out)
    assert (out / "c1.png").exists() and (out / "c2.jpg").read_bytes() == b"c2"   # nothing touched before apply
    rescan.apply(review, ops, changed)
    assert not (out / "c1.png").exists() and (out / "c1.jpg").exists()             # the clean re-scan replaced c1
    assert (out / "c2.jpg").exists() and (out / "c2.held-s2.jpg").exists()          # the flagged one kept both
    old = json.loads((review / "s1.json").read_text(encoding="utf-8"))
    assert [it.get("replacedBy") for it in old["items"]] == ["s2.png", None]
    new = json.loads((review / "s2.json").read_text(encoding="utf-8"))
    assert new["items"][0]["replaces"] == ["s1.png"] and new["items"][1]["heldFor"] == ["s1.png"]
    assert sorted((m["scan"], it["name"]) for m, it in rescan.current(review)) == [("s1.png", "c2"), ("s2.png", "c1")]


def test_a_held_front_holds_its_clean_back_too(tmp_path: Path):
    out, review = tmp_path / "out", tmp_path / "review"
    review.mkdir()
    rescan.write(review, man("s1.png", [item(tmp_path, "c1", 100, 100), item(tmp_path, "c1-b", 100, 100)]))
    back = item(tmp_path, "c1-b", 100, 100, folder="stage")
    back["pairOf"] = "c1"
    run = [man("s2.png", [item(tmp_path, "c1", 100, 100, flags=["UNKNOWN_SIZE"], folder="stage")]), man("s2b.png", [back])]
    every, ops, changed = rescan.plan(review, run, FakeGame(), out)
    rescan.apply(review, ops, changed)
    assert (out / "c1.jpg").exists() and (out / "c1-b.jpg").read_bytes() == b"c1-b"   # the old pair stays together
    assert (out / "c1.held-s2.jpg").exists() and (out / "c1-b.held-s2b.jpg").exists()
    assert [it.get("replacedBy") for it in json.loads((review / "s1.json").read_text(encoding="utf-8"))["items"]] == [None, None]
