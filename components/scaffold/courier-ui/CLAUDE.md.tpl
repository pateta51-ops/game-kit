# {{name}}

This project uses the opt-in courier assembly. Read `docs/COURIER_RULES.md` and `docs/game-spec.json` for its complete authored rules and supported inputs. The one game definition in `src/engine/rules.ts` supplies the store, simulation and save/replay paths. UI code imports only `src/engine/api.ts` and reads the public view. Simulation code is node-only.

Kit components are locked in `kit/`; never edit them or copy their implementation into `src/`. The kit pin is in `kit/kit.lock.json`. Search with `node kit/kit.mjs search <words>` before writing game code, then read the relevant recipe and component README.

Ports: dev {{dev}}, preview {{preview}}, e2e {{e2e}}, phone {{phone}}. They come from the registered `{{id}}` entry; do not invent replacements.

`npm run validate:assembly` checks the declared route. `npm run check` runs baseline tests, lint, types, kit integrity, CI configuration, repo-gate, build and bundle size, plus the authored plan, executable rule evidence, mounted plain-text checks and static theme checks. The same four applicable gates are in the PR lanes. Keep the check chain and lanes in agreement. Python 3 is required for `npm run plancheck`.

Read `docs/PLAN.md`, `docs/check-applicability.json`, `trace.config.json` and `tests/rule-evidence.ts` before changing rules. The explicit non-card profile excludes only card-language and LLM-playtester requirements, with reasons. It uses no legacy optional flags. Maintain the seven-rule inventory independently of the engine and the plan parser. Preserve actual refused-action controls, blocked/diagonal/remote movement, a destination visit before pickup, and the last-move delivery boundary.

The plain-text gate mounts the actual menu/setup/play/settings/saves and rejects empty or leaking content. The theme gate checks game-owned tokens; browser acceptance uses actual layout, coverage and phone-font measurements and rejects empty content. Install Chromium with `npm run browser:install` or set `PW_CHROMIUM_PATH`, then run `npm run test:acceptance` for the declared slice including browser gameplay. A static or jsdom result is not browser evidence. Generation validates configuration only; all game acceptance remains not run until executed. Record actual command results at the exact consumer and kit revisions.

The inputs describe only this original courier game. Other games must author their own rules, applicability, scenarios and acceptance. Architect wrappers and other profiles remain outside this bounded increment; K430 and K551 remain open. The synthetic rules and configuration are safe to publish; actual game adaptations remain private.
