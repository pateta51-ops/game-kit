"""Pure parts: python3 -m unittest discover -s components/audio-gen/tests"""
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from audiogen import cuesheet, listening, music, tail, voice  # noqa: E402
from audiogen.limits import check_manifest  # noqa: E402
from audiogen.spec import load_cues, loop_length, parse_cue  # noqa: E402

SHEET = """# Sheet
| Cue | Beats | On screen | Object and material | Attack, body, tail | Length | Tier | Var | Not |
|---|---|---|---|---|---|---|---|---|
| knock-short | tap | a plate is pressed | a finger pressing a metal tab on a desk | dull tick, tiny metal ring, none | 90 ms | quiet | 3 | not a click, not a beep |
| wind-long | peak | a gust blows | wind through tall trees | slow rise, long rush | 3.5 s | loud | 2 | |
| rain-light | B-30 | drizzle | light rain on a window | 1.2 s | quiet | 2 | |
| broken | x | y | z | w | soon | maybe | 1 | |

after the table
| Cue | other |
"""


class Sheet(unittest.TestCase):
    def test_rows(self):
        rows = cuesheet.parse_sheet(SHEET)
        self.assertEqual([r["name"] for r in rows], ["knock-short", "wind-long", "rain-light", "broken"])
        self.assertEqual((rows[0]["length"], rows[0]["tier"], rows[0]["variations"]), (0.09, "quiet", 3))
        self.assertEqual((rows[1]["length"], rows[1]["tier"]), (3.5, "loud"))
        self.assertEqual((rows[2]["length"], rows[2]["tier"], rows[2]["attack"]), (1.2, "quiet", ""))
        self.assertIsNone(rows[3]["length"])

    def test_prompt_never_shortened(self):
        rows = cuesheet.parse_sheet(SHEET)
        self.assertEqual(
            cuesheet.prompt_for(rows[0]),
            "A finger pressing a metal tab on a desk: dull tick, tiny metal ring, then nothing. Close microphone, dry, no reverb, "
            "not a click, not a beep, no music, no voice. 0.09 seconds.")
        self.assertTrue(cuesheet.prompt_for(rows[1]).endswith("3.5 seconds."))

    def test_specs_and_problems(self):
        specs, bad = cuesheet.to_specs(cuesheet.parse_sheet(SHEET))
        self.assertEqual([s["name"] for s in specs], ["knock-short", "wind-long", "rain-light"])
        self.assertEqual(len(bad), 1)
        self.assertIn("broken", bad[0])
        self.assertEqual(specs[0]["category"], "quiet")
        self.assertEqual(specs[0]["variations"], 3)
        cues = [parse_cue(s, None, i) for i, s in enumerate(specs)]  # the audiogen reader accepts them
        self.assertEqual(cues[0].length, 0.09)

    def test_override(self):
        specs, _ = cuesheet.to_specs(cuesheet.parse_sheet(SHEET), {"overrides": {"knock-short": "Mine."}})
        self.assertEqual(specs[0]["prompt"], "Mine.")

    def test_skip(self):
        specs, bad = cuesheet.to_specs(cuesheet.parse_sheet(SHEET), {"skip": ["broken", "rain-light"]})
        self.assertEqual(len(specs), 2)
        self.assertEqual(bad, [])


def clip(rate, sec_on, decay_s, lead_s=0.2, total_s=3.0, hz=440):
    """A tone with `lead_s` of silence, `sec_on` at full level, then an exponential decay with time constant decay_s."""
    n = int(total_s * rate)
    out = []
    for i in range(n):
        t = i / rate
        if t < lead_s:
            a = 0.0
        elif t < lead_s + sec_on:
            a = 1.0
        else:
            a = math.exp(-(t - lead_s - sec_on) / decay_s)
        out.append(0.8 * a * math.sin(2 * math.pi * hz * t))
    return out


class Tail(unittest.TestCase):
    rate = 8000

    def test_trims_lead_and_rings_out(self):
        x = clip(self.rate, 0.1, 0.1)
        y = tail.apply_tail(x, self.rate, 0.3)
        d = len(y) / self.rate
        self.assertLess(d, 1.5)  # the silent lead and the long near-silent tail are gone
        self.assertGreater(d, 0.35)
        self.assertEqual(y[0], 0.0)  # faded in
        self.assertLess(abs(y[-1]), 1e-3)  # ends on silence
        k = int(0.15 * self.rate)  # the last 150 ms only ever go down: a fade, never a cut
        env = [max(abs(v) for v in y[i:i + 40]) for i in range(len(y) - k, len(y) - 40, 40)]
        self.assertTrue(all(b <= a + 0.02 for a, b in zip(env, env[1:])))

    def test_fade_at_least_min_even_when_configured_shorter(self):
        x = [0.8] * (self.rate // 2)  # a flat clip: nothing decays, so only the fade ends it
        y = tail.apply_tail(x, self.rate, 0.5, tail.TailRule(fade_out_ms=20, min_fade_ms=150))
        fade = sum(1 for v in y if 1e-6 < abs(v) < 0.8 * 0.999)
        self.assertGreaterEqual(fade / self.rate, 0.14)

    def test_cap_past_cue_length(self):
        x = clip(self.rate, 0.1, 5.0, total_s=6.0)  # a decay that never gets below the floor within the file
        y = tail.apply_tail(x, self.rate, 0.2)
        self.assertLessEqual(len(y) / self.rate, 0.2 + 1.5 + 0.02)

    def test_k512_cap_ends_short_with_fade(self):
        x = clip(self.rate, 0.1, 2.0, total_s=4.0)  # spec 0.2 s, rings the whole file
        y, info = tail.apply_tail_info(x, self.rate, 0.2, tail.TailRule(max_length_x=1.5))
        d = len(y) / self.rate
        self.assertAlmostEqual(d, 0.31, delta=0.03)
        self.assertTrue(info["capped"])
        self.assertGreater(info["lengthBeforeMs"], 1000)
        self.assertAlmostEqual(info["lengthAfterMs"], 1000 * d, delta=1)
        self.assertLess(abs(y[-1]), 1e-3)
        self.assertGreater(max(abs(v) for v in y[-int(0.07 * self.rate):-int(0.05 * self.rate)]), 5 * max(abs(v) for v in y[-20:]))

    def test_k512_smaller_cap_wins_and_min_does_not_override(self):
        x = clip(self.rate, 0.1, 2.0, total_s=4.0)
        y = tail.apply_tail(x, self.rate, 0.2, tail.TailRule(max_length_x=5, max_s=0.2))
        self.assertLess(len(y) / self.rate, 0.25)  # the 0.35 s minimum would give more

    def test_k512_no_key_unchanged(self):
        x = clip(self.rate, 0.1, 2.0, total_s=4.0)
        y, info = tail.apply_tail_info(x, self.rate, 0.2)
        self.assertEqual(y, tail.apply_tail(x, self.rate, 0.2, tail.TailRule()))
        self.assertFalse(info["capped"])
        self.assertGreater(len(y) / self.rate, 1.5)
        r = tail.TailRule.from_category({"tail": {"maxLengthX": 1.5, "maxS": 2, "capFadeMs": 30}})
        self.assertEqual((r.max_length_x, r.max_s, r.cap_fade_ms), (1.5, 2, 30))

    def test_k512_gate_flags_uncapped_take(self):
        x = clip(self.rate, 0.1, 2.0, total_s=4.0)
        r = tail.TailRule(max_length_x=1.5)
        self.assertEqual(tail.check_cap(tail.apply_tail(x, self.rate, 0.2, r), self.rate, 0.2, r), "")
        self.assertIn("past the", tail.check_cap(tail.apply_tail(x, self.rate, 0.2), self.rate, 0.2, r))
        self.assertEqual(tail.check_cap(tail.apply_tail(x, self.rate, 0.2), self.rate, 0.2, tail.TailRule()), "")

    def test_k512_manifest_fields(self):
        cli = (Path(__file__).parent.parent / "audiogen" / "cli.py").read_text(encoding="utf-8")
        self.assertIn('e["tail"] = tail_info', cli)

    def test_silent_raises(self):
        with self.assertRaises(ValueError):
            tail.apply_tail([0.0] * 800, self.rate, 0.1)

    def test_from_category(self):
        r = tail.TailRule.from_category({"tail": {"endBelowDbfs": -40, "minFadeMs": 100}, "fadeOutMs": 300, "fadeInMs": 5})
        self.assertEqual((r.end_below_dbfs, r.min_fade_ms, r.fade_out_ms, r.fade_in_ms), (-40, 100, 300, 5))


SCORE = {"tempo": 132, "beatsPerBar": 4, "bars": 16, "layers": {
    "lead": {"program": 80, "channel": 0, "notes": [[0, 1, 72, 100], [63, 1, 74, 100]]},
    "drums": {"drums": True, "notes": [[0, 0.5, 36, 110], [4, 0.5, 38, 100]]}}}


class Music(unittest.TestCase):
    def test_loop_length(self):
        self.assertAlmostEqual(loop_length(132, 16), 16 * 4 * 60 / 132)
        self.assertEqual(music.loop_samples(SCORE, 44100), round(16 * 4 * 60 / 132 * 44100))
        self.assertEqual(music.loop_samples({"tempo": 120, "bars": 4}, 44100), 4 * 4 * 22050)  # 8 s

    def test_midi_ends_on_the_bar_line(self):
        full = music.parse_midi(music.build_midi(SCORE))
        self.assertEqual((full["format"], full["tracks"], full["tpb"]), (1, 3, 480))
        self.assertEqual(set(full["ends"][1:]), {16 * 4 * 480})  # every layer track ends at the loop's last tick
        stem = music.parse_midi(music.build_midi(SCORE, ["drums"]))
        self.assertEqual(stem["tracks"], 2)
        self.assertEqual(stem["ends"][1], 16 * 4 * 480)  # a stem has the same length as the mix
        self.assertEqual(stem["notes"][1], 2)

    def test_vlq(self):
        self.assertEqual(music.vlq(0), b"\x00")
        self.assertEqual(music.vlq(128), b"\x81\x00")
        self.assertEqual(music.vlq(480), b"\x83\x60")


class Voice(unittest.TestCase):
    table = {"kinds": {"pa": {"voices": ["a", "b"], "speed": 0.9}, "call": {"voices": ["c"]}},
             "lines": [{"id": "x", "text": " Hello ", "kind": "pa"}, {"id": "y", "text": "Done!", "kind": "call"}],
             "parts": {"num": [{"id": "one", "text": "one", "kind": "pa"}]}}

    def test_jobs_and_parts_are_separate_files(self):
        js = voice.jobs(self.table)
        self.assertEqual([j["id"] for j in js], ["x", "y", "num.one"])
        self.assertEqual(js[0]["text"], "Hello")
        self.assertEqual(voice.keys(js[0]), ["x-1", "x-2"])
        self.assertEqual(js[1]["speed"], 1.0)

    def test_bad_tables(self):
        with self.assertRaises(ValueError):
            voice.jobs({**self.table, "lines": [{"id": "x", "text": "a", "kind": "nope"}]})
        with self.assertRaises(ValueError):
            voice.jobs({**self.table, "lines": [{"id": "x", "text": "a"}, {"id": "x", "text": "b"}]})
        with self.assertRaises(ValueError):
            voice.jobs({**self.table, "lines": [{"id": "x", "text": " "}]})

    def test_shout_keeps_peak(self):
        y = voice.shout([0.1, -0.5, 0.25])
        self.assertAlmostEqual(max(abs(v) for v in y), 0.5)


class Listening(unittest.TestCase):
    def test_build(self):
        man = {"files": [
            {"id": "tick", "variation": 1, "kind": "sfx", "file": "q/tick-1.webm", "model": "m", "prompt": "P1", "seed": 7},
            {"id": "tick", "variation": 2, "kind": "sfx", "file": "q/tick-2.webm", "model": "m", "prompt": "P1", "seed": 8},
            {"id": "menu", "variation": 1, "kind": "music", "file": "music/menu.webm", "model": "yue2", "prompt": "P2"}]}
        d = listening.build(man, [{"name": "tick", "notes": "when tapped"}], None, None, {"tick-2"})
        self.assertEqual(len(d["snd"]), 1)
        self.assertEqual([t["now"] for t in d["snd"][0]["takes"]], [False, True])
        self.assertEqual(d["snd"][0]["takes"][0]["prompt"], "P1")
        self.assertEqual(d["snd"][0]["takes"][0]["manifest"]["seed"], 7)
        self.assertEqual(d["snd"][0]["when"], "when tapped")
        self.assertEqual(len(d["mus"]), 1)


class Limits(unittest.TestCase):
    def test_check(self):
        import tempfile
        with tempfile.TemporaryDirectory() as t:
            b = Path(t)
            (b / "a.webm").write_bytes(b"x" * 10)
            (b / "big.webm").write_bytes(b"x" * 500_000)
            (b / "c.wav").write_bytes(b"x")
            (b / "empty.mp3").write_bytes(b"")
            m = {"files": [{"id": "a", "variation": 1, "file": "a.webm"}, {"id": "big", "variation": 1, "file": "big.webm"},
                           {"id": "c", "variation": 1, "file": "c.wav"}, {"id": "e", "variation": 1, "file": "empty.mp3"},
                           {"id": "m", "variation": 1, "file": "gone.webm"},
                           {"id": "loop", "variation": 1, "kind": "music", "file": "big.webm"}]}
            bad = check_manifest(m, b)
            self.assertEqual(len(bad), 4)
            self.assertTrue(any("over 400000" in x for x in bad))
            self.assertTrue(any("c.wav is not one of" in x for x in bad))
            self.assertTrue(any("empty" in x for x in bad))
            self.assertTrue(any("not found" in x for x in bad))


class Config(unittest.TestCase):
    def test_tail_category_loads(self):
        import json
        import tempfile
        from audiogen.spec import load_config
        cfg = json.loads((Path(__file__).resolve().parent.parent / "example" / "config.json").read_text())
        with tempfile.TemporaryDirectory() as t:
            p = Path(t) / "c.json"
            p.write_text(json.dumps(cfg))
            c = load_config(p)
            self.assertEqual(c.categories["quiet"].tail["minFadeMs"], 150)
            self.assertIsNone(c.categories["music"].tail)
        cues = load_cues  # noqa: F841


class GpuOnly(unittest.TestCase):
    """Fake torch: no CUDA means no audio, never the CPU."""

    def torch(self, cuda=True, took=1):
        import types
        c = types.SimpleNamespace(is_available=lambda: cuda, reset_peak_memory_stats=lambda: None,
                                  memory_allocated=lambda: 5, max_memory_allocated=lambda: 5 + took)
        return types.SimpleNamespace(cuda=c, set_num_threads=lambda n: self.assertEqual(n, 2))

    def test_workers_start_under_nice(self):
        import tempfile
        from unittest import mock
        from audiogen import backends as B
        c = parse_cue({"name": "a", "prompt": "p", "category": "music", "length": 1}, None)
        with tempfile.TemporaryDirectory() as t, mock.patch.object(B.subprocess, "run", return_value=mock.Mock(returncode=0)) as run:
            B.make("stable-audio-3", {"licence": "x", "python": sys.executable}, Path(t)).generate([B.Job(cue=c, n=1, seed=1, seconds=1.0, out=Path(t) / "a.wav")])
        cmd = run.call_args[0][0]
        self.assertEqual(cmd[:3], ["nice", "-n", "19"])
        self.assertTrue(cmd[4].endswith("stable_audio_3_worker.py"))

    def test_no_cuda_exits_and_threads_are_capped(self):
        import os
        from unittest import mock
        from audiogen import gpu
        self.assertEqual((os.environ["OMP_NUM_THREADS"], os.environ["MKL_NUM_THREADS"]), ("2", "2"))
        with mock.patch.dict(sys.modules, {"torch": self.torch()}):
            self.assertTrue(gpu.cuda("x").cuda.is_available())
        with mock.patch.dict(sys.modules, {"torch": self.torch(cuda=False)}), self.assertRaises(SystemExit) as e:
            gpu.cuda("x")
        self.assertEqual(e.exception.code, 3)

    def test_first_generation_must_take_cuda_memory(self):
        from audiogen import gpu
        self.assertEqual(gpu.first(self.torch(), "x", lambda: 7), 7)
        with self.assertRaises(SystemExit) as e:
            gpu.first(self.torch(took=0), "x", lambda: 7)
        self.assertEqual(e.exception.code, 3)

class DeliverSeam(unittest.TestCase):
    def _run(self, loop_len):
        import tempfile
        from unittest import mock
        from audiogen import post as P
        from audiogen.spec import Category
        sh = lambda f: P.Shipped(path=Path(f), rate=48000, samples=4800, true_peak=-3.0, integrated=-20.0, priming=0, lag=100)
        with tempfile.TemporaryDirectory() as t, mock.patch.object(P, "ship_source", return_value=0.1), \
                mock.patch.object(P, "encode", return_value=(Path("a.webm"), Path("a.m4a"))), mock.patch.object(P, "inspect", side_effect=lambda f, s: sh(f)):
            src = Path(t) / "f.wav"
            src.write_bytes(b"")
            with mock.patch.object(P.shutil, "copyfile"):
                return P.deliver(src, Path(t) / "o", Category(name="c", kind="sfx", lufs=-20), 1, 48000, loop_len, Path(t) / "tmp")

    def test_one_shot_skips_loop_offset_check(self):
        self._run(None)

    def test_loop_keeps_loop_offset_check(self):
        from audiogen import post as P
        with self.assertRaises(P.PostError):
            self._run(2.0)


if __name__ == "__main__":
    unittest.main()
