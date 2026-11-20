"""K451: Stable Audio 3 and YuE2 defaults, the YuE2 instrumental recipe (7th Inning Stretch round6i), with fakes."""
import contextlib
import importlib.util
import io
import json
import os
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
        abc, n = novocal(ABC, "rests")
        lines = abc.split("\n")
        self.assertEqual(n, 2)
        self.assertEqual(lines[2], '"C"z16|z16|"G"z16|')
        self.assertEqual(lines[3], "w: la la la")
        self.assertEqual(lines[5], '"C" C4 E4 G8 | c16 |')

    def test_vocal_notes_move_to_instrumental_voice_when_asked(self):
        self.assertEqual(novocal(ABC)[0], novocal(ABC, "rests")[0])  # rests is the default, as the YuE skill does
        lines = novocal(ABC, "move")[0].split("\n")
        self.assertEqual(novocal(ABC, "move")[1], 2)
        self.assertEqual(lines[2], '"C"z16|z16|"G"z16|')
        self.assertEqual(lines[5], "\"C\" C4 E4 G8|c16|G8 A8|")  # own notes kept under the vocal bar; the longer Vocal voice is appended
        self.assertEqual(novocal("X:1\nV:Vocal\nc4 |\n")[0], "X:1\nV:Vocal\nz16|\n")

    def test_move_targets_ins_by_name_and_pairs_by_bar(self):
        s = "X:1\nV:Vocal\nV:Ins\nV:Pad\nK:C\nV:Vocal\n\"C\" c2 d2 | z16 |\nV:Pad\nA16 | A16 |\nV:Ins\nz16 | z16 |\nV:Vocal\ne8 | f8 |\nV:Ins\nz16 | z16 |\n"
        o = novocal(s, "move")[0].split("\n")
        self.assertEqual((o[8], o[10], o[14]), ("A16 | A16 |", "c2 d2|z16|", "e8|f8|"))

    def test_move_ties_chords_and_unequal_lengths(self):
        s = "X:1\nV:Vocal\nV:Ins\nK:C\nV:Vocal\nc8- | c8 | [CEG]8- | d8 |\nV:Ins\nz16 | C16 |\n"
        o = novocal(s, "move")[0].split("\n")
        self.assertEqual(o[5], "z16|z16|z16|z16|")
        self.assertEqual(o[7], "c8|C16|[CEG]8-|d8|")  # the tie from a moved bar into an own bar is dropped; the Vocal voice is longer; a [CEG] tie between moved bars stays

    def test_move_leaves_repeats_and_inline_fields_alone(self):
        for bad in ("|: c8 :|", "c8 |]", "c8 | [K:D] d8 |"):
            s = f"X:1\nV:Vocal\nV:Ins\nK:C\nV:Vocal\n{bad}\nV:Ins\nz16 |\n"
            self.assertEqual(novocal(s, "move")[0].split("\n")[7], "z16 |", bad)

    def test_offload_ar_auto_under_24_gib(self):
        from audiogen.recipe import offload_ar
        self.assertEqual([offload_ar("auto", 15.9), offload_ar(None, 24.0), offload_ar(True, 80), offload_ar(False, 8)], [True, False, True, False])

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
                B.make("x", {"type": kind, "licence": "x", "python": sys.executable, "queue": False}, Path(t)).generate(
                    [B.Job(cue=c, n=1, seed=1, seconds=1.0, out=Path(t) / "a.wav")])
            cmd = run.call_args[0][0]
            self.assertEqual(cmd[:3], ["nice", "-n", "19"])
            self.assertTrue(cmd[4].endswith(script))

    def test_yue2_runs_through_heavy_queue_only_yue2(self):
        c = parse_cue({"name": "a", "prompt": "p", "category": "music", "length": 1}, None)
        for kind, queued in (("yue2", True), ("stable-audio-3", False), ("acestep", False), ("stable-audio-open", False)):
            with tempfile.TemporaryDirectory() as t, mock.patch.object(B.subprocess, "run", return_value=mock.Mock(returncode=0)) as run,                     mock.patch.object(B.YuE2, "queue_tool", return_value="/x/heavy"):
                B.make("x", {"type": kind, "licence": "x", "python": sys.executable}, Path(t)).generate(
                    [B.Job(cue=c, n=1, seed=1, seconds=1.0, out=Path(t) / "a.wav")])
            cmd = run.call_args[0][0]
            self.assertEqual(cmd[:9] == ["/x/heavy", "run", "--label", "audio-gen x", "--slots", "all", "--mem", "16", "--"], queued)  # K474
            self.assertEqual(cmd[9 if queued else 0:12 if queued else 3], ["nice", "-n", "19"])
        with tempfile.TemporaryDirectory() as t, mock.patch.object(B.YuE2, "queue_tool", return_value=None):
            with self.assertRaises(B.Skip):
                B.make("x", {"type": "yue2", "licence": "x", "python": sys.executable}, Path(t)).generate(
                    [B.Job(cue=c, n=1, seed=1, seconds=1.0, out=Path(t) / "a.wav")])

    def run_yue2_fake(self, errors, cues=(("a", 3),), skip=(), queue=False):
        calls = []
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)

            def fake(cmd, env=None):
                job = json.loads(Path(cmd[-1]).read_text())
                calls.append((cmd[0], [i["label"] for i in job["items"]]))
                if job["items"][0]["label"].split("#")[0] in skip:
                    return mock.Mock(returncode=3)
                res = []
                for it in job["items"]:
                    e = errors.get(it["label"], [])
                    err = e.pop(0) if e else None
                    res.append({"out": it["out"], "error": err} if err else {"out": it["out"]})
                    if not err:
                        Path(it["out"]).write_bytes(b"x")
                Path(job["result"]).write_text(json.dumps({"items": res}))
                return mock.Mock(returncode=0)

            jobs = []
            for name, n in cues:
                c = parse_cue({"name": name, "prompt": "p", "category": "music", "length": 1}, None)
                jobs += [B.Job(cue=c, n=i, seed=1, seconds=1.0, out=t / f"{name}{i}.wav") for i in range(1, n + 1)]
            with mock.patch.object(B.subprocess, "run", side_effect=fake), mock.patch.object(B.YuE2, "queue_tool", return_value="/x/heavy"):
                res = B.make("x", {"type": "yue2", "licence": "x", "python": sys.executable, "queue": queue}, t).generate(jobs)
        return calls, res

    def test_k465_takes_of_one_cue_share_one_process(self):
        calls, res = self.run_yue2_fake({})
        self.assertEqual([c[1] for c in calls], [["a#1", "a#2", "a#3"]])
        self.assertTrue(all(r.ok for r in res))

    def test_k465_two_cues_two_processes(self):
        calls, res = self.run_yue2_fake({}, cues=(("a", 2), ("b", 1)))
        self.assertEqual([c[1] for c in calls], [["a#1", "a#2"], ["b#1"]])
        self.assertEqual([r.job.cue.name for r in res], ["a", "a", "b"])

    def test_k465_one_heavy_run_per_cue(self):
        calls, _ = self.run_yue2_fake({}, cues=(("a", 2), ("b", 2)), queue=True)
        self.assertEqual([c[0] for c in calls], ["/x/heavy", "/x/heavy"])

    def test_k465_cuda_error_retries_failed_takes_once_in_new_process(self):
        calls, res = self.run_yue2_fake({"a#2": ["AcceleratorError: CUDA error: unknown error"]}, cues=(("a", 3), ("b", 1)))
        self.assertEqual([c[1] for c in calls], [["a#1", "a#2", "a#3"], ["a#2"], ["b#1"]])
        self.assertTrue(all(r.ok for r in res))
        calls, res = self.run_yue2_fake({"a#1": ["CUDA error: x", "CUDA error: y"]}, cues=(("a", 1),))
        self.assertEqual(len(calls), 2)
        self.assertFalse(res[0].ok)

    def test_k465_other_error_no_retry(self):
        calls, res = self.run_yue2_fake({"a#1": ["RuntimeError: no take made"]}, cues=(("a", 1),))
        self.assertEqual(len(calls), 1)
        self.assertFalse(res[0].ok)

    def test_k465_skip_midrun_keeps_earlier_cues(self):
        calls, res = self.run_yue2_fake({}, cues=(("a", 1), ("b", 2), ("c", 1)), skip=("b",))
        self.assertEqual([r.ok for r in res], [True, False, False, False])
        self.assertEqual(len(calls), 2)
        self.assertIn("could not start", res[1].error)
        with self.assertRaises(B.Skip):
            self.run_yue2_fake({}, cues=(("a", 1), ("b", 1)), skip=("a", "b"))

    def test_k465_mixed_failed_and_passed_cues_merge_in_order(self):
        calls, res = self.run_yue2_fake({"b#1": ["RuntimeError: x"]}, cues=(("a", 1), ("b", 1), ("c", 2)))
        self.assertEqual([(r.job.cue.name, r.job.n, r.ok) for r in res], [("a", 1, True), ("b", 1, False), ("c", 1, True), ("c", 2, True)])

    def test_yue2_needs_demucs(self):
        with self.assertRaises(B.Skip):
            B.make("y", {"type": "yue2", "licence": "x", "python": sys.executable, "demucsPython": "/nope/python"}, Path(".")).check()
        B.make("y", {"type": "yue2", "licence": "x", "python": sys.executable, "demucsPython": sys.executable, "queue": False}, Path(".")).check()

    def test_yue2_check_needs_heavy_unless_queue_off(self):
        o = {"type": "yue2", "licence": "x", "python": sys.executable, "demucsPython": sys.executable}
        with mock.patch.object(B.YuE2, "queue_tool", return_value=None):
            with self.assertRaises(B.Skip):
                B.make("y", o, Path(".")).check()
            B.make("y", {**o, "queue": False}, Path(".")).check()
        with mock.patch.object(B.YuE2, "queue_tool", return_value="/x/heavy"):
            B.make("y", o, Path(".")).check()


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
    def run_worker(self, version="0.1.6", cuda=True, keep=None, quiet=0.001, gib=16, offload=None, vocal=None, avail=100.0, need=None, kill=None, need_d=None, killchild=None, oom=None):
        seen = {"calls": [], "demucs": [], "order": [], "seeds_started": []}

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

        def read(p):  # the first seed (1000) sings, the next ones do not
            p = str(p)
            if p.endswith("no_vocals.wav"):
                return Arr([1.0] * 40), 20
            return Arr([1.0 if "-1000" in p else quiet] * 40), 20

        def demucs(cmd, **kw):
            if "--take" in cmd:  # K477: the generating child, run in this process with the same fakes
                job = json.loads(Path(cmd[cmd.index("--take") + 1]).read_text())
                seen["order"].append(("child start", job["seed"]))
                if killchild is not None and job["seed"] == killchild[0]:
                    seen["order"].append(("child exit", job["seed"]))
                    raise __import__("subprocess").CalledProcessError(killchild[1], cmd)
                with mock.patch.object(sys, "argv", ["w", cmd[2], "--take", cmd[-1]]):
                    code = w.main()
                seen["order"].append(("child exit", job["seed"]))
                if code:
                    raise __import__("subprocess").CalledProcessError(code, cmd)
                return mock.Mock(returncode=0)
            if "htdemucs" in cmd:
                seen["demucs"].append(cmd)
                seen["order"].append(("demucs", None))
            if kill is not None and "htdemucs" in cmd:
                raise __import__("subprocess").CalledProcessError(kill, cmd)
            return mock.Mock(returncode=0)

        torch = types.SimpleNamespace(cuda=types.SimpleNamespace(
            is_available=lambda: cuda, reset_peak_memory_stats=lambda: None, memory_allocated=lambda: 5,
            max_memory_allocated=lambda: 6, get_device_properties=lambda i: types.SimpleNamespace(total_memory=gib * 2**30)),
            set_num_threads=lambda n: None)
        mods = {"yue2": types.SimpleNamespace(__version__=version, YuE2Pipeline=Pipe), "soundfile": types.SimpleNamespace(read=read), "torch": torch}
        spec = importlib.util.spec_from_file_location("yue2_worker", HERE / "workers" / "yue2_worker.py")
        w = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(w)
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            (t / "job.json").write_text(json.dumps({
                "options": {"modelDir": str(t / "none"), "tries": 3, **({"keep": keep} if keep else {}),
                            **({"offloadAr": offload} if offload is not None else {}), **({"vocal": vocal} if vocal else {}), **({"minAvailGiB": need} if need is not None else {}), **({"minAvailDemucsGiB": need_d} if need_d is not None else {})}, "result": str(t / "r.json"),
                "items": [{"out": str(t / "o" / "a.wav"), "prompt": "calm ballpark organ", "seconds": 20, "seed": 1000, "label": "a#1"}]}))
            with mock.patch.object(sys, "argv", ["w", str(t / "job.json")]), mock.patch.dict(sys.modules, mods), \
                    mock.patch.object(w.subprocess, "run", demucs), \
                    mock.patch.object(w.recipe, "oom_kills", oom or (lambda: 0)), \n                    mock.patch.object(w.recipe, "mem_available_gib", avail if callable(avail) else lambda: avail):
                try:
                    code = w.main()
                except SystemExit as e:
                    code = e.code
            res = json.loads((t / "r.json").read_text())["items"] if (t / "r.json").exists() else []
            return code, seen, res, (t / "o" / "a.wav").exists(), (t / "o" / "a-keep2.wav").exists()

    def test_recipe_and_next_seed(self):
        code, seen, res, made, alt = self.run_worker()
        self.assertFalse(alt)
        self.assertEqual(code, 0)
        self.assertTrue(made)
        self.assertEqual(seen["load"], ("m-a-p/YuE2-3B", {"revision": "8f24312f", "device": "cuda", "offload_ar": True}))
        plans = [kw for k, kw in seen["calls"] if k == "plan"]
        renders = [kw for k, kw in seen["calls"] if k == "render"]
        self.assertEqual([p["seed"] for p in plans], [1000, 8919])
        self.assertEqual({(p["lyrics"], p["cot"]) for p in plans + renders}, {("[Instrumental]", "full")})
        self.assertIn('"C"z16|z16|"G"z16|', renders[0]["abc"])
        self.assertNotIn("G8 A8|", renders[0]["abc"])  # rests by default, as the YuE skill does
        self.assertEqual(res[0]["seed"], 8919)
        self.assertEqual([x["vocalDb"] > -25 for x in res[0]["extra"]["tried"]], [True, False])
        d = seen["demucs"][0]
        self.assertEqual((d[:3], d[d.index("-d") + 1], d[d.index("-n", 3) + 1], "--two-stems=vocals" in d),
                         (["nice", "-n", "19"], "cuda", "htdemucs", True))

    def test_offload_only_under_24_gib_unless_set(self):
        self.assertTrue(self.run_worker(gib=16)[1]["load"][1]["offload_ar"])
        self.assertNotIn("offload_ar", self.run_worker(gib=24)[1]["load"][1])
        self.assertNotIn("offload_ar", self.run_worker(gib=16, offload=False)[1]["load"][1])
        self.assertTrue(self.run_worker(gib=48, offload=True)[1]["load"][1]["offload_ar"])

    def test_vocal_move_option(self):
        renders = [kw for k, kw in self.run_worker(vocal="move")[1]["calls"] if k == "render"]
        self.assertIn("G8 A8|", renders[0]["abc"])

    def test_pinned_version_and_no_cuda(self):
        self.assertEqual(self.run_worker(version="0.1.5")[0], 3)
        self.assertEqual(self.run_worker(cuda=False)[0], 3)

    def test_keep_several_passing_seeds(self):
        code, seen, res, made, alt = self.run_worker(keep=2)
        self.assertEqual((code, made, alt), (0, True, True))
        self.assertEqual(res[0]["seed"], 8919)
        self.assertEqual([a["seed"] for a in res[0]["extra"]["alternates"]], [16838])
        self.assertEqual(len(res[0]["extra"]["tried"]), 3)
        self.assertFalse(res[0]["extra"]["failedGate"])

    def test_no_seed_passes_keeps_best_marked(self):
        code, seen, res, made, alt = self.run_worker(quiet=0.5)
        self.assertEqual((code, made, alt), (0, True, False))
        self.assertNotIn("error", res[0])
        self.assertEqual((res[0]["seed"], res[0]["extra"]["failedGate"], len(res[0]["extra"]["tried"])), (8919, True, 3))


class K474MemoryCap(unittest.TestCase):
    """K474: a YuE2 run must never take WSL down: cap and all slots from the backend, MemAvailable gates in the worker."""

    def test_backend_passes_mem_and_slots_all(self):
        c = parse_cue({"name": "a", "prompt": "p", "category": "music", "length": 1}, None)
        for opts, mem in (({}, "16"), ({"memGiB": 9}, "9")):
            with tempfile.TemporaryDirectory() as t, mock.patch.object(B.subprocess, "run", return_value=mock.Mock(returncode=0)) as run,                     mock.patch.object(B.YuE2, "queue_tool", return_value="/x/heavy"):
                B.make("x", {"type": "yue2", "licence": "x", "python": sys.executable, **opts}, Path(t)).generate(
                    [B.Job(cue=c, n=1, seed=1, seconds=1.0, out=Path(t) / "a.wav")])
                cmd = run.call_args[0][0]
            self.assertEqual((cmd[cmd.index("--slots") + 1], cmd[cmd.index("--mem") + 1]), ("all", mem))
            self.assertLess(cmd.index("--mem"), cmd.index("--"))

    def test_memgib_is_not_sent_to_the_worker(self):
        self.assertNotIn("memGiB", B.make("x", {"type": "yue2", "memGiB": 9}, Path(".")).worker_options())

    def test_take_killed_by_the_cap_names_the_cap(self):
        c = parse_cue({"name": "a", "prompt": "p", "category": "music", "length": 1}, None)
        with tempfile.TemporaryDirectory() as t, mock.patch.object(B.subprocess, "run", return_value=mock.Mock(returncode=137)),                 mock.patch.object(B.YuE2, "queue_tool", return_value="/x/heavy"):
            res = B.make("x", {"type": "yue2", "licence": "x", "python": sys.executable, "memGiB": 9}, Path(t)).generate(
                [B.Job(cue=c, n=1, seed=1, seconds=1.0, out=Path(t) / "a.wav")])
        self.assertFalse(res[0].ok)
        self.assertIn("9 GiB memory cap", res[0].error)

    def test_other_failure_keeps_its_message(self):
        c = parse_cue({"name": "a", "prompt": "p", "category": "music", "length": 1}, None)
        with tempfile.TemporaryDirectory() as t, mock.patch.object(B.subprocess, "run", return_value=mock.Mock(returncode=1)),                 mock.patch.object(B.YuE2, "queue_tool", return_value="/x/heavy"):
            res = B.make("x", {"type": "yue2", "licence": "x", "python": sys.executable}, Path(t)).generate(
                [B.Job(cue=c, n=1, seed=1, seconds=1.0, out=Path(t) / "a.wav")])
        self.assertNotIn("memory cap", res[0].error)

    def test_demucs_killed_in_the_cgroup_names_the_cap(self):
        c = parse_cue({"name": "a", "prompt": "p", "category": "music", "length": 1}, None)
        for err in ("LowMemory: killed by the memory cap: demucs died (exit -9) in the cgroup limit",
                    "CalledProcessError: Command '[x]' died with <Signals.SIGKILL: 9>."):
            def fake(cmd, env=None):
                job = json.loads(Path(cmd[-1]).read_text())
                Path(job["result"]).write_text(json.dumps({"items": [{"out": job["items"][0]["out"], "error": err}]}))
                return mock.Mock(returncode=0)
            with tempfile.TemporaryDirectory() as t, mock.patch.object(B.subprocess, "run", side_effect=fake), \
                    mock.patch.object(B.YuE2, "queue_tool", return_value="/x/heavy"):
                res = B.make("x", {"type": "yue2", "licence": "x", "python": sys.executable, "memGiB": 9}, Path(t)).generate(
                    [B.Job(cue=c, n=1, seed=1, seconds=1.0, out=Path(t) / "a.wav")])
            self.assertIn("9 GiB memory cap", res[0].error, err)

    def test_oom_kill_counter_reader(self):
        from audiogen import recipe
        with tempfile.TemporaryDirectory() as t:
            (Path(t) / "u" / "s").mkdir(parents=True)
            (Path(t) / "u" / "s" / "memory.events").write_text("low 0\nmax 3\noom 1\noom_kill 2\n")
            (Path(t) / "cg").write_text("0::/u/s\n")
            self.assertEqual(recipe.oom_kills(t, str(Path(t) / "cg")), 2)
        self.assertEqual(recipe.oom_kills("/nonexistent", "/nonexistent"), 0)

    def test_meminfo_reader_and_check(self):
        from audiogen import recipe
        with tempfile.TemporaryDirectory() as t:
            f = Path(t) / "meminfo"
            f.write_text("MemTotal: 20971520 kB\nMemAvailable: 5242880 kB\n")
            self.assertEqual(recipe.mem_available_gib(str(f)), 5.0)
        self.assertIsNone(recipe.mem_available_gib("/nonexistent/meminfo"))
        recipe.need_memory(4, "x", avail=5.0)
        with self.assertRaisesRegex(recipe.LowMemory, "5.0 GiB.*demucs.*6 GiB"):
            recipe.need_memory(6, "the demucs pass", avail=5.0)


class K474Worker(unittest.TestCase):
    run_worker = Yue2Worker.run_worker

    def test_low_memory_before_load_fails_every_take_and_loads_nothing(self):
        code, seen, res, made, _ = self.run_worker(avail=2.0)
        self.assertEqual(code, 0)
        self.assertNotIn("load", seen)
        self.assertEqual(seen["calls"], [])
        self.assertEqual(len(res), 1)
        self.assertIn("LowMemory", res[0]["error"])
        self.assertFalse(made)

    def test_demucs_sigkill_fails_the_take_naming_the_cap(self):
        for rc in (-9, 137):
            code, seen, res, made, _ = self.run_worker(kill=rc)
            self.assertEqual(code, 0)
            self.assertIn("killed by the memory cap", res[0]["error"])
            self.assertFalse(made)

    def test_demucs_other_failure_is_not_the_cap(self):
        code, seen, res, made, _ = self.run_worker(kill=1)
        self.assertNotIn("memory cap", res[0]["error"])
        self.assertIn("CalledProcessError", res[0]["error"])

    def test_low_memory_option_lowers_the_need(self):
        code, seen, res, made, _ = self.run_worker(avail=2.0, need=1, need_d=1)
        self.assertTrue(made)
        self.assertNotIn("error", res[0])

    def test_demucs_need_is_its_own_option(self):
        code, seen, res, made, _ = self.run_worker(avail=4.0)  # under the 14 GiB child need, at the 4 GiB demucs need
        self.assertIn("loading YuE2", res[0]["error"])
        code, seen, res, made, _ = self.run_worker(avail=4.0, need=1)
        self.assertTrue(made)
        code, seen, res, made, _ = self.run_worker(avail=4.0, need=1, need_d=5)
        self.assertIn("demucs pass needs 5 GiB", res[0]["error"])

    def test_k477_child_has_exited_before_each_demucs_pass(self):
        code, seen, res, made, _ = self.run_worker()
        self.assertEqual(seen["order"], [("child start", 1000), ("child exit", 1000), ("demucs", None),
                                         ("child start", 8919), ("child exit", 8919), ("demucs", None)])

    def test_k477_gate_fail_starts_a_fresh_child_with_the_next_seed(self):
        code, seen, res, made, _ = self.run_worker()
        self.assertEqual([k for k in seen["order"] if k[0] == "child start"], [("child start", 1000), ("child start", 8919)])
        self.assertEqual(len([c for k, c in seen["calls"] if k == "plan"]), 2)
        self.assertEqual(res[0]["seed"], 8919)

    def test_k477_child_killed_by_the_cap_is_a_failed_take_naming_it(self):
        for rc in (-9, 137):
            code, seen, res, made, _ = self.run_worker(killchild=(1000, rc))
            self.assertEqual(code, 0)
            self.assertIn("killed by the memory cap", res[0]["error"])
            self.assertIn("generating child", res[0]["error"])
            self.assertEqual([c for c in seen["demucs"] if "htdemucs" in c], [])
            self.assertFalse(made)
        code, seen, res, made, _ = self.run_worker(killchild=(1000, 1))
        self.assertNotIn("memory cap", res[0]["error"])
        self.assertIn("generating child failed", res[0]["error"])

    def test_k477_oom_kill_rise_with_other_exit_is_a_cap_kill(self):
        counts = iter([0, 1])
        code, seen, res, made, _ = self.run_worker(killchild=(1000, 1), oom=lambda: next(counts))
        self.assertIn("killed by the memory cap", res[0]["error"])
        self.assertNotIn("generating child failed", res[0]["error"])

    def test_k477_peak_rss_line_is_the_childrens(self):
        import contextlib
        import io
        import resource
        err = io.StringIO()
        ru = lambda who: types.SimpleNamespace(ru_maxrss=int(13.5 * 2**20) if who == resource.RUSAGE_CHILDREN else 2**20)  # noqa: E731
        with contextlib.redirect_stderr(err), mock.patch.object(resource, "getrusage", ru):
            self.run_worker()
        self.assertIn("peak host RSS 13.5 GiB (largest child", err.getvalue())

    def test_k477_child_exit_3_stops_the_worker(self):
        self.assertEqual(self.run_worker(killchild=(1000, 3))[0], 3)

    def test_k477_reload_time_is_logged_per_take(self):
        import contextlib
        import io
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.run_worker()
        self.assertEqual(err.getvalue().count("child reloaded the pipeline in"), 2)

    def test_low_memory_before_demucs_fails_the_take_without_running_it(self):
        avail = iter([100.0, 2.0])
        code, seen, res, made, _ = self.run_worker(avail=lambda: next(avail))
        self.assertEqual([c for c in seen["demucs"] if "htdemucs" in c], [])
        self.assertIn("demucs pass", res[0]["error"])
        self.assertFalse(made)


class Sa3Retry(unittest.TestCase):
    def test_reject_rule(self):
        from audiogen.recipe import sa3_bad
        self.assertFalse(sa3_bad(0.4, 0.2, 0.99))
        self.assertTrue(sa3_bad(0.41, 0.0, 0.5))
        self.assertTrue(sa3_bad(0.1, 0.21, 0.5))
        self.assertTrue(sa3_bad(0.1, 0.0, 0.999))

    def test_retry_next_seed(self):
        from audiogen.recipe import first_good
        made = []
        take = lambda s: made.append(s) or s  # noqa: E731
        self.assertEqual(first_good(take, lambda s: s < 12, 10, 4), (12, 12, 3))
        self.assertEqual(made, [10, 11, 12])
        with self.assertRaises(RuntimeError):
            first_good(take, lambda s: True, 10, 2)

    def test_k475_gate_per_cue_and_reason(self):
        from audiogen.recipe import first_good, sa3_bad, sa3_fail
        self.assertEqual(sa3_fail(0.1, 0.31, 0.5), "high 0.310 > 0.2")
        self.assertEqual(sa3_fail(0.41, 0.0, 0.5), "flatness 0.410 > 0.4")
        self.assertEqual(sa3_fail(0.1, 0.0, 1.0), "peak 1.000 >= 0.999")
        self.assertEqual(sa3_fail(0.1, 0.31, 0.5, {"high": 0.5}), "")
        self.assertEqual(sa3_fail(0.9, 0.9, 1.0, False), "")
        self.assertFalse(sa3_bad(0.5, 0.0, 0.5, {"flatness": 0.9}))
        self.assertTrue(sa3_bad(0.1, 0.31, 0.5, {"flatness": 0.9}))
        with self.assertRaises(ValueError):
            sa3_fail(0.1, 0.0, 0.5, {"hihg": 0.5})
        with self.assertRaises(ValueError):
            sa3_fail(0.1, 0.0, 0.5, {"high": None})
        self.assertFalse(sa3_bad(0.4, 0.2, 0.99, None))
        err = io.StringIO()
        with self.assertRaises(RuntimeError) as e, contextlib.redirect_stderr(err):
            first_good(lambda s: s, lambda s: f"high 0.{s} > 0.2", 30, 2)
        self.assertIn("take rejected, seed 30: high 0.30 > 0.2", err.getvalue())
        self.assertIn("seed 30: high 0.30 > 0.2; seed 31: high 0.31 > 0.2", str(e.exception))


class AceDefaults(unittest.TestCase):
    def params(self, model):
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

        torch = types.SimpleNamespace(cuda=types.SimpleNamespace(
            is_available=lambda: True, reset_peak_memory_stats=lambda: None, memory_allocated=lambda: 5,
            max_memory_allocated=lambda: 6), set_num_threads=lambda n: None)
        mods = {"torch": torch, "acestep": types.ModuleType("acestep"), "acestep.handler": types.SimpleNamespace(AceStepHandler=Handler),
                "acestep.inference": types.SimpleNamespace(GenerationConfig=lambda **k: None, generate_music=music, GenerationParams=lambda **k: k),
                "acestep.llm_inference": types.SimpleNamespace(LLMHandler=lambda: None),
                "acestep.model_downloader": types.SimpleNamespace(
                    check_main_model_exists=lambda c: True, check_model_exists=lambda m, c: True, ensure_dit_model=None,
                    ensure_lm_model=None, ensure_main_model=None, get_checkpoints_dir=lambda: "ckpt")}
        spec = importlib.util.spec_from_file_location("acestep_worker", HERE / "workers" / "acestep_worker.py")
        w = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(w)
        cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            (t / "repo" / "acestep").mkdir(parents=True)
            (t / "job.json").write_text(json.dumps({"options": {"repo": str(t / "repo"), "model": model}, "result": str(t / "r.json"),
                                                    "items": [{"out": str(t / "a.wav"), "prompt": "p", "seconds": 1, "seed": 1, "label": "a#1"}]}))
            try:
                with mock.patch.object(sys, "argv", ["w", str(t / "job.json")]), mock.patch.dict(sys.modules, mods):
                    self.assertEqual(w.main(), 0)
            finally:
                os.chdir(cwd)
        return seen["p"]

    def test_xl_sft_and_turbo(self):
        xl = self.params("acestep-v15-xl-sft")
        self.assertEqual((xl["inference_steps"], xl["guidance_scale"]), (50, 7.0))
        turbo = self.params("acestep-v15-turbo")
        self.assertEqual((turbo["inference_steps"], "guidance_scale" in turbo), (8, False))


class Sa3Sampler(unittest.TestCase):
    def sampler(self, opts):
        seen = {}

        class T:
            def __init__(self, a):
                self.a = a
                self.dim = lambda: 2

            def float(self):
                return self

            def cpu(self):
                return self

            def numpy(self):
                return self.a

        class Model:
            model_config = {"sample_rate": 44100}

            @classmethod
            def from_pretrained(cls, name, **kw):
                return cls()

            def generate(self, **kw):
                seen["kw"] = kw
                return T(mock.MagicMock())

        torch = types.SimpleNamespace(cuda=types.SimpleNamespace(
            is_available=lambda: True, reset_peak_memory_stats=lambda: None, memory_allocated=lambda: 5,
            max_memory_allocated=lambda: 6), set_num_threads=lambda n: None)
        mods = {"torch": torch, "numpy": mock.MagicMock(), "soundfile": types.SimpleNamespace(write=lambda *a, **k: None),
                "stable_audio_3": types.SimpleNamespace(StableAudioModel=Model)}
        spec = importlib.util.spec_from_file_location("sa3_worker", HERE / "workers" / "stable_audio_3_worker.py")
        w = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(w)
        with tempfile.TemporaryDirectory() as t:
            t = Path(t)
            (t / "job.json").write_text(json.dumps({"options": opts, "result": str(t / "r.json"), "items": [
                {"out": str(t / "a.wav"), "prompt": "p", "seconds": 1, "seed": 1, "label": "a#1"}]}))
            with mock.patch.object(sys, "argv", ["w", str(t / "job.json")]), mock.patch.dict(sys.modules, mods), mock.patch.object(w.recipe, "first_good", lambda make, bad, seed, tries: (make(seed), seed, 1)):
                self.assertEqual(w.main(), 0)
            self.assertNotIn("error", json.loads((t / "r.json").read_text())["items"][0])
        return seen["kw"]

    def test_pingpong_sampler_by_default(self):
        self.assertEqual(self.sampler({})["sampler_type"], "pingpong")
        self.assertEqual(self.sampler({"sampler": "euler"})["sampler_type"], "euler")
