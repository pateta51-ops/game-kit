# Effect inventory, all games (18 Nov 2026)

**Historical motion inventory from 18 November 2026.** For current implementation, see [the effects recipe](../recipes/effects-sound-voice.md).

Every animation and visual effect in each game at the commit shown, checked against the kit at origin/main 18 Nov. Status: in kit (component/verb), a planned row, or missing. Missing effects go to the effect batches (motion-retrofit); this file is updated when a row lands.

## Work list after merging repeats (18 Nov)

The 82 missing rows below reduce to these pieces of kit work. Numbers are the rows of the missing table, counted from the top.

| # | Kit work | Covers rows | Where |
|---|---|---|---|
| 1 | State banner and grey-out: diagonal bar with the game's word, or a thin diagonal line (`line` variant), plus a grey filter | 12, 28, 47, 48, 51, 77, 78 | K350 card-parts (line variant to add) |
| 2 | Refresh: the banner dissolves and the grey drains out with a sweep line | 10 | effect-library |
| 3 | Tap/untap and turned cards: turn by any angle (90 = tap, 180 = Rome's turned enemy), small overshoot | 27, 60 | K349 tap/spin (take EBR's 450 ms overshoot) |
| 4 | Spin: turns clockwise or counterclockwise, with scale-in (icon roll-in 540°), endless for rings | 42, 79 (rings) | K349 spin |
| 5 | Looping pulse/breathe on an outline or glow (tutorial, coach, destination, menu) | 13, 37, 61, 81 | effect-library, one loop verb |
| 6 | Idle loops: bob, breathing glow, orbiting stars | 36, 68, 69 | effect-library, one idle verb with three kinds |
| 7 | Hover tilt toward the pointer (3D lean, shadow lift) | 64 | card-hand or effect-library |
| 8 | Typewriter text reveal at a set pace | 33 | effect-library `text` option |
| 9 | Marching dashed line between two elements | 11 | effect-library |
| 10 | Lock-on reticle: brackets close on a target | 71 | effect-library (or target-arrow option) |
| 11 | Falling debris (columns, parts fall, turn and fade) | 59, 79 (debris) | effect-library particles |
| 12 | View-transition wrapper with speed scaling | 6, 7 | motion-frame (bands.ts `flight` is close: extend it) |

Already covered by the kit, nothing to build: 29 (column-beam with `curve`), 40 and 41 (counter bump and tag, colour by `glow`), 43, 56, 65, 82 (`fade-in`, `move`), 14 (`fade-in`, `scale` pulse), 38 and 75 (`lift`), 35 and 2 (ambience layer), 57 petals and laurels (particles), 8, 9, 15 (built from `move`, `glow`, `scale`).

Game looks only, no kit work (a colour, filter, border or static picture that stays in the game): 1, 3, 4, 5, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 30, 31, 32, 34, 39, 44, 45, 46, 49, 50, 52, 53, 54, 55, 58, 62, 63, 66, 67, 70, 72, 73, 74, 76, 80.

## Missing, all games

| Game | Effect | What it does | File:line | Game-free? |
|---|---|---|---|---|
| 7th-inning-stretch-fan-prototype | Run star flies to diamond, diamond fills on landing | Star flies; empty diamond fills at its arrival time | motion.css:32-37; B-35.json, B-37.json | look-only |
| 7th-inning-stretch-fan-prototype | Dusk/floods hour of day (field tint, sun light) | Field filter brightness/hue and warm radial light by hour | src/ui/theme/tokens.css:22-24; xp/xp.css:13 | look-only |
| 7th-inning-stretch-fan-prototype | Tin-plate lifted button (pressed offset, -0.3deg skew) | Plates sit tilted; pressed plate shifts up | src/ui/theme/tokens.css:52-55 | look-only |
| 7th-inning-stretch-fan-prototype | Out-lamp empty/lit diamond | Diamond slot dark until lit | src/ui/theme/tokens.css:81; motion.css:33 | look-only |
| 7th-inning-stretch-fan-prototype | Starburst "notice" badge | Star-shaped clipped badge for notices | src/ui/theme/tokens.css:99 | look-only |
| Star-trek-captains-chair-game | View-transition wrapper | flushSync + startViewTransition, speed-gated | src/ui/motion/viewTransition.ts:13 | yes |
| Star-trek-captains-chair-game | Global view-transition duration | Scales all group cross-fades by motion speed | src/ui/theme/motion.css:5-8 | yes |
| Star-trek-captains-chair-game | Game-start spread and ripple | Piles fly out from centre, face-up cards ripple over, banner | src/ui/motion/gameStart.ts:145, src/ui/theme/gameStart.css:37 | look-only |
| Star-trek-captains-chair-game | Row light-up wash and line ticks | Matched row lights gold, lines tick on in groups | src/ui/motion/effects/botReveal.ts:233,306 | look-only |
| Star-trek-captains-chair-game | Exhaust refresh drain sweep | Face drains to grey with sweep line, tag lifts | src/ui/motion/effects/refresh.ts:105-259 | look-only |
| Star-trek-captains-chair-game | Ship link dashed running line | Dashed white line marches between linked ships | src/ui/board/table/ShipLink.tsx:65, src/ui/theme/table.css:699-710 | look-only |
| Star-trek-captains-chair-game | Exhausted card look | Greyed card with diagonal EXHAUSTED bar across it | src/ui/theme/table.css:480-512 | look-only |
| Star-trek-captains-chair-game | Tutorial highlight pulse | Teal outline pulses on named table areas | src/ui/theme/tutorial.css:146-171 | look-only |
| Star-trek-captains-chair-game | Take-the-chair card in / peek / zoom | Cards fade up, peek bounce, zoom pop, pulse, swap | src/ui/screens/take-the-chair.css:704,1198-1336 | look-only |
| Star-trek-captains-chair-game | Captain vs Bot reveal | "VS" pops with side portraits after BEGIN | src/ui/screens/take-the-chair.css:1256-1310 | look-only |
| Star-trek-captains-chair-game | Begin button hover sheen | Highlight sweeps across fill, chevron nudges | src/ui/theme/home.css:335-380,602 | look-only |
| Star-trek-captains-chair-game | Chevron rotate on open | Disclosure chevron turns 45 to 225 degrees | src/ui/theme/layout-v8.css:239-245 | yes |
| Star-trek-captains-chair-game | Title background blur | Static blurred, tilted art behind the title | src/ui/theme/title-background.css:24 | look-only |
| Star-trek-captains-chair-game | Trait mark tilt (static) | Marked entry stamp sits tilted -8 degrees | src/ui/theme/trait-marks.css:48 | look-only |
| astra-imperium | Empty slot dashed | Empty slot dashed and dimmed to 52 percent | src/ui/table/table.css:46 | look-only |
| astra-imperium | Disabled key dim | Disabled button at 45 percent opacity, flat | src/ui/theme/theme.css:43 | look-only |
| astra-imperium | Primary key sheen | Primary key has teal gradient bar | src/ui/theme/theme.css:44 | look-only |
| astra-imperium | Starfield + grid backdrop | Star SVG over scan grid lines on table | src/ui/theme/theme.css:9-11 | look-only |
| astra-imperium | Sonar starfield panel | Panel with stars and radial gradient glow | src/ui/theme/theme.css:113 | look-only |
| astra-imperium | Current socket glow | Active player socket lit with bright shadow | src/ui/theme/theme.css:62 | look-only |
| astra-imperium | Act/turn banner | Banner with Act numeral and turn detail | src/ui/theme/kit/index.tsx:77 | look-only |
| earthborne-rangers-fan-prototype | Exhaust/ready turn | Card rotates 90 degrees with small overshoot (450 ms) | src/ui/motion/effects.ts:164; src/ui/table/Board.tsx:76 | yes |
| earthborne-rangers-fan-prototype | Exhausted grey look | Exhausted card greyed and darkened (grayscale+brightness) | src/ui/table/Board.tsx:81 | look-only |
| earthborne-rangers-fan-prototype | Source-to-target beam | Source pulses, arc beam with bright head travels to target | src/ui/motion/effects.ts:538; fxKit.ts:117 | yes |
| earthborne-rangers-fan-prototype | Day-end dusk | 2 s full-screen banner with ink writing | src/ui/motion/sequence.ts:390 | no |
| earthborne-rangers-fan-prototype | Book closes, bookmark lands | Page turns away, bookmark flies to log | src/ui/motion/sequence.ts:540 | no |
| earthborne-rangers-fan-prototype | Detail-change cue | Cue when a card's keyword/detail changes (not read in detail) | src/ui/motion/details.ts:44 | no |
| earthborne-rangers-fan-prototype | Typewriter reveal | New story text appears word/letter at voice pace; unread transparent | src/ui/motion/book.ts:106,189 | yes |
| earthborne-rangers-fan-prototype | Book open | Book element animates open | src/ui/motion/book.ts:141 | look-only |
| earthborne-rangers-fan-prototype | Scenery backdrop drift | Blurred backdrop drifts slowly 24 s | src/ui/motion/motion.css:63 | yes |
| earthborne-rangers-fan-prototype | Moment card bob | Resolving card bobs up 10 px, 2.4 s loop | src/ui/motion/motion.css:73 | yes |
| earthborne-rangers-fan-prototype | Destination breathe | Map destination drop-shadow glow pulses 1.8 s | src/ui/index.css:46 | yes |
| earthborne-rangers-fan-prototype | Table card hover lift | Hovered table card rises 5 px | src/ui/motion/motion.css:8 | yes |
| earthborne-rangers-fan-prototype | Aspect quadrant hover | Ring one quadrant, dim the other three | src/ui/aspect/digitalCard.ts:102 | look-only |
| imperium-horizon-fan-prototype | Resource gain flash | Pool item background flashes green then clears | theme/play.css:891,961; theme/phone.css:153; theme/table.css:858 | yes |
| imperium-horizon-fan-prototype | Resource loss flash | Pool item background flashes red then clears | theme/play.css:894,969; theme/phone.css:156; theme/table.css:861 | yes |
| imperium-horizon-fan-prototype | Icon roll-in spin | Die icon spins 540deg and scales from .6 | theme/play.css:900,988 | yes |
| imperium-horizon-fan-prototype | Toast slide-in | Toast drops 0.5rem and fades in, 220 ms | theme/play.css:681,996 | yes |
| imperium-horizon-fan-prototype | Cost modifier glow | Cyan (cheaper) or orange (dearer) ring on card cost | theme/play.css:415-430 | look-only |
| imperium-horizon-fan-prototype | Interaction glow | Hovered card lights cards/piles its text reaches, purple with tag | theme/table.css:1715-1740; board/table/InteractionGlow.tsx:10 | no |
| imperium-horizon-fan-prototype | Pile slide-out on pick | History pile slides left from under card while picking | theme/stacks.css:180-215 | no |
| imperium-horizon-fan-prototype | Exhausted card dim | Used in-play card desaturated and darkened | theme/board.css:929 | yes |
| imperium-horizon-fan-prototype | Used token grey | Spent coin greyscale and darker | theme/board.css:922; theme/table.css:844 | look-only |
| imperium-horizon-fan-prototype | Bot sits-out dim+outline | Bot card darkened with accent outline | theme/story.css:300; theme/board.css:632 | look-only |
| imperium-horizon-fan-prototype | Garrison card dim | Phone garrison card brightness .92 | theme/phone.css:546 | look-only |
| radiance-fan-prototype | Exhausted skill strike | Diagonal maroon bar crosses exhausted skill element | src/ui/table/table.css:37 | look-only |
| radiance-fan-prototype | Pressed sun button | Pressed button scales .86, double outline, night fill | src/ui/theme/theme.css:33 | look-only |
| radiance-fan-prototype | Won scene brightening | Won scene surface filter brightness 1.2 | src/ui/phone/phone.css:135 | look-only |
| radiance-fan-prototype | Sun-ray frame | 16 rotated ray strokes around a sun glyph | src/ui/theme/frames.tsx:21 | look-only |
| rise-of-a-jarl-fan-prototype | Covered-card strip glow | Option glow only on the visible banner/strip of a covered card | src/ui/theme/table.css:696 | look-only |
| rise-of-a-jarl-fan-prototype | Tutorial box glide | Tutorial box slides to next target, 350 ms, not on first placement | src/ui/theme/table.css:731; src/ui/tutorial/place.ts | yes |
| rome-fate-of-an-empire-fan-prototype | Triumph arch, petals, laurels | Arch with twin petal bursts and golden laurels on win | src/ui/motion/TriumphMotion.tsx:48,68 | look-only |
| rome-fate-of-an-empire-fan-prototype | Defeat top sweep | Dark sweep from top, then defeat scroll | src/ui/motion/catalog.ts (loss) | look-only |
| rome-fate-of-an-empire-fan-prototype | Collapse falling columns | Columns fall with embers behind descending scroll | src/ui/motion/catalog.ts (collapse); MotionLab.tsx | look-only |
| rome-fate-of-an-empire-fan-prototype | Aggressive enemy turned, outlined | Enemy card rotated 180 with red outline | src/ui/table/table.css:403 | look-only |
| under-falling-skies-fan-prototype | Coach suggestion pulse | Dashed target ring pulses opacity 1.4 s | src/ui/anim/anim.css:156; Base.tsx:126; Sky.tsx:121 | yes |
| under-falling-skies-fan-prototype | Fold dim + star fade | Region above fold darkened, stars fade by row | src/ui/board/Sky.tsx:74,104 | no |
| unstoppable-fan-prototype | Buffed threat ring | Static inset orange ring on a buffed threat | src/ui/theme/polish.css:256 | look-only |
| unstoppable-fan-prototype | Card lean toward mouse (3D tilt) | Hovered card tilts a few degrees, shadow lifts | src/ui/board/useCardTilt.ts; theme/motion.css:8-30; cards/tilt | yes |
| unstoppable-fan-prototype | Card enter slide-in | New card fades/rises 6px and scales .97 to 1 | src/ui/theme/board.css:1058-1085 | yes |
| unstoppable-fan-prototype | Die-cut glow along card cut | Glow follows the card's cut outline, red when targeted | src/ui/theme/scanned.css:29-58 | look-only |
| unstoppable-fan-prototype | Inactive location dim | Inactive location desaturated to 70% | src/ui/theme/board.css:553-555 | look-only |
| warps-edge-fan-prototype | Stun idle loop (breathing glow, crackle, orbiting stars) | Stunned card glows, crackles, three stars orbit | src/ui/fx/idle.ts:56 | look-only |
| warps-edge-fan-prototype | Dizzy stars | Three stars orbit and twinkle over a card | src/ui/fx/looks.ts:796 | look-only |
| warps-edge-fan-prototype | Warp held scene (dimmed table, dark ship shape) | Table stays dimmed with ship silhouette until choice | src/ui/fx/warpLook.ts:576 | look-only |
| warps-edge-fan-prototype | Lock-on reticle | Brackets close on target | src/ui/fx/power/blocks.ts:11 | look-only |
| warps-edge-fan-prototype | Signature looks (claw slashes, forks, reflect, rupture etc.) | Seven power-token signatures built from blocks | src/ui/fx/power/sigLook.ts:49 | look-only |
| warps-edge-fan-prototype | Utility token looks (warp ahead, entrap, randomizer, retrofit) | Token-specific layers and chips | src/ui/fx/power/utilityLook.ts:33 | look-only |
| warps-edge-fan-prototype | 3D ship pictures (offscreen WebGL copy to 2D canvases) | Modelled ship drawn through one shared context | src/ui/ship3d/renderer.ts:35 | no |
| warps-edge-fan-prototype | Attacking enemy lift | Enemy card rises and scales 1.03 with red glow | src/ui/table/table.css:247 | look-only |
| warps-edge-fan-prototype | Stunned card outline | Static stun mark on enemy and section | src/ui/table/table.css:239 | look-only |
| warps-edge-fan-prototype | Exhausted skill greyed with diagonal line | Grayscale card with crossing diagonal line | src/ui/table/game.css:878 | look-only |
| warps-edge-fan-prototype | Diagonal band across card art | Text band at -22 degrees over a card | src/ui/table/game.css:65 | look-only |
| warps-edge-fan-prototype | End screen rings, spinning, falling debris | Rings turn, parts fall and fade | src/ui/table/endscreen.css:897 | look-only |
| warps-edge-fan-prototype | End screen desaturated outcome tints | Saturate/brightness filters and glows per outcome | src/ui/table/endscreen.css:334 | look-only |
| warps-edge-fan-prototype | Menu pulse and sweep | Slow glow pulse and light sweep on menu plate | src/ui/theme/menus.css:205 | look-only |
| warps-edge-fan-prototype | Update banner transition | Banner reveal | src/ui/updateBanner.css:1 | yes |


## 7th-inning-stretch-fan-prototype @ b3ef81b

Kit read at game-kit origin/main cb69479. Most beats are JSON specs (content/motion/B-*.json) played by kit motion-frame + effect-library; rows below name the distinct visual effect, not each beat.

| Effect (neutral name) | What it does (≤12 words) | File:line | Game-free? (yes/look-only/no) | Kit status |
|---|---|---|---|---|
| Beat player (spec timeline, pace, skip on press) | Plays director specs on an effect layer; Fast halves, Instant skips | src/ui/motion/index.ts:163-200 | yes | in kit: motion-frame (createMotionPlayer, skipOnInput, withReducedMotion) |
| Beat holds the next question | Hides question/card row while a rare or once beat plays | src/ui/motion/motion.css:5-6; index.ts:25,139 | yes | in kit: motion-frame gate/holdUntil (K328 done) |
| Held-until-press beat (pennant stays till tap) | Final frame stays until the next tap or key | src/ui/motion/index.ts:183-193 | yes | row K328 (done: holdUntil press) |
| Clone-actor layer (stand-in copy of live element) | Clones a live element onto a fixed layer and animates it | src/ui/motion/index.ts:166-170; motion.css:2-9 | yes | in kit: effect-library layer/registerEffects (resolve, onActor) |
| Source hidden while its clone flies | Live element vanishes at beat start, returns at end | src/ui/motion/index.ts:175-180; motion.css:4 | yes | in kit: effect-library hideSource (K342, K329) |
| Slot empties when its piece leaves | Die slot hides as its flight starts | src/ui/motion/index.ts:54 | yes | in kit: effect-library hideSource 'step' (K329) |
| Move / fade-in / fade-out / settle / lift | Cards, dice, runners glide, appear, vanish, set down | content/motion/B-01..B-43.json (steps) | yes | in kit: effect-library verbs move, fade-in, fade-out, settle, lift |
| Card deal from supply to roster | Ten cards fade in, fly to roster, flip | content/motion/B-01.json | yes | in kit: deck-motions planDeal + effect-library move/flip |
| Draft reveal and pick (cards turn, kept one lifts) | Two packs flip face up; kept card lifts, rest leave | content/motion/B-02a.json, B-02b.json | yes | in kit: effect-library flip/lift/move |
| Substitution swap | Old card lifts out, new card slides in | content/motion/B-06.json | yes | in kit: effect-library lift/move/fade |
| Die tumble (3D roll with shake) | WebGL d6/d10 tumbles to its value | src/ui/motion/index.ts:43-44; content/motion/B-10.json | yes | in kit: pieces-3d-verbs (registerPieceVerbs shake), pieces-3d |
| Die turn (quarter turn out, next in) | Die turns to a new face; flip hands over faces | index.ts:44-45; B-12b.json | yes | in kit: pieces-3d-verbs flip (fx-two, data-fx-flipped) |
| Ball roll and rock | Seamed ball rolls by distance, rocks back at rest | index.ts:44 (ballLook); B-14/15 .json | yes | in kit: pieces-3d-verbs (move rolls, settle rocks), pieces-3d ball |
| Home-run ball arc over the wall | Ball flies in a high arc, shrinks, fades | src/ui/motion/index.ts:30-36; B-17.json | yes | in kit: effect-library arc-move (K342 done) |
| Frame glow in a colour for a flight | Card frame glows red for a token's whole flight | src/ui/motion/index.ts:38-42; B-28.json | yes | in kit: effect-library glow (colour, hold) (K342 done) |
| Gold glow flash on a die/line | Satisfied line and dice glow gold briefly | content/motion/B-11.json, B-12b.json, B-23.json | yes | in kit: effect-library glow |
| Group rattle (scoreboard plates shake) | Every plate jitters left/right for the beat | src/ui/motion/index.ts:49-52; B-31.json | yes | in kit: effect-library shake-group (K342 done) |
| Shake on an element (die, card, plate) | Short random jitter on one actor | B-03/05/10/24/26/28/29/30 .json | yes | in kit: effect-library shake |
| Pennant unroll from top edge | Banner scales from 0 to full height, origin top | src/ui/motion/index.ts:56-60; motion.css:29 | yes | in kit: effect-library unroll (K342 done) |
| Lamp lit without squash (flip) | Out lamp turns on at step start, pops by scale | src/ui/motion/index.ts:20,47; B-09/18/21/22a.json | yes | in kit: effect-library flip squash:false (K342 done) |
| Call banner text rises and fades | Outcome word (HOME RUN, 3 OUTS) shows and floats up | motion.css:17-21; B-13..B-34 .json (text, show, scale) | look-only | in kit: effect-library text/show/scale; look = game preset |
| Call scale-up pulse | Call word swells to 1.5x while shown | B-17.json (call scale 1.5) | yes | in kit: effect-library scale (pulse) |
| Full-table veil dim | Whole table dims to ~80% under a banner | motion.css:30; B-33.json, B-38.json, B-42.json | yes | in kit: effect-library veil actor (fx-veil) |
| Starburst behind the call | Gold starburst fades in behind a banner | motion.css:25,27; B-17.json, B-31.json | look-only | in kit: effect-library fade-in + game CSS; shape missing |
| Runner steps base to base, then hides home | Runner token moves along bases, hides on score | B-08/13/14/15/16/17/19/20/21.json | yes | in kit: effect-library move (then: hide) |
| Run star flies to diamond, diamond fills on landing | Star flies; empty diamond fills at its arrival time | motion.css:32-37; B-35.json, B-37.json | look-only | missing (delayed 1 ms CSS fill + flight; nearest K335 bar-fill) |
| Score plate counts +N flies to total | A +1 plate lands on the score cell, total flips | src/ui/motion/index.ts (B-19/24/29 casts); motion.css:12,28 | look-only | in kit: effect-library move/flip + countUp |
| Steal ball with red seam | Ball flies to base, red ring marks steal | motion.css:16; B-08.json, B-09.json | look-only | in kit: effect-library move; look = game CSS |
| Token spent lifts, flies, fades | Token lifts from pool to a die and fades | content/motion/B-12a.json | yes | in kit: token-flights / effect-library lift+move+fade-out |
| Lineup wave (nine cards lift in turn) | Lineup cards lift and settle one after another | content/motion/B-31.json, B-32.json | yes | in kit: effect-library lift/settle with stagger |
| Season bar flight (cards move up, others fade in) | Season screen cards lift and move in a row | content/motion/B-36.json, B-41.json | yes | in kit: effect-library lift/move/fade |
| Beat-wait for render (poll frames) | Waits up to 60 frames until target zones exist | src/ui/motion/index.ts:120,153 | yes | row K325 (done: whenReady/awaitRects) |
| Queue hides next card row until steps played | Card row invisible while the answer's steps run | src/ui/motion/motion.css:5-6; index.ts:102 | yes | in kit: motion-frame gate (K328) |
| Season screen lock during beat | Buttons hidden so only the end tap works | src/ui/motion/motion.css:24 | yes | row K328 (holds) |
| Dusk/floods hour of day (field tint, sun light) | Field filter brightness/hue and warm radial light by hour | src/ui/theme/tokens.css:22-24; xp/xp.css:13 | look-only | missing |
| Picked / selected ring | Chosen option gets a ring and edge | src/ui/theme/tokens.css:142-155 | yes | in kit: picked-state |
| Can-act star outline, acting chalk outline, red dashed target | Static outlines for playable, acting and target things | src/ui/theme/tokens.css:27; table.css:33 | look-only | in kit: picked-state (partial); prompt-host looks/legal-glow.css |
| Tin-plate lifted button (pressed offset, -0.3deg skew) | Plates sit tilted; pressed plate shifts up | src/ui/theme/tokens.css:52-55 | look-only | missing (static look) |
| Out-lamp empty/lit diamond | Diamond slot dark until lit | src/ui/theme/tokens.css:81; motion.css:33 | look-only | missing |
| Starburst "notice" badge | Star-shaped clipped badge for notices | src/ui/theme/tokens.css:99 | look-only | missing |
| Tutorial highlight | Panel and highlight over the target | src/ui/tutorial/tutorial.css:19-40 | yes | in kit: tutorial (Highlight, TutorialPanel) |
| Dice flat fallback (--die-depth) | Dice show flat form without WebGL | src/ui/table/depth.ts:5; tokens.css:93,150 | yes | in kit: pieces-3d (p3-gl fallback) |
| Die removed fade-out (200 ms) | Removed die fades out in the tray | src/ui/motion/specs.ts:16 | yes | in kit: effect-library fade-out |
| Voice and sound cue at beat time | Cue fires at a step time per beat | src/ui/motion/index.ts:76,196 | yes | in kit: motion-frame onCue; sound-player |

## Star-trek-captains-chair-game @ a69c8dac

Kit origin/main @ cb69479. effect-library verbs checked: move, arc-move, lift, settle, flip, scale, shake, shake-group, glow, unroll, multi-stop-path, text, column-beam, collapse-jump, rotating-beam, warp-transfer, radial-streaks, canvas effects (particles, trail), countUp, ambience, bands (banners). Rows K325-K335 are the open Motion retrofit rows.

| Effect (neutral name) | What it does (≤12 words) | File:line | Game-free? | Kit status |
|---|---|---|---|---|
| Deal flight via view transitions | Cards fly pile to place, turning over on the way | src/ui/motion/dealing.ts:271-279, src/ui/theme/motion.css:11-29 | yes | in kit: deck-motions (dealFrom, planDeal; ported from this file) |
| Refill lift | Refilled card rises 6% and settles while turning | src/ui/theme/motion.css:225, dealing.ts:271 | yes | in kit: deck-motions (refill option) |
| Deck riffle (shuffle v2) | 12-card halves riffle, zigzag drop, square-up, tap | src/ui/motion/dealing.ts:22,419 | yes | in kit: deck-motions riffle; verb wrapper row K327 |
| View-transition wrapper | flushSync + startViewTransition, speed-gated | src/ui/motion/viewTransition.ts:13 | yes | missing (no standalone helper; bands.ts/deck-motions only mention it) |
| Global view-transition duration | Scales all group cross-fades by motion speed | src/ui/theme/motion.css:5-8 | yes | missing |
| Motion speed scale (Normal/Fast/Off) | Factor read by every effect; reduced motion = none | src/ui/motion/speed.ts | yes | in kit: motion-frame speed / withReducedMotion |
| Game-start spread and ripple | Piles fly out from centre, face-up cards ripple over, banner | src/ui/motion/gameStart.ts:145, src/ui/theme/gameStart.css:37 | look-only | missing as a preset (parts in kit: move, flip + stagger) |
| Card turn-over (two faces) | Face turns edge-on, swaps, turns in, darkening | src/ui/motion/effects/cardFx.ts:104 | yes | in kit: effect-library flip (holdMs, squash); axis/direction K347/K348 |
| Chart face flip (CSS) | rotateY 0-90 and -90-0 with brightness dip | src/ui/theme/layout-v6.css:77-100 | yes | in kit: effect-library flip |
| Chart switched (cards turn away, new turn in) | Several faces flip staggered, zone height eases | src/ui/motion/effects/chartSwitched.ts:140,207,226 | look-only | in kit: effect-library flip + stagger |
| Play flight (card to pile) | Card flies on a straight line to a target | src/ui/motion/effects/cardFx.ts:118 | yes | in kit: effect-library move / arc-move |
| Pile lift and settle | Pile lifts slightly, card slides under, pile settles | src/ui/motion/effects/cardFx.ts:128,138; bottomReturn.ts:83 | yes | in kit: effect-library lift/settle; pile-lift verb row K335 |
| Return to bottom of deck | Pile lifts, card slides under back-up, pile settles | src/ui/motion/effects/bottomReturn.ts:83,131 | yes | in kit: lift+move+settle (no preset); row K335 pile-lift |
| Logged / recalled tuck | Card flies to pile, pile lifts, card tucks, tag bumps | src/ui/motion/effects/logRecall.ts:115-150 | yes | in kit: arc-move+lift+settle; tag via counter showTag |
| Deployed drop | Card lands with small drop and shadow draw-in | src/ui/motion/effects/deployed.ts | yes | in kit: effect-library settle |
| Look fan (scan/peek cards) | Cards turn up, fan out, pick lights, rest go under pile | src/ui/motion/effects/lookFan.ts:78,173 | yes | in kit: card-pile fan + deck-motions; pick glow via glow |
| Card preview grow in place | Card grows to 44% screen height, holds, shrinks | src/ui/motion/effects/botReveal.ts:149 | yes | in kit: effect-library scale |
| Row light-up wash and line ticks | Matched row lights gold, lines tick on in groups | src/ui/motion/effects/botReveal.ts:233,306 | look-only | missing as a pattern (parts: fade-in, glow) |
| Continue-resolution flicker | Stopped row flickers grey three times then dims | src/ui/motion/effects/continueResolution.ts:111,118 | look-only | row K335 (flicker) |
| Resource zip (cost paid) | Icons zip in a line from counter to card, with ghosts | src/ui/motion/effects/resourceWarp.ts:312-371, resources.ts | look-only | in kit: warp-transfer (zipGhosts, zipSparks, zipPopMs) |
| Resource gain warp | Icon rises in a light column, crossing light, column forms at target | src/ui/motion/effects/resourceWarp.ts:128-300 | look-only | in kit: warp-transfer (columnUp/columnDown, crossingDots) |
| Total tag "+N/-N" | Floating total rises beside counter | src/ui/motion/effects/resourceWarp.ts:152,194 | yes | in kit: counter showTag |
| Counter bump | Counter scales 1.35, 0.92, 1 on change | src/ui/motion/effects/resourceWarp.ts:268, actionIcons.ts | yes | in kit: counter bumpCounter |
| Icon glow on arrival | Drop-shadow glow fades off the icon | src/ui/motion/effects/resourceWarp.ts:262 | yes | in kit: effect-library glow |
| Glory warp to card | Token pulled into column, beam to card chip, number ticks | src/ui/motion/effects/gloryPlaced.ts:116 | look-only | in kit: warp-transfer + counter + countUp |
| Dismissed payout | Card lifts, glory beamed to counter, card slides to discard | src/ui/motion/effects/dismissed.ts:87 | look-only | in kit: lift + warp-transfer + move |
| Action gained / spent icons | Icon zips to row and pops; spent icon bumps and greys | src/ui/motion/effects/actionIcons.ts:18,164 | look-only | in kit: warp-transfer + counter bump |
| Column-of-light beam (card/team) | Object dissolves into glitter column, reforms elsewhere | src/ui/motion/effects/beam.ts:97-244 | look-only | in kit: effect-library column-beam, warp-transfer |
| Crossing light between columns | Faint streak flies along low arc between beams | src/ui/motion/effects/beam.ts:177 | look-only | in kit: warp-transfer (crossingDots) |
| Away-team beam | Token-size beam with chip rising in column | src/ui/motion/effects/awayTeams.ts | look-only | in kit: column-beam / warp-transfer |
| Ship warp (collapse and expand) | Token collapses to point with star streaks, reappears | src/ui/motion/effects/warp.ts:69-131 | look-only | in kit: effect-library collapse-jump, radial-streaks |
| Phaser shot (beam + head) | Beam fires from source to target with moving head | src/ui/motion/effects/phaser.ts:169,193,291,315 | look-only | row K334 (projectile) |
| Target hot glow and burn spot | Target glows hot, burn spot spreads | src/ui/motion/effects/phaser.ts:140,213,423 | look-only | row K334 (shimmer); glow in kit |
| Disintegration into tiles/embers | Target breaks into fragments and rising embers | src/ui/motion/effects/phaser.ts:485,525, destroy.ts | look-only | row K334 (dissolve, shatter) |
| Shield shimmer and ripple | Pale blue bubble shimmer, ring ripple on hit | src/ui/motion/effects/phaser.ts:350,374 | look-only | row K334 (shield-bubble, ring-pulse) |
| Hit jolt | Target shoves and stays displaced | src/ui/motion/effects/phaser.ts:384 | yes | in kit: effect-library shake |
| Fizzle (grey shake and sputter) | Card greys, shakes, sputters out | src/ui/motion/effects/fizzle.ts:32-57 | look-only | in kit: shake + glow; sputter row K335 (flicker) |
| Promotion badge press | Badge drops on card chest, presses in, glint ring | src/ui/motion/effects/promotion.ts:81-142 | look-only | rows K335 (stamp), K334 (ring-pulse) |
| Badge dissolve to specks | Badge breaks into pale specks | src/ui/motion/effects/promotion.ts:142,167 | look-only | row K335 (motes) |
| Promotion card lift from hand | Card rises out of hand then slides to slot | src/ui/motion/effects/promotion.ts:218 | yes | in kit: lift + move |
| Crew track hop and bar fill | Dot hops along bar, fill follows, number ticks | src/ui/motion/effects/crewTrack.ts:76,206,214; src/ui/theme/motion.css:215 | look-only | in kit: track HopTrack (hopFrames, registerFill --v); bar-fill row K335 |
| Multiplier badge pop and gold pulses | Badge pops, rings pulse twice, sparks, rising text | src/ui/motion/effects/crewTrack.ts:94,117,146,246 | look-only | in kit: glow/text + particles; ring-pulse K334 |
| Mission complete fanfare | Light sweep, sparks, flare, ring pulses on chip | src/ui/motion/effects/missionComplete.ts | look-only | in kit: particles sparks + glow; ring-pulse K334 |
| Banner sweep (turn / final round / game over) | Title sweeps in from left, holds, exits right | src/ui/board/TurnBanner.tsx:46, effects/banner.ts, finalRound.ts | yes | in kit: effect-library bands (banner lines, phase sweeps); letterbox-banner row K335 |
| Incident rotating red light | Red wedge turns twice around card, faint glow swells | src/ui/motion/effects/incidentBeacon.ts | look-only | in kit: effect-library rotating-beam |
| Stardate resolved stamp and slide | Card lifts, RESOLVED tag stamped, slides away | src/ui/motion/effects/stardateResolved.ts | look-only | row K335 (stamp) + lift/move in kit |
| Take control flag plant | Flag drops, shock ring, rides card, dissolves to motes | src/ui/motion/effects/takeControl.ts | look-only | rows K334 (ring-pulse), K335 (stamp, motes) |
| Trait marked ink stamp | Round mark drops, over-presses, ink ring and drops | src/ui/motion/effects/traitMarked.ts:85,97 | look-only | row K335 (stamp) |
| Closing scene (pull-back, dim, burn embers) | Table scales 4% and dims, red flare, embers, banner | src/ui/motion/effects/closingScene.ts:123-155 | look-only | row K335 (camera-pull, motes, letterbox-banner) |
| Junk crumple (WebGL mesh) | Card crumples as lit triangle mesh, stays as wad | src/ui/motion/effects/crumple.ts:195-309, wad.ts | no | rows K330 + K335 (crumple) |
| Junk throw, squash, pile jiggle | Wad thrown in arc, lands squash, pile jiggles, count bumps | src/ui/motion/effects/junk.ts:81,249,300 | look-only | in kit: arc-move + shake + counter; wad needs K330 |
| Exhaust refresh drain sweep | Face drains to grey with sweep line, tag lifts | src/ui/motion/effects/refresh.ts:105-259 | look-only | missing |
| Phone pan to off-screen action | Eased scroll or tab switch to the action, then back | src/ui/motion/effects/pan.ts:85-171 | yes | row K326 |
| Effect layer for stand-ins | Fixed clones over page, removed when all finish | src/ui/motion/effects/layer.ts, fxKit.ts:25 | yes | in kit: effect-library layer (createEffectLayer) |
| Director queue | Plays legs per move event, pause, skip | src/ui/motion/director.ts:77 | yes | in kit: motion-frame createMotionPlayer; waits K325/K328 |
| Ship link dashed running line | Dashed white line marches between linked ships | src/ui/board/table/ShipLink.tsx:65, src/ui/theme/table.css:699-710 | look-only | missing |
| Exhausted card look | Greyed card with diagonal EXHAUSTED bar across it | src/ui/theme/table.css:480-512 | look-only | missing |
| Dim non-pickable cards | Non-legal cards drop to 50% brightness | src/ui/theme/interactions.css:305,357 | yes | in kit: picked-state (--unpicked-dim) / card-pile data-dim |
| Target highlight outlines | Source solid, targets dashed breathing glow on source hover | src/ui/theme/interactions.css:770-812, effects/targetHighlight.ts | look-only | in kit: card-hand/card-pile data-mark; breathing look missing |
| Drop zone dashed outline | Staging zone outlined while a hand card is dragged | src/ui/theme/interactions.css:812 | look-only | in kit: drag-drop (data-drop-block / marks) |
| Tutorial highlight pulse | Teal outline pulses on named table areas | src/ui/theme/tutorial.css:146-171 | look-only | missing (tutorial has targets, no pulse look) |
| Hand card hover lift | Hovered hand face rises and grows | src/ui/theme/interactions.css:837,888 | yes | in kit: card-hand (--hand-lift, --hand-grow) |
| Take-the-chair card in / peek / zoom | Cards fade up, peek bounce, zoom pop, pulse, swap | src/ui/screens/take-the-chair.css:704,1198-1336 | look-only | missing |
| Captain vs Bot reveal | "VS" pops with side portraits after BEGIN | src/ui/screens/take-the-chair.css:1256-1310 | look-only | missing |
| Begin button hover sheen | Highlight sweeps across fill, chevron nudges | src/ui/theme/home.css:335-380,602 | look-only | missing |
| Chevron rotate on open | Disclosure chevron turns 45 to 225 degrees | src/ui/theme/layout-v8.css:239-245 | yes | missing |
| Title background blur | Static blurred, tilted art behind the title | src/ui/theme/title-background.css:24 | look-only | missing |
| Trait mark tilt (static) | Marked entry stamp sits tilted -8 degrees | src/ui/theme/trait-marks.css:48 | look-only | missing |

## astra-imperium @ e2a2787
No @keyframes, element.animate, rAF or canvas in src. All motion comes from kit components; own effects are static looks.

| Effect (neutral name) | What it does (≤12 words) | File:line | Game-free? (yes/look-only/no) | Kit status |
|---|---|---|---|---|
| Hand fan hover lift | Hand cards arc; hovered card lifts and grows | src/ui/table/Table.tsx:155; src/ui/table/table.css:70 | yes | in kit: card-hand |
| Legal/armed card outline | Hand card gets can-act or acting outline | src/ui/table/table.css:73-74 | look-only | in kit: card-hand data-mark, picked-state |
| Drag ghost | Dragged card follows pointer at 85 percent opacity | src/ui/table/Table.tsx:161; src/ui/table/table.css:78 | yes | in kit: drag-drop DragGhost |
| Paced event stepping | Table view steps through an answer's events | src/ui/table/Table.tsx:35 | yes | in kit: paced-view createStepper |
| Resource cell marker | Cube marker with rim and shadow on resource row | src/ui/table/table.css:42 | look-only | in kit: track marker |
| Empty slot dashed | Empty slot dashed and dimmed to 52 percent | src/ui/table/table.css:46 | look-only | missing (static state) |
| Disabled key dim | Disabled button at 45 percent opacity, flat | src/ui/theme/theme.css:43 | look-only | missing (static state) |
| Primary key sheen | Primary key has teal gradient bar | src/ui/theme/theme.css:44 | look-only | missing (static look) |
| Starfield + grid backdrop | Star SVG over scan grid lines on table | src/ui/theme/theme.css:9-11 | look-only | missing (static background) |
| Sonar starfield panel | Panel with stars and radial gradient glow | src/ui/theme/theme.css:113 | look-only | missing (static) |
| Current socket glow | Active player socket lit with bright shadow | src/ui/theme/theme.css:62 | look-only | missing (static) |
| Act/turn banner | Banner with Act numeral and turn detail | src/ui/theme/kit/index.tsx:77 | look-only | missing (no motion; table-panels TurnBanner is logic only) |

## earthborne-rangers-fan-prototype @ 59e0ad1d

| Effect (neutral name) | What it does (≤12 words) | File:line | Game-free? (yes/look-only/no) | Kit status |
|---|---|---|---|---|
| Card flight (FLIP) | Stand-in flies card from old place/pile to new; draws stagger | src/ui/motion/effects.ts:76 | yes | in kit: motion-frame + effect-library move/arc-move; row K324 |
| Departed/held card stand-in | Old look kept at old box until its step starts | src/ui/motion/effects.ts:30,51 | yes | row K324 (ghosts), row K329 (hideSourceUntil) |
| Exhaust/ready turn | Card rotates 90 degrees with small overshoot (450 ms) | src/ui/motion/effects.ts:164; src/ui/table/Board.tsx:76 | yes | missing (animated turn; card-attachments `turned` is static geometry) |
| Turned (tapped) card | Exhausted card shown rotated 90 degrees | src/ui/cards/CardFace.tsx:60; src/ui/table/Board.tsx:80 | yes | in kit: card-attachments `turned` |
| Exhausted grey look | Exhausted card greyed and darkened (grayscale+brightness) | src/ui/table/Board.tsx:81 | look-only | missing |
| Card flip / face swap | Old face turns away, new face turns in (3D, 540 ms) | src/ui/motion/effects.ts:240,260 | yes | in kit: effect-library flip (holdMs, squash, K347 axis, K348 direction) |
| Token drop and box tick | Tokens drop onto card, count box ticks, "xN" for many | src/ui/motion/effects.ts:306 | yes | in kit: token-flights + counter bump + card-attachments TokenRow |
| Energy pips spent/refill | Spent pips fly out; refill per quadrant | src/ui/motion/effects.ts:389 | yes | in kit: token-flights |
| Clearing sweep + motes | Coloured slanted band over card, motes rise, red shake on harm, glow | src/ui/motion/effects.ts:472,501 | yes | row K334 (shimmer), row K335 (motes); shake in kit |
| Source-to-target beam | Source pulses, arc beam with bright head travels to target | src/ui/motion/effects.ts:538; fxKit.ts:117 | yes | missing (target-arrow is pointer-driven; beam verbs are warp-specific) |
| Ring pulse | Ring expands out of a box and fades | src/ui/motion/fxKit.ts:88 | yes | row K334 (ring-pulse) |
| Sweep / shine band | Slanted coloured band wipes across a box, clipped | src/ui/motion/fxKit.ts:63 | yes | row K334 (shimmer) |
| Motes | Particles leave a box upward and fade | src/ui/motion/fxKit.ts:24 | yes | row K335 (motes); canvas particles in kit |
| Rising label | Short word/number rises and fades from a point | src/ui/motion/fxKit.ts:164 | yes | in kit: effect-library `text` verb; counter tag |
| Round/phase banner | Banner across board at round start, 1.5 s | src/ui/motion/effects.ts:565 | yes | in kit: effect-library bands.ts bannerAt |
| Phase chip relight | Top-bar phase chip lights again on a later phase | src/ui/motion/effects.ts:633 | yes | in kit: effect-library glow |
| Turn-start frame glow | A player's frame glows when their turn starts | src/ui/motion/effects.ts:664 | yes | in kit: effect-library glow |
| Deck riffle | Halves riffle, zigzag drops, square-up, tap | src/ui/motion/extras.ts:21 | yes | in kit: deck-motions riffle; row K327 |
| Fan of revealed cards | Scouted/looked cards fanned face up | src/ui/motion/extras.ts:66 | yes | in kit: card-pile fan |
| Hidden-pile backs flight | Anonymous backs show a changed hidden pile | src/ui/motion/extras.ts:119 | yes | in kit: deck-motions |
| Deal rows | Offered faces dealt into rows | src/ui/motion/extras.ts:299 | yes | in kit: deck-motions planDeal |
| Commit / cleanup flights | Committed cards fly to strip, later to discard | src/ui/motion/sequence.ts:64,624 | yes | in kit: motion-frame + move; row K324 |
| Effort ticks | Effort number counts through at most 25 frames | src/ui/motion/sequence.ts:80 | yes | in kit: effect-library countUp |
| Challenge card reveal | Card flips from deck to centre stage, holds, goes to discard | src/ui/motion/sequence.ts:119 | yes | in kit: motion-frame spec (move + flip + scale) |
| Result stamp | Big SUCCESS/FAILURE title scales in with a tilt | src/ui/motion/sequence.ts:200 | yes | row K335 (stamp) |
| Travel and arrival cue | Travel flight and arrival cue for location change | src/ui/motion/sequence.ts:250,332 | no | in kit: arc-move/glow (cue body not read in detail) |
| Path-deck built cue | Ring plus "N path cards" label | src/ui/motion/sequence.ts:354 | yes | row K334 (ring-pulse) + in kit text verb |
| Day-end dusk | 2 s full-screen banner with ink writing | src/ui/motion/sequence.ts:390 | no | missing |
| Journal record label | Label rises at top right for a recorded entry | src/ui/motion/sequence.ts:512 | yes | in kit: text verb |
| Book closes, bookmark lands | Page turns away, bookmark flies to log | src/ui/motion/sequence.ts:540 | no | missing |
| Spirit aura | Ring pulse plus sweep over panel | src/ui/motion/sequence.ts:576 | yes | row K334 (ring-pulse, shimmer) |
| Shuffled-in backs + count | Backs fly in with "+N" label, identities hidden | src/ui/motion/sequence.ts:593 | yes | in kit: deck-motions + text verb |
| Marker hop | Ranger marker hops to a card or back to its mat | src/ui/motion/sequence.ts:662 | yes | in kit: track glide / token-flights |
| Detail-change cue | Cue when a card's keyword/detail changes (not read in detail) | src/ui/motion/details.ts:44 | no | missing |
| Typewriter reveal | New story text appears word/letter at voice pace; unread transparent | src/ui/motion/book.ts:106,189 | yes | missing |
| Book open | Book element animates open | src/ui/motion/book.ts:141 | look-only | missing |
| Count-up number | Number eases up to its value | src/ui/motion/Count.tsx:32 | yes | in kit: effect-library countUp |
| Reward flip-and-shine | Reward card flips and shines in day and at camp | src/ui/motion/reward.ts:14 | yes | in kit: flip; row K334 (shimmer) |
| Campaign birth sweep | One-time sweep over day 1 of a new tracker | src/ui/motion/campaignBirth.ts:10 | yes | row K334 (shimmer) |
| Menu view transition | Cross-fade of menu card swaps via startViewTransition, 280 ms | src/ui/motion/viewTransition.ts:8; motion.css:51 | yes | in kit: effect-library bands.ts `flight`; row K324 |
| Weather ambience | Faint drifting rain/wind/fog layers clipped to surroundings | src/ui/motion/motion.css:17; Ambience.tsx:22 | look-only | in kit: effect-library createAmbience (container); row K335 (drift-cloud) |
| Scenery backdrop drift | Blurred backdrop drifts slowly 24 s | src/ui/motion/motion.css:63 | yes | missing |
| Moment card bob | Resolving card bobs up 10 px, 2.4 s loop | src/ui/motion/motion.css:73 | yes | missing |
| Destination breathe | Map destination drop-shadow glow pulses 1.8 s | src/ui/index.css:46 | yes | missing |
| Response-source glow | Teal outline and bloom on available response sources | src/ui/motion/motion.css:42 | look-only | in kit: prompt-host looks/legal-glow |
| Reading glow label | Ring + bloom + "Source/Target/Chosen" chip on cards | src/ui/reading/reading.css:1; InteractionGlow.tsx | look-only | in kit: prompt-host marks + picked-state (chip text is game's) |
| Aim ring | Ring on aimed target card | src/ui/reading/reading.css:57 | look-only | in kit: target-arrow `data-arrow-aim` |
| Drag drop zone | Dashed zone lights when a dragged card is over it | src/ui/reading/reading.css:26,85; useHandDrag.ts | look-only | in kit: drag-drop + card-hand drag |
| Hand sink / raise | Resting hand sinks, pointer raises it (200 ms) | src/ui/reading/reading.css:70 | yes | in kit: card-hand |
| Fan card transition | Fan cards slide at speed-scaled 75/150 ms | src/ui/reading/reading.css:40; PeekPile.tsx:86 | yes | in kit: card-pile fan |
| Table card hover lift | Hovered table card rises 5 px | src/ui/motion/motion.css:8 | yes | missing (card-hand lifts hand cards only) |
| Attachment slide | Attached cards slide out, 200 ms | src/ui/motion/motion.css:3 | yes | in kit: card-attachments HostStack |
| Aspect quadrant hover | Ring one quadrant, dim the other three | src/ui/aspect/digitalCard.ts:102 | look-only | missing |
| Selected ring / locked dim | Green ring on chosen card; locked card darkened | src/ui/cards/CardFace.tsx:67,69; PeekPile.tsx:86 | look-only | in kit: picked-state; card-pile data-dim |

## imperium-horizon-fan-prototype @ b82d5cf
Paths under src/ui/theme/ unless full. Line numbers on origin/main.

| Effect (neutral name) | What it does (≤12 words) | File:line | Game-free? (yes/look-only/no) | Kit status |
|---|---|---|---|---|
| Card deal-in drop | New market card drops 1.5rem and fades in | theme/play.css:875,905 | yes | in kit: deck-motions deal / market-row deal; row K338 |
| Hand draw rise | Drawn hand cards rise 1.2rem, fade in | theme/play.css:878,915 | yes | in kit: deck-motions planDeal (pile to hand) |
| Card enter scale-in | Played card scales from .85 and fades in | theme/play.css:881,925 | yes | in kit: effect-library fade-in with scale |
| Pile shuffle wobble | Pile rocks ±4deg, shifts 3px | theme/play.css:884,935; theme/table.css:354; theme/stacks.css | yes | in kit: deck-motions riffle (richer); row K327 |
| Pile/counter pulse | Element scales 1.08 and back once | theme/play.css:887,950; theme/table.css:450 | yes | in kit: effect-library scale verb; counter bump |
| Resource gain flash | Pool item background flashes green then clears | theme/play.css:891,961; theme/phone.css:153; theme/table.css:858 | yes | missing (counter has "+N" tag, no tint flash) |
| Resource loss flash | Pool item background flashes red then clears | theme/play.css:894,969; theme/phone.css:156; theme/table.css:861 | yes | missing |
| Card flip (Y turn) | Card turns edge-on and back (state, bot, reveal) | theme/play.css:897,903,977 | yes | in kit: effect-library flip; deck-motions turn-over |
| Icon roll-in spin | Die icon spins 540deg and scales from .6 | theme/play.css:900,988 | yes | missing (K335 tumble-3d planned) |
| Toast slide-in | Toast drops 0.5rem and fades in, 220 ms | theme/play.css:681,996 | yes | missing (ui-helpers toasts: no entry animation) |
| Card flight | Moved card flies from old place to new, scaled | theme/table.css:1750-1772; board/table/FlightLayer.tsx:172-300 | yes | in kit: effect-library move/arc-move + motion-frame; row K338 |
| Card flight via rest | Played-and-done card rests mid-way, then flies to pile | theme/table.css:1773-1790 | yes | in kit: effect-library move with via; row K338 |
| Flight shadow | Flying card gets deep drop shadow | theme/table.css:1760 | look-only | in kit: effect-library lift (--fx-lift-shadow) |
| Hide source until landed | Destination card hidden while its flight runs | board/table/FlightLayer.tsx:223-292 | yes | in kit: effect-library hideSource; row K329 |
| 3D CSS die tumble | Cube die spins on 3 axes, hops, lands on roll | theme/story.css:255-283 | yes | in kit: pieces-3d d6 roll + pieces-3d-verbs |
| Die result held back | Die marks stay hidden until the die lands | theme/story.css:276-300 | yes | in kit: motion-frame holds (K328) |
| Pick glow (three layer) | Legal card gets gold triple bloom; selected stronger | theme/play.css:385-410; theme/table.css:772,1190; board/phone/sheet/phone-sheet.css:504 | look-only | in kit: prompt-host looks/imperium-legal.css (K309) |
| Pick dim | Non-legal cards greyscale and darken | theme/index.css:43; theme/play.css:410 | look-only | in kit: card-pile/card-hand data-dim; picked-state |
| Cost modifier glow | Cyan (cheaper) or orange (dearer) ring on card cost | theme/play.css:415-430 | look-only | missing |
| Pickable hover lift | Pickable card transform and shadow ease, 120 ms | theme/play.css:504 | look-only | in kit: card-hand lift |
| Interaction glow | Hovered card lights cards/piles its text reaches, purple with tag | theme/table.css:1715-1740; board/table/InteractionGlow.tsx:10 | no | missing |
| Hover card preview | Zoomed preview follows hovered card or pile | board/table/preview.tsx:28-90 | no | in kit: card-zoom, ui-helpers hoverHold (partial) |
| Floating hand | Hand fan lifts hovered card | board/table/FloatingHand.tsx:89 | yes | in kit: card-hand |
| Pile fan + board grey | Pile fans out; board greys with hole for panel | theme/stacks.css:205-217 | yes | in kit: card-pile fan |
| Pile slide-out on pick | History pile slides left from under card while picking | theme/stacks.css:180-215 | no | missing |
| Stack depth shading | Cards below top darken per depth, 1px edge | theme/stacks.css:38-42 | yes | in kit: card-pile stack edges |
| Exhausted card dim | Used in-play card desaturated and darkened | theme/board.css:929 | yes | missing (card-attachments turned rotates, no dim) |
| Used token grey | Spent coin greyscale and darker | theme/board.css:922; theme/table.css:844 | look-only | missing |
| Bot sits-out dim+outline | Bot card darkened with accent outline | theme/story.css:300; theme/board.css:632 | look-only | missing |
| Garrison card dim | Phone garrison card brightness .92 | theme/phone.css:546 | look-only | missing |
| Dev row dim | Non-pickable dev row at 50 percent opacity | theme/table.css:775 | look-only | in kit: data-dim (picked-state) |
| Phone card sheet slide-up | Sheet slides up 240 ms, board dims behind | board/phone/sheet/phone-sheet.css:62-88 | yes | in kit: phone-mode Sheet (slideMs) |
| Reduced-motion switch | No animation under reduce-motion; speed factor | play/fx.ts:118-147; theme/index.css:347 | yes | in kit: effect-library withReducedMotion; settings speed |
| Event fx sequencer | Events set data-fx attrs, one animation each | play/fx.ts:140-160 | yes | in kit: paced-view stepper + motion-frame; row K338 |

## radiance-fan-prototype @ eaab69a

| Effect (neutral name) | What it does (≤12 words) | File:line | Game-free? (yes/look-only/no) | Kit status |
|---|---|---|---|---|
| Exhausted skill strike | Diagonal maroon bar crosses exhausted skill element | src/ui/table/table.css:37 | look-only | missing |
| Exhausted skill dim | Locked/exhausted skill takes muted panel background | src/ui/theme/theme.css:94,148; src/ui/phone/phone.css:54 | look-only | in kit: picked-state / card-attachments turned (partial) |
| Active skill fill | Active skill shown gold on dark ink | src/ui/phone/phone.css:54; src/ui/theme/frames.tsx:120 | look-only | in kit: picked-state (state hooks) |
| Exhausted quest card turned | Quest card rotates 90 degrees and scales .71 | src/ui/table/table.css:80 | yes | in kit: card-attachments (turned boxes) |
| Pressed sun button | Pressed button scales .86, double outline, night fill | src/ui/theme/theme.css:33 | look-only | missing |
| Track current marker | Current space gold with tilted maroon marker | src/ui/theme/theme.css:43 | look-only | in kit: track (data-state=current) |
| Won scene brightening | Won scene surface filter brightness 1.2 | src/ui/phone/phone.css:135 | look-only | missing |
| Sun-ray frame | 16 rotated ray strokes around a sun glyph | src/ui/theme/frames.tsx:21 | look-only | missing |
| Beat names table | Events map to named beats; nothing listens in 1.0 | src/ui/beats.ts:6 | yes | in kit: effect-library beats.ts beatsFromEvents |

## rise-of-a-jarl-fan-prototype @ 82bb1d5

| Effect (neutral name) | What it does (≤12 words) | File:line | Game-free? (yes/look-only/no) | Kit status |
|---|---|---|---|---|
| Option glow | Brass ring and gold bloom on a card the prompt offers | src/ui/theme/table.css:40 | look-only | in kit: prompt-host looks/legal-glow, imperium-legal |
| Selected glow | Stronger coin ring and bloom on a picked card | src/ui/theme/table.css:51 | look-only | in kit: picked-state |
| Dim unavailable card | Greyed, darkened card; fades in 120 ms | src/ui/theme/table.css:19,48 | look-only | in kit: card-pile `data-dim` (look is game's) |
| Covered-card strip glow | Option glow only on the visible banner/strip of a covered card | src/ui/theme/table.css:696 | look-only | missing |
| Tutorial box glide | Tutorial box slides to next target, 350 ms, not on first placement | src/ui/theme/table.css:731; src/ui/tutorial/place.ts | yes | missing (kit tutorial has docked panel, no glide) |
| Phone sheet slide-up | Bottom sheet slides up from 40 percent with fade | src/ui/theme/phone.css:225; src/ui/phone/Sheet.tsx:35 | yes | in kit: phone-mode Sheet (kit-pm-slide) |
| Fanned tilted cards | Home screen cards fanned with fixed tilts | src/ui/screens/Home.tsx:95 | look-only | in kit: pieces-3d `p3-tilt` (static tilt) |
| Rotated table cards | Stored/rotated cards drawn turned | src/ui/table/Table.tsx:91; src/ui/phone/table/Zones.tsx:183 | yes | in kit: card-attachments `turned` |

## rome-fate-of-an-empire-fan-prototype @ 399ab2d

| Effect (neutral name) | What it does (≤12 words) | File:line | Game-free? (yes/look-only/no) | Kit status |
|---|---|---|---|---|
| Deal deck-to-hand with turn-up | Cards fly from deck, back turns face up | src/ui/motion/dealing.ts:39 | yes | in kit: deck-motions dealFrom/planDeal |
| Card slide between zones | Face-up card glides hand/market/play/discard, 520 ms | src/ui/motion/dealing.ts:18; catalog.ts (play, discard, buy) | yes | in kit: deck-motions; effect-library move, arc-move |
| Market refill turn-over | Deck card lands in slot and turns face up | src/ui/motion/catalog.ts (refill) | yes | in kit: deck-motions turn-over |
| Market row slide | Surviving market cards slide to adjacent slot via view transition | src/ui/motion/viewTransition.ts:19 | yes | in kit: effect-library flight (startViewTransition); market-row rowMotions; row K324 |
| Card trash crumple and bin throw | Textured card crumples (canvas triangles), arcs into bin | src/ui/motion/TrashMotion.tsx:31; crumple.ts:315 | yes | row K330 (crumple verb in K335) |
| Enemy reveal vertical flip | Enemy card flips top edge toward viewer, 600 ms | src/ui/motion/catalog.ts (enemy-reveal) | yes | in kit: deck-motions turn-over axis y (K347); effect-library flip |
| Enemy defeat spin flight | Enemy spins in flight, lands as grey reverse | src/ui/motion/catalog.ts (enemy-defeat); live/LiveMotion.tsx | look-only | in kit: effect-library arc-move + flip + warp-transfer grey |
| Token slide to slot | Influence/trade/bonus disc glides from pool to slot | src/ui/motion/catalog.ts (influence-place, trade-place, bonus-*) | yes | in kit: effect-library move; token-flights |
| Thick disc flip spent/ready | 3D cardboard disc flips in place with shadow | src/ui/motion/live/live.css:~78 (.lm-disc) | yes | in kit: effect-library flip; deck-motions turn-over |
| Pawn step with foot marker | Movement points drain as pawn steps cell to cell | src/ui/motion/replayStage.ts:712 | look-only | in kit: effect-library movement.ts |
| Resource icon flight with amount | Icon plus number flies to counter, opaque, shadow | src/ui/motion/ResourceMotion.tsx:7; live/live.css:49 | yes | in kit: token-flights; effect-library flight-effects |
| Track cube pop and bump | +1 icon pops on cube, dissolves, cube bumps then moves | src/ui/motion/catalog.ts (wisdom, stability) | yes | in kit: track Glide/HopTrack; effect-library text, scale pulse |
| Round track advance | Round cube advances, turn cube resets to star | src/ui/motion/catalog.ts (round-track) | yes | in kit: track useMarkerGlide |
| Counter change | Fame/gold counter changes value with fly-in | src/ui/motion/catalog.ts (fame, gold) | yes | in kit: counter; effect-library countUp |
| Supply card to discard | Strife/Loan card leaves supply, lands in discard | src/ui/motion/catalog.ts (strife, loan) | yes | in kit: effect-library move/hide; deck-motions |
| Edict turn in place | Edict card rotateY 180 to 0, perspective 900 | src/ui/screens/menus.css:554 | yes | in kit: effect-library flip |
| Scroll banner unroll | Parchment scroll with rolled ends unrolls (round start/end/loss) | src/ui/motion/MotionLab.tsx:345; live/LiveMotion.tsx:413 | look-only | in kit: effect-library unroll; row K335 letterbox-banner |
| Triumph arch, petals, laurels | Arch with twin petal bursts and golden laurels on win | src/ui/motion/TriumphMotion.tsx:48,68 | look-only | missing |
| Defeat top sweep | Dark sweep from top, then defeat scroll | src/ui/motion/catalog.ts (loss) | look-only | missing |
| Collapse falling columns | Columns fall with embers behind descending scroll | src/ui/motion/catalog.ts (collapse); MotionLab.tsx | look-only | missing (particles.embers exists; scene does not) |
| Deck riffle shuffle | Twelve backs split, interleave, square, tap | src/ui/motion/replayStage.ts; catalog.ts (shuffle) | yes | in kit: deck-motions riffle; row K327 |
| Warp particles | Drifting particles in lab | src/ui/motion/lab.css:657,665 | look-only | in kit: effect-library particles |
| Clip playback rAF loop | Time-driven stage plays catalog clips | src/ui/motion/replayStage.ts:787; live/LiveMotion.tsx:78 | yes | in kit: motion-frame player/timeline/record |
| Motion speed and reduced motion | Speed setting scales or disables all motion | src/ui/motion/speed.ts; viewTransition.ts:7 | yes | in kit: motion-frame / effect-library withReducedMotion |
| Flight drop shadows | Lifted cards and pieces carry drop-shadow in flight | src/ui/motion/live/live.css:49,66 | look-only | in kit: effect-library lift (--fx-lift-shadow) |
| Tutorial panel unroll | Tutorial panel unrolls with rods, 300 ms | src/ui/tutorial/tutorial.css:110,344,348,354 | look-only | in kit: effect-library unroll verb (tutorial ui has none) |
| Tutorial target pulse | Highlighted cell, tab and coach pulse on loop | src/ui/tutorial/tutorial.css:137,145,156,169,311,314,416 | yes | in kit: tutorial TutorialHighlight (pulse unverified); effect-library glow |
| Tutorial highlight tracking | rAF loop keeps highlight frame on moving target | src/ui/tutorial/Highlight.tsx:63 | yes | in kit: tutorial TutorialHighlight |
| Aggressive enemy turned, outlined | Enemy card rotated 180 with red outline | src/ui/table/table.css:403 | look-only | missing |
| Played card tilt | Played cards rest tilted 4 to 14 degrees | src/ui/table/table.css:135,415,416 | look-only | in kit: card-pile fan (partial) |
| Thumbnail fan | Two thumbnails fanned -7 and +5 degrees | src/ui/table/table.css:44 | look-only | in kit: card-hand / card-pile fan |
| Schematic state clips | Debt draw, supply warning, income, cleanup, expire clips | src/ui/motion/catalog.ts (schematic) | no | in kit: effect-library beats.ts (sequencing only) |

## under-falling-skies-fan-prototype @ f1042f8

| Effect (neutral name) | What it does (≤12 words) | File:line | Game-free? (yes/look-only/no) | Kit status |
|---|---|---|---|---|
| Explosion burst | Ring, two spinning bursts and 8 particles at a point | src/ui/board/Fx.tsx:28; anim.css:44 | yes | in kit: effect-library particles (canvas sparks/impact) |
| Particle scatter | Dots fly outward along fixed angles and shrink | src/ui/board/Fx.tsx:14; anim.css:87 | yes | in kit: effect-library particles.sparks |
| Dust puff | Soft puffs rise and grow while fading (excavate) | src/ui/board/Fx.tsx:84; anim.css:97 | yes | in kit: effect-library particles.smoke; row K335 (motes) |
| Band flash | Coloured rect flashes in and out (city hit, descend) | src/ui/board/Fx.tsx:48,100; anim.css:67 | yes | in kit: effect-library glow (colour) |
| Whole-board damage tint | Full-board red veil flash on damage | src/ui/board/Fx.tsx:58 | yes | in kit: effect-library glow / `--fx-veil` |
| Board shake | Whole board jitters once on city hit | src/ui/board/Board.tsx:28 | yes | in kit: effect-library shake, feel.ts shakeAt |
| Region glow pulse | Room or action row glows in and out with ring | src/ui/board/Fx.tsx:69,75; anim.css:78 | yes | in kit: effect-library glow; row K334 (ring-pulse) |
| Ring pulse | Ring expands and fades at a space (place, robot) | src/ui/board/Fx.tsx:92,96; anim.css:57 | yes | row K334 (ring-pulse) |
| Pop-in | Piece scales from 0 with overshoot (new ship, placed die) | src/ui/anim/anim.css:107; Sky.tsx:190; Base.tsx:118 | yes | in kit: effect-library fade-in/scale |
| Drop-in | Piece lands from 1.8x with bounce | src/ui/anim/anim.css:117; Base.tsx:110 | yes | in kit: effect-library fade-in with `scale` |
| Wobble | Piece rocks left/right (blocked move) | src/ui/anim/anim.css:131; Sky.tsx:191 | yes | in kit: effect-library shake |
| Shrink-fade | Piece shrinks to 0.3 and dims (absorbed ship) | src/ui/anim/anim.css:143; Sky.tsx:192 | yes | in kit: effect-library scale + fade-out |
| Piece glide | Ships/mothership/fold line slide to new cell per frame | src/ui/board/Sky.tsx:106,147,176,203 | yes | in kit: effect-library move; row K324 |
| Event-replay frames | One action replayed as frames, each with its own fx and length | src/ui/anim/frames.ts:157; useAnimatedView.ts:33 | yes | row K324 (beats with commit/data) |
| Camera/fold tween | Eased numeric tween moves the view top | src/ui/board/useTween.ts:9; Board.tsx:23 | yes | row K335 (camera-pull) |
| Track marker glide | Marker slides between track steps, step fill fades | src/ui/board/Tracks.tsx:37,62,85 | yes | in kit: track useMarkerGlide |
| Die flight | Flat die copy flies from tray to board space | src/ui/anim/fly.ts:17 | yes | in kit: effect-library arc-move / token-flights |
| CSS cube die tumble | Cube spins to value, hops, shadow squashes | src/ui/panel/Die3D.tsx:76 | yes | in kit: pieces-3d roll (WebGL); row K335 (tumble-3d) |
| Coach suggestion pulse | Dashed target ring pulses opacity 1.4 s | src/ui/anim/anim.css:156; Base.tsx:126; Sky.tsx:121 | yes | missing |
| Coach spotlight | Tinted rect with outline over the coach's target area | src/ui/board/Spotlights.tsx:33 | yes | in kit: tutorial highlight (ui.ts) |
| Fold dim + star fade | Region above fold darkened, stars fade by row | src/ui/board/Sky.tsx:74,104 | no | missing |

## unstoppable-fan-prototype @ 9825676

Kit read at game-kit origin/main cb69479. Retrofit row K339 (open) swaps this game's own arrow/flights for kit parts; target-arrow, token-flights, card-hand glide are already ported from here.

| Effect (neutral name) | What it does (≤12 words) | File:line | Game-free? (yes/look-only/no) | Kit status |
|---|---|---|---|---|
| Targeting arrow (segmented curve, snaps to target) | Curved arrow follows pointer from asking card, snaps to legal target | src/ui/board/TargetArrow.tsx:220,342; theme/motion.css:34-80 | yes | in kit: target-arrow (arrow.ts, TargetArrow) |
| Arrow dash flow (marching dashes) | Dashed arrow body scrolls along its length | src/ui/theme/motion.css:53-60,81-85 | yes | in kit: target-arrow (K306/K307 look, glow part) |
| Arrow colour change on snap (gold to red) | Arrow and glow turn red when aimed at a target | src/ui/theme/motion.css:67-77 | look-only | in kit: target-arrow look (K306) |
| Aimed target brighten and red glow | Aimed card gets brightness plus red drop-shadow | src/ui/theme/motion.css:86-93 | look-only | in kit: target-arrow (red glow on aimed place, K306) |
| Hit flash over target | Radial flash scales up and fades on a hit | src/ui/board/TargetArrow.tsx:386-415; motion.css:100-114 | yes | in kit: target-arrow strike.ts (flash) |
| Hit shake of the target | Target place wobbles left/right on damage | src/ui/board/TargetArrow.tsx:416-430 | yes | in kit: target-arrow strike.ts (shake) |
| Glow-only hit (non-damage target) | Target glows gold briefly, no flash or shake | src/ui/board/TargetArrow.tsx:370-382 | yes | in kit: target-arrow (gold glow, K306) |
| Token flight (arc between two places) | Token lifts 15% of distance, swells 1.15, lands | src/ui/board/TokenFlights.tsx:193-225; scanned.css:1588-1592 | yes | in kit: token-flights (flights.ts, TokenFlights) |
| Token flight ledger (token in one place) | Flying token hidden at source and destination until landing | src/ui/board/TokenFlights.tsx:123 | yes | in kit: token-flights ledger; row K329 |
| Token drop shadow while flying | Soft shadow under flying token | src/ui/theme/scanned.css:1588-1591 | look-only | in kit: token-flights (look) |
| Danger marker glide on track | Marker hops from old space to new with arc and swell | src/ui/board/threatBuffs.tsx:100-140 | yes | in kit: track (glide.ts, [data-part=glide]) |
| Danger rise buff pulse (red-orange glow) | Card glows red/orange, swells, pulses twice, fades | src/ui/theme/polish.css:192-232 | look-only | in kit: effect-library looks/rise-pulse.css (K308) |
| Health counter tick (flash and scale) | Number flashes orange at 1.45x and settles | src/ui/theme/polish.css:234-247 | yes | in kit: counter bump (+ looks/health-glow.css K308) |
| Floating +N stat rise | Pill with +N rises 1.6em and fades per stat | src/ui/theme/polish.css:262-300; threatBuffs.tsx | yes | in kit: counter tag ("+N" span, data-part=tag) |
| Buffed threat ring | Static inset orange ring on a buffed threat | src/ui/theme/polish.css:256 | look-only | missing (static state; kit counter looks only) |
| Hand fan glide (card flies into row in play) | Played card glides from hand to its row | src/ui/board/Hand.tsx:9,106,128 | yes | in kit: card-hand glide.ts (useGlideIn) |
| Card lean toward mouse (3D tilt) | Hovered card tilts a few degrees, shadow lifts | src/ui/board/useCardTilt.ts; theme/motion.css:8-30; cards/tilt | yes | missing |
| Card enter slide-in | New card fades/rises 6px and scales .97 to 1 | src/ui/theme/board.css:1058-1085 | yes | missing (nearest: effect-library entryMotions, K324 board swap) |
| Value pop on change | Changed number scales 1.35 to 1 in 220 ms | src/ui/theme/board.css:1064-1090 | yes | in kit: counter bump |
| Toast slide-in | Message toast fades in and rises 8px | src/ui/theme/board.css:1069,1112 | yes | in kit: achievements toast.ts (partial) |
| Exhausted card rotated 90 degrees | Exhausted card turns sideways, desaturated, dimmed | src/ui/theme/cards.css:59-85 | yes | in kit: card-attachments (turned: true box) |
| Playable face glow / dim / ring | Actionable glows, others dim, chosen has solid ring | src/ui/theme/cards.css:49-58,732; scanned.css:29-60,1440-1448 | look-only | in kit: picked-state; prompt-host looks/legal-glow.css (K308) |
| Die-cut glow along card cut | Glow follows the card's cut outline, red when targeted | src/ui/theme/scanned.css:29-58 | look-only | missing |
| Pile volume (stack edges and shadow) | Deck shows layered card edges with depth shadow | src/ui/theme/polish.css:5-30; scanned.css:900-935 | yes | in kit: card-pile (stack at rest) |
| Inactive location dim | Inactive location desaturated to 70% | src/ui/theme/board.css:553-555 | look-only | missing (static state; picked-state dims unpicked) |
| Home hero slow drift | Title image scales/pans slowly in and out, 36 s | src/ui/theme/screens.css:80-100 | yes | in kit: effect-library createAmbience (per study); K335 drift-cloud (other) |
| Card zoom dialog pan/scale | Zoom window scales picture, drags, anchors on pointer | src/ui/scanned/ZoomDialog.tsx:130-160 | yes | in kit: card-zoom (no pan/scale motion noted) |
| Animation speed and reduced-motion scaling | --motion multiplier; reduced motion shortens all to 0.001 ms | src/ui/theme/index.css:210-240 | yes | in kit: motion-frame speed, withReducedMotion |
| Sound cues for effects | Cues played with arrow, flights, buffs | src/ui/sound/cues.ts, recipes.ts | yes | in kit: sound-player; row K331 |

## warps-edge-fan-prototype @ 449af55

| Effect (neutral name) | What it does (≤12 words) | File:line | Game-free? | Kit status |
|---|---|---|---|---|
| FLIP slide of moved elements | Keyed elements glide from old place to new after render | src/ui/table/motion.ts:117 | yes | in kit: token-flights / row K324 (board swap) |
| Token flight from bag on draw | Drawn tokens fly one after another from the bag | src/ui/table/motion.ts:84 | yes | in kit: token-flights; token-bag |
| Everything returns to bag | Ghost copies of table tokens fly back to the bag | src/ui/table/motion.ts:1 | yes | in kit: token-flights |
| Ledger-held token hide (hold source) | Real element hidden until its ghost lands | src/ui/fx/gate.ts:1 | yes | row K329 (hideSourceUntil) |
| Effect director (held WAAPI time, skip, speed scale) | Plays plan of stand-in overlays, speeds Slow/Fast/Instant, skip finishes | src/ui/fx/director.ts:251 | yes | in kit: motion-frame + effect-library layer |
| Phone tab follows effect | Phone switches tab to where the effect plays | src/ui/fx/gate.ts:1 | yes | row K326 (phone pan) |
| Sound cue hook per effect moment | Effects name cues fired at exact moments | src/ui/fx/cue.ts:1 | yes | row K331 (sound) |
| Seeded canvas kit (sparks, smoke, arcs, flashes) | Pure time-function particle and glow helpers | src/ui/fx/kit.ts:335 | yes | in kit: effect-library particles |
| Token hit on target (flash, shake) | Token strikes card: bolt, flash, card shake | src/ui/fx/looks.ts:349 | look-only | in kit: target-arrow (hit flash/shake); row K334 (projectile) |
| Pip fill | Pip bar fills one pip per energy with glow | src/ui/fx/looks.ts:616 | look-only | in kit: effect-library count/bands (partial); row K335 (bar-fill) |
| Stun onset (EMP ring, arcs, desaturate) | Pink-violet ring and arcs hit card, then stun mark | src/ui/fx/looks.ts:869 | look-only | row K334 (ring-pulse); stun look missing |
| Stun idle loop (breathing glow, crackle, orbiting stars) | Stunned card glows, crackles, three stars orbit | src/ui/fx/idle.ts:56 | look-only | missing (row K335 flicker partial) |
| Dizzy stars | Three stars orbit and twinkle over a card | src/ui/fx/looks.ts:796 | look-only | missing |
| Enemy destroyed (shatter into shards) | Card tears into 24 clip-path shards, fire, shockwave, debris | src/ui/fx/blast.ts:327 | look-only | row K334 (shatter), K335 (crumple); missing now |
| Section breach (blow-out) | Section flashes, fire, link fade, pops | src/ui/fx/blast.ts:892 | look-only | row K334 (shatter/ring-pulse) |
| Shared-work blast degrade | Concurrent blasts use fewer particles, plainer canvas | src/ui/fx/blast.ts:340 | yes | row K330 (shared canvas) |
| Evasion pass (ship loops past enemy) | Player ship flies three curved passes, afterimages, ribbon | src/ui/fx/evasion.ts:85 | look-only | in kit: effect-library paths/arc-move/multi-stop-path, trail; juke missing |
| Enemy bolts that miss | Enemy fires three bolts that miss and continue | src/ui/fx/evasion.ts:231 | look-only | row K334 (projectile) |
| Reward tractor beam + coin flip | Beam with scan strips pulls and flips reward coin | src/ui/fx/tractor.ts:11 | look-only | in kit: effect-library column-beam/warp-transfer (K333); coin flip partial |
| Shield bubble hit and recharge | Hex-cell bubble flares at impact, recharges | src/ui/fx/shieldLook.ts:111 | look-only | row K334 (shield-bubble) |
| Meter marker hop | Decorative pin moves between measured meter cells | src/ui/fx/shield.ts:1 | yes | in kit: track (hop-and-fill) |
| Attack run (ship beats) | Attack beats: lasers and impacts from stand-ins | src/ui/fx/attackLook.ts:9 | look-only | row K334 (projectile) |
| Warp portal (plasma core ball) | Breathing ball with filaments, arcs; swells on launch | src/ui/fx/portal.ts:168 | look-only | in kit: effect-library portal/vortex (README); row K335 (plasma-orb) |
| Enemy ship arrival flight | Ship leaves portal on curved, banking, levelling path | src/ui/fx/flight.ts:95 | yes | in kit: effect-library arc-move/paths/trail |
| Enemy warp-in (rip, flash, lock, settle) | Scan streaks, rip, drop, flash, lock on arrival | src/ui/fx/warpIn.ts:26 | look-only | in kit: warp-transfer (partial); rest missing |
| Wreck cloud (discard drift) | Cut-out fragments drift, fade, return as cloud | src/ui/fx/wreck.ts:171 | look-only | row K335 (drift-cloud) |
| Warp departure (spiral, singularity suck-in) | Ship spirals into vortex, row gravitates to centre | src/ui/fx/warpLook.ts:699 | look-only | in kit: effect-library spiral/collapse/portal (K333) |
| Warp arrival (reverse suck-out) | New row emerges from the singularity | src/ui/fx/warpLook.ts:1044 | look-only | in kit: effect-library collapse/portal |
| Warp banner | Banner text stamps across during warp | src/ui/fx/warpLook.ts:833 | look-only | row K335 (letterbox-banner / stamp) |
| Mothership flip | Revenant mothership turns over in warp | src/ui/fx/warpLook.ts:933 | look-only | in kit: effect-library flip |
| Warp held scene (dimmed table, dark ship shape) | Table stays dimmed with ship silhouette until choice | src/ui/fx/warpLook.ts:576 | look-only | missing |
| Signature frame (letterbox bars, gold vignette, name) | Bars and vignette stamp a power token's name | src/ui/fx/power/frame.ts:31 | look-only | row K335 (letterbox-banner) |
| Camera push | Whole table scales 1.03-1.07 about a focus | src/ui/fx/power/push.ts:23 | yes | row K335 (camera-pull) |
| Power coin 3D flight | Coin spins edge-on on shared WebGL layer, 2D fallback | src/ui/fx/power/coin.ts:18 | yes | row K330 (shared WebGL canvas) |
| Value chips | Small pop-up chips saying what the engine did | src/ui/fx/power/coin.ts:85 | look-only | in kit: counter (+N tag) partial; row K335 (stamp) |
| Lock-on reticle | Brackets close on target | src/ui/fx/power/blocks.ts:11 | look-only | missing |
| Ribbon / trail | Fading ribbon along a path | src/ui/fx/power/blocks.ts:31 | yes | in kit: effect-library trail |
| Burst (sparks at point) | Radial sparks and flash at impact | src/ui/fx/power/blocks.ts:65 | yes | in kit: effect-library particles |
| Shake offset | Decaying positional shake | src/ui/fx/power/blocks.ts:97 | yes | in kit: effect-library shake / shake-group |
| Self-damage backlash arc | Jagged orange arc from token to ship, shield flare | src/ui/fx/power/backlash.ts:36 | look-only | row K334 (shield-bubble/ring-pulse); arc missing |
| Discard token burn-away | Removed token lifts and burns | src/ui/fx/power/backlash.ts:36 | look-only | row K334 (dissolve) |
| Pulse vortex arms + three energy rings | Vortex arms, long arc, three green rings | src/ui/fx/power/pulseLook.ts:16 | look-only | row K334 (ring-pulse); in kit: collapse/radial partial |
| Signature looks (claw slashes, forks, reflect, rupture etc.) | Seven power-token signatures built from blocks | src/ui/fx/power/sigLook.ts:49 | look-only | missing (row K334 partial) |
| Utility token looks (warp ahead, entrap, randomizer, retrofit) | Token-specific layers and chips | src/ui/fx/power/utilityLook.ts:33 | look-only | missing |
| Player ship sortie | Real ship leaves dashboard, laps targets, returns | src/ui/fx/power/sortie.ts:9 | look-only | in kit: effect-library multi-stop-path |
| 3D token draw from bag (shake and draw) | Cloth bag shakes, coins drawn, in three.js | src/ui/bag3d/bagScene.ts:661 | yes | in kit: token-bag |
| 3D bag rest dock | Bag idle on dock canvas | src/ui/bag3d/Bag3dRest.tsx:62 | yes | in kit: token-bag |
| Bag 3D fade-in | Canvas fades in after 0.45 s | src/ui/bag3d/bag3d.css:93 | yes | in kit: token-bag |
| 3D ship pictures (offscreen WebGL copy to 2D canvases) | Modelled ship drawn through one shared context | src/ui/ship3d/renderer.ts:35 | no | missing (no 3D model work rule) |
| Token coins in 3D (V7 event mapping) | Coins flights on a shared 3D layer | src/ui/tokens3d/motion.ts:12 | yes | row K330; in kit: token-bag |
| Hit pulse on cards/phone | Short red flash on a hit card (0.45-0.5 s) | src/ui/table/table.css:553 | look-only | in kit: target-arrow (hit flash) |
| Valid-target pulse | Pulsing glow on lit targets (0.6 s alternate) | src/ui/table/table.css:76 | look-only | in kit: card-hand/card-pile marks, picked-state looks |
| Enemy laser arc flicker | Stepped arc segments flicker on enemy card | src/ui/table/table.css:344 | look-only | row K335 (flicker) |
| Attacking enemy lift | Enemy card rises and scales 1.03 with red glow | src/ui/table/table.css:247 | look-only | missing |
| Enemy fade | Enemy card opacity transitions 0.2 s | src/ui/table/table.css:223 | yes | in kit: effect-library fade-in/out |
| Stunned card outline | Static stun mark on enemy and section | src/ui/table/table.css:239 | look-only | missing |
| Exhausted skill (turned 90 degrees) | Used skill card rotated a quarter turn | src/ui/table/table.css:576 | yes | in kit: card-attachments (turned) |
| Exhausted skill greyed with diagonal line | Grayscale card with crossing diagonal line | src/ui/table/game.css:878 | look-only | missing |
| Diagonal band across card art | Text band at -22 degrees over a card | src/ui/table/game.css:65 | look-only | missing |
| Skill stack fan-out | Skills fan out of dashboard stack over dimmed table | src/ui/table/skillStack.css:63 | yes | in kit: card-pile (fan); card-attachments |
| Dimmed table behind fan | Scrim dims the table during overlays | src/ui/table/skillStack.css:1 | yes | in kit: picked-state dim; scrim missing |
| Dimmed illegal targets | Non-legal targets dim, reason on tap | src/ui/table/game.css:20 | yes | in kit: picked-state / card-pile marks |
| End screen: pulse, sweep, scan, arrive, burst, blast, spark, embers | Layered victory/defeat animation set | src/ui/table/endscreen.css:832 | look-only | row K335 (stamp, motes); rest missing |
| End screen stamp | Stamp slams in rotated -8 degrees | src/ui/table/endscreen.css:891 | look-only | row K335 (stamp) |
| End screen rings, spinning, falling debris | Rings turn, parts fall and fade | src/ui/table/endscreen.css:897 | look-only | missing |
| End screen desaturated outcome tints | Saturate/brightness filters and glows per outcome | src/ui/table/endscreen.css:334 | look-only | missing |
| Menu pulse and sweep | Slow glow pulse and light sweep on menu plate | src/ui/theme/menus.css:205 | look-only | missing |
| Tutorial highlight pulse | Pulsing outline on highlighted element | src/ui/tutorial/tutorial.css:78 | look-only | in kit: tutorial (highlight) |
| Space background (nebula, black hole, warp, stars) | Slow drifting decorative backdrop, 48-84 s loops | src/ui/space/space.css:77 | look-only | in kit: effect-library ambience (boxed layer) |
| Phone hit flash | Phone hit pulse | src/ui/phone/phone.css:222 | look-only | in kit: target-arrow (hit flash) |
| Reduced-motion / Instant switch-off | All motion off at speed 0 or reduced-motion | src/ui/theme/menus.css:250 | yes | in kit: motion-frame speed 0 / settings |
| Update banner transition | Banner reveal | src/ui/updateBanner.css:1 | yes | missing (below minor) |
