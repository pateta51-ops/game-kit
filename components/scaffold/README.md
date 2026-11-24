# scaffold

One command makes a working, empty game repo from the kit (K204). Run it from the game-kit checkout; the game's repo does not carry this component.

## Rules for agents

**What it does:** Creates a working, empty game repository from the kit with one command, run from the game-kit checkout.

**You must:**
1. Run it from the game-kit checkout as `node kit.mjs new <dir> <id> "<Name>"`; a game repository does not carry this component.
2. Register the game's port block first: `node tools/game-server/server.mjs add <id> "<Name>" <dir>`, then commit `ports.json` and `docs/PORTS.md` in game-kit. The scaffold reads `games.<id>` (with `serve.local`), stops with that command if it is missing, and never picks a port.
3. Use an empty or new folder: any other is refused ("is not empty") unless `--existing`, which writes only missing files and, if any template file already exists, writes nothing and lists the clashes.
4. Re-running is safe: each step (git init, first commit, `gh repo create`, `gh repo edit --delete-branch-on-merge`) prints what it did and a failure names the step. Use `--no-remote` offline; `--no-install` or `--link` skips `npm install`.
5. After it: set `ci.config.json` (`repo`, `runnerLabel`), run `node kit/ci-templates/render.mjs`, then `npm run check`.
6. Write template files with the `.tpl` ending and only the placeholders `{{id}} {{name}} {{dev}} {{preview}} {{phone}} {{repo}} {{runner}}`; any other `{{x}}` throws "unknown {{x}}".
7. For a specification-driven start, resolve the spec before generation; never ignore unresolved mechanics or treat a component selection as an implemented rule.
8. Do the TODOs listed in the generated `CLAUDE.md` (traceability, theme-check, plan-checker, plain-text, e2e, repo-gate's `cardIdLiteral` and `artFolder`); they are not wired.

**Common mistakes:**
- Editing `ports.json` by hand instead of using `server.mjs add`.
- Skipping `npm install`: the generated CI's `npm ci` needs `package-lock.json`.

1. Ports: `kit.mjs new` runs `node tools/game-server/server.mjs add <id> "<Name>" <dir>` itself when `ports.json` has no entry (then commit `ports.json` and `docs/PORTS.md` in game-kit; never edit them by hand). After the files it also does `git init`, the first commit, `gh repo create <owner>/<id> --private --source . --push` and `gh repo edit --delete-branch-on-merge` (owner from `gh api user`, or `--repo`); each step prints what it did, skips when done, and a failure stops naming the step, so re-running is safe. `--no-remote` skips git and GitHub (tests, offline); `--ports <file>` never registers. The scaffold reads `games.<id>` in `ports.json` (dev = block, preview = block + 1, phone = `serve.local`) and stops with that command if the entry is missing. It never picks a port.
2. `node kit.mjs new <dir> <id> "<Name>" [--ref <tag|commit>] [--repo <owner/name>] [--runner <label>] [--link <node_modules folder>] [--no-install] [--existing] [--trailer <text>] [--ports <file>]`; `--runner` defaults to the id, `--trailer` replaces the first commit's trailer (empty: none)
3. The command ends with `npm install` in `<dir>` (it writes `package-lock.json`, which the generated CI's `npm ci` needs); `--no-install` skips it (tests, offline), and `--link` (a junction to an existing `node_modules`) skips it too. Then set `ci.config.json` (`repo`, `runnerLabel`), run `node kit/ci-templates/render.mjs`, then `npm run check`.

`--ref` defaults to the latest tag. The folder must be empty or new, unless `--existing`: then it may hold files and history; it overwrites nothing (if any template file or rendered workflow already exists it writes nothing and lists the clashes in one line), but merges two cases: an existing `kit/` is pulled over at the chosen tag, and an existing `.gitignore` gets its missing lines appended; it keeps every file and any `.git` / origin, writes only the missing ones, and makes no first commit. It writes: `package.json` (dev, build, phone, lint, typecheck, test, kit:check, ci:check, repo-gate, size, check), `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` (`.test.ts` and `tests/**/*.test.tsx`), `eslint.config.js` (lint-preset: engine pure, UI through `src/engine/api.ts`), `.nvmrc`, `.gitignore`, `ci.config.json` with the rendered `.github/workflows/`, `scripts/check-runner.config.json`, `repo-gate.config.json`, `CLAUDE.md`, `index.html`, `src/main.tsx`, and `src/engine/` (`rules.ts`: a stub `GameRules` with one move and the one `GAME_DEF = defineGame(...)`; `api.ts`), `src/ui/store.ts` (settings schema, saves, set-up spec, the game store) and `src/ui/App.tsx` (app-frame routes menu, setup, play, settings, saves over `screens`, settings and saves; the stub game has one move), `tests/smoke.test.ts` (the rules, then the store with undo) and `tests/ui.test.tsx` (menu, set-up, play, undo; settings and saves screens). It pulls `BASE` (engine-core, game-store, sim-pool, state-machines, app-frame, settings, saves, screens, lint-preset, ci-templates, check-runner, repo-gate, bundle-size, and their needs) and runs `git init`.

Template files end in `.tpl` (the kit's own lint and tests skip them); `{{id}} {{name}} {{dev}} {{preview}} {{phone}} {{repo}} {{runner}}` are filled in.

Hook for the reference game (K205): `scaffold({ dir, id, name, kit, ports, overlay: [<template folder>], components: [...] })` from `scaffold.js` applies more template folders over the base one (same path replaces) and pulls more components.

Gates wired: tests, lint, types, kit check, CI check, repo-gate (default config, engine folder only) and bundle size (`size.config.json`: 2 MB first download, 500 KB chunk). Not included, each needs the game's own settings, listed as TODO in the generated `CLAUDE.md`: traceability, theme-check, plan-checker, plain-text, e2e; repo-gate's `cardIdLiteral` and `artFolder`.

## Use it in 10 lines

```ts
import { scaffold } from '../kit/scaffold/scaffold.js'

// after `node tools/game-server/server.mjs add demo "Demo" C:/projects/demo` (ports first)
const made = scaffold({ dir: 'C:/projects/demo', id: 'demo', name: 'Demo', kit: 'C:/projects/game-kit', repo: 'me/demo', runner: 'demo-wsl' })
console.log(made.ref, made.ports.dev) // then: cd C:/projects/demo && npm run check
```

## Declarative starter (K551, first increment)

Run from the game-kit checkout. A JSON spec with version 1, id, name, optional profiles, components, opponent, mechanics and buildOwn selects a pinned set of components before creating files. Profiles are component-selection recipes, not completed game engines. Supported profiles: deck-builder, lcg, bag-builder, dice-placement, tactical-board, campaign. Opponent: none, automa, heuristic, learned.

```json
{"version":1,"id":"demo","name":"Demo","profiles":["deck-builder"],"mechanics":["draw a card"],"opponent":"automa"}
```

```sh
node kit.mjs spec resolve game-spec.json --ref HEAD
node kit.mjs spec generate game-spec.json --dir demo --ref HEAD --ports ports.json --no-install
```

Use a release tag for real games. Resolve reads the mechanics registry and transitive component manifests at the resolved commit, reports why each component was selected and lists required npm packages. Match an exact comma-separated mechanic alias (case insensitive); use the existing search command to discover aliases. Partial or unmapped mechanics block generation unless the spec has a nonempty buildOwn reason keyed by the requested mechanic. An explicit reason does not turn a partial mechanic into a mapped one. Fully mapped mechanics cannot be overridden with buildOwn.

Generate is local only (no private GitHub repo or first commit), requires a new or empty directory, and uses the existing port registration and scaffold. An explicit ports file must already include the id and phone slot. It pulls the resolved components at the exact commit, adds missing declared npm dependencies before installation, and saves docs/game-spec.json and docs/kit-assembly.json. Use --link for an existing node_modules or --no-install for offline work. The generated engine and UI remain stubs: agents must still implement rules, adapters, setup and game-specific gate configuration. Never infer a rule from the profile. Existing kit.mjs new is unchanged.
