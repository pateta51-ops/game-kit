"""No GPU needed: python3 -m unittest discover -s components/picture-upscale/tests"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import upscale as U  # noqa: E402

try:
    import numpy as np
except ImportError:
    np = None


def cli(*argv, env=None):
    err, out = io.StringIO(), io.StringIO()
    old = dict(os.environ)
    os.environ.update(env or {})
    code = 0
    try:
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(out):
            try:
                code = U.main(list(argv))
            except SystemExit as e:
                code = e.code
    finally:
        os.environ.clear()
        os.environ.update(old)
    return code, out.getvalue(), err.getvalue()


class Tiles(unittest.TestCase):
    def test_starts_cover_and_end_at_edge(self):
        s = U.tile_starts(1000, 256, 32)
        self.assertEqual(s[0], 0)
        self.assertEqual(s[-1] + 256, 1000)
        for a, b in zip(s, s[1:]):
            self.assertGreaterEqual(a + 256 - b, 32)

    def test_small_picture_is_one_tile(self):
        self.assertEqual(U.tile_starts(100, 256, 32), [0])

    def test_target_size(self):
        self.assertEqual(U.target_size(2000, 1000, 3, None), (6000, 3000))
        self.assertEqual(U.target_size(2000, 1000, None, 3400), (3400, 1700))


@unittest.skipIf(np is None, "numpy missing")
class Blend(unittest.TestCase):
    def gradient(self, h=70, w=90):
        y, x = np.mgrid[0:h, 0:w].astype(np.float32)
        return np.stack([x / w, y / h, (x + y) / (w + h)], axis=2)

    def test_identity_model_is_seamless(self):
        g = self.gradient()
        out = U.blend_tiles(g, lambda t: t, 1, 32, 8)
        self.assertEqual(out.shape, g.shape)
        self.assertLess(float(np.abs(out - g).max()), 1e-5)

    def test_2x_model_is_seamless_on_gradient(self):
        g = self.gradient()
        out = U.blend_tiles(g, lambda t: t.repeat(2, axis=0).repeat(2, axis=1), 2, 32, 8)
        self.assertEqual(out.shape, (140, 180, 3))
        self.assertLess(float(np.abs(out - g.repeat(2, axis=0).repeat(2, axis=1)).max()), 1e-5)

    def test_blend_hides_a_seam(self):
        # a model whose tile output is off by a tile-dependent bias: the blend must change smoothly, not jump
        g = np.zeros((64, 128, 1), dtype=np.float32)
        calls = []

        def biased(t):
            calls.append(1)
            return t + 0.1 * len(calls)

        out = U.blend_tiles(g, biased, 1, 64, 32)
        step = float(np.abs(np.diff(out[32, :, 0])).max())
        self.assertLess(step, 0.1 * 0.2)


class Cli(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.TemporaryDirectory()
        self.p = Path(self.d.name)
        (self.p / "a.png").write_bytes(b"not read before the GPU check")

    def tearDown(self):
        self.d.cleanup()

    def reg(self, **model):
        f = self.p / "models.json"
        f.write_text(json.dumps({"default": "m", "models": {"m": {"file": "m.pth", "url": "u", "sha256": "x", **model}}}))
        return str(f)

    def test_no_cuda_exits_3_and_writes_nothing(self):
        out = self.p / "out"
        code, _, err = cli("run", "--in", str(self.p / "a.png"), "--out", str(out), "--scale", "2",
                           env={"PICTURE_UPSCALE_NO_CUDA": "1"})
        self.assertEqual(code, 3)
        self.assertIn("no CPU fallback", err)
        self.assertFalse(out.exists())

    def test_model_without_licence_is_refused(self):
        for lic in ({}, {"licence": ""}, {"licence": "  "}):
            code, _, err = cli("run", "--in", str(self.p / "a.png"), "--out", str(self.p / "o"),
                               "--registry", self.reg(**lic), env={"PICTURE_UPSCALE_NO_CUDA": "1"})
            self.assertEqual(code, 2)
            self.assertIn("no licence", err)

    def test_check_refuses_licenceless_and_unfetched(self):
        code, _, err = cli("check", "--in", str(self.p / "a.png"), "--registry", self.reg())
        self.assertEqual(code, 2)
        code, _, err = cli("check", "--in", str(self.p / "a.png"), "--registry", self.reg(licence="MIT"), "--models-dir", str(self.p))
        self.assertEqual(code, 2)
        self.assertIn("not fetched", err)
        (self.p / "m.pth").write_bytes(b"w")
        code, out, _ = cli("check", "--in", str(self.p / "a.png"), "--registry", self.reg(licence="MIT"), "--models-dir", str(self.p))
        self.assertEqual(code, 0)
        self.assertIn("ok", out)

    def test_unknown_model_and_bad_arguments(self):
        a = str(self.p / "a.png")
        self.assertEqual(cli("check", "--in", a, "--model", "nope")[0], 2)
        self.assertEqual(cli("check", "--in", a, "--scale", "5")[0], 2)
        self.assertEqual(cli("check", "--in", a, "--scale", "2", "--width", "100")[0], 2)
        self.assertEqual(cli("check", "--in", a, "--tile", "128", "--overlap", "64")[0], 2)
        self.assertEqual(cli("check", "--in", str(self.p / "missing.png"))[0], 2)

    def test_optin_model_needs_the_flag(self):
        a = str(self.p / "a.png")
        r = self.reg(licence="CC-BY-NC-SA-4.0", optIn=True)
        code, _, err = cli("check", "--in", a, "--registry", r)
        self.assertEqual(code, 2)
        self.assertIn("--allow-noncommercial", err)


class Registry(unittest.TestCase):
    def test_every_shipped_model_has_licence_url_sha(self):
        reg = U.load_registry(None)
        self.assertIn(reg["default"], reg["models"])
        self.assertEqual(set(reg["models"]), {"nomos2-hq-dat2"})
        for n, e in reg["models"].items():
            for k in ("file", "url", "sha256", "licence"):
                self.assertTrue(e.get(k), f"{n} {k}")
            self.assertEqual(len(e["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
