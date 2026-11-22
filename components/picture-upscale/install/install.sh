#!/usr/bin/env bash
# Install picture-upscale under ~/picture-upscale (WSL or Linux): a venv with torch (CUDA 12.8) and spandrel, and the
# model weights listed in models.json. Weights are never committed.
#   install.sh [model ...]     (no argument: every model that is not opt-in)
set -euo pipefail
H="${PICTURE_UPSCALE_HOME:-$HOME/picture-upscale}"
D="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$H/models"
[ -x "$H/venv/bin/python" ] || python3 -m venv "$H/venv"
"$H/venv/bin/pip" install -q numpy pillow spandrel
"$H/venv/bin/pip" install -q torch --index-url https://download.pytorch.org/whl/cu128
"$H/venv/bin/python" -I "$D/upscale.py" fetch "$@"
"$H/venv/bin/python" -I "$D/upscale.py" status
