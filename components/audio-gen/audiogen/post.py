"""ffmpeg post-processing: trim, filters, fades, loop seam, loudness, encode. Needs ffmpeg and ffprobe on PATH."""

from __future__ import annotations

import json
import re
import shutil
import struct
import subprocess
from array import array
from dataclasses import dataclass
from pathlib import Path

from .spec import Category, Cue
from .tail import TailRule, apply_tail_info, check_cap

FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"


class PostError(RuntimeError):
    pass


def have_ffmpeg() -> bool:
    return shutil.which(FFMPEG) is not None and shutil.which(FFPROBE) is not None


def run(args: list[str]) -> str:
    """Run ffmpeg or ffprobe; return stderr+stdout (ffmpeg prints its measurements on stderr)."""
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode != 0:
        tail = "\n".join((p.stderr or "").strip().splitlines()[-12:])
        raise PostError(f"{args[0]} failed ({p.returncode}):\n{tail}")
    return (p.stdout or "") + (p.stderr or "")


def ff(*args: str) -> str:
    return run([FFMPEG, "-hide_banner", "-nostdin", "-y", *args])


def duration(path: Path) -> float:
    out = run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)])
    return float(json.loads(out[out.index("{") :])["format"]["duration"])


def samples(path: Path) -> int:
    """Exact sample count of a PCM WAV (header-based; the files here are always our own WAVs)."""
    out = run([FFPROBE, "-v", "error", "-select_streams", "a:0", "-count_packets", "-show_entries",
               "stream=duration_ts,sample_rate", "-of", "json", str(path)])  # fmt: skip
    s = json.loads(out[out.index("{") :])["streams"][0]
    return int(s["duration_ts"])


@dataclass
class Loudness:
    integrated: float  # LUFS; -70 when the gate saw nothing
    true_peak: float  # dBTP
    sample_peak: float  # dBFS


def measure(path: Path) -> Loudness:
    out = ff("-i", str(path), "-af", "ebur128=peak=true+sample:framelog=quiet", "-f", "null", "-")
    summary = out[out.rfind("Summary:") :] if "Summary:" in out else out

    def grab(label: str) -> float:
        m = re.search(label + r"\s*:?\s*(-?inf|-?[\d.]+)", summary)
        if not m:
            raise PostError(f"ebur128: no '{label}' in output")
        v = m.group(1)
        return -70.0 if "inf" in v else float(v)

    integrated = grab(r"I:")
    tp = re.search(r"True peak:\s*Peak:\s*(-?inf|-?[\d.]+)", summary)
    sp = re.search(r"Sample peak:\s*Peak:\s*(-?inf|-?[\d.]+)", summary)
    if not tp or not sp:
        raise PostError("ebur128: no peak in output")
    f = lambda m: -120.0 if "inf" in m.group(1) else float(m.group(1))  # noqa: E731
    return Loudness(integrated=integrated, true_peak=f(tp), sample_peak=f(sp))


def to_wav(src: Path, dst: Path, rate: int, channels: int) -> None:
    """Decode anything to float WAV at the pipeline rate and channel count."""
    ff("-i", str(src), "-ac", str(channels), "-ar", str(rate), "-c:a", "pcm_f32le", str(dst))


def clean(src: Path, dst: Path, cue: Cue, cat: Category, rate: int, channels: int) -> dict | None:
    """Trim silence, apply the category filters, cut to length and fade (one-shots); cut, seam and fade (loops)."""
    chain: list[str] = [f"aresample={rate}"]
    if cue.is_loop:
        if cue.skip > 0:
            chain.append(f"atrim=start={cue.skip},asetpts=PTS-STARTPTS")
        if cat.filters:
            chain.append(cat.filters)
        tmp = dst.with_suffix(".pre.wav")
        ff("-i", str(src), "-af", ",".join(chain), "-ac", str(channels), "-c:a", "pcm_f32le", str(tmp))
        try:
            loop_seam(tmp, dst, cue.length, cue.crossfade, rate)
        finally:
            tmp.unlink(missing_ok=True)
        if cue.max_drop_db > 0:
            check_steady(dst, cue.max_drop_db, f"{cue.name}")
        return
    if cat.tail:
        pre = dst.with_suffix(".pre.wav")
        try:
            src2 = src
            if cat.filters:
                src2 = dst.with_suffix(".flt.wav")
                ff("-i", str(src), "-af", f"aresample={rate},{cat.filters}", "-c:a", "pcm_f32le", str(src2))
            rule = TailRule.from_category({"tail": cat.tail, "fadeOutMs": cat.fade_out_ms, "fadeInMs": cat.fade_in_ms})
            y, info = apply_tail_info(list(decode_mono(src2, rate)), rate, cue.length, rule)
            bad = check_cap(y, rate, cue.length, rule)
            if bad:
                raise PostError(f"{cue.name}: {bad}")
            write_f32(pre, y, rate)
            ff("-i", str(pre), "-ac", str(channels), "-c:a", "pcm_f32le", str(dst))
        finally:
            pre.unlink(missing_ok=True)
            dst.with_suffix(".flt.wav").unlink(missing_ok=True)
        return info if rule.cap_s(cue.length) is not None else None
    if cat.trim_silence:
        th = f"{cat.silence_db}dB"
        # leading silence, then trailing silence (reverse, trim leading, reverse back)
        chain += [
            f"silenceremove=start_periods=1:start_threshold={th}:start_silence=0.004",
            "areverse",
            f"silenceremove=start_periods=1:start_threshold={th}:start_silence=0.02",
            "areverse",
        ]
    if cat.filters:
        chain.append(cat.filters)
    chain.append(f"atrim=end={cue.length},asetpts=PTS-STARTPTS")
    tmp = dst.with_suffix(".pre.wav")
    ff("-i", str(src), "-af", ",".join(chain), "-ac", str(channels), "-c:a", "pcm_f32le", str(tmp))
    try:
        d = duration(tmp)
        if d < 0.01:
            raise PostError(f"{cue.name}: nothing left after trimming silence (all below {cat.silence_db} dB)")
        fin = min(cat.fade_in_ms / 1000.0, d / 4)
        fout = min(cat.fade_out_ms / 1000.0, d / 2)
        fades = [f"afade=t=in:st=0:d={fin:.4f}:curve=qsin"] if fin > 0 else []
        if fout > 0:
            fades.append(f"afade=t=out:st={max(0.0, d - fout):.4f}:d={fout:.4f}:curve=qsin")
        if fades:
            ff("-i", str(tmp), "-af", ",".join(fades), "-c:a", "pcm_f32le", str(dst))
        else:
            shutil.copyfile(tmp, dst)
    finally:
        tmp.unlink(missing_ok=True)


def loop_seam(src: Path, dst: Path, length: float, xfade: float, rate: int) -> None:
    """Make a seamless loop of exactly `length` seconds (to the sample).

    out[0:x]  = src[0:x] faded in (equal power) + src[L:L+x] faded out (the tail wraps onto the head)
    out[x:L]  = src[x:L]
    So playing out[L-1] then out[0] continues src[L-1] -> ~src[L]: no seam, no click."""
    L = round(length * rate)
    X = round(xfade * rate)
    have = samples(src)
    if have < L + X:
        raise PostError(f"loop needs {(L + X) / rate:.2f} s of audio, the generator gave {have / rate:.2f} s")
    # acrossfade(A, B) = A faded out over B faded in, then the rest of B. With A = src[L:L+x] (exactly x long)
    # and B = src[0:L], the result is the seam described above and is L samples long.
    graph = (
        f"[0:a]atrim=start_sample={L}:end_sample={L + X},asetpts=PTS-STARTPTS[tail];"
        f"[1:a]atrim=start_sample=0:end_sample={L},asetpts=PTS-STARTPTS[head];"
        f"[tail][head]acrossfade=ns={X}:o=1:c1=qsin:c2=qsin[out]"
    )
    ff("-i", str(src), "-i", str(src), "-filter_complex", graph, "-map", "[out]", "-c:a", "pcm_f32le", str(dst))
    got = samples(dst)
    if got != L:
        raise PostError(f"loop seam produced {got} samples, expected {L}")


def level_profile(path: Path, window: float = 1.0) -> list[float]:
    """RMS level in dB of each `window` seconds (both channels together)."""
    meta = path.with_suffix(".rms.txt")
    rate = int(json.loads(run([FFPROBE, "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate",
                               "-of", "json", str(path)]))["streams"][0]["sample_rate"])  # fmt: skip
    n = max(1, round(rate * window))
    try:
        ff("-i", str(path), "-af", f"asetnsamples=n={n}:p=0,astats=metadata=1:reset=1,"
           f"ametadata=print:key=lavfi.astats.Overall.RMS_level:file={meta}", "-f", "null", "-")  # fmt: skip
        vals = []
        for line in meta.read_text().splitlines():
            if "RMS_level=" in line:
                v = line.split("=", 1)[1]
                vals.append(-120.0 if "inf" in v else float(v))
        return vals
    finally:
        meta.unlink(missing_ok=True)


def check_steady(path: Path, max_drop_db: float, what: str) -> None:
    """A loop must not contain a fade or a silence (the generator ending its 'song' early): every second must be
    within `max_drop_db` of the median level."""
    prof = level_profile(path)
    if len(prof) < 3:
        return
    med = sorted(prof)[len(prof) // 2]
    low = [i for i, v in enumerate(prof) if v < med - max_drop_db]
    if low:
        raise PostError(
            f"{what}: the loop drops more than {max_drop_db:g} dB below its median level ({med:.0f} dB) at "
            f"{low[0]}-{low[-1] + 1} s (a fade-out or silence in the generation). Ask for more audio with the cue's "
            f"'generate' seconds, or move 'skip', and generate again (without --reuse-raw)."
        )


def gain_for(m: Loudness, cat: Category, dur: float) -> tuple[float, str]:
    """The linear gain (dB) toward the category target, and the rule used."""
    if dur < cat.peak_below_s or m.integrated <= -69.0:
        return cat.peak_dbfs - m.sample_peak, f"peak {cat.peak_dbfs} dBFS"
    return cat.lufs - m.integrated, f"{cat.lufs} LUFS"


def normalise(src: Path, dst: Path, cat: Category, rate: int, gain_db: float | None = None) -> tuple[Loudness, str]:
    """Apply gain to the target, limit true peak to the category ceiling, and return the final measurement.

    The limiter runs at 4x the rate so it catches inter-sample peaks; a final trim guarantees the ceiling."""
    m0 = measure(src)
    dur = duration(src)
    if gain_db is None:
        gain_db, rule = gain_for(m0, cat, dur)
    else:
        rule = "group gain"
    ceiling = cat.true_peak
    limit_lin = 10 ** ((ceiling - 0.3) / 20)
    chain = f"volume={gain_db:.3f}dB"
    if m0.true_peak + gain_db > ceiling - 0.3:
        chain += f",aresample={rate * 4},alimiter=limit={limit_lin:.5f}:attack=1:release=40:level=false,aresample={rate}"
    tmp = dst.with_suffix(".norm.wav")
    ff("-i", str(src), "-af", chain, "-c:a", "pcm_f32le", str(tmp))
    m1 = measure(tmp)
    if m1.true_peak > ceiling:
        ff("-i", str(tmp), "-af", f"volume={ceiling - m1.true_peak - 0.05:.3f}dB", "-c:a", "pcm_f32le", str(dst))
        tmp.unlink(missing_ok=True)
        m1 = measure(dst)
    else:
        tmp.replace(dst)
    return m1, rule


def group_gain(paths: list[Path], cat: Category) -> float:
    """One gain for a set of stems, from the loudness of their sum, so the layer balance stays as designed."""
    if len(paths) == 1:
        m = measure(paths[0])
        return cat.lufs - m.integrated
    tmp = paths[0].with_name("_groupsum.wav")
    args: list[str] = []
    for p in paths:
        args += ["-i", str(p)]
    ff(*args, "-filter_complex", f"amix=inputs={len(paths)}:normalize=0:duration=longest", "-c:a", "pcm_f32le",
       str(tmp))  # fmt: skip
    try:
        return cat.lufs - measure(tmp).integrated
    finally:
        tmp.unlink(missing_ok=True)


def encode(src: Path, stem: Path, cat: Category, channels: int) -> tuple[Path, Path]:
    """Opus in WebM (the main file) and AAC in .m4a (the fallback for older iOS Safari)."""
    stem.parent.mkdir(parents=True, exist_ok=True)
    webm = stem.parent / (stem.name + ".webm")
    m4a = stem.parent / (stem.name + ".m4a")
    ff("-i", str(src), "-ac", str(channels), "-c:a", "libopus", "-b:a", f"{cat.opus_kbps}k", "-vbr", "on",
       "-application", "audio", "-map_metadata", "-1", "-f", "webm", str(webm))  # fmt: skip
    ff("-i", str(src), "-ac", str(channels), "-c:a", "aac", "-b:a", f"{cat.aac_kbps}k", "-map_metadata", "-1",
       "-movflags", "+faststart", str(m4a))  # fmt: skip
    return webm, m4a


# ---------------------------------------------------------------------------------------------------------------
# Delivery: encode, then measure and check the files that ship (decoded), not the WAV they came from.
# ---------------------------------------------------------------------------------------------------------------

LOOP_MARGIN = 0.05  # music.md section 4: loops carry 50 ms past loop.end (the loop's own start, so it is seamless)


@dataclass
class Shipped:
    """One encoded file, as a decoder that honours the container's trim (Opus pre-skip, MP4 edit list) sees it."""

    path: Path
    rate: int  # decoded sample rate (Opus always decodes at 48 kHz)
    samples: int  # decoded length in samples
    true_peak: float  # dBTP of the decoded audio
    integrated: float  # LUFS of the decoded audio
    priming: int  # encoder delay in samples at `rate` that the container tells the decoder to drop
    lag: int  # offset of the decoded audio against the source, in samples (0 = sample-aligned)

    @property
    def seconds(self) -> float:
        return self.samples / self.rate


def _probe_stream(path: Path) -> dict:
    out = run([FFPROBE, "-v", "error", "-select_streams", "a:0", "-show_entries",
               "stream=codec_name,sample_rate,initial_padding,duration_ts,time_base", "-of", "json", str(path)])  # fmt: skip
    return json.loads(out[out.index("{") :])["streams"][0]


def decode_mono(path: Path, rate: int) -> array:
    """Decode to mono float32 at `rate` (ffmpeg honours Opus pre-skip and the MP4 edit list's start)."""
    p = subprocess.run([FFMPEG, "-v", "error", "-nostdin", "-i", str(path), "-ac", "1", "-ar", str(rate),
                        "-f", "f32le", "-"], capture_output=True)  # fmt: skip
    if p.returncode != 0:
        raise PostError(f"cannot decode {path.name}: {p.stderr.decode('utf-8', 'replace')[-300:]}")
    a = array("f")
    a.frombytes(p.stdout[: len(p.stdout) // 4 * 4])
    return a


def write_f32(path: Path, x: list[float], rate: int) -> None:
    """Write mono float samples as a float WAV (through ffmpeg; no numpy)."""
    p = subprocess.run([FFMPEG, "-v", "error", "-nostdin", "-y", "-f", "f32le", "-ar", str(rate), "-ac", "1", "-i", "-",
                        "-c:a", "pcm_f32le", str(path)], input=array("f", x).tobytes(), capture_output=True)  # fmt: skip
    if p.returncode != 0:
        raise PostError(f"cannot write {path.name}: {p.stderr.decode('utf-8', 'replace')[-300:]}")


def mp4_priming(path: Path) -> int:
    """The AAC encoder delay: media_time of the first edit list entry (moov/trak/edts/elst), in samples."""
    data = path.read_bytes()

    def boxes(start: int, end: int):  # noqa: ANN202
        i = start
        while i + 8 <= end:
            size, kind = struct.unpack(">I4s", data[i : i + 8])
            head = 8
            if size == 1:
                size = struct.unpack(">Q", data[i + 8 : i + 16])[0]
                head = 16
            elif size == 0:
                size = end - i
            if size < head:
                return
            yield kind.decode("latin-1"), i + head, i + size
            i += size

    def find(start: int, end: int, names: list[str]) -> tuple[int, int] | None:
        for kind, s, e in boxes(start, end):
            if kind == names[0]:
                return (s, e) if len(names) == 1 else find(s, e, names[1:])
        return None

    hit = find(0, len(data), ["moov", "trak", "edts", "elst"])
    if not hit:
        return 0
    s = hit[0]
    version = data[s]
    if struct.unpack(">I", data[s + 4 : s + 8])[0] < 1:
        return 0
    if version == 1:
        return max(0, struct.unpack(">q", data[s + 16 : s + 24])[0])
    return max(0, struct.unpack(">i", data[s + 12 : s + 16])[0])


def best_lag(ref: array, got: array, start: int, n: int, search: int) -> int:
    """The shift d (|d| <= search) that best aligns got[start+d:...] with ref[start:start+n] (normalised
    cross-correlation)."""
    start = max(start, search)
    n = min(n, len(ref) - start, len(got) - start - search)
    if n < 16:
        return 0
    seg = ref[start : start + n]
    e_ref = sum(x * x for x in seg) or 1e-12
    best, best_d = -2.0, 0
    for d in range(-search, search + 1):
        g = got[start + d : start + d + n]
        dot = sum(a * b for a, b in zip(seg, g))
        e_g = sum(x * x for x in g) or 1e-12
        c = dot / (e_ref * e_g) ** 0.5
        if c > best:
            best, best_d = c, d
    return best_d


def ship_source(final: Path, dst: Path, loop_len: float | None, rate: int) -> float:
    """The audio that is encoded: the final WAV, plus for a loop LOOP_MARGIN seconds of its own start after the end
    (so the codec's last frame never cuts the loop). Returns the expected decoded length in seconds."""
    if loop_len is None:
        shutil.copyfile(final, dst)
        return samples(final) / rate
    m = round(LOOP_MARGIN * rate)
    graph = (f"[0:a]asetpts=PTS-STARTPTS[a];[1:a]atrim=start_sample=0:end_sample={m},asetpts=PTS-STARTPTS[b];"
             f"[a][b]concat=n=2:v=0:a=1[out]")  # fmt: skip
    ff("-i", str(final), "-i", str(final), "-filter_complex", graph, "-map", "[out]", "-c:a", "pcm_f32le", str(dst))
    return samples(dst) / rate


def inspect(path: Path, source: Path) -> Shipped:
    """Decode a shipped file and measure it: length, true peak, loudness, priming, and alignment to the source."""
    st = _probe_stream(path)
    rate = int(st["sample_rate"])
    m = measure(path)
    got = decode_mono(path, rate)
    if st.get("codec_name") == "opus":
        priming = int(st.get("initial_padding") or 0)
        n = len(got)
    else:
        priming = mp4_priming(path)
        # ffmpeg drops the edit list's start but decodes the last frame's padding; the edit list's length is what a
        # trimming decoder returns
        n = int(st["duration_ts"]) if st.get("duration_ts") and st.get("time_base") == f"1/{rate}" else len(got)
    ref = decode_mono(source, rate)
    window = min(4096, max(64, len(ref) // 2))
    start = min(len(ref) // 4, rate)  # a quarter in (at most 1 s): past any fade-in
    lag = best_lag(ref, got, start, window, search=min(96, max(8, len(ref) // 8)))
    return Shipped(path=path, rate=rate, samples=n, true_peak=m.true_peak, integrated=m.integrated, priming=priming,
                   lag=lag)  # fmt: skip


def deliver(final: Path, stem: Path, cat: Category, channels: int, rate: int, loop_len: float | None,
            tmp_dir: Path, max_tries: int = 5) -> tuple[Shipped, Shipped, float]:  # fmt: skip
    """Encode .webm and .m4a, then check the decoded files:
    * true peak at or below the category ceiling; lossy codecs overshoot the source's peaks (AAC by about 1.5 dB on
      dense music), so when a file is over, the source's peaks are limited lower (4x oversampled, which keeps the
      loudness) and both files are re-encoded; the last try lowers the gain instead;
    * length within 1 ms of the source (a loop: loop + LOOP_MARGIN);
    * sample-aligned with the source within 1 ms, so loop points in seconds hold in a decoder that honours the trim.
    Returns both files and the encode headroom used (dB, <= 0: how far under the ceiling the source peaks were set)."""
    tmp_dir.mkdir(parents=True, exist_ok=True)
    src = tmp_dir / (stem.name + ".ship.wav")
    orig = tmp_dir / (stem.name + ".ship0.wav")
    expected = ship_source(final, orig, loop_len, rate)
    shutil.copyfile(orig, src)
    headroom = 0.0
    try:
        for attempt in range(max_tries):
            webm, m4a = encode(src, stem, cat, channels)
            shipped = [inspect(f, src) for f in (webm, m4a)]
            worst = max(s.true_peak for s in shipped)
            if worst <= cat.true_peak:
                break
            if attempt == max_tries - 1:
                raise PostError(f"{stem.name}: the encoded true peak stays at {worst:.2f} dBTP, above "
                                f"{cat.true_peak} dBTP, after {max_tries} tries")  # fmt: skip
            headroom -= worst - cat.true_peak + 0.15
            limit_lin = 10 ** ((cat.true_peak + headroom) / 20)
            if attempt < max_tries - 2:
                chain = f"aresample={rate * 4},alimiter=limit={limit_lin:.5f}:attack=1:release=40:level=false,aresample={rate}"
            else:  # a stubborn file: plain gain
                chain = f"volume={headroom:.3f}dB"
            ff("-i", str(orig), "-af", chain, "-c:a", "pcm_f32le", str(src))
        for s in shipped:
            tol = max(2, round(0.001 * s.rate))
            if abs(s.samples - round(expected * s.rate)) > tol:
                raise PostError(f"{s.path.name}: decodes to {s.seconds:.4f} s, expected {expected:.4f} s")
            if loop_len is not None and abs(s.lag) > tol:  # only loops need alignment
                raise PostError(f"{s.path.name}: the decoded audio is offset {1000 * s.lag / s.rate:.2f} ms from the "
                                f"source (over 1 ms), so loop points would be wrong")  # fmt: skip
        return shipped[0], shipped[1], headroom
    finally:
        src.unlink(missing_ok=True)
        orig.unlink(missing_ok=True)
