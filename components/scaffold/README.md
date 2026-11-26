# scaffold

Generate an empty starter or a supported, explicitly configured game slice from the kit. Run it from the game-kit checkout; the game's repo does not carry this component.

## Rules for agents

**What it does:** Creates a working starter, with executable rules and adapters for an explicitly supported assembly.

**You must:**
1. Run it from the game-kit checkout as `node kit.mjs new <dir> <id> "<Name>"`; a game repository does not carry this component.
2. Register the game's port block first: `node tools/game-server/server.mjs add <id> "<Name>" <dir>`, then commit `ports.json` and `docs/PORTS.md` in game-kit. The scaffold reads `games.<id>` (with `serve.local`), stops with that command if it is missing, and never picks a port.
3. Use an empty or new folder: any other is refused ("is not empty") unless `--existing`, which writes only missing files and, if any template file already exists, writes nothing and lists the clashes.
4. Re-running is safe: each step (git init, first commit, `gh repo create`, `gh repo edit --delete-branch-on-merge`) prints what it did and a failure names the step. Use `--no-remote` offline; `--no-install` or `--link` skips `npm install`.
5. After it: set `ci.config.json` (`repo`, `runnerLabel`), run `node kit/ci-templates/render.mjs`, then `npm run check`.
6. Write template files with the `.tpl` ending and only the placeholders `{{id}} {{name}} {{dev}} {{preview}} {{e2e}} {{phone}} {{repo}} {{runner}}`; any other `{{x}}` throws "unknown {{x}}".
7. For a specification-driven start, resolve the spec at the intended kit ref, register its port block, and then generate into a new or empty directory. Keep the registry entry the same between attempts. Profiles select components; only an explicit supported `assembly` adds executable rules and acceptance. Other rules and gate configuration remain game work. For existing games, use the [pinned package plan](../../tools/package-plan/README.md).
8. For a profile-only starter, do the TODOs in its generated `CLAUDE.md` (traceability, theme-check, plan-checker, plain-text, repo-gate's `cardIdLiteral` and `artFolder`). The courier assembly wires its own applicable gates with authored inputs; those inputs do not certify another game.
9. Keep `node_modules` local, whether installed or linked. For a local `spec generate` result, run `git init`, `git add -A`, then `npm run check`. Generated ignores cover both dependency forms.
10. Keep game engine code pure. Use pure kit APIs such as `defineGame` from `kit/game-store/index.ts`. The UI imports game engine code through `src/engine/api.ts`.
11. Run `npm run browser:install` (or set `PW_CHROMIUM_PATH` to an installed Chromium), then `npm run test:e2e` for the scaffold stub. Replace the stub smoke with the game's own browser acceptance as its rules and UI are implemented.
12. The opt-in `courier` assembly implements only the original rules below. Supply a winning `acceptanceRoute` from those rules and explicit setup allowances. Run the generated `npm run test:acceptance`; generation validates the configuration route but does not claim bootstrap or gameplay acceptance. The pilot is a public-view test driver, not an official automa. Do not add other mechanics or opponents to this assembly without implementing their adapters.
13. For courier gates, install Python 3 and read the generated plan, applicability declarations and independent executable rule inventory. Keep plancheck, traceability, plain-text and theme-check in both the check chain and declared lanes. Keep actual nonempty rendered-content assertions; static/jsdom checks do not replace the browser lane.


**Common mistakes:**
- Editing `ports.json` by hand instead of using `server.mjs add`.
- Skipping `npm install`: the generated CI's `npm ci` needs `package-lock.json`.

1. Ports: `kit.mjs new` runs `node tools/game-server/server.mjs add <id> "<Name>" <dir>` itself when `ports.json` has no entry (then commit `ports.json` and `docs/PORTS.md` in game-kit; never edit them by hand). After the files it also does `git init`, the first commit, `gh repo create <owner>/<id> --private --source . --push` and `gh repo edit --delete-branch-on-merge` (owner from `gh api user`, or `--repo`); each step prints what it did, skips when done, and a failure stops naming the step, so re-running is safe. `--no-remote` skips the first commit and GitHub operations. A new directory can still get `git init`; `--ports <file>` never registers. The scaffold reads `games.<id>` in `ports.json` (dev = block, preview = block + 1, e2e = block + 2, phone = `serve.local`) and stops with that command if the entry is missing. It never picks a port.
2. `node kit.mjs new <dir> <id> "<Name>" [--ref <tag|commit>] [--repo <owner/name>] [--runner <label>] [--link <node_modules folder>] [--no-install] [--existing] [--trailer <text>] [--ports <file>]`; `--runner` defaults to the id, `--trailer` replaces the first commit's trailer (empty: none)
3. The command ends with `npm install` in `<dir>` (it writes `package-lock.json`, which the generated CI's `npm ci` needs); `--no-install` skips it (tests, offline), and `--link` (a junction to an existing `node_modules`) skips it too. Then set `ci.config.json` (`repo`, `runnerLabel`), run `node kit/ci-templates/render.mjs`, then `npm run check`.

`--ref` defaults to the latest tag. The folder must be empty or new, unless `--existing`: then it may hold files and history; it overwrites nothing (if any template file or rendered workflow already exists it writes nothing and lists the clashes in one line), but merges two cases: an existing `kit/` is pulled over at the chosen tag, and an existing `.gitignore` gets its missing lines appended; it keeps every file and any `.git` / origin, writes only the missing ones, and makes no first commit. It writes: `package.json` (dev, build, phone, lint, typecheck, test, test:e2e, browser:install, kit:check, ci:check, repo-gate, size, check), `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` (`.test.ts` and `tests/**/*.test.tsx`), `eslint.config.js` (lint-preset: engine pure, UI through `src/engine/api.ts`), `.nvmrc`, `.gitignore`, `ci.config.json` with the rendered `.github/workflows/`, `scripts/check-runner.config.json`, `repo-gate.config.json`, `CLAUDE.md`, `index.html`, `src/main.tsx`, and `src/engine/` (`rules.ts`: a stub `GameRules` with one move and the one `GAME_DEF = defineGame(...)`; `api.ts`), `src/ui/store.ts` (settings schema, saves, set-up spec, the game store) and `src/ui/App.tsx` (app-frame routes menu, setup, play, settings, saves over `screens`, settings and saves; the stub game has one move), `tests/smoke.test.ts` (the rules, then the store with undo) and `tests/ui.test.tsx` (menu, set-up, play, undo; settings and saves screens), and `tests/scaffold.e2e.mjs` (Chromium stub smoke). It pulls `BASE` (engine-core, game-store, sim-pool, state-machines, app-frame, settings, saves, screens, lint-preset, ci-templates, check-runner, repo-gate, bundle-size, and their needs) and runs `git init`.

Template files end in `.tpl` (the kit's own lint and tests skip them); `{{id}} {{name}} {{dev}} {{preview}} {{e2e}} {{phone}} {{repo}} {{runner}}` are filled in.

Hook for the reference game (K205): `scaffold({ dir, id, name, kit, ports, overlay: [<template folder>], components: [...] })` from `scaffold.js` applies more template folders over the base one (same path replaces) and pulls more components.

Profile-only gates wired: tests, lint, types, kit check, CI check, repo-gate (default config, engine folder only) and bundle size (`size.config.json`: 2 MB first download, 500 KB chunk). Its TODOs still need the game's own inputs: traceability, theme-check, plan-checker, plain-text; repo-gate's `cardIdLiteral` and `artFolder`. The courier overlay below supplies the first four for its bounded rules and UI.

## Scaffold browser smoke

The browser command starts the generated Vite app and plays menu → setup → step → undo in Chromium. By default it uses the registered e2e port; the full gate supplies `E2E_PORT`. The regular `npm run check` works without a browser install. When a batch changes the scaffold UI, full `finish` appends the browser command. Existing games can set `package.json kit.e2eRoots` for extra UI directories and keep their existing e2e script. See the [agent workflow](../../docs/recipes/agent-workflow.md).

Record scaffold readiness after install, kit lock verification, the baseline check and successful stub smoke. Validate a game slice by executing its own declared acceptance, including a browser scenario for its actual gameplay when applicable.

## Use it in 10 lines

```ts
import { scaffold } from '../kit/scaffold/scaffold.js'

// after `node tools/game-server/server.mjs add demo "Demo" C:/projects/demo` (ports first)
const made = scaffold({ dir: 'C:/projects/demo', id: 'demo', name: 'Demo', kit: 'C:/projects/game-kit', repo: 'me/demo', runner: 'demo-wsl' })
console.log(made.ref, made.ports.dev) // then: cd C:/projects/demo && npm run check
```

## Declarative starter (K551, first increment)

[K748](../../docs/plan/K748.md) tracks the delivered specification, pinned component selection and transactional scaffold. [K551](../../docs/plan/K551.md) tracks the remaining executable system adapters, setup integration and game-specific validation gates.

Run from the game-kit checkout. A JSON spec with version 1, id, name, optional profiles, components, opponent, mechanics and buildOwn selects a pinned set of components before creating files. Profiles are component-selection recipes, not completed game engines. Supported profiles: deck-builder, lcg, bag-builder, dice-placement, tactical-board, campaign. Opponent: none, automa, heuristic, learned.

```json
{"version":1,"id":"demo","name":"Demo","profiles":["deck-builder"],"mechanics":["draw a card"],"opponent":"automa"}
```

```sh
node kit.mjs spec resolve game-spec.json --ref HEAD
node tools/game-server/server.mjs add demo "Demo" demo --pending
node kit.mjs spec generate game-spec.json --dir demo --ref HEAD
```

Use a release tag for real games. Resolution uses the generator, templates, mechanics registry, and manifests from the selected commit and lists the required npm packages. A ref with its own declarative starter supplies its own profile definitions. Older refs use the original version 1 profile definitions and are supported when they ship a compatible scaffold and all required components. An incompatible ref fails before generation. Match an exact comma-separated mechanic alias (case insensitive). Use search to discover aliases. Partial or unmapped mechanics block generation unless the spec has a nonempty `buildOwn` reason keyed by the requested mechanic. Fully mapped mechanics cannot be overridden with `buildOwn`.

Register the game once with `server.mjs add … --pending`, or pass an existing registry with `--ports`. The entry must contain the game's block and phone slot. Earlier drafts of `spec generate` registered missing entries automatically. Generation now reads the registry, stages a new or empty destination beside the requested path, and publishes it after source generation, lock validation, and installation succeed. A normal failure clears the staging directory and leaves the destination ready to retry. An interrupted process can leave a `.kit-spec-*` directory beside the destination. Remove that staging directory after the process exits and retry.

Generation makes a local scaffold. It pulls the resolved components at the exact commit, adds missing declared npm dependencies, and saves `docs/game-spec.json` and `docs/kit-assembly.json`. Use `--link` for an existing `node_modules` or `--no-install` for offline work. Generation adds a `node_modules` ignore when an older template only ignores directories, so `git add -A` skips a dependency link too. After `git init` and `git add -A`, run `npm run check` for the scaffold's baseline checks, then its browser command. With a profile-only spec, build executable game rules, system adapters, setup and game-specific gate configuration in the game project. The opt-in courier assembly below supplies its declared slice.

Use the generated `npm run repo-gate` command for repository validation. With an older kit pin, generation adds a project script that flags a force-staged `node_modules` link before invoking the pinned gate. The kit files stay byte-for-byte pinned. Direct invocation of an older kit's `repo-gate.ts` uses that release's behavior.

## Bounded courier assembly

Add `assembly` to opt into a playable original synthetic game. The existing profile-only spec still produces the empty starter. The selected kit pin must contain this assembly; a newer checkout never supplies its executable templates to an older pin.

```json
{
  "version": 1,
  "id": "demo",
  "name": "Courier Demo",
  "profiles": ["tactical-board"],
  "assembly": {
    "kind": "courier",
    "version": 1,
    "board": {"rows": 2, "cols": 3, "walls": [[0, 0, "e"]]},
    "depot": "r0c0",
    "pickup": "r1c1",
    "destination": "r0c2",
    "allowances": [5, 1],
    "acceptanceRoute": ["r1c0", "r1c1", "r0c1", "r0c2"]
  }
}
```

Resolve and generate with the same `spec resolve` / `spec generate` commands above, at a release containing the assembly. One existing `grid-map` supplies wall-aware adjacency and pilot routing. One `defineGame` supplies the store and `simGameOf`; the UI reads its public view. Setup selects an allowance, each move costs one, visiting the pickup permanently collects the parcel, and reaching the destination with it wins even on the last move. Otherwise spending the last move loses. The first allowance is the default. All information is public. The rules have no extra actions, resource payments, diagonal movement, response windows or opponent.

Supported inputs are a grid from 1 to 20 rows and columns, walls, three distinct valid cell IDs, one to ten distinct allowances from 1 to 1000, and an authored winning route within the default allowance. Generation replays that route through the real kernel in staging; invalid routes fail without publishing a destination. Additional profiles, mechanics and opponent policies are refused. Extra explicit components may be selected, but the assembly does not wire their behavior.

The output includes the complete rule statement in `docs/COURIER_RULES.md`, typed configuration, a shared rule factory, setup/store/UI adapters, node-only simulation, strict state invariants, semantic tests, and browser acceptance. `npm run check` runs the baseline and applicable authored gates below; `npm run test:acceptance` also requires Chromium and plays actual movement, cost, undo, pickup and delivery. Tests cover a mid-decision save/restore, refusal without state changes, exhausted allowance, deterministic simulation/store agreement and invariant failures. `docs/kit-assembly.json` records configuration validation and leaves bootstrap/game-slice checks as `not-run`; record their executed evidence separately.

`docs/PLAN.md` contains seven rules, nine scenarios, phases, sessions and the actual reuse map. `npm run plancheck` uses Python 3 and `docs/check-applicability.json`: cards and LLM playtesting are explicitly absent, with reasons; structural, scenario, session, reuse and applicable depth requirements remain strict. There are no fabricated card sections or legacy optional flags. The independently maintained `trace.config.json` inventory drives `npm run traceability` through K744's actual setup/action assertions, including atomic refused moves, wall/diagonal/remote choices, permanent pickup, destination-before-pickup, last-move delivery, undo and restored play. Missing rules, truncated evidence or absent fixtures fail.

`npm run plain-text` mounts the actual five UI routes, requires their expected nonempty content and checks visible text with plain-text. `npm run theme-check` checks the game-owned token file and styles without disabling rules. Browser acceptance separately uses theme-check's layout, coverage and 26px phone-font checks on rendered controls, including an empty-screen refusal. The regular test lane excludes the dedicated presentation test, so the plain-text lane executes it once. These four gates are wired in the default and PR lanes; the existing check runner rejects an omitted lane. Generation does not run them or claim their result.

`courier/` is the shared synthetic-rule overlay for the compatibility reference: it exports `createCourier`, the default `COURIER`, and a node-only `src/courier-sim.ts`. `courier-ui/` is the thin executable-scaffold overlay. They are templates, not components to vendor. Both use the kit's existing engine; games own any different rules. Two generated configurations and injected bad cost/button controls protect the integration.

This is a bounded increment of K551, which remains open. The applicable K430 plan and gate wiring is delivered for this courier input contract only. K430 remains open for other game-specific contracts and its still-unspecified architect-wrapper behavior. Other profiles retain the empty starter and require their own rules and gate inputs.
