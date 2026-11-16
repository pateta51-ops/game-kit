"""The plug-in contract: what ``--plugin module:Class`` accepts, and what a game's plug-in must provide
(scanpipe/plugins/contract.py, which a game runs on its own plug-in)."""
from pathlib import Path

import pytest

from scanpipe.plugins import get
from scanpipe.plugins.base import Orientation, Plugin
from scanpipe.plugins.contract import problems
from tests.fake_game import FakeGame, FakeTiles


class NotAPlugin:
    item_sizes_mm = {"card": (63.0, 88.0)}


class Broken(Plugin):
    def __init__(self):
        raise RuntimeError("sizes.json is missing")


def test_a_plug_in_is_loaded_by_module_and_class():
    assert isinstance(get("tests.fake_game:FakeGame"), FakeGame)


@pytest.mark.parametrize("spec", ["tests.test_plugin_contract:NotAPlugin", "tests.fake_game:magenta_share",
                                  "tests.fake_game:TOKEN_TOLERANCE_MM", "scanpipe.plugins.base:Orientation"])
def test_a_class_that_is_not_a_plugin_subclass_is_refused(spec):
    with pytest.raises(SystemExit) as e:
        get(spec)
    assert spec in str(e.value) and "not a subclass of scanpipe.plugins.base.Plugin" in str(e.value)


def test_a_constructor_error_is_a_clear_message_not_a_traceback():
    with pytest.raises(SystemExit) as e:
        get("tests.test_plugin_contract:Broken")
    msg = str(e.value)
    assert "tests.test_plugin_contract:Broken" in msg and "could not be created" in msg
    assert "RuntimeError: sizes.json is missing" in msg


@pytest.mark.parametrize("spec", ["no_such_module:X", "tests.fake_game:NoSuchClass", "tests.fake_game", ""])
def test_a_spec_that_names_nothing_says_how_to_give_one(spec):
    with pytest.raises(SystemExit) as e:
        get(spec)
    assert "Cannot load plug-in" in str(e.value) and "module:Class" in str(e.value)


@pytest.mark.parametrize("cls", [FakeGame, FakeTiles])
def test_the_fake_games_keep_the_contract(cls):
    assert problems(cls()) == []


def test_the_bare_base_class_is_not_a_game():
    got = problems(Plugin())
    assert any(x.startswith("name") for x in got) and any(x.startswith("item_sizes_mm") for x in got)


def test_each_broken_promise_is_named():
    class Bad(FakeGame):
        name = "bad"
        item_sizes_mm = {**FakeGame.item_sizes_mm, "wide": (90.0, 60.0)}
        shaped_kinds = frozenset({"ghost"})
        printed_edge_kinds = frozenset({"card"})
        card_kind = "poker"
        jpeg_quality = 0

        def orient(self, crop, kind):
            return Orientation(45, True, "tilted")

        def default_out(self, project):
            return Path("/elsewhere")

        def file_for(self, out_dir, name, ext):
            return out_dir / "same.png"

        def preflight(self, project, names, scans):
            return None

    got = "\n".join(problems(Bad()))
    for want in ("item_sizes_mm['wide']", "shaped_kinds: 'ghost'", "printed_edge_kinds: 'card' is not in thick_kinds",
                 "card_kind: 'poker'", "jpeg_quality", "orient(", "default_out", "file_for: a .jpg",
                 "file_for: two names", "preflight"):
        assert want in got, (want, got)


def test_a_thin_kind_cannot_also_be_thick():
    class Both(FakeGame):
        name = "both"
        thick_kinds = {**FakeGame.thick_kinds, "card": 2.0}

    assert any("both cast_kinds" in x for x in problems(Both()))
