# Ports

Single source of truth for every local port used by the owner's games and tools. Read docs/PORTS.md before choosing a port. block = dev server, block+1 = vite preview, block+2 = e2e (Playwright webServer default, env E2E_PORT overrides), block+3 = second e2e server, block+4..+9 = spare for that game (proof sheets, clip renderers). serve.local (4170-4199) is only for the phone build behind tailscale serve; nothing else may use 4170-4199. CI always picks a free port. 5190-5299 is for Codex worktree servers.

Before using a port, look here; a new port = the game's block or an entry in `ports.json`, in the same PR.

Generated from `ports.json` by `node tools/game-server/server.mjs ports-md`; a test fails when this file drifts.

Panel: local 4170, https://REDACTED:8440

| Game | dev | preview | e2e | e2eAux | phone local | phone URL |
|---|---|---|---|---|---|---|
| Imperium Horizons | 6010 | 6011 | 6012 | 6013 | 4173 | https://REDACTED |
| Star Trek Captain's Chair | 6020 | 6021 | 6022 | 6023 | 4174 | https://REDACTED:8443 |
| Warp's Edge | 6030 | 6031 | 6032 | 6033 | 4175 | https://REDACTED:8444 |
| Rome: Fate of an Empire | 6040 | 6041 | 6042 | 6043 | 4176 | https://REDACTED:8445 |
| 7th Inning Stretch | 6050 | 6051 | 6052 | 6053 | 4177 | https://REDACTED:8446 |
| Rise of a Jarl | 6060 | 6061 | 6062 | 6063 | 4178 | https://REDACTED:8447 |
| Radiance | 6070 | 6071 | 6072 | 6073 | 4179 | https://REDACTED:8448 |
| Earthborne Rangers | 6080 | 6081 | 6082 | 6083 | 4180 | https://REDACTED:8449 |
| Under Falling Skies | 6090 | 6091 | 6092 | 6093 | 4181 | https://REDACTED:8450 |
| Unstoppable | 6100 | 6101 | 6102 | 6103 | 4182 | https://REDACTED:8451 |
| LotR LCG | 6110 | 6111 | 6112 | 6113 | 4183 | https://REDACTED:8452 |
