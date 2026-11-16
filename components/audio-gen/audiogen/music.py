"""Music from written notes: a score (JSON) to MIDI, rendered through a soundfont, one stem per layer, every stem cut to
the exact loop length so that layers stack. Needs fluidsynth and ffmpeg for render(); the rest is pure Python.

Score: {"tempo": 132, "beatsPerBar": 4, "bars": 16, "layers": {name: {"program": 80, "channel": 0, "drums": false,
"notes": [[startBeat, durBeats, pitch, velocity], ...]}}}. Beats count from 0; a layer on channel 9 or with "drums"
is a percussion layer."""
from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from .spec import loop_length

TPB = 480


def score_length(score: dict) -> float:
    return loop_length(float(score["tempo"]), int(score["bars"]), int(score.get("beatsPerBar", 4)))


def loop_samples(score: dict, rate: int) -> int:
    return round(score_length(score) * rate)


def vlq(n: int) -> bytes:
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def layer_events(layer: dict, ch: int) -> list[tuple[int, int, bytes]]:
    ev = []
    for start, dur, pitch, vel in layer["notes"]:
        on = round(start * TPB)
        off = on + max(1, round(dur * TPB))
        ev.append((on, 1, bytes([0x90 | ch, int(pitch), int(vel)])))
        ev.append((off, 0, bytes([0x80 | ch, int(pitch), 0])))
    return sorted(ev, key=lambda e: (e[0], e[1]))  # at one tick, note-offs first


def track(events: list[tuple[int, int, bytes]], name: str, program: int | None, ch: int, end_tick: int) -> bytes:
    body = b"\x00\xff\x03" + vlq(len(name)) + name.encode()
    if program is not None:
        body += b"\x00" + bytes([0xC0 | ch, program])
    last = 0
    for tick, _, msg in events:
        body += vlq(tick - last) + msg
        last = tick
    body += vlq(max(0, end_tick - last)) + b"\xff\x2f\x00"
    return b"MTrk" + len(body).to_bytes(4, "big") + body


def build_midi(score: dict, names: list[str] | None = None) -> bytes:
    """A format-1 MIDI file of the named layers (all by default). The file ends exactly at the loop's last tick."""
    bpb = int(score.get("beatsPerBar", 4))
    end = round(int(score["bars"]) * bpb * TPB)
    tempo = round(60_000_000 / float(score["tempo"]))
    t0 = (b"\x00\xff\x03\x05tempo" + b"\x00\xff\x51\x03" + tempo.to_bytes(3, "big")
          + b"\x00\xff\x58\x04" + bytes([bpb, 2, 24, 8]) + b"\x00\xff\x2f\x00")
    tracks = [b"MTrk" + len(t0).to_bytes(4, "big") + t0]
    layers = score["layers"]
    for i, n in enumerate(names or list(layers)):
        lay = layers[n]
        ch = 9 if lay.get("drums") else int(lay.get("channel", i if i < 9 else i + 1))
        tracks.append(track(layer_events(lay, ch), n, None if ch == 9 else int(lay.get("program", 0)), ch, end))
    return b"MThd" + (6).to_bytes(4, "big") + (1).to_bytes(2, "big") + len(tracks).to_bytes(2, "big") + TPB.to_bytes(2, "big") + b"".join(tracks)


def parse_midi(data: bytes) -> dict:
    """Header and per-track facts, for tests and checks: {format, tracks, tpb, ends: [last tick of each track]}."""
    assert data[:4] == b"MThd"
    fmt, n, tpb = (int.from_bytes(data[8:10], "big"), int.from_bytes(data[10:12], "big"), int.from_bytes(data[12:14], "big"))
    i, ends, notes = 14, [], []
    for _ in range(n):
        assert data[i:i + 4] == b"MTrk"
        size = int.from_bytes(data[i + 4:i + 8], "big")
        b = data[i + 8:i + 8 + size]
        j, tick, cnt, run = 0, 0, 0, 0
        while j < len(b):
            d = 0
            while True:
                c = b[j]
                j += 1
                d = (d << 7) | (c & 0x7F)
                if not c & 0x80:
                    break
            tick += d
            st = b[j]
            if st == 0xFF:
                ln = b[j + 2]
                j += 3 + ln
                continue
            if st & 0x80:
                run = st
                j += 1
            kind = run & 0xF0
            j += 1 if kind == 0xC0 else 2
            if kind == 0x90:
                cnt += 1
        ends.append(tick)
        notes.append(cnt)
        i += 8 + size
    return {"format": fmt, "tracks": n, "tpb": tpb, "ends": ends, "notes": notes}


def run(args: list[str]) -> None:
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"{args[0]} failed: {(p.stderr or '')[-300:]}")


def render(score: dict, out_dir: Path, soundfont: Path, rate: int = 44100, gain: float = 0.8) -> dict[str, Path]:
    """Render the full mix and one stem per layer to `<out_dir>/<name>.wav`, each exactly loop_samples long (the
    renderer's reverb tail is cut, a short render is padded with silence). Returns name -> path ('full' for the mix)."""
    for tool in ("fluidsynth", "ffmpeg"):
        if shutil.which(tool) is None:
            raise RuntimeError(f"{tool} is not installed (see install/install.sh)")
    if not Path(soundfont).exists():
        raise RuntimeError(f"soundfont not found: {soundfont}")
    out_dir.mkdir(parents=True, exist_ok=True)
    n = loop_samples(score, rate)
    L = n / rate
    paths = {}
    for name, names in [("full", None)] + [(k, [k]) for k in score["layers"]]:
        mid = out_dir / f"_{name}.mid"
        raw = out_dir / f"_{name}.raw.wav"
        mid.write_bytes(build_midi(score, names))
        run(["fluidsynth", "-ni", "-R", "0", "-C", "0", "-g", str(gain), "-r", str(rate), "-F", str(raw), str(soundfont), str(mid)])
        dst = out_dir / f"{name}.wav"
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af", f"apad=whole_dur={L:.6f},atrim=end_sample={n}",
             "-c:a", "pcm_f32le", str(dst)])
        mid.unlink()
        raw.unlink()
        paths[name] = dst
    return paths


def load_score(path: str | Path) -> dict:
    s = json.loads(Path(path).read_text(encoding="utf-8"))
    for k in ("tempo", "bars", "layers"):
        if k not in s:
            raise ValueError(f"score: missing '{k}'")
    return s
