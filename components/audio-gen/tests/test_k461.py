"""K461: each backend (Stable Audio Open, ACE-Step, Kokoro) configured by its own docs, with fake modules."""
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


class SaoInstall(unittest.TestCase):
    def test_install_has_torchsde(self):  # diffusers' CosineDPMSolverMultistepScheduler (the model's own) imports torchsde
        sh = (HERE / "install" / "install.sh").read_text()
        block = sh[sh.index("if has sao"):sh.index("if has ace")]
        self.assertIn("torchsde", block)


class SaoWorker(unittest.TestCase):
    def run_worker(self, opts, seconds):
        seen = {}

        class Audio:
            def __getitem__(self, i):
                return types.SimpleNamespace(T=types.SimpleNamespace(float=lambda: types.SimpleNamespace(cpu=lambda: types.SimpleNamespace(numpy=lambda: 0))))

        class Pipe:
            vae = types.SimpleNamespace(sampling_rate=44100)

            @classmethod
            def from_pretrained(cls, model, **kw):
                seen["load"] = kw
                return cls()

            def to(self, d):
                return self

            def __call__(self, prompt, **kw):
                seen["call"] = kw
                return types.SimpleNamespace(audios=Audio())

        mods = {"torch": fake_torch(), "soundfile": types.SimpleNamespace(write=lambda *a, **k: None),
                "huggingface_hub": types.SimpleNamespace(get_token=lambda: "t"), "diffusers": types.SimpleNamespace(StableAudioPipeline=Pipe)}
        w = load("sao_worker", "workers/stable_audio_open_worker.py")
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            (t / "job.json").write_text(json.dumps({"options": opts, "result": str(t / "r.json"), "items": [
                {"out": str(t / "a.wav"), "prompt": "p", "seconds": seconds, "seed": 1, "label": "a#1"}]}))
            with mock.patch.object(sys, "argv", ["w", str(t / "job.json")]), mock.patch.dict(sys.modules, mods):
                self.assertEqual(w.main(), 0)
            self.assertNotIn("error", json.loads((t / "r.json").read_text())["items"][0])
        return seen

    def test_model_card_defaults(self):  # model card / stable-audio-tools: 100 steps, cfg 7, fp16 as the diffusers example, up to 47 s
        s = self.run_worker({}, 60)
        self.assertEqual((s["call"]["num_inference_steps"], s["call"]["guidance_scale"], s["call"]["audio_end_in_s"]), (100, 7.0, 47.0))
        self.assertEqual(s["load"]["torch_dtype"], "f16")


class AceWorker(unittest.TestCase):
    def params(self, model, seconds=30, **opts):
        seen = {}

        class Handler:
            def initialize_service(self, **kw):
                self.vae = types.SimpleNamespace(decode=lambda z: "wav")
                return "", True

        def music(dit, llm, params, cfg, save_dir):
            seen["p"] = params
            p = Path(save_dir) / "x.wav"
            p.write_bytes(b"x")
            return types.SimpleNamespace(success=True, audios=[{"path": str(p), "params": {"seed": 1}}], error=None)

        mods = {"torch": fake_torch(), "acestep": types.ModuleType("acestep"), "acestep.handler": types.SimpleNamespace(AceStepHandler=Handler),
                "acestep.inference": types.SimpleNamespace(GenerationConfig=lambda **k: None, generate_music=music, GenerationParams=lambda **k: k),
                "acestep.llm_inference": types.SimpleNamespace(LLMHandler=lambda: None),
                "acestep.model_downloader": types.SimpleNamespace(
                    check_main_model_exists=lambda c: True, check_model_exists=lambda m, c: True, ensure_dit_model=None,
                    ensure_lm_model=None, ensure_main_model=None, get_checkpoints_dir=lambda: "ckpt")}
        w = load("acestep_worker", "workers/acestep_worker.py")
        cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            (t / "repo" / "acestep").mkdir(parents=True)
            (t / "job.json").write_text(json.dumps({"options": {"repo": str(t / "repo"), "model": model, **opts}, "result": str(t / "r.json"),
                                                    "items": [{"out": str(t / "a.wav"), "prompt": "p", "seconds": seconds, "seed": 1, "label": "a#1"}]}))
            try:
                with mock.patch.object(sys, "argv", ["w", str(t / "job.json")]), mock.patch.dict(sys.modules, mods):
                    self.assertEqual(w.main(), 0)
            finally:
                os.chdir(cwd)
            self.result = json.loads((t / "r.json").read_text())["items"][0]
        return seen.get("p")

    def test_turbo_shift_3(self):  # docs/en/INFERENCE.md: "set shift=3.0 for turbo" (not auto-corrected)
        self.assertEqual(self.params("acestep-v15-turbo")["shift"], 3.0)
        self.assertEqual(self.params("acestep-v15-xl-turbo")["shift"], 3.0)
        self.assertEqual(self.params("acestep-v15-turbo", shift=2)["shift"], 2.0)

    def test_base_and_sft_keep_shift_default(self):  # the table's defaults (shift 1.0, cfg 7.0, 50 steps) are for base/SFT
        for m in ("acestep-v15-sft", "acestep-v15-xl-sft", "acestep-v15-xl-base"):
            p = self.params(m)
            self.assertNotIn("shift", p)
            self.assertEqual((p["inference_steps"], p["guidance_scale"]), (50, 7.0))

    def test_duration_limits(self):  # duration is 10 to 600 s: under 10 is made at 10 (cut later), over 600 fails the item
        self.assertEqual(self.params("acestep-v15-turbo", seconds=4)["duration"], 10.0)
        self.assertEqual(self.params("acestep-v15-turbo", seconds=45)["duration"], 45.0)
        self.assertEqual(self.params("acestep-v15-turbo", seconds=600)["duration"], 600.0)
        self.assertIsNone(self.params("acestep-v15-turbo", seconds=900))
        self.assertIn("600", self.result["error"])
        self.assertIn("10 to 600", self.result["error"])


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
