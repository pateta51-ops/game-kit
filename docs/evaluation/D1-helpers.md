# D1 In-game helpers: bug reporter, tutorial engine, glossary
Scores 0-3. Read from main exports; counts by grep and diff, nothing run.

## 1. Bug reporter
Candidates: rome, jarl, warps, stcc (src/ui/bugs, one design), ebr (own design, src/ui/bugReport, 660 lines, no queue).

| | Generic | Tested | Proven | Carries fixes | Complete | Clean seams |
|---|---|---|---|---|---|---|
| jarl | 2: about 14 imports out (engine, content, routes, stores, lib/machine, viewport) | 3: 5 test files, e2e owner-bugs | 3: phone P5/P6, device facts | 3: 409 retry, shared in-flight set, Send all, CI skips bugs/ | 2 | 3: dialog.machine.ts pure state machine |
| rome | 2: about 14 imports out | 3: bugs, capture, dialog, floatButton tests, fakeGitHub | 2: #37 #39 #46 #48; no bug e2e found | 3: jarl fixes plus memory-only notice, scrolled capture (capture.ts 114 lines vs jarl 29) | 3 | 2 |
| warps | 2: about 7 imports out | 2: bugs.test 659 lines, e2e | 2: markup review fixes (focus, Escape, z-key, undo across reopen) | 1: oldest, github.ts 213 lines, no Send all | 1 | 2 |
| stcc | 1: about 20 imports out (fonts table, story, game over, frames) | 2: bugs.test, capture.test, e2e | 2: font embedding (#236), game-styled toolbar | 2: embeds game fonts; lacks 409 retry, Send all | 2 | 1 |
| ebr | 2: engine only | 1: 3 tests | 1 | 0: no queue, no retry | 1: bugs-send.ts server script | 1 |

Evidence: github.ts lines rome 396, stcc 247, jarl 221, warps 213. History: jarl 11-09/10 in-flight set, 409 retry, Send all; rome ported it 11-10 and added more; warps/stcc stop 11-03/05.

Checklist (union): screenshot capture [all]; scrolled phone capture [rome]; game font embedding [stcc]; markup editor [all four]; offline queue [all four, not ebr]; memory-only notice [rome]; GitHub filing to bugs/ [all]; 409 retry [rome, jarl]; shared in-flight set [rome, jarl]; Send all [rome, jarl; stcc and warps use scripts/bugs-file.ts]; floating button [rome]; token-safe settings [four]; device facts and replay snapshot [warps, jarl]; fake GitHub for tests [rome]; pure state machine [jarl].

Verdict
- Base: rome. It holds jarl's fixes plus the memory-only notice, scrolled capture, floating button and a fake GitHub.
- Graft: jarl dialog.machine.ts and collect.test.ts; stcc font embedding in capture.ts; scripts/bugs-file.ts if a command-line filer is wanted; jarl owner-bugs e2e.
- Cut or parameterise: imports of game store, saves, settings, routes, engine, content; repo name and bug folder (config.ts); MenuFrame; CSS theme; snapshot content. Offer an interface: getSnapshot, getDeviceFacts, theme, repo config.
- Lift effort: M. Same design everywhere; the work is replacing about 14 game imports with an interface.
- Risks: GitHub token storage (keep token-safe code and tests); screenshots pushed to a repo (privacy, 50 MB). No third-party licence seen.

## 2. Tutorial engine
Candidates: stcc (src/tutorial, src/ui/tutorial), warps, rome (same layout), jarl (src/ui/tutorial, state machine).

| | Generic | Tested | Proven | Carries fixes | Complete | Clean seams |
|---|---|---|---|---|---|---|
| stcc | 1: play, lock, freeze, scenario import engine and content/tutorial; freeze copies stcc pack parts | 3: tests/tutorial 22 cases, narration 3, scripts 11, ui 11, store 20, e2e | 3: decision notes b38, b39, b40, owner round | 3: richest check script (mechanic coverage, end scores; warps check differs 203 lines) | 3 | 2 |
| warps | 1 | 3: 27 + 13 cases, e2e | 2 | 2: port; adds store.ts, tutorial-seed.ts (827 lines deck-order search) | 2 | 2 |
| rome | 1 | 2: 11 + 6 cases, e2e | 2 | 2: port; Highlight 165 lines richest; scripts near equal to warps | 2 | 2: data.ts loads json |
| jarl | 2: narration and lock import engine and saves only; place.ts, machine import nothing | 2: 12 + 4 + 2 cases, check test, e2e plus phone e2e | 3 | 2: no freeze (live content plus seed); bare-number check in narration | 2 | 3: tutorial.machine.ts, place.ts pure |

Checklist (union): scripted headless play [stcc, warps, rome]; lock to the right move with reasons [all]; forced settings, no undo or auto-answer [stcc]; frozen pack proven equal to live [stcc, warps, rome]; hash [stcc]; mechanic coverage check [stcc]; script doc for owner approval [all]; seed or deck-order search [warps, jarl]; bare-number narration check [jarl]; highlight overlay [stcc, warps, rome best]; panel with phone docking [stcc]; home entry and reopen [stcc, rome]; panel placement [jarl].

Verdict
- Base: stcc. Most complete and tested, with owner decision notes.
- Graft: jarl tutorial.machine.ts, place.ts, bare-number check; rome Highlight.tsx; warps tutorial-seed.ts.
- Cut or parameterise: freeze.ts (list of what to copy, supplied by game); ALL_M_ITEMS and labels; FORFEIT, seats, Bot pause steps; engine types behind an adapter (apply action, list options, read events); end-score rule.
- Lift effort: L. Play, lock and freeze are welded to each game's engine; needs an adapter design.
- Risks: determinism-critical (seeds, shuffle scripts, frozen pack hash). No third-party code seen. Freeze step is pattern only.

## 3. Glossary
Candidates: warps and stcc (src/ui/glossary, content/glossary.ts), jarl (components/glossary.ts, GlossaryScreen), rome (glossaryData.ts, GlossaryScreen), ebr (src/ui/glossary).

| | Generic | Tested | Proven | Carries fixes | Complete | Clean seams |
|---|---|---|---|---|---|---|
| warps | 2: match.ts imports only content schema; GlossaryText imports store, GameIcon, powerText | 3: 7 test files, e2e, check 464 lines | 3 | 3: newer matcher (icon codes, wildcard, coveredChars), rules doc, icon-word rules | 3 | 3: match.ts pure |
| stcc | 1: LookupHost imports card face, tokens, art, session (8) | 3: 9 test files, e2e, check 274 | 3: notes b37, owner round | 2: original; linking index (game words only); no wildcards | 2 | 2 |
| jarl | 2 | 2: groups test, check test | 2 | 1 | 1: groups, popover, screen, check 194 | 2 |
| rome | 2 | 1: 4 files | 1 | 1 | 1: sections, no auto-linking | 1 |
| ebr | 3: engine api only | 2: reading-glossary test | 1 | 0 | 1: matcher, text, lookup host | 3: prepareGlossary(entries, names) takes data |

Checklist (union): longest-match terms with endings and case-as-printed [warps, stcc]; icon-code resolution with wildcards [warps]; number tokens [stcc]; linking index vs screen index [stcc]; link-in-text component [warps, stcc, ebr]; lookup popup with store and layout [warps, stcc, ebr]; glossary screen [all]; rules doc [warps]; icon-word table [warps]; check script [warps, stcc, jarl, rome]; grouped screen [jarl]; samples file [stcc].

Verdict
- Base: warps. Pure newest matcher, most tests, broadest check script.
- Graft: stcc linking index and glossary-samples.ts; jarl glossaryGroups; ebr data-in API shape.
- Cut or parameterise: VOCAB and REQUIRED lists and HEADING rule in glossary-check; iconWordTable.ts game json imports; GlossaryText game store, GameIcon, powerText (use a render prop).
- Lift effort: M. Matcher and tests lift nearly as is; check script lists become config.
- Risks: no licence issue. Capitalisation and wildcard rules are owner decisions; keep as options.

Not checked: runtime behaviour; ebr bug e2e and server tests in detail; no rome bug e2e found.
