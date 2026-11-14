# E1 Motion and effects (warps, stcc, ebr, rome)

Method: file lists, import counts, diffs of same-named files, excerpts. Nothing was run. Effect files were not read one by one.

## Short answer
- Frame (a): two real designs. A) warps = a pure PLAN (engine events plus table before/after become a list of timed effects), then a director plays it as overlays above the real elements. B) stcc/ebr/rome = LOTR queue: each move waits its turn, the state is committed inside a browser View Transition, stand-ins fly. ebr adds a registry with one entry per engine event kind. rome adds a pure plan (live/plan.ts) and a director with injected speed.
- Recommended: ONE FRAME plus effects ported. Frame = warps plan/director split (pure plan, overlay play, skip-all, cue hook) with the ebr registry idea (every event kind must have an entry or the type check fails) and the stcc/ebr speed.ts. Effects = generic ones from stcc (fxKit, layer, dealing) plus warps canvas kit.
- Cost: frame M, generic effects M. Game looks stay in their games.

## (a) Motion frame - scores 0-3

| Criterion | warps | stcc | ebr | rome |
|---|---|---|---|---|
| Generic | 1: fx imports engine (7), game/model (7), table/shipBoard (4), tokens3d; all cue names are ship sounds | 1: 38 imports from engine; session, cardViews hard-wired; Move carries PlayerView, bot seats, tutorial sync | 1: 9 from engine/api, 8 from store, guide book, places | 2: director.ts imports only speed; plan.ts imports engine types; jobs injected |
| Tested | 3: 6 files, 67 cases plus 8 e2e files | 2: 8 files, 52 cases plus motion-b50..b59 e2e | 1: 0 unit tests in motion folder; e2e motion, vfx2, vfx3 only | 2: 2 files, 24 cases (live/plan.test, motion.test) |
| Proven in use | 3: docs/vfx README and inventory, batches V1-V8, 7 fix-type commits | 3: D-424 decision, owner mock rounds 2-3, 16 fix-type commits | 2: docs/reviews vfx proposals and implementation, motion-reliability note (3 causes fixed); 0 fix-type commits by subject | 2: decisions 018/019, owner clip rounds 17-19; 1 fix commit |
| Carries the fixes | 2: skip-all on tap, input never waits, Instant still cues | 3: unnameClipped (phone panel bug), flushSync, Safari addListener fallback, pan before leg | 3: reduced-motion switch, automated-browser Off, pointerdown pause fix | 2: failed effect cannot poison the queue, view-transition playback-rate scaling |
| Complete by feature | see list | | | |
| Clean seams | 2: plan pure and node-testable; looks registered by kind in a map | 1: legs (out/hold/arrive) are an interface, but director names event kinds in code | 3: registry type forces one entry per event kind; plan returns steps; timeline pure | 3: createDirector(speed) takes jobs (commit, play, finish); plan pure; no store use |

Feature checklist (a):
- Pure plan from events and before/after, no DOM: warps, rome (ebr and stcc partly)
- Queue of moves: stcc, rome FIFO; ebr one action at a time, new ends old; warps new answer finishes old
- Overlay stand-ins, real elements untouched: warps, ebr
- Browser View Transition for card moves: stcc, rome (ebr menus only)
- Skip on tap or key, input never blocked: warps, ebr, stcc (transition skip), rome partial
- Speed: stcc Normal/Fast/Off; ebr same plus cinematic 1.5 factor; rome instant/fast/normal; warps Slow/Normal/Fast/Instant
- OS reduced-motion obeyed: stcc, ebr (plus own switch). rome and warps: not found
- Automated browser forced Off: ebr only
- Wait hook for tests: stcc html data-moving; warps html data-fx (count); ebr and rome none found
- Sound cue hook: warps only (cue.ts, setCueSink; Instant still cues). None found in stcc, ebr, rome motion folders
- Every event kind must be placed (type-checked): ebr only
- Phone pan before a leg (D-439): stcc
- Lab page and clip capture scripts: rome (MotionLab, motion-record, motion-capture, motion-encode)

## (b) Effect library - scores 0-3

| Criterion | warps | stcc | ebr | rome |
|---|---|---|---|---|
| Generic | 1: looks tied to ship hits, shields, warp, coins; kit.ts (ease, seg, pulse, rng, sparks, glow, arc, impact, embers, smoke) is generic | 2: deal, shuffle, flip, beam, pulse generic; phaser, crewTrack, awayTeams, stardate are Star Trek | 1: effects.ts and sequence.ts tied to rangers, book, tests; FX colours ER only | 1: catalog and replays tied to Roman rules; crumple generic |
| Tested | 3: looks, v2, v3 frame tests | 2: dealing.test 354 lines, fizzle, signals, b51/52/59 | 0 | 1: motion.test |
| Proven in use | 3: round 2 and 3 mocks approved, copied 1:1 | 3: owner mock approvals | 2: owner picks, vfx3 | 2: owner clips |
| Carries the fixes | 2 | 3: stcc layer/fxKit are the base; ebr copy lacks unhide, BEAM gap, tabSwitched | 2: layer adds one overlay, opacity hide (keeps clicks), tracks all animations, click finishes all | 1: crumple is the stcc copy, only formatting differs |
| Complete by feature | see list | | | |
| Clean seams | 2: seeded rng, pure function of time, per-kind look | 2: leg interface; names hard-coded inside | 2: step list, colour table | 1: React component per effect |

Feature checklist (b), G = generic, L = look of one game:
- G deal / shuffle from deck: stcc (dealing.ts), rome (small)
- G card move between zones: stcc cardMotions/director, ebr flight, rome live/plan, warps useFlip (table/motion.ts) plus flight.ts
- G flip: ebr flip, stcc botReveal, warps flipBefore
- G shake / recoil / sway: warps hit recoil, stcc cardFx
- G highlight / target ring: stcc targetHighlight, ebr ring
- G beam: stcc beam, ebr sourceBeam, warps arc
- G sparks / embers / smoke / glow / impact: warps kit.ts; stcc fxKit sparks, shine, motes; ebr motes, shine
- G count-up numbers: ebr Count.tsx; stcc resources
- G banner / phase chip: stcc banner, ebr roundBanner, phaseChip
- G card crumple (WebGL): stcc and rome, same code
- G ambience particles: ebr Ambience.tsx
- G lab and clip recorder: rome
- L warp tunnel, power/signature looks, coins, blast/wreck, portal, tractor, shield: warps
- L phaser, crewTrack, awayTeams, stardate, incident beacon, promotion, takeControl: stcc
- L book open, travel, day end, test/effort sequence: ebr
- L triumph, trash, replay stages: rome

## Lineage
stcc, ebr, rome share LOTR ancestry in director, speed, viewTransition, fxKit, layer, crumple (each has LICENSE-LordOfTheRings.txt beside it). warps is independent.

## Verdicts

### (a) Frame
- Base: warps, the only frame with a pure, node-tested plan, a sound-cue hook, skip-all and 67 test cases.
- Graft: ebr registry.ts pattern (every event kind forced to have an entry); ebr speed.ts (reduced-motion switch, automated browser Off); stcc viewTransition.ts (unnameClipped, flushSync, finished handling) and its data-moving wait helper; rome createDirector (injected speed, failed effect cannot poison the queue) as the queue core.
- Cut or parameterise: warps CueName union (game supplies its own); imports of engine, game/model, tokens3d, shipBoard; SPEED_SCALE from game/presentation (move into kit settings, add Off and OS reduced-motion); director.ts mixes ship looks and the beat loop.
- Lift effort: M. The plan/director shape is reusable but the director needs one generalising batch and a test port.
- Risks: ported stcc/ebr/rome parts carry the LOTR BSD-3 notice; keep LICENSE-LordOfTheRings.txt beside each. Motion must never touch engine state or the seed (all four honour this).

### (b) Effects
- Base: stcc generic effects (fxKit, layer, dealing, cardMotions, crumple, beam, targetHighlight), because they carry the most fixes and tests; plus warps kit.ts for canvas particles.
- Graft: ebr layer.ts overlay approach (one overlay, opacity hide so clicks work, any click finishes all), Count.tsx, Ambience.tsx; rome lab and capture scripts.
- Cut or parameterise: every L item above; ebr FX colour table (make a theme object); stcc imports of play/cardViews, cards/artContext, content/assets, board/markColour (inject).
- Lift effort: M for the generic set (about 8-10 files, tests ported from dealing.test and effects.test). L items stay in games.
- Risks: crumple uses WebGL (throws on shader failure); LOTR notice; keep seeded rng for repeatable visuals.

### One design or two
Frame from warps plus the ebr registry, effects from stcc. Taking one game whole means losing the pure plan (stcc, ebr) or the generic effects (warps looks are ship-specific). Mixed cost: M plus M, no redesign.

## Could not check
Fix-commit counts are subject-line matches only (stcc 16, ebr 0, rome 1, warps 7). Not read: individual effect files, MotionLab, rome e2e beyond tutorial.spec. Whether warps honours OS reduced-motion: not found in director.
