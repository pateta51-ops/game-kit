"""K485: transcribe one audio file with faster-whisper on CUDA (no CPU fallback), in the whisper Python.
Usage: <python> whisper_transcribe.py <model dir> <audio file> <result.json> [language]. Writes {"text": ...}. Exit 3 = no CUDA."""
from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    model, wav, out = sys.argv[1:4]
    import ctranslate2

    if ctranslate2.get_cuda_device_count() < 1:
        print("whisper: no CUDA device; the lyrics check never runs on the CPU", file=sys.stderr)
        return 3
    from faster_whisper import WhisperModel

    m = WhisperModel(model, device="cuda", compute_type="float16")
    segs, _ = m.transcribe(wav, language=(sys.argv[4] if len(sys.argv) > 4 else "en"), beam_size=5, condition_on_previous_text=False)
    Path(out).write_text(json.dumps({"text": " ".join(s.text.strip() for s in segs)}), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
