"""K784 scanpipe/identify.py: which built card face a crop shows (hash at 4 turns, then SIFT + RANSAC inliers), the
paired-faces check, the same card twice, shared-art variants, and the plug-in wiring (identify_refs, off by default).
Synthetic faces and sheets only."""
import json
import shutil
from pathlib import Path

import cv2

from scanpipe import identify
from scanpipe.__main__ import main
from scanpipe.plugins.base import Orientation
from scanpipe.plugins.contract import problems
from tests.fake_game import FakeGame
from tests.synth_faces import face, scanned
from tests.test_pairs_rescan import PairedGame, sheets

FRONTS = {f"c{k}": face(k) for k in range(6)}
REFS = identify.Refs(FRONTS)


def test_k784_identifies_the_face_and_the_turn_that_reads_like_it():
    for k, turn in [(0, 0), (1, 90), (2, 180), (3, 270), (4, 90)]:
        r = identify.identify(scanned(FRONTS[f"c{k}"], turn, seed=k), REFS)
        assert (r["ref"], r["face"], r["ambiguous"]) == (f"c{k}", "front", False), r
        assert r["inliers"] >= 120 and r["confidence"] > 0.5 and r["runnerUp"] != r["ref"]
        assert r["turn"] == (360 - turn) % 360, r     # turning the crop by this reads like the reference


def test_k784_ambiguous_when_two_refs_are_alike_or_nothing_matches():
    r = identify.identify(scanned(FRONTS["c0"], 0), {"a": FRONTS["c0"], "b": FRONTS["c0"].copy(), "c": FRONTS["c1"]})
    assert r["ambiguous"] and {r["ref"], r["runnerUp"]} == {"a", "b"} and r["held"]
    r = identify.identify(face(99), REFS)
    assert r["ambiguous"] and r["inliers"] < 120


def test_k784_die_cuts_of_one_card_are_never_runner_up_and_shared_art_takes_the_silhouette_variant():
    refs = identify.Refs({"a1": face(1), "a2": face(1).copy(), "b": face(2)}, family={"a1": "a", "a2": "a"},
                         variants={"a1": "left", "a2": "right"})
    crop = scanned(face(1), 90)
    r = identify.identify(crop, refs, {"silhouette": {"variant": "right", "confidence": "high"}})
    assert (r["ref"], r["ambiguous"], r["runnerUp"]) == ("a2", False, "b"), r
    r = identify.identify(crop, refs, {"silhouette": {"variant": "right", "confidence": "low"}})
    assert r["ambiguous"] and r["variantUnread"] and "share art" in r["held"]


def test_k784_a_paired_back_is_checked_against_its_front():
    own = identify.Refs(FRONTS, backs={"c0": face(60), "c1": face(61)})
    front = scanned(FRONTS["c0"], 90)
    assert identify.check_pair(front, scanned(face(60), 270), own)["matches"] is True
    c = identify.check_pair(front, scanned(face(61), 270), own)                  # two faces, two cards
    assert c["matches"] is False and "c0 and c1" in c["held"]
    gen = identify.Refs(FRONTS, generic={"blue": face(50), "red": face(51)}, back_map={"c0": "red"})
    c = identify.check_pair(front, scanned(face(51), 180), gen)
    assert (c["card"], c["matches"], c["otherFace"]["face"]) == ("c0", True, "generic"), c
    assert identify.check_pair(front, scanned(face(50), 180), gen)["matches"] is False
    assert identify.check_pair(scanned(FRONTS["c1"], 0), scanned(face(51), 0), gen)["matches"] is None  # no design
    assert identify.check_pair(face(97), face(98), gen)["held"] == "neither face identified"
    # hash margin under the setting: SIFT on the generic designs decides (correction from real sheets)
    sift = identify.Refs(FRONTS, generic={"blue": face(50), "red": face(51)}, back_map={"c0": "red"},
                         params={"back_hash_margin": 1000})
    c = identify.check_pair(front, scanned(face(51), 180), sift)
    assert c["matches"] is True and c["otherFace"]["inliers"] >= 120 > c["otherFace"]["nextInliers"], c
    assert identify.check_pair(front, scanned(face(50), 180), sift)["matches"] is False


def test_k784_an_item_cut_off_or_too_small_is_not_matched_and_a_weak_guess_never_reads_the_variant(tmp_path: Path):
    f = tmp_path / "x.png"
    cv2.imwrite(str(f), scanned(FRONTS["c0"], 0))
    it = lambda flags, size: {"name": "x", "file": str(f), "flags": flags, "sizeMm": size}
    m = {"items": [it(["CUT_OFF_AT_SCAN_EDGE"], [63, 88]), it([], [10, 20]), it([], [63, 88])]}
    identify.annotate(m, REFS, None, 1000)
    assert [x["identity"].get("skipped", False) for x in m["items"]] == [True, True, False]
    assert m["items"][2]["identity"]["card"] == "c0" and m["items"][2]["flags"] == []
    assert m["items"][1]["flags"] == ["IDENTITY_AMBIGUOUS"]
    refs = identify.Refs({"a1": face(1), "a2": face(1).copy()}, family={"a1": "a", "a2": "a"},
                         variants={"a1": "left", "a2": "right"})
    r = identify.identify(face(99), refs)
    assert r["ambiguous"] and not r.get("variantUnread")


def test_k784_the_same_card_twice_holds_the_one_with_fewer_front_inliers():
    def it(n, inl, tot, **kw):
        return {"name": n, "flags": [], "identity": {"card": "c0", "inliers": inl, "total": tot, "held": None}, **kw}
    m = {"items": [it("x", 300, 300), it("y", 200, 500), it("z", 900, 900, replacedBy="s2.png")]}
    assert identify.dedupe([m]) == 1                      # front inliers, not a front+back sum; z was replaced
    assert [i["flags"] for i in m["items"]] == [[], ["IDENTITY_DUPLICATE"], []]
    assert m["items"][1]["identity"]["held"] == "same card as x"
    m = {"items": [it("x", 300, 300), it("y", 300, 400)]}
    assert identify.dedupe([m]) == 1 and m["items"][0]["flags"] == ["IDENTITY_DUPLICATE"]   # the back breaks a tie


def test_k784_cli_identifies_a_folder_of_crops(tmp_path: Path, capsys):
    (tmp_path / "refs").mkdir()
    (tmp_path / "crops").mkdir()
    for k, img in FRONTS.items():
        cv2.imwrite(str(tmp_path / "refs" / f"{k}.png"), img)
    cv2.imwrite(str(tmp_path / "crops" / "x.jpg"), scanned(FRONTS["c2"], 90))
    args = ["identify", str(tmp_path / "crops"), "--refs", str(tmp_path / "refs")]
    assert main([*args, "--json", str(tmp_path / "r.json")]) == 0
    assert json.loads((tmp_path / "r.json").read_text(encoding="utf-8"))["x.jpg"]["ref"] == "c2"
    assert main([*args, "--min-inliers", "100000"]) == 1
    cv2.imwrite(str(tmp_path / "refs" / "c2.jpg"), FRONTS["c2"])
    assert main(args) == 1 and "two reference images have the id c2" in capsys.readouterr().err
    (tmp_path / "refs" / "c2.jpg").unlink()
    cv2.imwrite(str(tmp_path / "crops" / "y.jpg"), face(98))
    assert main(args) == 1


def test_k784_the_feature_cache_is_bounded():
    refs = identify.Refs(FRONTS, params={"cache": 2, "top": 6})
    identify.identify(scanned(FRONTS["c0"], 0), refs)
    assert len(refs._feat) == 2


def test_k784_off_by_default_and_checked():
    g = FakeGame()
    assert (g.identify_refs, g.back_map, g.identify_params) == (None, {}, {}) and problems(PairedGame()) == []
    bad = PairedGame()
    bad.identify_refs, bad.back_map, bad.identify_params = 5, {"a": 1}, {"min_inlier": 3}
    found = problems(bad)
    assert all(any(p.startswith(a) for p in found) for a in ("identify_refs", "back_map", "identify_params"))


def test_k784_a_run_records_identity_and_flags_a_back_that_is_not_its_fronts(tmp_path: Path, monkeypatch):
    scans = sheets(tmp_path, "s1", 3, 3)
    names = ["--name", "c1", "--name", "c2", "--name", "c3"]
    first, review = tmp_path / "first", tmp_path / "scan-review"
    monkeypatch.setattr(PairedGame, "rescans", False)
    main(["scan", "--plugin", "tests.test_pairs_rescan:PairedGame", "--out", str(first), *names, *scans])
    assert "identity" not in json.loads((review / "s1-a.json").read_text(encoding="utf-8"))["items"][0]
    refs, backs = tmp_path / "refs", tmp_path / "backs"
    refs.mkdir()
    backs.mkdir()
    for k in ("c1", "c2", "c3"):
        shutil.copy(first / f"{k}.jpg", refs / f"{k}.jpg")
    shutil.copy(first / "c1-b.jpg", backs / "classic.jpg")
    cv2.imwrite(str(backs / "other.png"), face(7))
    monkeypatch.setattr(PairedGame, "identify_refs", str(refs))
    monkeypatch.setattr(PairedGame, "identify_generic_backs", [str(backs)])
    monkeypatch.setattr(PairedGame, "back_map", {"c1": "classic", "c2": "classic", "c3": "other"})
    review2 = tmp_path / "review2"
    assert main(["scan", "--plugin", "tests.test_pairs_rescan:PairedGame", "--out", str(tmp_path / "second"),
                 "--review", str(review2), *names, *scans]) == 1
    front = json.loads((review2 / "s1-a.json").read_text(encoding="utf-8"))["items"]
    assert [(it["name"], it["identity"]["ref"], it["identity"]["card"], it["identity"]["matches"]) for it in front] == \
        [("c1", "c1", "c1", True), ("c2", "c2", "c2", True), ("c3", "c3", "c3", False)], front
    assert [("BACK_IDENTITY_MISMATCH" in it["flags"]) for it in front] == [False, False, True]
    back = json.loads((review2 / "s1-b.json").read_text(encoding="utf-8"))["items"]
    assert all(b["identity"]["generic"]["design"] == "classic" for b in back)


class Plain(FakeGame):
    name = "plain-game"

    def orient(self, crop, kind):
        return Orientation(0, True, "test: as found")


def _refs_from_a_first_run(tmp_path, plugin, scans, names):
    first = tmp_path / "first"
    main(["scan", "--plugin", plugin, "--out", str(first), "--review", str(tmp_path / "r0"), *names, *scans])
    refs = tmp_path / "refs"
    refs.mkdir()
    for k in ("c1", "c2", "c3"):
        shutil.copy(first / f"{k}.jpg", refs / f"{k}.jpg")
    return refs


def test_k784_an_unpaired_run_records_each_item_and_holds_a_card_found_twice(tmp_path: Path, monkeypatch):
    scans = sheets(tmp_path, "s1", 3, 3)[:1]
    names = ["--name", "c1", "--name", "c2", "--name", "c3"]
    monkeypatch.setattr(Plain, "identify_refs", str(_refs_from_a_first_run(tmp_path, "tests.test_identify:Plain",
                                                                            scans, names)))
    review = tmp_path / "review"
    shutil.copy(scans[0], tmp_path / "again.png")
    code = main(["scan", "--plugin", "tests.test_identify:Plain", "--out", str(tmp_path / "out"), "--review",
                 str(review), *names, "--name", "d1", "--name", "d2", "--name", "d3", scans[0],
                 str(tmp_path / "again.png")])
    items = json.loads((review / "s1-a.json").read_text(encoding="utf-8"))["items"]
    assert [(it["name"], it["identity"]["card"], it["identity"]["held"]) for it in items] == \
        [("c1", "c1", None), ("c2", "c2", None), ("c3", "c3", None)], items
    again = json.loads((review / "again.json").read_text(encoding="utf-8"))["items"]
    assert all("IDENTITY_DUPLICATE" in it["flags"] for it in again) and code == 1


def test_k784_a_clean_rescan_of_the_same_card_is_no_duplicate(tmp_path: Path, monkeypatch):
    names = ["--name", "c1", "--name", "c2", "--name", "c3"]
    s1, s2 = sheets(tmp_path, "s1", 3, 3), sheets(tmp_path, "s2", 3, 3)
    monkeypatch.setattr(PairedGame, "rescans", False)
    refs = _refs_from_a_first_run(tmp_path, "tests.test_pairs_rescan:PairedGame", s1, names)
    monkeypatch.setattr(PairedGame, "rescans", True)
    monkeypatch.setattr(PairedGame, "identify_refs", str(refs))
    backs = tmp_path / "own-backs"
    backs.mkdir()
    for k in ("c1", "c2", "c3"):
        shutil.copy(tmp_path / "first" / f"{k}-b.jpg", backs / f"{k}.jpg")
    monkeypatch.setattr(PairedGame, "identify_back_refs", str(backs))
    review = tmp_path / "review"
    for scans in (s1, s2):    # the second run scans the same three cards again under their names
        main(["scan", "--plugin", "tests.test_pairs_rescan:PairedGame", "--out", str(tmp_path / "out"), "--review",
              str(review), *names, *scans])
    old = json.loads((review / "s1-a.json").read_text(encoding="utf-8"))["items"]
    new = json.loads((review / "s2-a.json").read_text(encoding="utf-8"))["items"]
    assert [it["identity"]["matches"] for it in old] == [True, True, True], old
    assert all(it.get("replacedBy") == "s2-a.png" for it in old), old
    assert [(it["identity"]["card"], it["flags"].count("IDENTITY_DUPLICATE")) for it in new] == \
        [("c1", 0), ("c2", 0), ("c3", 0)], new
