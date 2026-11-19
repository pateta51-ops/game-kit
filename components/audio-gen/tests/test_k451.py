"""K451: Stable Audio 3 and YuE2 defaults, the YuE2 instrumental recipe (7th Inning Stretch round6i), with fakes."""
import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from audiogen import backends as B  # noqa: E402
from audiogen.recipe import measure, novocal, passes, seeds  # noqa: E402
from audiogen.spec import Category, parse_cue, resolve_backend  # noqa: E402

HERE = Path(__file__).resolve().parent.parent
ABC = """X:1
V:Vocal
"C" c2 d2 e4 | z16 | "G" G8 A8 |
w: la la la
V:Piano
"C" C4 E4 G8 | c16 |
"""


class Yue2Recipe(unittest.TestCase):
    def test_vocal_voice_becomes_rests(self):
        abc, n = novocal(ABC)
        lines = abc.split("\n")
        self.assertEqual(n, 2)
        self.assertEqual(lines[2], '"C"z16|z16|"G"z16|')
        self.assertEqual(lines[3], "w: la la la")
        self.assertEqual(lines[5], '"C" C4 E4 G8 | c16 |')

    def test_gate_math(self):
        mix = [1.0] * 400
        self.assertEqual(measure([0.001] * 400, mix, 10), (-30.0, 0.0))
        db, fr = measure([0.001] * 390 + [1.0] * 10, mix, 10)  # one loud window of 40: 2.5 %
        self.assertEqual(fr, 0.025)
        self.assertGreater(db, -25.0)
        self.assertTrue(passes(-25.0, 0.03))
        self.assertFalse(passes(-24.9, 0.0))
        self.assertFalse(passes(-40.0, 0.031))

    def test_seeds(self):
        self.assertEqual(seeds(100, 3), [100, 8019, 15938])


def cat(kind, backend=None):
    return Category(name="x", kind=kind, lufs=-20, true_peak=-1, channels=1, backend=backend)


class Defaults(unittest.TestCase):
    def test_kind_defaults(self):
        c = parse_cue({"name": "a", "prompt": "p", "category": "x", "length": 1}, None)
        self.assertEqual(resolve_backend(c, cat("sfx"), None), "sa3")
        self.assertEqual(resolve_backend(c, cat("music"), None), "yue2")
        self.assertEqual(resolve_backend(c, cat("music", "ace"), None), "ace")
        self.assertEqual(resolve_backend(c, cat("sfx"), "sao"), "sao")

    def test_example_config(self):
        cfg = json.loads((HERE / "example" / "config.json").read_text())
        kinds = {k: cfg["backends"][v["backend"]]["type"] for k, v in cfg["categories"].items()}
        self.assertEqual(kinds, {"quiet": "stable-audio-3", "normal": "stable-audio-3", "loud": "stable-audio-3", "music": "yue2"})
        y = cfg["backends"]["yue2"]
        self.assertEqual((y["revision"], y["version"], y["licence"][:12]), ("8f24312f", "0.1.6", "CC BY-NC 4.0"))
        made = {n: type(B.make(n, o, Path("."))).__name__ for n, o in cfg["backends"].items()}
        self.assertEqual(made, {"sa3": "StableAudio3", "yue2": "YuE2", "ace-xl": "AceStep", "sao": "StableAudioOpen", "ace": "AceStep"})
        self.assertEqual((cfg["backends"]["ace-xl"]["model"], cfg["backends"]["ace"]["model"]), ("acestep-v15-xl-sft", "acestep-v15-turbo"))

    def test_new_workers_start_under_nice(self):
        c = parse_cue({"name": "a", "prompt": "p", "category": "music", "length": 1}, None)
        for kind, script in (("stable-audio-3", "stable_audio_3_worker.py"), ("yue2", "yue2_worker.py")):
            with tempfile.TemporaryDirectory() as t, mock.patch.object(B.subprocess, "run", return_value=mock.Mock(returncode=0)) as run:
                B.make("x", {"type": kind, "licence": "x", "python": sys.executable}, Path(t)).generate(
                    [B.Job(cue=c, n=1, seed=1, seconds=1.0, out=Path(t) / "a.wav")])
            cmd = run.call_args[0][0]
            self.assertEqual(cmd[:3], ["nice", "-n", "19"])
            self.assertTrue(cmd[4].endswith(script))

    def test_yue2_needs_demucs(self):
        with self.assertRaises(B.Skip):
            B.make("y", {"type": "yue2", "licence": "x", "python": sys.executable, "demucsPython": "/nope/python"}, Path(".")).check()
        B.make("y", {"type": "yue2", "licence": "x", "python": sys.executable, "demucsPython": sys.executable}, Path(".")).check()


class Arr:
    def __init__(self, v):
        self.v, self.ndim = v, 1

    def __pow__(self, k):
        return Arr([x**k for x in self.v])

    def __add__(self, o):
        return Arr([a + b for a, b in zip(self.v, o.v)])

    def tolist(self):
        return self.v


class Yue2Worker(unittest.TestCase):
    def run_worker(self, version="0.1.6", cuda=True):
        seen = {"calls": [], "demucs": []}

        class Pipe:
            @classmethod
            def from_pretrained(cls, model, **kw):
                seen["load"] = (model, kw)
                return cls()

            def plan(self, **kw):
                seen["calls"].append(("plan", kw))
                return types.SimpleNamespace(abc=ABC)

            def __call__(self, **kw):
                seen["calls"].append(("render", kw))
                return types.SimpleNamespace(save=lambda p: Path(p).write_bytes(b"x"))

        def read(p):  # the first seed sings, the second (8919) does not
            p = str(p)
            if p.endswith("no_vocals.wav"):
                return Arr([1.0] * 40), 20
            return Arr([0.001 if "8919" in p else 1.0] * 40), 20

        def demucs(cmd, **kw):
            seen["demucs"].append(cmd)
            return mock.Mock(returncode=0)

        torch = types.SimpleNamespace(cuda=types.SimpleNamespace(
            is_available=lambda: cuda, reset_peak_memory_stats=lambda: None, memory_allocated=lambda: 5,
            max_memory_allocated=lambda: 6), set_num_threads=lambda n: None)
        mods = {"yue2": types.SimpleNamespace(__version__=version, YuE2Pipeline=Pipe), "soundfile": types.SimpleNamespace(read=read), "torch": torch}
        spec = importlib.util.spec_from_file_location("yue2_worker", HERE / "workers" / "yue2_worker.py")
        w = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(w)
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            (t / "job.json").write_text(json.dumps({
                "options": {"modelDir": str(t / "none"), "tries": 3}, "result": str(t / "r.json"),
                "items": [{"out": str(t / "o" / "a.wav"), "prompt": "calm ballpark organ", "seconds": 20, "seed": 1000, "label": "a#1"}]}))
            with mock.patch.object(sys, "argv", ["w", str(t / "job.json")]), mock.patch.dict(sys.modules, mods), \
                    mock.patch.object(w.subprocess, "run", demucs):
                try:
                    code = w.main()
                except SystemExit as e:
                    code = e.code
            res = json.loads((t / "r.json").read_text())["items"] if (t / "r.json").exists() else []
            return code, seen, res, (t / "o" / "a.wav").exists()

    def test_recipe_and_next_seed(self):
        code, seen, res, made = self.run_worker()
        self.assertEqual(code, 0)
        self.assertTrue(made)
        self.assertEqual(seen["load"], ("m-a-p/YuE2-3B", {"revision": "8f24312f", "device": "cuda"}))
        plans = [kw for k, kw in seen["calls"] if k == "plan"]
        renders = [kw for k, kw in seen["calls"] if k == "render"]
        self.assertEqual([p["seed"] for p in plans], [1000, 8919])
        self.assertEqual({(p["lyrics"], p["cot"]) for p in plans + renders}, {("[Instrumental]", "full")})
        self.assertIn('"C"z16|z16|"G"z16|', renders[0]["abc"])
        self.assertEqual(res[0]["seed"], 8919)
        self.assertEqual([x["vocalDb"] > -25 for x in res[0]["extra"]["tried"]], [True, False])
        d = seen["demucs"][0]
        self.assertEqual((d[:3], d[d.index("-d") + 1], d[d.index("-n", 3) + 1], "--two-stems=vocals" in d),
                         (["nice", "-n", "19"], "cuda", "htdemucs", True))

    def test_pinned_version_and_no_cuda(self):
        self.assertEqual(self.run_worker(version="0.1.5")[0], 3)
        self.assertEqual(self.run_worker(cuda=False)[0], 3)
