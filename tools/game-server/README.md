# game-server

A small web panel that updates any game to its latest `origin/main` in its own clone (`REDACTED/<id>`), builds it, serves it and maps it onto the tailnet with `tailscale serve`. No dependencies (Node 24). Not a kit component: it runs on the owner's PC and is never pulled into a game.

## Install (once, on the PC)

`powershell -File tools\game-server\install.ps1` registers the per-user Scheduled Task `game-server` (at logon, hidden, restarts on failure), starts it, and maps the panel. `uninstall.ps1` removes both.

## Use

Phone or PC: `https://REDACTED:8440` (panel port from `ports.json`). Per game: **Update & serve**, **Stop**, **Open**, expandable log. The panel listens on 127.0.0.1 only; Tailscale fronts it (tailnet only).

CLI: `node tools/game-server/server.mjs update <id> | stop <id> | status`.

## Add a game

Edit `ports.json` at the kit root (the only place ports live), then press **Reload ports.json**. It is validated on load: every port unique across the panel and all games, `serve.local` outside every 10-port `block`, `https` unique. The check is `validatePorts` in `lib.mjs`, exported for other tools.

State: `REDACTED/state.json`; logs: `REDACTED/<id>.log`.
