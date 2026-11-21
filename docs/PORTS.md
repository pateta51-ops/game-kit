# Ports

Single source of truth for every local port used by the owner's games and tools. Read docs/PORTS.md before choosing a port. block = dev server, block+1 = vite preview, block+2 = e2e (Playwright webServer default, env E2E_PORT overrides), block+3 = second e2e server, block+4..+9 = spare for that game (proof sheets, clip renderers). serve.local (4170-4199) is only for the phone build behind tailscale serve; nothing else may use 4170-4199. CI always picks a free port. 5190-5299 is for Codex worktree servers.

Before using a port, look here; a new port = the game's block or an entry in `ports.json`, in the same PR.

Generated from `ports.json` by `node tools/game-server/server.mjs ports-md`; a test fails when this file drifts.

Panel: local 4170, https://<host>:8440

Tool heavy-queue: local 6005

| Game | dev | preview | e2e | e2eAux | phone local | phone URL |
|---|---|---|---|---|---|---|
| Imperium | 6010 | 6011 | 6012 | 6013 | 4173 | https://<host> |
| Star Trek Captain's Chair | 6020 | 6021 | 6022 | 6023 | 4174 | https://<host>:8443 |
| Warp's Edge | 6030 | 6031 | 6032 | 6033 | 4175 | https://<host>:8444 |
| Rome: Fate of an Empire | 6040 | 6041 | 6042 | 6043 | 4176 | https://<host>:8445 |
| 7th Inning Stretch | 6050 | 6051 | 6052 | 6053 | 4177 | https://<host>:8446 |
| Rise of a Jarl | 6060 | 6061 | 6062 | 6063 | 4178 | https://<host>:8447 |
| Radiance | 6070 | 6071 | 6072 | 6073 | 4179 | https://<host>:8448 |
| Earthborne Rangers | 6080 | 6081 | 6082 | 6083 | 4180 | https://<host>:8449 |
| Under Falling Skies | 6090 | 6091 | 6092 | 6093 | 4181 | https://<host>:8450 |
| Unstoppable | 6100 | 6101 | 6102 | 6103 | 4182 | https://<host>:8451 |
| LotR LCG | 6110 | 6111 | 6112 | 6113 | 4183 | https://<host>:8452 |
| Astra Imperium | 6120 | 6121 | 6122 | 6123 | 4171 | https://<host>:8441 |
| Dieson Crusoe | 6130 | 6131 | 6132 | 6133 | 4172 | https://<host>:8442 |
| Dice Commandos | 6140 | 6141 | 6142 | 6143 | 4184 | https://<host>:8453 |
