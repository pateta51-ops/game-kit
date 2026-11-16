# game-server

A small web panel that updates any game to its latest `origin/main` in its own clone (`REDACTED/<id>`), builds it, serves it and maps it onto the tailnet with `tailscale serve`. No dependencies (Node 24). Not a kit component: it runs on the owner's PC and is never pulled into a game.

## Install (once, on the PC)

`sudo powershell -ExecutionPolicy Bypass -File tools\game-server\install.ps1` (elevated: a task that runs before logon needs it). It registers the Scheduled Task `game-server` for this user with two triggers, at boot (30 s delay, runs without anyone logged in, no window) and at logon, restarts it on failure, maps the panel onto the tailnet, and puts a **Game Server** icon (`game-server.ico`) on the desktop. The icon opens the panel in the browser and starts the task first if the panel is not answering. `uninstall.ps1` removes the task, the mapping and the icon. Re-run `install.ps1` after moving the kit or changing the panel port.

For the phone to reach it before anyone logs in, Tailscale itself must stay up while logged out: Tailscale tray icon > Settings > Run unattended (or `tailscale set --unattended`).

## Use

Phone or PC: `https://REDACTED:8440` (panel port from `ports.json`). Per game: **Update & serve**, **Stop**, **Open**, expandable log. The panel listens on 127.0.0.1 only; Tailscale fronts it (tailnet only).

CLI: `node tools/game-server/server.mjs update <id> | stop <id> | status`.

## Add a game

`node tools/game-server/server.mjs add <id> "<Name>" <repo path> [app subfolder]` gives the game the next free 10-port block and the next free phone slot, appends one line to `ports.json`, validates it, regenerates `docs/PORTS.md`, tells a running panel to reload, and prints what to set in the game (its vite `server.port` = block, `preview.port` = block+1, `preview.allowedHosts: ['.ts.net']`, Playwright default block+2). Then commit `ports.json` and `docs/PORTS.md` in game-kit. Change `build` or `copyIgnored` in the new line by hand if the game needs private files (see Imperium and Unstoppable). Every port lives only in `ports.json`; it is validated on load (every port unique, `serve.local` in 4170-4199, blocks outside the reserved ranges): `validatePorts` in `lib.mjs`.
