"""Backend adapters: each turns jobs (prompt, seconds, seed) into raw audio files.

Local GPU backends run a worker script in their own Python (the config's `python`, a venv with CUDA PyTorch) under
`nice -n 19`, so this package needs only the standard library. Workers run on the GPU only (`gpu.py`). No hosted
(paid) backend is part of the kit.

Keys are read from the environment only and never printed, logged or written to the manifest. A worker gets only
the key it needs (`pass_env`); every other key variable is removed from its environment.

A failure of one job never aborts the run: `generate` returns a Result with `error` set for it, and the pipeline
records it and carries on.
"""

from __future__ import annotations

import json
import os
import socket
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .spec import DEFAULTS, Cue, expand  # noqa: F401 - DEFAULTS is read from here too

WORKERS = Path(__file__).resolve().parent.parent / "workers"

# the only variables the pipeline loads from env files (a .env.local may hold other secrets; they are left alone)
KEY_VARS = frozenset({"HF_TOKEN"})


@dataclass
class Job:
    cue: Cue
    n: int
    seed: int
    seconds: float
    out: Path  # raw file the backend writes (WAV, or another format it states in the result)


@dataclass
class Result:
    job: Job
    path: Path | None
    seed: int | None
    model: str
    extra: dict[str, Any] = field(default_factory=dict)
    error: str | None = None  # set when this job failed; path is then None

    @property
    def ok(self) -> bool:
        return self.error is None and self.path is not None


def failed(job: Job, reason: str, model: str = "") -> Result:
    return Result(job=job, path=None, seed=job.seed, model=model, error=reason)


class Skip(Exception):
    """The backend cannot run here (a missing key, weights or Python). The message tells the user what to do."""


class Backend:
    id = "base"
    tool = "?"

    def __init__(self, name: str, opts: dict[str, Any], base: Path):
        self.name = name
        self.opts = opts
        self.base = base

    @property
    def model(self) -> str:
        return str(self.opts.get("model", ""))

    @property
    def licence(self) -> str:
        return str(self.opts["licence"])

    def check(self) -> None:
        """Raise Skip when the backend cannot run."""

    def generate(self, jobs: list[Job]) -> list[Result]:
        """One Result per job, in any order; a failed job has `error` set. Raise Skip only before any work."""
        raise NotImplementedError


def worker_env(pass_env: tuple[str, ...]) -> dict[str, str]:
    """The environment for a worker: everything but the key variables, plus only the keys it needs."""
    env = {k: v for k, v in os.environ.items() if k not in KEY_VARS}
    for k in pass_env:
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


class WorkerBackend(Backend):
    """Runs workers/<script> in the backend's own Python with a JSON job file."""

    script = ""
    pass_env: tuple[str, ...] = ()

    def python(self) -> Path:
        return expand(str(self.opts.get("python", sys.executable)), self.base)

    def check(self) -> None:
        py = self.python()
        if not py.exists():
            raise Skip(f"{self.name}: its Python {py} does not exist (see scripts/audio/README.md, Setup).")

    def wrap(self, cmd: list[str]) -> list[str]:
        return cmd

    def worker_options(self) -> dict[str, Any]:
        return {k: v for k, v in self.opts.items() if k not in ("python", "licence", "tool", "type")}

    def generate(self, jobs: list[Job]) -> list[Result]:
        if not jobs:
            return []
        jobs[0].out.parent.mkdir(parents=True, exist_ok=True)
        job_file = jobs[0].out.parent / f"_job-{self.name}-{os.getpid()}.json"
        res_file = job_file.with_suffix(".result.json")
        res_file.unlink(missing_ok=True)
        payload = {
            "options": {k: (str(expand(v, self.base)) if k.endswith(("Dir", "Path", "repo")) and isinstance(v, str)
                            else v) for k, v in self.worker_options().items()},  # fmt: skip
            "items": [
                {
                    "out": str(j.out),
                    "prompt": j.cue.prompt,
                    "negativePrompt": j.cue.negative_prompt,
                    "seconds": j.seconds,
                    "seed": j.seed,
                    "tempo": j.cue.tempo,
                    "key": j.cue.key,
                    "beatsPerBar": j.cue.beats_per_bar,
                    "loop": j.cue.is_loop,
                    "options": j.cue.options,
                    "label": f"{j.cue.name}#{j.n}",
                }
                for j in jobs
            ],
            "result": str(res_file),
        }
        job_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        cmd = self.wrap(["nice", "-n", "19", str(self.python()), str(WORKERS / self.script), str(job_file)])
        print(f"  [{self.name}] {len(jobs)} item(s) -> {self.python()} {self.script}", flush=True)
        t0 = time.time()
        p = subprocess.run(cmd, env=worker_env(self.pass_env))  # the worker's progress goes straight to the console
        job_file.unlink(missing_ok=True)
        if p.returncode == 3:
            raise Skip(f"{self.name}: the worker could not start; see its message above.")
        # the worker rewrites the result file after every item, so a crash keeps what it finished
        data = json.loads(res_file.read_text(encoding="utf-8")) if res_file.exists() else {"items": []}
        res_file.unlink(missing_ok=True)
        print(f"  [{self.name}] done in {time.time() - t0:.0f} s (exit {p.returncode})", flush=True)
        by_out = {r["out"]: r for r in data.get("items", [])}
        out: list[Result] = []
        for j in jobs:
            r = by_out.get(str(j.out))
            if r is None:
                out.append(failed(j, f"the worker exited with code {p.returncode} before this item", self.model))
            elif r.get("error"):
                out.append(failed(j, str(r["error"])[:500], self.model))
            elif not Path(r["out"]).exists():
                out.append(failed(j, "the worker reported a file that does not exist", self.model))
            else:
                out.append(Result(job=j, path=Path(r["out"]), seed=r.get("seed", j.seed),
                                  model=r.get("model", self.model), extra=r.get("extra", {})))  # fmt: skip
        return out


class AceStep(WorkerBackend):
    """ACE-Step 1.5 (MIT), local music. https://github.com/ace-step/ACE-Step-1.5"""

    id = "acestep"
    tool = "ACE-Step 1.5"
    script = "acestep_worker.py"

    def check(self) -> None:
        super().check()
        repo = expand(str(self.opts.get("repo", "")), self.base)
        if not (repo / "acestep").is_dir():
            raise Skip(f"{self.name}: ACE-Step checkout not found at {repo} (set backends.{self.name}.repo).")


def hf_token_file() -> Path:
    """Where `hf auth login` stores the token (huggingface_hub reads it by itself)."""
    if os.environ.get("HF_TOKEN_PATH"):
        return Path(os.environ["HF_TOKEN_PATH"]).expanduser()
    home = os.environ.get("HF_HOME") or os.path.join(os.environ.get("XDG_CACHE_HOME", "~/.cache"), "huggingface")
    return Path(home).expanduser() / "token"


class StableAudioOpen(WorkerBackend):
    """Stable Audio Open 1.0 (Stability AI Community License), local SFX via diffusers. The weights are gated.

    The token comes from HF_TOKEN, or from the standard Hugging Face login (`hf auth login`), which huggingface_hub
    reads from its token file; the pipeline only checks that one of them exists."""

    id = "stable-audio-open"
    tool = "Stable Audio Open"
    script = "stable_audio_open_worker.py"
    pass_env = ("HF_TOKEN",)

    def check(self) -> None:
        if not os.environ.get("HF_TOKEN") and not hf_token_file().is_file():
            raise Skip(
                f"{self.name}: no Hugging Face token (neither HF_TOKEN nor a login at {hf_token_file()}). Its weights "
                "are gated: accept the licence at https://huggingface.co/stabilityai/stable-audio-open-1.0, then log "
                "in with `hf auth login` . Nothing was generated."
            )
        super().check()


class StableAudio3(WorkerBackend):
    """Stable Audio 3 Small SFX (Stability AI Community License), local SFX; the default for sounds."""

    id = "stable-audio-3"
    tool = "Stable Audio 3 Small SFX"
    script = "stable_audio_3_worker.py"
    pass_env = ("HF_TOKEN",)


class YuE2(WorkerBackend):
    """YuE2-3B (weights CC BY-NC 4.0), instrumental music by the 7th Inning Stretch recipe; the default for music."""

    id = "yue2"
    tool = "YuE2-3B"
    script = "yue2_worker.py"
    pass_env = ("HF_TOKEN",)

    def queue_tool(self) -> str | None:
        return shutil.which("heavy") or next((str(p) for p in [Path.home() / ".local" / "bin" / "heavy"] if p.exists()), None)

    def need_queue(self) -> str | None:
        if self.opts.get("queue", True) is False:
            return None
        h = self.queue_tool()
        if not h:
            raise Skip(f"{self.name}: YuE2 runs go through the heavy queue and `heavy` was not found (tools/heavy-queue/install-wsl.sh), or set queue: false.")
        return h

    def wrap(self, cmd: list[str]) -> list[str]:
        """Every YuE2 run goes through the machine's heavy queue (owner, 19 Nov 2026), unless `queue` is false."""
        h = self.need_queue()
        return cmd if h is None else [h, "run", "--label", f"audio-gen {self.name}", "--"] + cmd

    def worker_options(self) -> dict[str, Any]:
        return {k: v for k, v in super().worker_options().items() if k != "queue"}

    def generate(self, jobs: list[Job]) -> list[Result]:
        """One fresh worker process (and heavy job) per cue, with all its takes, so host RAM is given back; a cue's
        takes that fail with a CUDA error are retried once in a fresh process; a Skip keeps the earlier cues' results (K465)."""
        groups: dict[str, list[Job]] = {}
        for j in jobs:
            groups.setdefault(j.cue.name, []).append(j)
        done: dict[int, Result] = {}
        skip: str | None = None
        ran = False
        for js in groups.values():
            if skip is None:
                try:
                    rs = super().generate(js)
                    ran = True
                    bad = [r.job for r in rs if r.error and ("CUDA error" in r.error or "AcceleratorError" in r.error)]
                    if bad:
                        print(f"  [{self.name}] {js[0].cue.name}: CUDA error, retrying {len(bad)} take(s) once in a fresh process", flush=True)
                        try:
                            again = {id(r.job): r for r in super().generate(bad)}
                            rs = [again.get(id(r.job), r) for r in rs]
                        except Skip:
                            pass
                    for r in rs:
                        done[id(r.job)] = r
                    continue
                except Skip as e:
                    skip = str(e)
                    if not ran:
                        raise
            for j in js:
                done[id(j)] = failed(j, skip or "", self.model)
        return [done[id(j)] for j in jobs]

    def check(self) -> None:
        super().check()
        self.need_queue()
        dm = expand(str(self.opts.get("demucsPython", "~/audio-gen/venv-demucs/bin/python")), self.base)
        if not dm.exists():
            raise Skip(f"{self.name}: no demucs Python at {dm} for the vocal gate (install.sh yue2, or set demucsPython).")


KINDS: dict[str, type[Backend]] = {b.id: b for b in (AceStep, StableAudioOpen, StableAudio3, YuE2)}


def make(name: str, opts: dict[str, Any], base: Path) -> Backend:
    """`name` is the config key; `opts.type` picks the adapter (default: the key itself)."""
    kind = str(opts.get("type", name))
    if kind not in KINDS:
        raise ValueError(f"backend '{name}': unknown type '{kind}' (known: {', '.join(KINDS)})")
    return KINDS[kind](name, opts, base)
