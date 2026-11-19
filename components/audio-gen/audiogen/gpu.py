"""GPU only: every local model runs on CUDA, on two CPU threads at most. No CPU offload, no CPU fallback.
Import this before numpy and torch: they read the thread limits when they load."""
from __future__ import annotations

import os
import subprocess
import sys
import threading
import time

os.environ["OMP_NUM_THREADS"] = os.environ["MKL_NUM_THREADS"] = "2"
SMI = ["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"]


def cuda(who: str):
    """torch on two threads. Exits 3 when CUDA is missing."""
    import torch

    torch.set_num_threads(2)
    if not torch.cuda.is_available():
        print(f"{who}: CUDA is not available. Audio is generated on the GPU only: there is no CPU fallback.", file=sys.stderr)
        sys.exit(3)
    return torch


def first(torch, who: str, run):
    """The check before a batch: run its first generation and print what that used (GPU utilisation as nvidia-smi
    shows it, sampled twice a second; CUDA memory; CPU cores). Exits 3 when it took no CUDA memory."""
    seen, stop = [], threading.Event()

    def sample():
        try:
            while True:
                last = stop.wait(0.5)
                seen.append(int(subprocess.run(SMI, capture_output=True, text=True, timeout=5).stdout.split()[0]))
                if last:
                    return
        except (OSError, subprocess.SubprocessError, ValueError, IndexError):
            pass

    th = threading.Thread(target=sample, daemon=True)
    torch.cuda.reset_peak_memory_stats()
    base, t0, c0 = torch.cuda.memory_allocated(), time.time(), time.process_time()
    th.start()
    try:
        out = run()
    finally:
        wall, cpu = time.time() - t0, time.process_time() - c0
        stop.set()
        th.join()
    took = torch.cuda.max_memory_allocated() - base
    print(f"{who}: first generation: GPU at {max(seen, default='?')} % at its peak, {took / 2**20:.0f} MiB of CUDA memory, "
          f"{cpu / max(wall, 1e-9):.1f} CPU cores", file=sys.stderr, flush=True)  # fmt: skip
    if took <= 0:
        print(f"{who}: the first generation did not use the GPU. Stopped.", file=sys.stderr)
        sys.exit(3)
    return out
