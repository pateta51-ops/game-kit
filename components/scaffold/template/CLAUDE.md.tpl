# {{name}}
Made by `node kit.mjs new` (game-kit scaffold). Kit components are in `kit/`: never edit them; change game-kit and pull again (`node ../game-kit/kit.mjs pull ../game-kit <tag>`, then `node kit/kit.mjs check`).
The kit version is in `kit/kit.lock.json` (never copy it into this file).
Before writing anything: `node kit/kit.mjs search <word>`, then `kit/recipes/`, then the component README.
Ports: dev {{dev}}, preview {{preview}}, e2e {{e2e}}, phone {{phone}}; they come from game-kit `ports.json` (entry `{{id}}`), never pick another.
Keep `src/engine` pure. Use pure kit components such as `defineGame` from `kit/game-store/index.ts`. The UI imports game engine code through `src/engine/api.ts`. `npm run check` runs the baseline checks.
Gates wired: tests, lint, types, kit check, CI check, repo-gate (`repo-gate.config.json`), build, bundle size (limits in `package.json` script `size`). Screens: menu, set-up, play, settings, saves (`src/ui/App.tsx`).
Run `npm run browser:install` once (or set `PW_CHROMIUM_PATH` to an installed Chromium), then `npm run test:e2e` for the scaffold browser smoke. It exercises menu, setup, step, and undo against the stub. Replace that smoke with the game's actual browser flow as game rules and UI are implemented. Scaffold readiness means the pinned kit, baseline checks, and stub smoke passed. The game slice needs its own declared and executed acceptance.
TODO (each needs the game's own settings; pull with `node ../game-kit/kit.mjs pull ../game-kit <tag> <name>`, add its config and a lane in `scripts/check-runner.config.json`): `traceability` (rule ids), `theme-check` (token file), `plan-checker` (docs/PLAN.md), `plain-text` (id families); set `cardIdLiteral` and `artFolder` in `repo-gate.config.json`.
