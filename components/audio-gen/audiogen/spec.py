"""Cue spec and pipeline config: loading, validation and the derived numbers (lengths, seeds, file names).

Nothing here knows about any particular game. A game supplies two JSON files:
  * a config (where files go, loudness per category, the backends and their licences);
  * one or more cue specs (what to generate).
See ../README.md for both formats.
"""

from __future__ import annotations

import json
import os
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

MODES = ("oneshot", "loop")


class SpecError(ValueError):
    """A cue spec or config that cannot be used; the message says which field and why."""


def expand(path: str, base: Path) -> Path:
    """Expand ~ and environment variables; a relative path is taken from `base`."""
    p = Path(os.path.expandvars(os.path.expanduser(path)))
    return p if p.is_absolute() else (base / p)


@dataclass
class Category:
    name: str
    kind: str  # "sfx" or "music"
    lufs: float
    true_peak: float = -1.0
    channels: int = 1
    backend: str | None = None
    # ffmpeg audio filters applied after trimming and before loudness (e.g. "highpass=f=120").
    filters: str = ""
    fade_in_ms: float = 5.0
    fade_out_ms: float = 30.0
    trim_silence: bool = True
    silence_db: float = -60.0
    # Files shorter than this are peak-normalised (the EBU R128 gate needs 400 ms of signal).
    peak_below_s: float = 1.0
    peak_dbfs: float = -3.0
    opus_kbps: int = 32
    aac_kbps: int = 64
    layout: str = "{kind}/{name}-{n}"
    priority: str | None = None
    # the "rings out" rule (tail.py): {"endBelowDbfs", "minFadeMs"}; one-shots only. Replaces the silence trim.
    tail: dict[str, Any] | None = None


@dataclass
class Config:
    path: Path
    root: Path
    output_dir: Path
    manifest: Path
    work_dir: Path
    categories: dict[str, Category]
    backends: dict[str, dict[str, Any]]
    env_files: list[str] = field(default_factory=list)
    sample_rate: int = 44100


@dataclass
class Cue:
    name: str
    prompt: str
    category: str
    length: float  # seconds: the one-shot's maximum length, or the loop's exact length
    variations: int = 1
    mode: str = "oneshot"
    negative_prompt: str = ""
    tempo: float | None = None  # bpm, music
    bars: int | None = None
    beats_per_bar: int = 4
    key: str | None = None
    seed: int | None = None
    backend: str | None = None
    channels: int | None = None
    crossfade: float = 1.5  # loop seam crossfade, seconds
    skip: float = 0.0  # seconds of the raw generation dropped from the start (an intro)
    generate: float | None = None  # seconds to ask the generator for (loops: more than needed, to avoid its ending)
    max_drop_db: float = 0.0  # loops: fail when a second is this far below the median level (0 = off)
    group: str | None = None  # stems normalised together
    options: dict[str, Any] = field(default_factory=dict)  # passed to the backend as is
    notes: str = ""
    lyrics: str = ""  # K485: YuE2 sung lyrics (section tags allowed); empty = instrumental

    @property
    def is_loop(self) -> bool:
        return self.mode == "loop"

    def seed_for(self, n: int) -> int:
        """The seed of variation n (1-based). Deterministic, so a keeper can be re-rendered."""
        base = self.seed if self.seed is not None else zlib.crc32(self.name.encode("utf-8")) % 1_000_000_000
        return base + (n - 1)

    def raw_seconds(self) -> float:
        """How long to ask the generator for: loops need the seam tail and a margin."""
        if self.generate is not None:
            return self.generate
        if self.is_loop:
            return round(self.skip + self.length + self.crossfade + 2.0, 3)
        return self.length


def loop_length(tempo: float, bars: int, beats_per_bar: int = 4) -> float:
    """Seconds in `bars` whole bars: bars x beats x 60 / bpm."""
    return bars * beats_per_bar * 60.0 / tempo


def _num(obj: dict, key: str, where: str, default: Any = None, required: bool = False) -> Any:
    if key not in obj or obj[key] is None:
        if required:
            raise SpecError(f"{where}: missing '{key}'")
        return default
    v = obj[key]
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise SpecError(f"{where}: '{key}' must be a number, got {v!r}")
    return v


def load_config(path: str | Path) -> Config:
    path = Path(path).resolve()
    data = json.loads(path.read_text(encoding="utf-8"))
    base = path.parent
    root = expand(data.get("root", "."), base).resolve()
    cats: dict[str, Category] = {}
    for name, c in (data.get("categories") or {}).items():
        where = f"config categories.{name}"
        kind = c.get("kind")
        if kind not in ("sfx", "music"):
            raise SpecError(f"{where}: 'kind' must be 'sfx' or 'music'")
        known = {f for f in Category.__dataclass_fields__}  # noqa: SLF001
        camel = {
            "truePeak": "true_peak",
            "fadeInMs": "fade_in_ms",
            "fadeOutMs": "fade_out_ms",
            "trimSilence": "trim_silence",
            "silenceDb": "silence_db",
            "peakBelowS": "peak_below_s",
            "peakDbfs": "peak_dbfs",
            "opusKbps": "opus_kbps",
            "aacKbps": "aac_kbps",
        }
        kwargs = {}
        for k, v in c.items():
            k2 = camel.get(k, k)
            if k2 not in known:
                raise SpecError(f"{where}: unknown field '{k}'")
            kwargs[k2] = v
        kwargs["name"] = name
        _num(c, "lufs", where, required=True)
        cats[name] = Category(**kwargs)
    if not cats:
        raise SpecError("config: no categories")
    backends = data.get("backends") or {}
    for b, opts in backends.items():
        if "licence" not in opts:
            raise SpecError(f"config backends.{b}: missing 'licence' (it goes in every manifest entry)")
    out = expand(data.get("outputDir", "public/audio"), root)
    return Config(
        path=path,
        root=root,
        output_dir=out,
        manifest=expand(data.get("manifest", str(out / "manifest.json")), root),
        work_dir=expand(data.get("workDir", "~/.cache/audiogen"), root),
        categories=cats,
        backends=backends,
        env_files=list(data.get("envFiles") or []),
        sample_rate=int(data.get("sampleRate", 44100)),
    )


def parse_cue(obj: dict, cfg: Config | None, index: int = 0) -> Cue:
    where = f"cue #{index + 1}"
    if not isinstance(obj, dict):
        raise SpecError(f"{where}: must be an object")
    name = obj.get("name")
    if not isinstance(name, str) or not name or not all(ch.isalnum() or ch in "-_" for ch in name):
        raise SpecError(f"{where}: 'name' must be letters, digits, '-' or '_', got {name!r}")
    where = f"cue '{name}'"
    prompt = obj.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise SpecError(f"{where}: missing 'prompt'")
    category = obj.get("category")
    if not isinstance(category, str):
        raise SpecError(f"{where}: missing 'category'")
    if cfg is not None and category not in cfg.categories:
        raise SpecError(f"{where}: category '{category}' is not in the config ({', '.join(cfg.categories)})")
    mode = obj.get("mode", "loop" if obj.get("loop") is True else "oneshot")
    if mode not in MODES:
        raise SpecError(f"{where}: 'mode' must be one of {MODES}")
    tempo = _num(obj, "tempo", where)
    bars = _num(obj, "bars", where)
    bpb = int(_num(obj, "beatsPerBar", where, 4))
    length = _num(obj, "length", where)
    if mode == "loop":
        if tempo is not None and bars is not None:
            exact = loop_length(tempo, int(bars), bpb)
            if length is not None and abs(length - exact) > 0.01:
                raise SpecError(f"{where}: length {length} s is not {bars} bars at {tempo} bpm ({exact:.3f} s)")
            length = exact
        elif tempo is not None and length is not None:
            bar = bpb * 60.0 / tempo
            if abs(length / bar - round(length / bar)) > 1e-6:
                raise SpecError(f"{where}: a loop must be whole bars; {length} s at {tempo} bpm is {length / bar:.3f} bars")
    if length is None or length <= 0:
        raise SpecError(f"{where}: 'length' (seconds) must be > 0, or give 'tempo' and 'bars' for a loop")
    variations = int(_num(obj, "variations", where, 1))
    if variations < 1 or variations > 50:
        raise SpecError(f"{where}: 'variations' must be 1 to 50")
    seed = _num(obj, "seed", where)
    channels = _num(obj, "channels", where)
    if channels is not None and channels not in (1, 2):
        raise SpecError(f"{where}: 'channels' must be 1 or 2")
    crossfade = float(_num(obj, "crossfade", where, 1.5))
    if mode == "loop" and not (0 < crossfade < length / 2):
        raise SpecError(f"{where}: 'crossfade' must be > 0 and under half the loop")
    backend = obj.get("backend")
    if cfg is not None and backend is not None and backend not in cfg.backends:
        raise SpecError(f"{where}: backend '{backend}' is not in the config")
    known = {
        "name", "prompt", "negativePrompt", "category", "mode", "loop", "length", "variations", "tempo", "bars",
        "beatsPerBar", "key", "seed", "backend", "channels", "crossfade", "skip", "group", "options", "notes",
        "generate", "maxDropDb", "lyrics",
    }  # fmt: skip
    unknown = set(obj) - known
    if unknown:
        raise SpecError(f"{where}: unknown field(s) {sorted(unknown)}")
    skip = float(_num(obj, "skip", where, 0.0))
    generate = _num(obj, "generate", where)
    if generate is not None and mode == "loop" and generate < skip + length + crossfade:
        raise SpecError(f"{where}: 'generate' {generate} s is less than skip + length + crossfade "
                        f"({skip + length + crossfade:.2f} s)")  # fmt: skip
    return Cue(
        name=name,
        prompt=prompt.strip(),
        category=category,
        length=float(length),
        variations=variations,
        mode=mode,
        negative_prompt=str(obj.get("negativePrompt", "")),
        tempo=float(tempo) if tempo is not None else None,
        bars=int(bars) if bars is not None else None,
        beats_per_bar=bpb,
        key=obj.get("key"),
        seed=int(seed) if seed is not None else None,
        backend=backend,
        channels=int(channels) if channels is not None else None,
        crossfade=crossfade,
        skip=skip,
        generate=float(generate) if generate is not None else None,
        max_drop_db=float(_num(obj, "maxDropDb", where, 18.0 if mode == "loop" else 0.0)),
        group=obj.get("group"),
        options=dict(obj.get("options") or {}),
        notes=str(obj.get("notes", "")),
        lyrics=str(obj.get("lyrics") or "").strip(),
    )


def load_cues(paths: list[str | Path], cfg: Config | None) -> list[Cue]:
    cues: list[Cue] = []
    seen: set[str] = set()
    for p in paths:
        data = json.loads(Path(p).read_text(encoding="utf-8"))
        items = data.get("cues") if isinstance(data, dict) else data
        if not isinstance(items, list):
            raise SpecError(f"{p}: expected {{\"cues\": [...]}} or a list")
        for i, obj in enumerate(items):
            cue = parse_cue(obj, cfg, i)
            if cue.name in seen:
                raise SpecError(f"{p}: cue '{cue.name}' appears twice")
            seen.add(cue.name)
            cues.append(cue)
    return cues


def output_stem(cue: Cue, cat: Category, n: int) -> str:
    """The file path (no extension) of variation n, relative to the output dir.

    `layout` placeholders: {kind}, {category}, {name}, {n}. A single-variation cue drops a trailing "-{n}"."""
    layout = cat.layout
    if cue.variations == 1 and layout.endswith("-{n}"):
        layout = layout[: -len("-{n}")]
    return layout.format(kind=cat.kind, category=cat.name, name=cue.name, n=n)


# the backend (config key) a category gets when neither it nor the cue names one
DEFAULTS = {"sfx": "sa3", "music": "yue2"}


def resolve_backend(cue: Cue, cat: Category, override: str | None) -> str | None:
    return override or cue.backend or cat.backend or DEFAULTS.get(cat.kind)
