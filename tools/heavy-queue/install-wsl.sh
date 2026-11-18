#!/usr/bin/env bash
# K399: copy the heavy queue to ~/.local/share/heavy-queue (HEAVY_HOME), install it as the always-on systemd service
# heavy-queue.service (as the invoking user) and link `heavy` into ~/.local/bin; the unit, the link and the runner hooks use
# the copy, never a checkout. Idempotent: run it again to update the copy. HEAVY_SLOTS=<n> sets the slots (default 1).
set -e
S=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
D=${HEAVY_HOME:-$HOME/.local/share/heavy-queue}
U=${SUDO_USER:-$(id -un)}
NODE=$(command -v node)
mkdir -p "$D" "$HOME/.local/bin"
cp "$S"/server.mjs "$S"/heavy.mjs "$S"/heavy "$S"/runner-job-started.sh "$S"/runner-job-completed.sh "$S"/install-runner-hooks.sh "$D"/
cp "$S/../../ports.json" "$D/ports.json"
chmod +x "$D/heavy" "$D"/*.sh
sudo tee /etc/systemd/system/heavy-queue.service >/dev/null <<UNIT
[Unit]
Description=heavy-queue: machine-wide queue for heavy runs
After=network.target

[Service]
User=$U
Environment=HEAVY_SLOTS=${HEAVY_SLOTS:-1}
ExecStart=$NODE $D/server.mjs
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable heavy-queue.service
sudo systemctl restart heavy-queue.service
ln -sf "$D/heavy" "$HOME/.local/bin/heavy"
echo "heavy-queue.service running from $D; heavy linked in ~/.local/bin; status page http://127.0.0.1:$(node -p "require('$D/ports.json').tools['heavy-queue']")/"
