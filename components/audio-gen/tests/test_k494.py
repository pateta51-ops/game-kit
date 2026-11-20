"""K494: a YuE2 take whose child prints no progress for stallSecs is killed and fails; the next seed goes on."""
import contextlib
import importlib.util
import io
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_k485 import HERE, LY, SungWorker  # noqa: E402

spec = importlib.util.spec_from_file_location("yue2_worker_k494", HERE / "workers" / "yue2_worker.py")
W = importlib.util.module_from_spec(spec)
spec.loader.exec_module(W)

HANG = "import time\nprint('Running Planning score: 667 tokens', flush=True)\ntime.sleep(60)\n"
BUSY = "import time\nfor i in range(8):\n    print('step', i, flush=True)\n    time.sleep(0.4)\n"


def script(t, src):
    p = Path(t) / "child.py"
    p.write_text(src)
    return [sys.executable, str(p)]


class Stall(unittest.TestCase):
    def test_silent_child_is_killed(self):
        with tempfile.TemporaryDirectory() as t:
            t0 = time.time()
            with self.assertRaises(W.TakeStalled) as e:
                W.run_take(script(t, HANG), None, 1)
            self.assertLess(time.time() - t0, 20)
            self.assertIn("stalled: no progress for 1 s", str(e.exception))

    def test_child_that_keeps_printing_passes(self):
        with tempfile.TemporaryDirectory() as t:
            t0 = time.time()
            W.run_take(script(t, BUSY), None, 1)
            self.assertGreater(time.time() - t0, 2.5)  # longer than stallSecs, never silent for it

    def test_zero_turns_the_watch_off(self):
        with tempfile.TemporaryDirectory() as t:
            W.run_take(script(t, "import time\nprint('x', flush=True)\ntime.sleep(2)\n"), None, 0)


class StallInWorker(unittest.TestCase):
    run_worker = SungWorker.run_worker

    def wrap(self, bad_first):
        n = [0]

        def wrap(w, run):
            def take(cmd, env, stall):
                n[0] += 1
                if n[0] <= bad_first:
                    with tempfile.TemporaryDirectory() as t:
                        return w.run_take(script(t, HANG), env, stall)
                return run(cmd, env=env, check=True)
            return take
        return wrap

    def test_stalled_take_fails_and_next_seed_runs(self):  # K494
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            code, seen, res, made = self.run_worker("take me out to the ball game dont stop now", wrap=self.wrap(1), stallSecs=1)
        self.assertEqual((code, made), (0, True))
        self.assertIn("yue2 worker: a#1 take seed 1000 stalled: no progress for 1 s", err.getvalue())
        self.assertEqual([p["seed"] for p in seen["plans"]], [8919])
        tr = res[0]["extra"]["tried"]
        self.assertEqual(tr[0], {"seed": 1000, "reason": "stalled: no progress for 1 s"})
        self.assertEqual(res[0]["seed"], 8919)

    def test_every_seed_stalled_is_no_take_made(self):
        with contextlib.redirect_stderr(io.StringIO()):
            code, seen, res, made = self.run_worker(LY, wrap=self.wrap(9), stallSecs=1, tries=2)
        self.assertFalse(made)
        self.assertIn("no take made", res[0]["error"])

    def test_default_is_600(self):
        got = []
        self.run_worker(LY, wrap=lambda w, run: lambda cmd, env, stall: (got.append(stall), run(cmd, env=env, check=True))[1])
        self.assertEqual(got[0], 600)


if __name__ == "__main__":
    unittest.main()
