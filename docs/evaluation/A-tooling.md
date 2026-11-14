# Group A - BUILD TOOLING (read-only comparison, main exports of 14 Nov 2026)

Evidence: file diffs, md5 sums, test-case counts, header comments. No tests were run.

## 1a. Plan checker (plancheck)
Python checker for docs/BUILD_PLAN.md: fences, TOC anchors, section refs, table columns, json blocks, ids defined once, scenario ids resolve, scenarios referenced by phases, session-plan table, optional tsc of type blocks. Game-independent (section names are flags).

| Candidate | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| warps, rome, jarl, imp tools/plancheck.py (byte-identical, 366 lines) | 3: no game imports | 1: rome and jarl tests/scripts/plancheck.test.ts, 1 case each (wrapper only) | 3: in npm run check of 5 games | 3: newest; stcc differs only in 3 docstring example lines | 3: session-plan check and --tsc | 3: heading keywords are flags |
| stcc tools/plancheck.py | 3 | 0 | 3 | 3 (same code) | 3 | 3 |
| ebr scripts/plancheck.py + run-plancheck.ts (16 lines) | 3 | 0 | 3 | 2: wrapper succeeds silently with no Python, hiding a skipped check | 3 | 3 |
| unst tools/plancheck.py (139 lines) | 3 | 0 | 1 | 0: older, lacks session plan, tsc, id ranges | 1 | 3 |
| jarl, rome, warps scripts/plancheck.ts wrapper (48 lines, identical) | 3 | 1 case | 3 | 3: tries PYTHON env, python3, python, py launcher; rejects the Windows Store placeholder; exit 2 if none | 3 | 3 |

**Base:** jarl (equal to warps, rome, imp) tools/plancheck.py plus jarl scripts/plancheck.ts. Identical, complete, no game coupling.
**Graft:** the plancheck test; ebr no-Python-notice only as an option flag.
**Cut or parameterise:** docstring examples only.
**Lift effort:** S. **Risks:** none. Tests are thin: add a fixture plan in the kit.

## 1b. Traceability (each rule id must be in a test title and in a code comment)
All six scripts/check-traceability.ts differ (none identical); ebr trace.ts is a separate design.

| Candidate | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| jarl check-traceability.ts (457 lines) | 2: id families (R, RL, IR) and docs path hard-coded | 3: 16 cases | 3: --strict and --release, pending file with stale check | 3: newest; warps differs by 104 lines, rome by 124 | 3: titles and comments, pending json, unknown ids in titles, scenario ids exactly once, release mode | 3: pure functions with injected Io, exported |
| rome (449) | 2 | 2: 15 | 3 | 2 | 3 | 3 |
| warps (387) | 2 | 2: 13 | 3 | 2: older than rome and jarl | 2 | 3 |
| stcc (301) | 2 | 1: 6 | 3 | 1 | 2 | 2 |
| imp (288), unst (257) | 2 | 2: 13 and 25 | 2 | 1 | 1-2 | 2 |
| ebr trace.ts (187) | 1: knows PROGRESS.md phases, plan section 11.3 | 2: 8 | 3 | 2: only it/test titles count, titles listing over 6 ids count for none, skipIf handled | 2: phase-gated families, pending by phase | 1: tied to ebr plan layout |

Feature checklist: titles in tests, cites in src comments, pending list with stale check, unknown-id typo check, scenario id uniqueness, release flag, warn mode, Io injection, phase-gated families (ebr), long-id-list rule (ebr), skip handling (ebr).

**Base:** jarl scripts/check-traceability.ts: newest, most features, injectable Io, 16 tests.
**Graft:** ebr rules (describe does not count, long id lists count for none, skipIf distinction), ebr scripts/testing/titles; ebr phase-gating if wanted.
**Cut or parameterise:** id families, plan path, test dirs, pending file path, DEFERRED list: one config object.
**Lift effort:** M. **Risks:** none; it parses plan markdown, so the kit needs a matching plan template.

## 1c. Repo gate (privacy and size gate)
| Candidate | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| jarl scripts/repo-gate.ts (310) | 2: CONTENT_ID and CONTENT_NAME hard-code engine folder and a C-nn card id regex; runner name in code | 2: 8 cases | 3: owner rules (50 MB, no tailnet names, no session URLs) | 3: has RAW_SCAN, SESSION_URL, TAILNET_HOST, CONTENT_NAME that warps lacks | 3: 10 checks | 2: constants at top; edit in place |
| warps repo-gate.ts (330) | 2 | 3: 12 | 3 | 2: adds PORT rule (TS vs Rust engine) and Rust folders; lacks RAW_SCAN, session, tailnet | 2 | 2 |
| rome repo-gate.ts (308) | 2 | 2: 8 | 3 | 2 | 3 | 2 |
| stcc repogate.ts (280) + tools/repogate/runners.json | 2 | 2: 10 | 3 | 2: older; runner names kept as data outside code (good) | 2 | 3 |

Checks in jarl: SIZE 50 MB, RAW_SCAN, SECRET, SESSION_URL, TAILNET_HOST, RUNNER_NAME, CONTENT_ID, CONTENT_NAME, ART_BUDGET, REPO_BUDGET.
**Base:** jarl scripts/repo-gate.ts: widest privacy and size checks every private game needs.
**Graft:** stcc runners.json (names as data); warps PORT rule only if a game gets a second engine.
**Cut or parameterise:** card-id regex, engine folders, art folder and budgets, texts.json file, runner name.
**Lift effort:** M. **Risks:** the runner-name regex holds a private machine name: move to data. Kit repo must stay private.

## 1d. Smaller gates: generic enough to share?
| Gate | Games | Verdict |
|---|---|---|
| check-bundle-size.ts | stcc 157, imp 157 (header-only diff vs stcc), ebr 178, unst 181; 5 cases each | Yes. Base ebr: builds into .cache/size-build itself and fails when images, fonts or audio over a limit leak into the bundle. Effort S. Parameter: budget numbers. |
| glossary-check.ts | stcc 274, warps 464, rome 88, jarl 194; tests warps 14, jarl 1, stcc 1 file | Pattern only. Each imports game content and checks game terms. Share the idea (every [TOKEN] has an entry, every entry rule id exists). |
| theme-check.ts | rome 126, jarl 179; 2 cases | Partly. Font, logo, icon file checks are generic (jarl: 0 engine imports); route-render mode is game UI. Take jarl file mode. Effort S-M. |
| describe-check.ts | jarl 57 | No. Imports engine describeEffect and card pack. Pattern only. |
| guard-private.ts | ebr 144; 5 tests | Adaptable core: fingerprints runs of N words from private narrative text, fails on a leak or deploy workflow. Imports ebr pack registry. Parameterise the source files. Effort M. |

## 2. Check runner (behind npm run check)
| Candidate | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| ebr scripts/ci-lanes.ts (192) | 3: names scripts only | 1: exports coverageProblems and checkScripts; no test file found by grep | 3: comments cite PR 178 and 182 failures that shaped it | 3: kills whole process tree on cancel (taskkill on Windows, process group on Linux), 20 s grace then SIGKILL, 30 min timeout, per-check logs, every check runs after a failure, solo first phase for timing-sensitive tests | 3 | 3: reads npm run check from package.json and FAILS if lanes and chain disagree |
| stcc scripts/ci/check.ts (175) | 3: lane tables are data | 0 | 3: check:pr mode, serial fallback kept | 2: fail-fast with --keep-going, repeats failing output, timing summary; no tree-kill; lane table can drift from check:serial | 2 | 2 |
| plain && chains (warps, rome, jarl, ebr, imp, unst) | 3 | n/a | 3 | 0: first failure hides the rest; fully serial | 1 | 3 |

Features: parallel lanes; serial first phase (ebr); solo perf phase (stcc); fail-fast with keep-going (stcc); run-all-then-fail (ebr); PR-subset mode (stcc); per-check logs (ebr); timing summary (stcc); tree-kill and timeout (ebr); drift check (ebr); serial fallback (stcc).

**Base:** ebr scripts/ci-lanes.ts: drift check and tree-kill are real hardening.
**Graft:** stcc --pr mode, --keep-going, timing summary, solo perf phase; keep a serial check script as escape hatch.
**Cut or parameterise:** LANES, FIRST, EXTRA lists into a config file.
**Lift effort:** M. Needs a test file (coverageProblems is cheap to test).
**Risks:** timing-sensitive tests failed under overlap (5 s limit), hence FIRST. Windows and Linux kill paths untested.

## 3. CI and runner scripts
| Candidate | Generic | Tested | Proven | Fixes | Complete | Seams |
|---|---|---|---|---|---|---|
| jarl full-gate.mjs (74) + full-gate.yml (58) + ci.yml (37) | 2: label jarl, e2e project names | 0 | 3: used for merges | 3: newest; desktop e2e first, then WebKit phone, then offline | 3: prepare (checks PR number and 40-hex SHA, refuses heads outside the repo, merges into main), browsers, e2e on a free port | 3: workflow calls named mjs subcommands |
| rome full-gate.mjs (65) | 2 | 0 | 3 | 2: older | 2 | 3 |
| warps full-gate.mjs (89) | 2 | 0 | 3 | 2: adds port and perf subcommands | 2 | 3 |
| stcc full-gate.yml (139, logic inline in YAML) | 1 | 0 | 3 | 1 | 2 | 1: not testable |
| imp full-gate.yml (75) plus deploy, ingest, sandbox-sweep | 1 | 0 | 2 | 1 | 2 | 1 |
| ebr ci.yml (68, runs ci:lanes) + verify.yml (142) | 1 | 0 | 3 | 2 | 2 | 2 |
| unst ci.yml (99), no full gate | 1 | 0 | 1 | 0 | 1 | 1 |
| tools/architect local-ci.sh (jarl 60, rome 51, warps 54, stcc 52, imp 41), gate-slot.sh (19), watch-run.sh (warps, rome, stcc, imp) | 2: repo name and /tmp/jarl-ci hard-coded | 0 | 3 | 3: jarl handles branch or PR, head SHA check, flock, chromium path | 3 | 3 |
| tools/runner/install-wsl.sh (jarl 151, rome 141; 38 changed lines) | 1: repo slug, owner login, label, runner name hard-coded | 0 | 3: owner ran it | 3: jarl newer; idempotent, token never printed, --check, exit codes | 3 | 2: env overrides for repo, dir, name |
| warps setup-runner.ps1 (37), ebr scripts/setup.ps1 (86) | 1 | 0 | 2 | 1 | 1 | 1 |

Features: ci.yml with concurrency cancel and timeout; manual full gate by PR and SHA; refusal of outside heads; merge-into-main test; free-port e2e; desktop, phone, offline order; both-engine port rule (warps); perf step (warps); local fallback CI with flock; shared gate slots; watch-run; WSL runner installer; nightly fuzz (warps); deploy, ingest, sandbox sweep (imp).

**Base:** jarl: full-gate.yml, full-gate.mjs, ci.yml, tools/architect/local-ci.sh and gate-slot.sh, tools/runner/install-wsl.sh. Newest, logic in Node not YAML, input safety checks.
**Graft:** warps watch-run.sh (missing in jarl export), warps perf and port subcommands (optional), warps nightly-fuzz.yml.
**Cut or parameterise:** runner label, repo slug, owner login, runner name, /tmp paths, e2e project list: one config. Gate slot dir /tmp/stcc-gates needs a neutral name.
**Lift effort:** M (S for the mjs; M for installer and workflows).
**Risks:** installer and workflows embed the owner GitHub login and repo slugs. Self-hosted runner safety rests on refusing outside heads and never using pull_request_target: keep both. Installer uses sudo -n and registration tokens (never print). ebr verify.yml has private-pack steps: do not copy.

## Not checked
Test file for ci-lanes and stcc check.ts (grep found none); whether jarl has watch-run.sh (absent in export); real workflow run history; glossary-check internals.
