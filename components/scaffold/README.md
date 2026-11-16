# scaffold

One command makes a working, empty game repo from the kit (K204). Run it from the game-kit checkout; the game's repo does not carry this component.

1. Ports: `kit.mjs new` runs `node tools/game-server/server.mjs add <id> "<Name>" <dir>` itself when `ports.json` has no entry (then commit `ports.json` and `docs/PORTS.md` in game-kit; never edit them by hand). After the files it also does `git init`, the first commit, `gh repo create <owner>/<id> --private --source . --push` and `gh repo edit --delete-branch-on-merge` (owner from `gh api user`, or `--repo`); each step prints what it did, skips when done, and a failure stops naming the step, so re-running is safe. `--no-remote` skips git and GitHub (tests, offline); `--ports <file>` never registers. The scaffold reads `games.<id>` in `ports.json` (dev = block, preview = block + 1, phone = `serve.local`) and stops with that command if the entry is missing. It never picks a port.
2. `node kit.mjs new <dir> <id> "<Name>" [--ref <tag|commit>] [--repo <owner/name>] [--runner <label>] [--link <node_modules folder>] [--no-install] [--ports <file>]`
3. The command ends with `npm install` in `<dir>` (it writes `package-lock.json`, which the generated CI's `npm ci` needs); `--no-install` skips it (tests, offline), and `--link` (a junction to an existing `node_modules`) skips it too. Then set `ci.config.json` (`repo`, `runnerLabel`), run `node kit/ci-templates/render.mjs`, then `npm run check`.

`--ref` defaults to the latest tag. The folder must be empty or new. It writes: `package.json` (dev, build, phone, lint, typecheck, test, kit:check, ci:check, check), `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` (`.test.ts` and `tests/**/*.test.tsx`), `eslint.config.js` (lint-preset: engine pure, UI through `src/engine/api.ts`), `.nvmrc`, `.gitignore`, `ci.config.json` with the rendered `.github/workflows/`, `scripts/check-runner.config.json`, `CLAUDE.md`, `index.html`, `src/main.tsx`, and `src/engine/` (`rules.ts`: a stub `GameRules` with one move; `api.ts`; `tests/smoke.test.ts`). It pulls `BASE` (engine-core, sim-pool, state-machines, app-frame, settings, saves, lint-preset, ci-templates, check-runner, and their needs) and runs `git init`.

Template files end in `.tpl` (the kit's own lint and tests skip them); `{{id}} {{name}} {{dev}} {{preview}} {{phone}} {{repo}} {{runner}}` are filled in.

Hook for the reference game (K205): `scaffold({ dir, id, name, kit, ports, overlay: [<template folder>], components: [...] })` from `scaffold.js` applies more template folders over the base one (same path replaces) and pulls more components.

Not included: repo-gate, traceability, theme-check, bundle-size and e2e configs (each needs the game's own settings).

## Use it in 10 lines

```ts
import { scaffold } from '../kit/scaffold/scaffold.js'

// after `node tools/game-server/server.mjs add demo "Demo" C:/projects/demo` (ports first)
const made = scaffold({ dir: 'C:/projects/demo', id: 'demo', name: 'Demo', kit: 'C:/projects/game-kit', repo: 'me/demo', runner: 'demo-wsl' })
console.log(made.ref, made.ports.dev) // then: cd C:/projects/demo && npm run check
```
