"""K461: each backend (Kokoro) configured by its own docs, with fake modules."""
import importlib.util
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

HERE = Path(__file__).resolve().parent.parent


def load(name, rel):
    spec = importlib.util.spec_from_file_location(name, HERE / rel)
    w = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(w)
    return w


def fake_torch():
    return types.SimpleNamespace(
        cuda=types.SimpleNamespace(is_available=lambda: True, reset_peak_memory_stats=lambda: None,
                                   memory_allocated=lambda: 5, max_memory_allocated=lambda: 6),
        set_num_threads=lambda n: None, float16="f16", Generator=lambda d: types.SimpleNamespace(manual_seed=lambda s: s))


class CutToCueLength(unittest.TestCase):
    def cut(self, mode):  # a take made at 10 s for a 4 s cue comes back 4 s (post.clean: atrim for one-shots, loop_seam for loops)
        from audiogen import post as P
        from audiogen.spec import Category, parse_cue
        if not P.have_ffmpeg():
            self.skipTest("no ffmpeg")
        c = parse_cue({"name": "a", "prompt": "p", "category": "music", "length": 4, "mode": mode}, None)
        with tempfile.TemporaryDirectory() as t:
            src, dst = Path(t) / "s.wav", Path(t) / "d.wav"
            P.ff("-f", "lavfi", "-i", "sine=frequency=440:duration=10", "-ar", "48000", str(src))
            P.clean(src, dst, c, Category(name="c", kind="music", lufs=-20, trim_silence=False, fade_in_ms=0, fade_out_ms=0), 48000, 1)
            return P.duration(dst)

    def test_one_shot_is_cut_to_length(self):
        self.assertAlmostEqual(self.cut("oneshot"), 4.0, delta=0.01)

    def test_loop_is_cut_to_length(self):
        self.assertAlmostEqual(self.cut("loop"), 4.0, delta=0.01)


class np:
    class L(list):
        def max(self):
            return max(self)

    @staticmethod
    def asarray(x):
        return np.L(x)

    @staticmethod
    def concatenate(xs):
        return np.L(v for x in xs for v in x)

    @staticmethod
    def abs(a):
        return np.L(abs(v) for v in a)


class KokoroVoice(unittest.TestCase):
    def run_gen(self, voices):
        made, said = [], []

        class KPipeline:
            def __init__(self, lang_code, repo_id=None, model=True, device=None):
                self.model = model if model is not True else object()
                made.append({"lang": lang_code, "repo": repo_id, "device": device, "model": self.model})
                self.lang = lang_code

            def __call__(self, text, voice=None, speed=1):
                said.append((self.lang, voice))
                yield "g", "p", np.L([0.5] * 12000)

        mods = {"torch": fake_torch(), "numpy": np, "soundfile": types.SimpleNamespace(write=lambda *a, **k: None),
                "kokoro": types.SimpleNamespace(KPipeline=KPipeline)}
        from audiogen import voice as V
        table = {"kinds": {"k": {"voices": voices}}, "lines": [{"id": "a", "text": "hi", "kind": "k"}]}
        with tempfile.TemporaryDirectory() as t, mock.patch.dict(sys.modules, mods), mock.patch.object(V.os, "nice", lambda n: 0):
            V.generate(table, Path(t))
        return made, said

    def test_language_follows_the_voice_prefix(self):  # kokoro README: one KPipeline per language; af_/am_ = 'a', bf_/bm_ = 'b'
        made, said = self.run_gen(["af_heart", "bf_emma", "am_adam"])
        self.assertEqual(said, [("a", "af_heart"), ("b", "bf_emma"), ("a", "am_adam")])
        self.assertEqual([m["lang"] for m in made], ["a", "b"])

    def test_repo_pinned_and_one_model_shared(self):  # a KModel is reused across pipelines
        made, _ = self.run_gen(["af_heart", "bf_emma"])
        self.assertEqual(len(made), 2)
        for m in made:
            self.assertEqual((m["repo"], m["device"]), ("hexgrad/Kokoro-82M", "cuda"))
        self.assertIs(made[0]["model"], made[1]["model"])


class KokoroInstall(unittest.TestCase):
    def test_kokoro_pinned(self):  # the version whose source was read
        sh = (HERE / "install" / "install.sh").read_text()
        self.assertIn("kokoro==0.9.4", sh)


if __name__ == "__main__":
    unittest.main()
