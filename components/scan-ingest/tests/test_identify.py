"""K784 scanpipe/identify.py: which built card image a crop shows (hash at 4 turns, then SIFT + RANSAC inliers), the
paired-back check, and the plug-in wiring (identify_refs, off by default). Synthetic faces and sheets only."""
import json
import shutil
from pathlib import Path

import cv2

from scanpipe import identify
from scanpipe.__main__ import main
from scanpipe.plugins.contract import problems
from tests.fake_game import FakeGame
from tests.synth_faces import face, scanned
from tests.test_pairs_rescan import PairedGame, sheets

REFS = {f"c{k}": face(k) for k in range(6)}


def test_k784_identifies_the_face_and_the_turn_that_reads_like_it():
    refs = identify.Refs(REFS)
    for k, turn in [(0, 0), (1, 90), (2, 180), (3, 270), (4, 90)]:
        r = identify.identify(scanned(REFS[f"c{k}"], turn, seed=k), refs)
        assert (r["ref"], r["ambiguous"]) == (f"c{k}", False), r
        assert r["inliers"] >= 30 and r["confidence"] > 0.5 and r["runnerUp"] != r["ref"]
        assert r["turn"] == (360 - turn) % 360, r     # turning the crop by this reads like the reference


def test_k784_ambiguous_when_two_refs_are_alike_or_nothing_matches():
    r = identify.identify(scanned(REFS["c0"], 0), {"a": REFS["c0"], "b": REFS["c0"].copy(), "c": REFS["c1"]})
    assert r["ambiguous"] and {r["ref"], r["runnerUp"]} == {"a", "b"}
    r = identify.identify(face(99), REFS)
    assert r["ambiguous"] and r["inliers"] < 40


def test_k784_a_paired_back_is_checked_against_its_front():
    backs = {"blue": face(50), "red": face(51)}
    crop = scanned(backs["red"], 180)
    assert identify.check_back("c1", crop, backs, {"c1": "red"})["matches"] is True
    assert identify.check_back("c1", crop, backs, {"c1": ["blue"]})["matches"] is False
    assert identify.check_back("red", crop, backs)["matches"] is True       # no map: the back ref has the front's id
    assert identify.check_back("c9", crop, backs, {"c1": "red"})["matches"] is None


def test_k784_cli_identifies_a_folder_of_crops(tmp_path: Path):
    (tmp_path / "refs").mkdir()
    (tmp_path / "crops").mkdir()
    for k, img in REFS.items():
        cv2.imwrite(str(tmp_path / "refs" / f"{k}.png"), img)
    cv2.imwrite(str(tmp_path / "crops" / "x.jpg"), scanned(REFS["c2"], 90))
    assert main(["identify", str(tmp_path / "crops"), "--refs", str(tmp_path / "refs"), "--json",
                 str(tmp_path / "r.json")]) == 0
    assert json.loads((tmp_path / "r.json").read_text(encoding="utf-8"))["x.jpg"]["ref"] == "c2"
    cv2.imwrite(str(tmp_path / "crops" / "y.jpg"), face(98))
    assert main(["identify", str(tmp_path / "crops"), "--refs", str(tmp_path / "refs")]) == 1


def test_k784_off_by_default_and_checked():
    g = FakeGame()
    assert (g.identify_refs, g.back_map) == (None, {}) and problems(PairedGame()) == []
    bad = PairedGame()
    bad.identify_refs, bad.back_map, bad.identify_min_inliers = 5, {"a": 1}, 0
    found = problems(bad)
    assert all(any(p.startswith(a) for p in found) for a in ("identify_refs", "back_map", "identify_min_inliers"))


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
    monkeypatch.setattr(PairedGame, "identify_back_refs", [str(backs)])
    monkeypatch.setattr(PairedGame, "back_map", {"c1": "classic", "c2": "classic", "c3": "other"})
    review2 = tmp_path / "review2"
    main(["scan", "--plugin", "tests.test_pairs_rescan:PairedGame", "--out", str(tmp_path / "second"), "--review",
          str(review2), *names, *scans])
    front = json.loads((review2 / "s1-a.json").read_text(encoding="utf-8"))["items"]
    back = json.loads((review2 / "s1-b.json").read_text(encoding="utf-8"))["items"]
    assert [(it["name"], it["identity"]["ref"], it["identity"]["ambiguous"]) for it in front] == \
        [("c1", "c1", False), ("c2", "c2", False), ("c3", "c3", False)], front
    assert [("BACK_IDENTITY_MISMATCH" in it["flags"]) for it in front] == [False, False, True]
    assert sorted((b["pairOf"], b["identity"]["ref"], b["identity"]["matches"]) for b in back) == \
        [("c1", "classic", True), ("c2", "classic", True), ("c3", "classic", False)]
