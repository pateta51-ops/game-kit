# {{name}}
Made by `node kit.mjs new` (game-kit scaffold). Kit components are in `kit/`: never edit them; change game-kit and pull again (`node ../game-kit/kit.mjs pull ../game-kit <tag>`, then `node kit/kit.mjs check`).
Before writing anything: `node kit/kit.mjs search <word>`, then `kit/recipes/`, then the component README.
Ports: dev {{dev}}, preview {{preview}}, phone {{phone}}; they come from game-kit `ports.json` (entry `{{id}}`), never pick another.
Engine: `src/engine` (pure; only `kit/engine-core`); the UI imports it through `src/engine/api.ts`. `npm run check` is the gate.
Gates wired: tests, lint, types, kit check, CI check, repo-gate (`repo-gate.config.json`), build, bundle size (limits in `package.json` script `size`). Screens: menu, set-up, play, settings, saves (`src/ui/App.tsx`).
TODO (each needs the game's own settings; pull with `node ../game-kit/kit.mjs pull ../game-kit <tag> <name>`, add its config and a lane in `scripts/check-runner.config.json`): `traceability` (rule ids), `theme-check` (token file), `plan-checker` (docs/PLAN.md), `plain-text` (id families); set `cardIdLiteral` and `artFolder` in `repo-gate.config.json`.
