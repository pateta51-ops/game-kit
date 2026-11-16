# {{name}}
Made by `node kit.mjs new` (game-kit scaffold). Kit components are in `kit/`: never edit them; change game-kit and pull again (`node ../game-kit/kit.mjs pull ../game-kit <tag>`, then `node kit/kit.mjs check`).
Ports: dev {{dev}}, preview {{preview}}, phone {{phone}}; they come from game-kit `ports.json` (entry `{{id}}`), never pick another.
Engine: `src/engine` (pure; only `kit/engine-core`); the UI imports it through `src/engine/api.ts`. `npm run check` is the gate.
