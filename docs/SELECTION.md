# Component selection (14 Nov 2026)

Which game's version each kit component starts from. Judged on the code of each game's main branch on 14 Nov 2026 by seven read-only reviews; the evidence is in `docs/evaluation/`.

Source commits: stcc `9fc59643`, warps `2af6937`, ebr `33b5abd3`, rome `1d0fd2e`, jarl `6f006a2`, imp `20a033a`, unst `9e666b4`.

## Criteria

"Best" is not the most lines of code. Each candidate was scored on:

1. **Generic** - how little of it is tied to its game.
2. **Tested** - tests that exercise it directly.
3. **Proven in use** - owner decisions, review notes, end-to-end tests, fix commits.
4. **Carries the fixes** - among drifted copies, the copy that has the fixes the others lack.
5. **Complete by feature** - a feature checklist, not a line count.
6. **Clean seams** - the game plugs in through data or an interface, not by editing the code.

## Effort

- **S** - copy with tiny edits.
- **M** - one worker batch of generalising.
- **L** - several batches or a redesign.
- **Pattern only** - not shareable as code; described in `docs/patterns/` with a pointer to the best example.

## Build tooling

| Component | Base | Graft from others | Effort |
|---|---|---|---|
| Plan checker | Jarl (same file in Warp's, Rome, Imperium, EBR; Jarl's wrapper finds Python) | - | S |
| Traceability check | Jarl | EBR's stricter title rules | M |
| Repo gate | Jarl | STCC's runner names kept as data | M |
| Bundle-size check | EBR | - | S |
| Privacy guard | EBR | - | M (dropped by the owner, 16 Nov 2026) |
| Theme check | Jarl (its file mode only) | - | M |
| Check runner | EBR (kills the whole process tree; fails when its lanes drift from the check chain) | STCC's pull-request mode and timing summary | M |
| CI and runner scripts | Jarl (full gate, workflows, local CI, runner install) | - | M |
| Glossary check, describe check | Pattern only | | |

## Engine

| Component | Base | Graft from others | Effort |
|---|---|---|---|
| Random numbers, hashing, canonical JSON, copy | Jarl, byte for byte (same as Rome; known-answer tests, no modulo bias). Never EBR's random numbers: they seed differently | - | S |
| Runner, copy-on-write, undo, replay, save format | Jarl | Warp's copy-on-write property tests and undo refusal reasons; EBR's save migration | M |
| State-machine check | Jarl (the only one; its library has no imports) | - | S |
| Simulation pool, driver contract, driver random numbers | Warp's | EBR's crash-safe records, resume file and fuzz script | S to M |
| Generic simulation runner | Warp's contract | | L |
| Command-line replay | Imperium (most tests, golden updates) | EBR's per-action hash comparison; STCC's injected input and output | M |
| Greedy and planner players, sanity bands | Pattern only | | |

Open check before the lift: the canonical JSON of the Jarl line and of STCC build their text and hash differently. A new game takes Jarl's as is, so nothing depends on them matching.

## Cards

| Component | Base | Graft from others | Effort |
|---|---|---|---|
| Card-language interpreter | Pattern only: every interpreter is welded to its game's state, zones and phases. Reference: EBR for the dry run and the handler table, Jarl for the small validator and registry | | L if ever shared |
| Card-language checks | Jarl's describe-check gate; the Rome and Jarl schema conformance test; the STCC and Imperium content validator | | S |
| Card test harness | STCC (scenario builder, prompt-delivery harness, choice probe, synthetic pack, inventory with stale check, written programme) | EBR's clause-level inventory and before/after helper; Warp's compiler-based reading of operation types | M |

## In-game helpers

| Component | Base | Graft from others | Effort |
|---|---|---|---|
| Bug reporter | Rome (has Jarl's fixes plus the memory-only notice, scrolled capture, floating button, fake GitHub for tests) | Jarl's dialog state machine; STCC's font embedding in captures | M |
| Glossary | Warp's (pure matcher, newest, most tests, broadest check) | STCC's linking index; EBR's data-in interface | M |
| Card patches | New (arkham.build design: one patch file per reason, applied on import) | | S |
| Tutorial engine | STCC (most complete and tested, owner decision notes) | Jarl's pure state machine and placement; Rome's highlight; Warp's deck-order seed script | L |
| Tutorial freeze | Pattern only | | |
| Achievements (K160), K162 | New; ideas only from marvel-lcg (nothing stored, versioned summary) and ArkhamHorror (catalogue, checklists); builds on play-stats, which holds no summary | | M |

## Menus shell and phone

| Component | Base | Graft from others | Effort |
|---|---|---|---|
| Settings | Imperium | Jarl's Layout setting; Rome's Resolution setting | M |
| Saved games | Jarl | Warp's tests; Rome's golden test; EBR's autosave slot pruning | M |
| Offline install | Jarl (precache plugin, pure register rule, offline end-to-end test) | - | S to M |
| App frame (routes, start-up, error boundary) | Imperium | Jarl's routes state machine | M |
| Phone mode | Jarl (confirmed on the owner's iPhone). About a third is reusable mechanism: viewport, safe area, sheet, disclosure | - | M |
| Proof sheet | Pattern only; take STCC's filters and groups | | |
| Themed screen frames, dev and phone scripts | Pattern only | | |

## Presentation

| Component | Base | Graft from others | Effort |
|---|---|---|---|
| Motion frame | Warp's (pure tested plan, director, sound-cue hook, skip all) | EBR's registry with one entry per event kind and its speed setting with reduced motion; Rome's injected-speed queue (STCC's view transitions not taken: the frame plays stand-ins over a stage and commits no state) | M |
| Effect library | STCC's generic set (kit, layer, dealing, beam, crumple, target highlight) plus Warp's particle kit | EBR's overlay layer, count-up and ambience | M |
| Sound player | Warp's (cue table as data, music, priorities, ducking, most fixes) | Unstoppable's event-to-cue merge layer | M |
| Sound generator | Warp's (the only one) | - | S to M |
| Voice-over | EBR (the only one). The player is generic; the scripts are tied to EBR's guide text and cast | - | M |
| Board layout (K116: map drawn in Inkscape, extracted as space rects and adjacency edges) | Rally the Troops `parse-layout.js`, `new-layout.js` (ISC; ported to TypeScript) | - | S |
| Visual replay | Pattern only: Rome's is welded to its screens and art | | L if ever shared |
| Code-built 3D pieces (`pieces-3d`, K166) | 7th Inning Stretch, commit 4dcb9be: the only game with WebGL dice and a rolling ball, already free of its game's names | - | M |

Generic effects: deal, move, flip, shake, highlight, beam, sparks, count-up, banner, crumple. One game's look, not shared: phaser, warp tunnel, coins, book, triumph.

## Risks to carry into the lifts

- The STCC, EBR and Rome motion code descends from an open-source LOTR LCG project (BSD-3). Its notice file travels with every file taken from it.
- `audio-gen` (K75): Stable Audio Open 1.0 (Stability AI Community License, gated weights), ACE-Step 1.5 (MIT), Kokoro-82M (Apache-2.0), a General MIDI soundfont the game supplies (GeneralUser GS: its own licence file). Checked from each project's page at lift time, 16 Nov 2026; a game re-checks before shipping anything made with them. No weights or generated audio are in the kit.
- No secrets were found in the voice-over files that were scanned; `castElevenLabs.ts` and the Warp's audio key script were not scanned. Scan them at lift time.
- Random numbers and hashing are determinism-critical: lift byte for byte, with their known-answer tests.

## Not checked by the reviews

Nothing was run; tests were counted, not executed. Per-review gaps are listed at the end of each file in `docs/evaluation/`.
