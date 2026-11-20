"""audiogen: generate game audio from a cue spec. Run `python3 scripts/audio/audiogen.py --help`."""

from __future__ import annotations

import argparse
import datetime as dt
import glob
import json
import os
import re
import shutil
import sys
import zlib
from collections import defaultdict
from pathlib import Path
from typing import Any

from . import backends as B
from . import manifest as M
from . import post as P
from .spec import Config, Cue, SpecError, expand, load_config, load_cues, output_stem, resolve_backend

ENV_LINE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$")


def env_value(raw: str) -> str:
    """The value of a dotenv line: inside matching quotes (anything after the closing quote is ignored), or else up to
    an inline ` #` comment, trimmed."""
    s = raw.strip()
    if s[:1] in ("'", '"'):
        end = s.find(s[0], 1)
        return s[1:end] if end > 0 else s[1:]
    cut = re.search(r"\s#", s)
    if cut:
        s = s[: cut.start()]
    return s.strip()


def rel_to(path: Path, base: Path, what: str) -> str:
    """`path` relative to `base` (POSIX), or a clear error when it is not inside it."""
    try:
        return path.resolve().relative_to(base.resolve()).as_posix()
    except ValueError:
        raise SpecError(f"{what} {path} is not inside {base}: put the manifest in the output folder or above it "
                        "(config 'manifest' and 'outputDir')") from None  # fmt: skip


def load_env_files(cfg: Config, extra: list[str] | None = None) -> list[str]:
    """Load the backends' key variables (B.KEY_VARS only; other lines are ignored) from, in order: the `--env-file`
    paths, `.env.local` at the config root (the game repo), and the config's envFiles globs (e.g.
    ~/.config/audiogen/*.env). A variable already set in the environment is never overridden. Returns the variable
    names loaded, never the values."""
    loaded: list[str] = []
    patterns = [str(expand(p, Path.cwd())) for p in (extra or [])]
    patterns += [str(cfg.root / ".env.local")] + [str(expand(p, cfg.root)) for p in cfg.env_files]
    for pattern in patterns:
        for f in sorted(glob.glob(pattern)):
            try:
                lines = Path(f).read_text(encoding="utf-8").splitlines()
            except OSError:
                continue
            for line in lines:
                m = ENV_LINE.match(line)
                if not m or line.lstrip().startswith("#"):
                    continue
                k = m.group(1)
                if k not in B.KEY_VARS:
                    continue
                v = env_value(m.group(2))
                if v and not os.environ.get(k):
                    os.environ[k] = v
                    loaded.append(k)
    return loaded


def plan(cfg: Config, cues: list[Cue], override: str | None) -> dict[str, list[Cue]]:
    by: dict[str, list[Cue]] = defaultdict(list)
    for c in cues:
        b = resolve_backend(c, cfg.categories[c.category], override)
        if b is None:
            raise SpecError(f"cue '{c.name}': no backend (set one on the cue, its category, or pass --backend)")
        if b not in cfg.backends:
            raise SpecError(f"cue '{c.name}': backend '{b}' is not in the config")
        by[b].append(c)
    return by


def cmd_check(cfg: Config, cues: list[Cue], args: argparse.Namespace) -> int:
    loaded = load_env_files(cfg, args.env_file)
    by = plan(cfg, cues, args.backend)
    print(f"config {cfg.path}\noutput {cfg.output_dir}\nmanifest {cfg.manifest}\nwork {cfg.work_dir}")
    if loaded:
        print(f"env files set: {', '.join(loaded)}")
    print(f"ffmpeg: {'ok' if P.have_ffmpeg() else 'MISSING (install ffmpeg)'}")
    for name, cs in by.items():
        be = B.make(name, cfg.backends[name], cfg.root)
        try:
            be.check(cs)
            state = "ready"
        except B.Skip as e:
            state = f"SKIP: {e}"
        files = sum(c.variations for c in cs)
        print(f"\n[{name}] {be.tool} ({be.model or 'default model'}), {len(cs)} cue(s), {files} file(s): {state}")
        for c in cs:
            cat = cfg.categories[c.category]
            extra = f", {c.tempo:g} bpm x {c.bars} bars" if c.tempo and c.bars else ""
            print(f"  {c.name:24} {c.category:8} {c.mode:7} {c.length:7.3f} s x{c.variations}{extra}"
                  f" -> {output_stem(c, cat, 1)}.webm")  # fmt: skip
    return 0


def _gen_jobs(cfg: Config, name: str, be: B.Backend, cs: list[Cue], args: argparse.Namespace, raw_dir: Path
              ) -> tuple[list[B.Job], list[B.Result]]:  # fmt: skip
    jobs: list[B.Job] = []
    reused: list[B.Result] = []
    for c in cs:
        for n in range(1, (args.variations or c.variations) + 1):
            seed = c.seed_for(n)
            secs = c.raw_seconds()
            tl = cfg.categories[c.category].tail
            if tl and not c.is_loop:
                secs = round(secs + float(tl.get("extraGenerateS", 2.0)), 3)  # room for the clip's own decay
            stem = f"{name}--{c.name}-{n}-s{seed}-{secs:g}s" + (f"-L{zlib.crc32(c.lyrics.encode()):08x}" if c.lyrics else "")  # a longer request is a new raw file
            job = B.Job(cue=c, n=n, seed=seed, seconds=secs, out=raw_dir / f"{stem}.wav")
            old = [p for p in sorted(raw_dir.glob(f"{stem}.*")) if p.suffix != ".json"] if args.reuse_raw else []
            if old:
                side = raw_dir / f"{stem}.json"  # what the backend reported when it made the raw file
                info = json.loads(side.read_text(encoding="utf-8")) if side.exists() else {}
                reused.append(B.Result(job=job, path=old[0], seed=info.get("seed", seed),
                                       model=info.get("model", be.model or "default"),
                                       extra=info.get("extra", {})))  # fmt: skip
            else:
                jobs.append(job)
    return jobs, reused


def cmd_generate(cfg: Config, cues: list[Cue], args: argparse.Namespace, all_cues: list[Cue] | None = None) -> int:
    """Generate, post-process and ship. A failure of one file (backend or post) never stops the others: it is
    reported, recorded in the manifest's `failed` list, and the run exits non-zero at the end (5)."""
    if not P.have_ffmpeg():
        print("ffmpeg and ffprobe are needed on PATH (Ubuntu: sudo apt-get install ffmpeg)", file=sys.stderr)
        return 2
    rel_to(cfg.output_dir / "x", cfg.manifest.parent, "the output folder")  # fail before any work, not after
    loaded = load_env_files(cfg, args.env_file)
    if loaded:
        print(f"env files set: {', '.join(loaded)}")
    by = plan(cfg, cues, args.backend)
    raw_dir = cfg.work_dir / "raw"
    tmp_dir = cfg.work_dir / "tmp"
    raw_dir.mkdir(parents=True, exist_ok=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)
    today = dt.date.today().isoformat()
    skipped: list[str] = []
    failures: list[dict[str, Any]] = []  # one per failed file: id, variation, backend, stage, reason, date
    made: list[B.Result] = []
    backend_of: dict[str, B.Backend] = {}

    def fail(c: Cue, n: int, backend: str, stage: str, reason: str) -> None:
        print(f"FAILED {c.name}#{n} ({stage}): {reason}")
        failures.append({"id": c.name, "variation": n, "backend": backend, "stage": stage, "reason": reason,
                         "date": today})  # fmt: skip

    for name, cs in by.items():
        be = B.make(name, cfg.backends[name], cfg.root)
        backend_of[name] = be
        jobs, reused = _gen_jobs(cfg, name, be, cs, args, raw_dir)
        if reused:
            print(f"[{name}] reusing {len(reused)} raw file(s) from {raw_dir}")
            made += reused
        if not jobs:
            continue
        try:
            be.check(cs)
            print(f"[{name}] generating {len(jobs)} file(s) with {be.tool}")
            results = be.generate(jobs)
        except B.Skip as e:
            msg = f"SKIPPED {len(jobs)} file(s) of {', '.join(sorted({j.cue.name for j in jobs}))}: {e}"
            print(msg)
            skipped.append(msg)
            continue
        except Exception as e:  # noqa: BLE001 - a backend crash fails its jobs, not the run
            results = [B.failed(j, f"{type(e).__name__}: {e}"[:500]) for j in jobs]
        for r in results:
            if not r.ok:
                fail(r.job.cue, r.job.n, name, "generate", r.error or "no file")
                continue
            side = r.job.out.with_suffix(".json")
            side.write_text(json.dumps({"seed": r.seed, "model": r.model, "extra": r.extra}), encoding="utf-8")
            made.append(r)

    # post-process: decode, clean, (group) normalise, encode, check the shipped files
    cleaned: list[tuple[B.Result, Path, int]] = []
    for r in made:
        c = r.job.cue
        cat = cfg.categories[c.category]
        ch = c.channels or cat.channels
        dec = tmp_dir / f"{c.name}-{r.job.n}.dec.wav"
        cl = tmp_dir / f"{c.name}-{r.job.n}.clean.wav"
        try:
            assert r.path is not None
            P.to_wav(r.path, dec, cfg.sample_rate, ch)
            P.clean(dec, cl, c, cat, cfg.sample_rate, ch)
            cleaned.append((r, cl, ch))
        except P.PostError as e:
            fail(c, r.job.n, r.job.out.name.split("--")[0], "post", f"{e} (raw kept: {r.path})")
        finally:
            dec.unlink(missing_ok=True)

    data = M.load(cfg.manifest)
    group_gains = _group_gains(cfg, cleaned, all_cues or cues, data)
    entries: list[dict[str, Any]] = []
    for r, cl, ch in cleaned:
        c = r.job.cue
        cat = cfg.categories[c.category]
        be = backend_of[resolve_backend(c, cat, args.backend) or ""]
        try:
            gg = group_gains.get((c.group, r.job.n)) if c.group else None
            if c.group and gg is None:
                raise P.PostError(f"group '{c.group}' needs all its stems in one run, or a stored groupGainDb")
            fin = tmp_dir / f"{c.name}-{r.job.n}.final.wav"
            loud, rule = P.normalise(cl, fin, cat, cfg.sample_rate, gg)
            rel = output_stem(c, cat, r.job.n)
            webm, m4a, extra_gain = P.deliver(fin, cfg.output_dir / rel, cat, ch, cfg.sample_rate,
                                              c.length if c.is_loop else None, tmp_dir)  # fmt: skip
        except P.PostError as e:
            fail(c, r.job.n, be.name, "post", str(e))
            continue
        finally:
            if not args.keep_tmp:
                cl.unlink(missing_ok=True)
        e = _entry(cfg, c, cat, r, be, today, ch, webm, m4a, loud, rule, gg, extra_gain)
        entries.append(e)
        if not args.keep_tmp:
            (tmp_dir / f"{c.name}-{r.job.n}.final.wav").unlink(missing_ok=True)
        print(f"  {e['file']}: {webm.seconds:.3f} s, {webm.integrated:.1f} LUFS, TP webm {webm.true_peak:.2f} / "
              f"m4a {m4a.true_peak:.2f} dB ({rule}), {e['bytes']['webm'] // 1024} KB webm / "
              f"{e['bytes']['m4a'] // 1024} KB m4a")  # fmt: skip
    if entries or failures:
        if entries and not args.variations:
            for c in cues:
                M.prune(data, c.name, c.variations)
        M.merge(data, entries)
        M.set_failures(data, [(e["id"], e["variation"]) for e in entries], failures)
        M.save(cfg.manifest, data)
        print(f"manifest: {cfg.manifest} ({len(entries)} file(s), {len(failures)} failure(s) recorded)")
    if not args.keep_tmp:
        shutil.rmtree(tmp_dir, ignore_errors=True)
    print(f"\n{len(entries)} file(s) made, {len(failures)} failed, {len(skipped)} backend batch(es) skipped.")
    for s in skipped:
        print("  " + s)
    for f in failures:
        print(f"  FAILED {f['id']}#{f['variation']} ({f['stage']}): {f['reason']}")
    if failures:
        return 5
    return 4 if (skipped and args.strict) else 0


def _group_gains(cfg: Config, cleaned: list[tuple[B.Result, Path, int]], all_cues: list[Cue],
                 data: dict[str, Any]) -> dict[tuple[str, int], float]:  # fmt: skip
    """One gain per (group, variation) from the sum of its stems, when every stem of the group is in this run;
    otherwise the gain stored in the manifest (groupGainDb) by the run that made the whole group."""
    members: dict[str, set[str]] = defaultdict(set)
    for c in all_cues:
        if c.group:
            members[c.group].add(c.name)
    here: dict[tuple[str, int], list[tuple[str, Path, str]]] = defaultdict(list)
    for r, cl, _ in cleaned:
        if r.job.cue.group:
            here[(r.job.cue.group, r.job.n)].append((r.job.cue.name, cl, r.job.cue.category))
    stored = {(f.get("group"), f["variation"]): f["groupGainDb"] for f in data.get("files", []) if "groupGainDb" in f}
    gains: dict[tuple[str, int], float] = {}
    for (g, n), items in here.items():
        if {name for name, _, _ in items} >= members[g]:
            gains[(g, n)] = P.group_gain([p for _, p, _ in items], cfg.categories[items[0][2]])
        elif (g, n) in stored:
            gains[(g, n)] = float(stored[(g, n)])
            print(f"  group {g}#{n}: not all stems in this run; reusing the stored gain {gains[(g, n)]:+.2f} dB")
    return gains


def _entry(cfg: Config, c: Cue, cat: Any, r: B.Result, be: B.Backend, today: str, ch: int, webm: P.Shipped,
           m4a: P.Shipped, loud: P.Loudness, rule: str, gg: float | None, extra_gain: float) -> dict[str, Any]:  # fmt: skip
    def fmt(s: P.Shipped) -> dict[str, Any]:
        return {
            "file": rel_to(s.path, cfg.manifest.parent, "the file"),
            "sampleRate": s.rate,
            "samples": s.samples,
            "durationMs": round(1000 * s.seconds, 3),
            "primingSamples": s.priming,
            "truePeak": round(s.true_peak, 2),
            "lufs": round(s.integrated, 1),
            "bytes": s.path.stat().st_size,
        }

    e: dict[str, Any] = {
        "id": c.name,
        "variation": r.job.n,
        "category": c.category,
        "kind": cat.kind,
        "mode": c.mode,
        "file": rel_to(webm.path, cfg.manifest.parent, "the file"),
        "fileFallback": rel_to(m4a.path, cfg.manifest.parent, "the file"),
        "durationMs": round(1000 * webm.seconds),
        "channels": ch,
        "tool": str(be.opts.get("tool", be.tool)),
        "backend": be.name,
        "model": r.model,
        "prompt": c.prompt,
        "seed": r.seed,
        "licence": be.licence,
        "date": today,
        # measured on the decoded .webm and .m4a; the worse true peak of the two is at or under the ceiling
        "loudness": {"lufs": round(webm.integrated, 1), "truePeak": round(max(webm.true_peak, m4a.true_peak), 2),
                     "rule": rule, "wavLufs": round(loud.integrated, 1)},  # fmt: skip
        "formats": {"webm": fmt(webm), "m4a": fmt(m4a)},
        "bytes": {"webm": webm.path.stat().st_size, "m4a": m4a.path.stat().st_size},
    }
    if extra_gain:
        e["loudness"]["encodeHeadroomDb"] = round(extra_gain, 2)  # source peaks set this far under the ceiling
    if c.negative_prompt:
        e["negativePrompt"] = c.negative_prompt
    if cat.priority:
        e["priority"] = cat.priority
    if c.is_loop:
        # seconds on the decoded buffer (trim honoured); the file runs LOOP_MARGIN past `end` with the loop's start.
        # A decoder that ignores the container's trim returns primingSamples extra at the start: shift by that.
        e["loop"] = {"start": 0.0, "end": round(c.length, 6), "crossfade": c.crossfade, "margin": P.LOOP_MARGIN}
    if c.tempo:
        e["bpm"] = c.tempo
    if c.bars:
        e["bars"] = c.bars
        e["beatsPerBar"] = c.beats_per_bar
    if c.key:
        e["key"] = c.key
    if c.group:
        e["group"] = c.group
        if gg is not None:
            e["groupGainDb"] = round(gg, 3)
    if r.extra:
        e["generator"] = r.extra
    return e


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="audiogen", description=__doc__)
    ap.add_argument("command", choices=("check", "generate"), help="check: validate and show the plan; generate: make files")
    ap.add_argument("--config", required=True, help="the game's pipeline config (JSON)")
    ap.add_argument("--spec", required=True, nargs="+", help="one or more cue spec files (JSON)")
    ap.add_argument("--only", help="comma-separated cue names to run")
    ap.add_argument("--backend", help="use this backend for every cue (overrides the spec and category)")
    ap.add_argument("--variations", type=int, help="make this many variations per cue instead of the spec's")
    ap.add_argument("--reuse-raw", action="store_true", help="re-post-process raw files kept from an earlier run")
    ap.add_argument("--keep-tmp", action="store_true", help="keep intermediate WAVs in the work dir")
    ap.add_argument("--strict", action="store_true", help="exit 4 when a backend was skipped")
    ap.add_argument("--env-file", action="append", help="a KEY=value file to read keys from (repeatable); <root>/.env.local is always read")
    ap.add_argument("--output-dir", help="write files and the manifest here instead (e.g. to compare two backends)")
    args = ap.parse_args(argv)
    try:
        cfg = load_config(args.config)
        if args.output_dir:
            cfg.output_dir = Path(args.output_dir).expanduser().resolve()
            cfg.manifest = cfg.output_dir / "manifest.json"
        cues = load_cues(args.spec, cfg)
        all_cues = list(cues)
        if args.only:
            want = {s.strip() for s in args.only.split(",") if s.strip()}
            missing = want - {c.name for c in cues}
            if missing:
                raise SpecError(f"--only: not in the spec: {', '.join(sorted(missing))}")
            cues = [c for c in cues if c.name in want]
        if args.command == "check":
            return cmd_check(cfg, cues, args)
        return cmd_generate(cfg, cues, args, all_cues)
    except SpecError as e:
        print(f"spec error: {e}", file=sys.stderr)
        return 2
    except P.PostError as e:
        print(f"post-processing error: {e}", file=sys.stderr)
        return 1
