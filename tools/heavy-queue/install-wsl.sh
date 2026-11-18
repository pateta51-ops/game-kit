#!/usr/bin/env bash
# K399: install the heavy queue as the always-on systemd service heavy-queue.service (as the invoking user) and put `heavy`
# in ~/.local/bin. Idempotent. HEAVY_SLOTS=<n> sets the number of slots (default 1).
set -e
H=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
U=${SUDO_USER:-$(id -un)}
NODE=$(command -v node)
sudo tee /etc/systemd/system/heavy-queue.service >/dev/null <<UNIT
[Unit]
Description=heavy-queue: machine-wide queue for heavy runs
After=network.target

[Service]
User=$U
Environment=HEAVY_SLOTS=${HEAVY_SLOTS:-1}
ExecStart=$NODE $H/server.mjs
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable heavy-queue.service
sudo systemctl restart heavy-queue.service
chmod +x "$H/heavy" "$H"/*.sh
mkdir -p "$HOME/.local/bin"
ln -sf "$H/heavy" "$HOME/.local/bin/heavy"
echo "heavy-queue.service running; heavy linked in ~/.local/bin; status page http://127.0.0.1:$(node -p "require('$H/../../ports.json').tools['heavy-queue']")/"
