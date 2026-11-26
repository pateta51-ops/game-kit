# {{name}} implementation and acceptance plan

## 1. Scope

This plan covers the original courier rules in `COURIER_RULES.md`, parameterized by `game-spec.json`. It does not adapt an external game. The shared courier factory supplies the rules; the game owns configuration, UI composition and independently authored acceptance fixtures. Generation is not evidence that a phase or check passed.

## 2. Shared preamble

Read the pinned component README before using a kit API. Keep `kit/` unchanged. Run focused tests while editing; reserve the full and heavy checks for the generated game's configured CI. The e2e browser scenario is required for gameplay acceptance and cannot be replaced by jsdom or a build. Report commands that did not run explicitly. Python 3 is required for the plan gate; Chromium is required for browser acceptance.

## 3. Rules

- **COU-01** Setup starts at the configured depot without the parcel, with the selected declared allowance; the first allowance is the default.
- **COU-02** A decision accepts one current-prompt choice of an orthogonally adjacent unblocked space. Each accepted move changes position and spends exactly one move. Illegal and stale choices leave authoritative state unchanged and emit no events.
- **COU-03** Entering the pickup collects the parcel; it remains collected after leaving.
- **COU-04** Entering the destination with the parcel ends the route as delivered, including when that move spends the last allowance.
- **COU-05** Spending the last allowance without delivering ends the route as late. A finished route has no pending choice and accepts no further move.
- **COU-06** Before the route ends, undo reverses one answered decision, restoring its prior position, parcel and movement allowance.
- **COU-07** Saving an open decision and restoring it preserves the selected rules, answers and complete authoritative state; play can continue from that same decision.

The seven IDs are maintained independently in `trace.config.json`, and their fixtures are maintained in `tests/rule-evidence.ts`. Neither inventory is discovered from engine handlers. A reviewer must check the case inputs and assertions against these rules. Boundary fixtures use the same public courier factory: the authored route with allowances of one and its length, an explicit two-by-three walled board for blocked/diagonal/remote refusal, and a three-cell row whose destination precedes the pickup. They do not change the generated setup choices.

## 4. Scenario catalogue

| Scenario | Rules | Expected outcome |
| --- | --- | --- |
| SC-001 | COU-01 | Each declared setup allowance starts at the depot with no parcel and the chosen budget. |
| SC-002 | COU-02 | The authored first move costs one; self, stale, wall-blocked, diagonal and remote choices are refused atomically. |
| SC-003 | COU-03 | The authored route collects at the pickup and keeps the parcel on the next move. |
| SC-004 | COU-04 | A destination visit without the parcel stays open; with the parcel it delivers, including on the last move. |
| SC-005 | COU-05 | A one-move boundary fixture ends late and refuses a further answer. |
| SC-006 | COU-06 | One legal answer followed by undo restores the preceding position, parcel and budget. |
| SC-007 | COU-07 | Save and restore at an open route decision preserve state and history, then finish the route. |
| SC-008 | COU-02, COU-03, COU-04 | The public-view pilot repeats under a seed and its replay agrees with the store. |
| SC-009 | COU-01, COU-02 | Mounted menu/setup/play/settings/saves have nonempty expected content and no rule-ID text; browser gameplay measures actual pieces. |

## 5. Layers

The kernel and store tests exercise actual moves, refusal, undo, save/restore and simulation. The K744 executable suite maps each rule to real setup or action assertions and requires accepted/refused controls for legality and exhaustion. The presentation test mounts the actual app, checks expected route controls and nonempty visible text, and uses the plain-text APIs. Static theme checking checks game-owned token use. Browser e2e checks geometry, coverage and phone text size on actual rendered content, then plays setup, movement, undo, pickup and delivery. Empty content fails the presentation checks.

## 6. Implementation phases

### Phase C1: Courier composition and rule evidence

Read `COURIER_RULES.md`, the Rules section and the pinned engine-core, game-store, grid-map and traceability guides. Maintain the shared factory adapter and independent expectations. Execute SC-001, SC-002, SC-003, SC-004, SC-005, SC-006, SC-007 and SC-008. Gate with the focused tests and `npm run traceability`; preserve meaningful accepted and rejected actions.

### Phase U1: Courier screen and acceptance

Read the Rules section and pinned screens, plain-text and theme-check guides. Maintain the game-owned board presentation and token file. Execute SC-009 and the browser path for SC-001, SC-002, SC-003, SC-004 and SC-006. Gate with `npm run plain-text`, `npm run theme-check` and the actual browser command.

## 7. Session plan

Confidence is a planning estimate, not measured correctness or a check result. Each batch owns only the stated game files; the kit remains pinned.

| Batch | Phases | Model | Confidence | Worker | Touches | Gate | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | C1 | repository default | 80% | codex | engine adapters and rule fixtures | npm run check and npm run traceability | game maintainer |
| S2 | U1 | repository default | 80% | codex | game UI and presentation checks | npm run check and full browser acceptance | game maintainer |

## 8. Reuse map

The kit pin is the exact `ref` in `kit/kit.lock.json`; the checker must verify Pull names against that locked copy. A missing verification source is not acceptance.

| Layer | Kind | Source |
| --- | --- | --- |
| Engine and state | Pull | `engine-core`, `game-store` |
| Board and pilot | Pull | `grid-map`, `sim-pool` |
| App navigation and forms | Pull | `app-frame`, `screens`, `settings`, `saves` |
| Checks and rule evidence | Pull | `plan-checker`, `traceability`, `plain-text`, `theme-check`, `check-runner` |
| Courier configuration and rules | New | build-own: parameters and synthetic courier rule composition using the scaffold's shared factory |
| Screen: courier board | New | build-own: the game's board cells and status composition over kit screens |

| Game sheet | Answer | Kit part or game ownership |
| --- | --- | --- |
| Who the player controls | One public courier | `game-store` |
| What can run out | Selected movement allowance | `engine-core`; build-own courier rule |
| Clocks and tracks | Movement decreases by one per answer | `engine-core` |
| The phase list | Setup, open route decisions, then delivered or late | `engine-core`, `screens` |
| Where the opposition comes from | Not in this game | No opponent; the pilot is only a test driver |
| Dice | Not in this game | No dice |
| Positions | Orthogonal cells and authored walls | `grid-map` |
| Numbers several cards change | Not in this game | No cards |
| Costs and payment | One move per accepted step | build-own courier counter rule over `engine-core` |
| May an effect be offered | A current legal adjacent route choice | `engine-core` |
| Lasting effects and status | Parcel remains collected | `engine-core`; build-own courier flag |
| Triggers and windows | Not in this game | No interrupts or responses |
| Cards as data | Not in this game | No printed cards or card language |
| Hidden information | Not in this game | All board and route state is public |
| Objectives and scoring | Deliver with the parcel before exhaustion | build-own courier terminal rules |
| Set-up picks | One declared movement allowance | `screens`, `game-store` |
| Between games | Not in this game | No campaign or progression |
| Loading the content | Validated authored board and locations | build-own typed courier configuration |
| Attacks and damage | Not in this game | No combat |
| Tokens and markers | One courier position and one parcel flag | build-own state using `engine-core` |
| Levels and upgrades | Not in this game | No upgrades |
| Markets and rows | Not in this game | No market |

| What the game builds | Phrasings searched | Nearest kit part | Verdict | Register id/refusal |
| --- | --- | --- | --- | --- |
| Courier configuration and rules | courier assembly; fixed board delivery | `scaffold`, `engine-core` | game code | These synthetic delivery rules are game content composed over existing kit APIs; steward not asked |
| Screen: courier board | tactical board screen; courier board view | `screens`, `grid-map` | game code | This view arranges the game's public cells and statuses over existing screens; steward not asked |

The current fit review is `plan-review/kit-fit.md`. There is no asserted external steward response and no new general mechanic or engine.

## 9. Definition of Done

Run `npm run plancheck`, `npm run traceability`, `npm run plain-text`, `npm run theme-check` and the generated baseline check at the exact consumer and kit revisions. Keep the check chain and runner lanes in agreement. Cheats and undeclared autoplay remain default-off. Run `npm run test:acceptance` with Chromium for actual e2e gameplay; unavailable execution remains not run. Require the missing-rule, missing-scenario, truncated-evidence, omitted-lane and empty-screen controls to fail. Independently review the fixtures and expected results. The broader scaffold and architect-wrapper roadmap items remain open.
