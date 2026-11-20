"""K485: YuE2 sung lyrics checked by faster-whisper (fake models, no GPU)."""
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
from audiogen.recipe import lyrics_fail, wer, words  # noqa: E402
from audiogen.spec import parse_cue  # noqa: E402

HERE = Path(__file__).resolve().parent.parent
LY = "[verse]\nTake me out, to the ball game!\n[chorus]\nDon't stop, now"


class Arr:
    def __init__(self, v):
        self.v, self.ndim = v, 1

    def __pow__(self, k):
        return Arr([x**k for x in self.v])

    def __add__(self, o):
        return Arr([a + b for a, b in zip(self.v, o.v)])

    def tolist(self):
        return self.v


class Normaliser(unittest.TestCase):
    def test_words(self):
        self.assertEqual(words(LY), ["take", "me", "out", "to", "the", "ball", "game", "dont", "stop", "now"])
        self.assertEqual(words("[Instrumental]"), [])

    def test_wer(self):
        self.assertEqual(wer(LY, "Take me out to the ball game. Dont stop now"), 0.0)
        self.assertEqual(wer("a b c d", "a x c"), 0.5)  # one substitution, one deletion
        self.assertEqual(wer("a b", ""), 1.0)
        self.assertEqual(wer("a b", "a b c d"), 1.0)  # insertions count

    def test_over_and_under_limit(self):
        self.assertEqual(lyrics_fail(-10, "take me out to the ball game dont stop now", LY, 0.5)[0], "")
        why, w = lyrics_fail(-10, "take me out to the", LY, 0.5)
        self.assertEqual(w, 0.5 + 0.0)
        self.assertEqual(why, "")  # exactly at the limit passes
        why, w = lyrics_fail(-10, "take me out", LY, 0.5)
        self.assertIn("WER 0.70 > 0.5", why)
        self.assertIn("'take me out'", why)

    def test_near_silent_fails_even_with_perfect_words(self):
        why, _ = lyrics_fail(-50, "take me out to the ball game dont stop now", LY)
        self.assertIn("near silent", why)


class SpecAndCheck(unittest.TestCase):
    def test_cue_field(self):
        c = parse_cue({"name": "a", "prompt": "p", "category": "music", "length": 1, "lyrics": "  " + LY + "\n"}, None)
        self.assertEqual(c.lyrics, LY)
        self.assertEqual(parse_cue({"name": "a", "prompt": "p", "category": "music", "length": 1}, None).lyrics, "")

    def test_payload_carries_lyrics(self):
        c = parse_cue({"name": "a", "prompt": "p", "category": "music", "length": 1, "lyrics": LY}, None)
        with tempfile.TemporaryDirectory() as t, mock.patch.object(B.subprocess, "run", return_value=mock.Mock(returncode=0)) as run:
            sent = {}

            def grab(cmd, **kw):
                sent.update(json.loads(Path(cmd[-1]).read_text()))
                return mock.Mock(returncode=0)

            run.side_effect = grab
            B.make("x", {"type": "yue2", "licence": "x", "python": sys.executable, "queue": False}, Path(t)).generate(
                [B.Job(cue=c, n=1, seed=1, seconds=1.0, out=Path(t) / "a.wav")])
        self.assertEqual(sent["items"][0]["lyrics"], LY)

    def test_check_fails_lyrics_cue_without_model_naming_install(self):
        o = {"type": "yue2", "licence": "x", "python": sys.executable, "demucsPython": sys.executable, "queue": False}
        sung = parse_cue({"name": "s", "prompt": "p", "category": "music", "length": 1, "lyrics": LY}, None)
        plain = parse_cue({"name": "i", "prompt": "p", "category": "music", "length": 1}, None)
        with tempfile.TemporaryDirectory() as t:
            be = B.make("y", {**o, "whisperModelDir": str(Path(t) / "none")}, Path(t))
            be.check([plain])
            be.check()
            with self.assertRaises(B.Skip) as e:
                be.check([plain, sung])
            self.assertIn("install.sh whisper", str(e.exception))
            self.assertIn("s", str(e.exception))
            (Path(t) / "m").mkdir()
            (Path(t) / "m" / "model.bin").write_bytes(b"x")
            B.make("y", {**o, "whisperModelDir": str(Path(t) / "m")}, Path(t)).check([sung])


ABC = 'X:1\nV:Vocal\n"C" c2 d2 e4 |\nw: la\nV:Piano\n"C" C4 E4 G8 |\n'


class SungWorker(unittest.TestCase):
    def run_worker(self, heard, vocal=0.5, lyrics=LY, tries=3, **o):
        seen = {"plans": [], "renders": [], "cmds": [], "seed": None}

        class Pipe:
            @classmethod
            def from_pretrained(cls, model, **kw):
                return cls()

            def plan(self, **kw):
                seen["plans"].append(kw)
                return types.SimpleNamespace(abc=ABC)

            def __call__(self, **kw):
                seen["renders"].append(kw)
                return types.SimpleNamespace(save=lambda p: Path(p).write_bytes(b"x"))

        def read(p):
            p = str(p)
            return (Arr([1.0] * 40) if p.endswith("no_vocals.wav") else Arr([vocal] * 40)), 20

        def run(cmd, **kw):
            if "--take" in cmd:
                job = json.loads(Path(cmd[cmd.index("--take") + 1]).read_text())
                seen["seed"] = job["seed"]
                with mock.patch.object(sys, "argv", ["w", cmd[2], "--take", cmd[-1]]):
                    code = w.main()
                assert code == 0
            elif any(str(c).endswith("whisper_transcribe.py") for c in cmd):
                seen["cmds"].append(cmd)
                text = heard[sum(1 for c in seen["cmds"] if not isinstance(c, tuple)) - 1] if isinstance(heard, list) else heard
                Path(cmd[-1]).write_text(json.dumps({"text": text}))
            elif "htdemucs" in cmd:
                seen["cmds"].append(("demucs", cmd))
                (Path(cmd[cmd.index("-o") + 1]) / "htdemucs" / Path(cmd[-1]).stem).mkdir(parents=True)
            return mock.Mock(returncode=0)

        torch = types.SimpleNamespace(cuda=types.SimpleNamespace(
            is_available=lambda: True, reset_peak_memory_stats=lambda: None, memory_allocated=lambda: 5,
            max_memory_allocated=lambda: 6, get_device_properties=lambda i: types.SimpleNamespace(total_memory=16 * 2**30)),
            set_num_threads=lambda n: None)
        mods = {"yue2": types.SimpleNamespace(__version__="0.1.6", YuE2Pipeline=Pipe), "soundfile": types.SimpleNamespace(read=read), "torch": torch}
        spec = importlib.util.spec_from_file_location("yue2_worker", HERE / "workers" / "yue2_worker.py")
        w = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(w)
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            (t / "job.json").write_text(json.dumps({
                "options": {"modelDir": str(t / "none"), "tries": tries, **o}, "result": str(t / "r.json"),
                "items": [{"out": str(t / "o" / "a.wav"), "prompt": "style", "seconds": 20, "seed": 1000, "label": "a#1", "lyrics": lyrics}]}))
            with mock.patch.object(sys, "argv", ["w", str(t / "job.json")]), mock.patch.dict(sys.modules, mods), \
                    mock.patch.object(w.subprocess, "run", run), mock.patch.object(w.recipe, "oom_kills", lambda: 0), \
                    mock.patch.object(w.recipe, "mem_available_gib", lambda: 100.0):
                code = w.main()
            res = json.loads((t / "r.json").read_text())["items"]
            return code, seen, res, (t / "o" / "a.wav").exists()

    def test_keeps_vocal_sends_lyrics_skips_instrumental_gate(self):
        code, seen, res, made = self.run_worker("take me out to the ball game dont stop now")
        self.assertEqual((code, made), (0, True))
        self.assertEqual({p["lyrics"] for p in seen["plans"] + seen["renders"]}, {LY})
        self.assertEqual(seen["renders"][0]["abc"], ABC)  # the Vocal voice is not turned to rests
        self.assertEqual(len(seen["plans"]), 1)
        t = res[0]["extra"]["tried"][0]
        self.assertEqual((t["wer"], t["heard"]), (0.0, "take me out to the ball game dont stop now"))
        self.assertNotIn("loudWindows", t)  # the instrumental gate numbers are not used (vocal 0.5 would fail it)
        self.assertFalse(res[0]["extra"]["failedGate"])

    def test_whisper_is_its_own_cuda_step_after_demucs(self):
        _, seen, _, _ = self.run_worker("take me out to the ball game dont stop now")
        self.assertEqual([c[0] if isinstance(c, tuple) else "whisper" for c in seen["cmds"]], ["demucs", "whisper"])
        wc = seen["cmds"][1]
        self.assertEqual(wc[:3], ["nice", "-n", "19"])
        self.assertTrue(wc[4].endswith("whisper_transcribe.py"))

    def test_over_limit_takes_next_seed_and_reason_names_heard_and_wer(self):
        code, seen, res, made = self.run_worker(["take me out", "take me out to the ball game dont stop now"])
        self.assertEqual([p["seed"] for p in seen["plans"]], [1000, 8919])
        tr = res[0]["extra"]["tried"]
        self.assertIn("WER 0.70 > 0.5", tr[0]["reason"])
        self.assertIn("take me out", tr[0]["reason"])
        self.assertEqual((res[0]["seed"], tr[1]["reason"], res[0]["extra"]["failedGate"]), (8919, "", False))

    def test_lyrics_max_wer_option(self):
        _, _, res, _ = self.run_worker("take me out", lyricsMaxWer=0.9)
        self.assertEqual(len(res[0]["extra"]["tried"]), 1)

    def test_near_silent_stem_fails_every_seed_best_kept_marked(self):
        code, seen, res, made = self.run_worker("take me out to the ball game dont stop now", vocal=0.001)
        self.assertEqual(len(res[0]["extra"]["tried"]), 3)
        self.assertIn("near silent", res[0]["extra"]["tried"][0]["reason"])
        self.assertTrue(res[0]["extra"]["failedGate"])
        self.assertTrue(made)

    def test_instrumental_cue_unchanged(self):
        code, seen, res, made = self.run_worker("never read", lyrics="", vocal=0.001)
        self.assertEqual(seen["cmds"][0][0], "demucs")
        self.assertEqual(len(seen["cmds"]), 1)  # no whisper
        self.assertEqual({p["lyrics"] for p in seen["plans"]}, {"[Instrumental]"})
        self.assertIn('"C"z16|', seen["renders"][0]["abc"])
        self.assertIn("loudWindows", res[0]["extra"]["tried"][0])


if __name__ == "__main__":
    unittest.main()
