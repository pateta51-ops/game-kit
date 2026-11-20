#!/usr/bin/env bash
# Install the local models under ~/audio-gen (WSL or Linux). Each group is optional:
#   install.sh core sa3 yue2 whisper kokoro midi        (no argument: core only)
# Nothing paid is installed or called. Weights are downloaded by the tools on first use into ~/audio-gen or the
# Hugging Face cache and are never committed. `python3 audiogen/tools.py status` says what is installed.
set -euo pipefail
H="${AUDIO_GEN_HOME:-$HOME/audio-gen}"
mkdir -p "$H"
groups=("$@"); [ ${#groups[@]} -eq 0 ] && groups=(core)
has() { for g in "${groups[@]}"; do [ "$g" = "$1" ] && return 0; done; return 1; }

venv() { [ -x "$H/$1/bin/python" ] || python3 -m venv "$H/$1"; }

if has core; then
  command -v ffmpeg >/dev/null || { echo "install ffmpeg first: sudo apt install ffmpeg"; exit 1; }
  venv venv
  "$H/venv/bin/pip" install -q numpy soundfile
fi
if has sa3; then
  # Stable Audio 3 Small SFX (Stability AI Community License), the default for sounds; weights go to the HF cache.
  venv venv-sa3
  "$H/venv-sa3/bin/pip" install -q torch torchaudio stable-audio-3==0.1.0 soundfile numpy
fi
if has yue2; then
  # YuE2-3B (weights CC BY-NC 4.0), the default for music: code pinned to release yue2-v0.1.6, weights to rev 8f24312f.
  venv venv-yue
  "$H/venv-yue/bin/pip" install -q "yue2-infer @ git+https://github.com/multimodal-art-projection/YuE@yue2-v0.1.6" "huggingface-hub==0.36.2"
  "$H/venv-yue/bin/hf" download m-a-p/YuE2-3B --revision 8f24312f --local-dir "$H/models/yue2"
  # demucs htdemucs for the vocal gate, in its own venv
  venv venv-demucs
  "$H/venv-demucs/bin/pip" install -q torch torchaudio demucs==4.1.0 soundfile
fi
if has whisper; then
  # K485: faster-whisper (CUDA) checks sung lyrics; it goes into the demucs venv (torch is already there), the model is
  # large-v3-turbo in CTranslate2 form (MIT) in $H/models/whisper-large-v3-turbo.
  venv venv-demucs
  "$H/venv-demucs/bin/pip" install -q torch torchaudio faster-whisper==1.2.1 huggingface-hub
  "$H/venv-demucs/bin/python" -c "from huggingface_hub import snapshot_download as d; d('mobiuslabsgmbh/faster-whisper-large-v3-turbo', local_dir='$H/models/whisper-large-v3-turbo')"
fi
if has kokoro; then
  # Kokoro-82M, free local voice lines (needs espeak-ng for English: sudo apt install espeak-ng).
  venv venv-kokoro
  "$H/venv-kokoro/bin/pip" install -q kokoro==0.9.4 soundfile numpy
fi
if has midi; then
  command -v fluidsynth >/dev/null || { echo "install fluidsynth: sudo apt install fluidsynth"; exit 1; }
  mkdir -p "$H/soundfonts"
  ls "$H"/soundfonts/*.sf2 >/dev/null 2>&1 || echo "put a free General MIDI soundfont (for example GeneralUser GS, with its licence file) in $H/soundfonts/"
fi
python3 "$(dirname "$0")/../audiogen/tools.py" status
