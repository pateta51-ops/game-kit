# Motion retrofit study (18 Nov 2026)

Owner's direction, 18 Nov 2026: the kit is an extensive catalogue of components and effects that future games pick from. Each game's animations are rebuilt on the kit's `motion-frame` (beat specs, ordered player queue) and `effect-library` (verbs, own effects, canvas particles), and the game's own motion code is deleted. Effects first made for one game go into the kit under neutral names, with the game's look passed as settings, so a fix in one game reaches all of them. Nothing stays game-only without a written reason. This replaces the 15 Nov "existing games take the build tooling only" rule for presentation; engines and card code are not part of it.

Trigger: in STCC, the animations after "End turn" play in an order unrelated to the cards' resolution, and the log jumps ahead of them.

Sources read (read-only gap checks, file headers and key sections, not every line):
- game-kit main at v0.115.0
- STCC `src/ui/motion` at a69c8dac
- 7th Inning Stretch `src/ui/motion`
- Warp's Edge `origin/main` 449af55 (the local checkout is stale)
- Unstoppable main 52c19f6
- Imperium `origin/main` b82d5cf

## 1. The common defect: no game plays its events in order

| Game | How motion is triggered and sequenced | Log sync |
|---|---|---|
| STCC | One move = the action plus every auto-answered prompt (`session.ts` `settle`, 347-376). `director.ts` 115-230 plays the move's legs grouped by kind: all card motions at once (`Promise.all`), then signals, turn flow, shuffles, every cost, every gain, then fizzles. | The whole log goes in at one commit, mid-motion (`director.ts` 162-169). |
| Warp's Edge | `fx/plan.ts` 226-259 turns an answer's events into a flat `Fx[]` with absolute start offsets. `fx/director.ts` 229-270 plays it all at once on WAAPI delays, with cue timers. A new answer force-finishes the old one. | None. |
| Unstoppable | No queue and no event list: each effect is a React layout effect that diffs state (`TokenFlights.tsx` 78-190, `Hand.tsx` 42, `threatBuffs.tsx` 60). Order is timing only. One ad-hoc hold: `strike.ts` `beginHold`/`endHold`. Only sound reads `lastEvents`, batched and capped (`bindSound.ts` 26, `cues.ts`). | None. |
| Imperium | `play/fx.ts` 55-107 folds a batch into an unordered flag set held for `ms+50`; CSS plays everything together. Card flights (`FlightLayer.tsx`) are staggered per batch. Bot pacing is `setTimeout` (`useGameEffects.ts` 42-47, 111-123). | The log reads the same events but isn't timed to motion (`LogPanel.tsx` 138-146). |
| 7th Inning Stretch | Already on motion-frame: events become beat names (`beats.ts`), the queue plays them in order (`index.ts`). | Waits on rAF for React before queuing. |

The kit's player is the cure. `motion-frame/player.ts` keeps a FIFO (`queue.push` 295/305, `queue.shift` 224), with one beat at a time unless `parallel: true`. Each game becomes an ordered list of beats, one per event (or per chunk of related events), with the log line revealed by `onBeatStart`.

## 2. Mechanism gaps: kit rows first, every retrofit needs them

| # | Gap | Seen in | Kit shape (proposal) |
|---|---|---|---|
| M1 | Animate the real board between two states, many cards at once. The kit's `bands.flight` handles one card. | STCC `viewTransition.ts`, `director.ts`; Warp's `table/motion.ts` (data-flip FLIP); Imperium `FlightLayer` (old and new rects, landing hold) | A `board-swap` beat or hook: the game passes "measure before, commit, measure after"; the kit flies every keyed element, staggered, landing hidden until arrival. The player still never touches state (the game's commit callback). |
| M2 | Wait until the new board is drawn before reading rects | STCC `nextFrame`; 7IS rAF poll up to 60 frames; Unstoppable layout effects; Imperium `useLayoutEffect` | A beat option `whenReady` / `awaitRects(ids)`, beside `whenVisible`. |
| M3 | Phone pan: switch tab, scroll to the actor, play, come back | STCC `pan.ts`; Warp's phone readout and `gate.ts` tab follow | A beat `pan` pre/post step, or a `phone-mode` helper the player calls. |
| M4 | Deck riffle as a verb | STCC `dealing.ts` riffle; Imperium `fx-shuffle` | Wrap `deck-motions` `riffleFrames` as a `riffle` verb. |
| M5 | Hold until a tap / hold until a beat / auto-continue pacing | 7IS B-41; Warp's `gate.ts` (draw held until the warp arrives); Imperium die-wait marks and Bot auto-Next timer; Unstoppable strike hold | Extend `gate` and `afterGate`: `holdUntil: 'press' \| beatId`, and an auto-continue delay the queue owns. |
| M6 | Hide the source until takeoff, per item | Unstoppable `flightLedger`; 7IS `leave` | A per-actor `hideSourceUntil: 'start'` (the effect layer's `start` partly does it). |
| M7 | A WebGL layer with a 2D fallback | STCC `crumple.ts`; Warp's `power/coin.ts` | A shared WebGL canvas in the effect layer, like `registerCanvasEffect`. |
| M8 | Sound cues from the queue | Warp's `fx/cue.ts` `setCueSink`; Unstoppable `cues.ts` | Already there: the spec's `sound` field plus `onCue` into the kit's `sound-player`. Check `sound-player` against Warp's `mixer.ts`/`engine.ts` (priority stealing, 40 ms dedupe, ducking, seeded playlist) and lift what it lacks. |

## 3. New general effects for effect-library

Neutral name, settings, and which games feed it. "Port from" is the code a worker ports; never write from scratch.

| Effect | Settings | Port from |
|---|---|---|
| `arc-move` | arc height, bank and lean, waypoint rest, clip-path, stagger | 7IS home-run-ball; Warp's `fx/flight.ts`, `evasion.ts`; Unstoppable `playMotion.ts`, `useMarkerGlide`, `TokenFlights` `fly`; Imperium `card-flight-via` |
| `multi-stop-path` | stops, dwell | Warp's `power/sortie.ts` |
| `trail` | ribbon width, fade | Warp's `evasion.ts` engine ribbon |
| `warp-transfer` | from, to, count, colour, column light, total label | STCC `resourceWarp.ts`, `resources.ts`, `actionIcons.ts`, `gloryPlaced.ts`, `dismissed.ts`; Warp's `warp.ts`/`warpLook.ts` |
| `radial-streaks` | streak count, centre | Warp's `warpLook.ts` vortex, `power/pulseLook.ts` |
| `collapse-jump` | streak colour, n | STCC `warp.ts` |
| `column-beam` | colour, tuck | STCC `beam.ts`, `awayTeams.ts`; Warp's `tractor.ts` |
| `rotating-beam` | colour, turns | STCC `incidentBeacon.ts` |
| `projectile` | colour, speed | STCC `phaser.ts`, `attack.ts`; Warp's `attack*.ts`, `power/blocks.ts` |
| `dissolve` | embers | STCC `destroy.ts`; Warp's `power/backlash.ts` |
| `shatter` | shard count, direction, clip source | Warp's `blast.ts` |
| `shimmer` | colour | STCC `phaser.ts` shield |
| `shield-bubble` | outline, radius, hit angle | Warp's `shield.ts`, `shieldLook.ts` |
| `plasma-orb` | arc count, pulse period, swell | Warp's `portal.ts` |
| `drift-cloud` | piece count, source image | Warp's `wreck.ts` |
| `crumple` (needs M7) | seed, creases | STCC `crumple.ts`, `junk.ts`, `wad.ts` |
| `ring-pulse` | colour, count | STCC `missionComplete.ts`, `takeControl.ts`; Warp's `blast.ts` shockwave, `pulseLook.ts`; Unstoppable hit flash |
| `stamp` | text, tilt | STCC `stardateResolved.ts`, `traitMarked.ts`, `promotion.ts`; Warp's `power/frame.ts` name stamp |
| `motes` | count, colour | STCC `takeControl.ts` |
| `flicker` | times, colour, loop | STCC `continueResolution.ts`; Warp's `idle.ts`, `looks.ts` stun; Unstoppable threat-buff pulse |
| `bar-fill` | from, to, colour | STCC `crewTrack.ts`; Warp's `looks.ts` fill, shield meter pins |
| `camera-pull` | scale, dim | STCC `closingScene.ts`; Warp's `power/push.ts` |
| `letterbox-banner` | bar height, vignette colour | Warp's `power/frame.ts` |
| `unroll` | axis, origin | 7IS pennant |
| `shake-group` | actors or selector, amplitude | 7IS scoreboard-rattle; Imperium `fx-shuffle` |
| `tumble-3d` (fits `pieces-3d`) | faces, landing face | Imperium `Die3D`, `die-tumble` |
| `pile-lift` | lift, settle | STCC `cardFx.ts`, `cardMotions.ts` |

Settings to add to existing verbs: `glow` gets colour and hold (7IS highlight, Imperium gain/lose tint). `flip` gets `squash: false` (7IS lamp). `scale` gets pulse and spin (Imperium `fx-pulse`, `fx-roll`).

## 4. Already covered by the kit (rebuild with kit parts, no new effect)

- **STCC:**
  - `speed.ts` → `putMotionSpeed`, `withReducedMotion`
  - banners → `bannerAt`, `text`, `move`
  - `fizzle.ts` → `shake` + smoke
  - card flights, logs, recalls, deploys → `move`, `lift`, `settle`, `entryMotions`
  - `lookFan.ts` → card-pile fan + `flip`
  - `botReveal.ts` → `scale`, `glow`
  - `chartSwitched.ts`, `refresh.ts` → `flip holdMs`, `fade-in`
  - deal and refill → `deck-motions`
  - `gameStart.ts` → `move`, `flip` stagger, `text` (needs M2)
  - `layer.ts`, `fxKit.ts` → `createEffectLayer`, particles
- **Warp's Edge:**
  - `plan.ts`, `power/plan.ts`, `tokens3d/motion.ts` → `beatsFromEvents`
  - timing tables → beat specs
  - `kit.ts` canvas helpers → particles
  - hit and impact → `impact`, `shake`, `glow`
  - the seven signature and four utility tokens → composed from the new blocks (their plans stay game data)
- **Unstoppable:**
  - `motion.ts` → kit speed
  - `board.css` card-enter, pop, toast → `fade-in`, `scale`
  - `home-drift` → `createAmbience`
  - target glow → `glow`
- **Imperium:**
  - `fx-deal`, `fx-rise`, `fx-enter`, `fx-toast-in` → `move`, `fade-in`, `scale`
  - `fx-pulse`, `fx-gain`/`fx-lose`, `fx-flip`, `fx-roll` → `scale`, `glow`, `flip`
  - `useSpeed` → kit speed
  - `cs-sheet-in` → already owned by the kit Sheet (Imperium's CSS is a leftover)
- **7th Inning Stretch:** 3D dice and ball → `pieces-3d`.

## 5. Game-only (with the reason)

- **STCC `targetHighlight.ts`:** a pointer-hover outline; interaction, not a beat.
- **Unstoppable `TargetArrow` follow and `motion.css` tilt:** pointer-following aids. Its hit flash and shake still go to the kit. A hover lean could become a `card-hand` look later.
- **Imperium hover transitions:** affordances.
- **Warp's `shipPic.ts`:** a DOM lookup helper. The per-token plans and the cue catalogue are game data.
- **7IS baseball event plumbing:** CASTS/fill, which map events to its actors.

## 6. Order of work

1. **Rule change.** `docs/RETROFIT_PLAN.md` and the kit's README say presentation is retrofitted now (owner, 18 Nov). Add this study's rows to the plan.
2. **Mechanism rows M1-M7, kit only.** Each comes with tests on a fake game and a lab demo. M1, M2 and M5 come first: every game needs them.
3. **New effects** (§3) in about four batches by family:
   - flights and paths: arc-move, multi-stop-path, trail
   - beams and transfers: warp-transfer, column-beam, rotating-beam, radial-streaks, collapse-jump
   - combat: projectile, dissolve, shatter, shimmer, shield-bubble, ring-pulse
   - signals and staging: stamp, motes, flicker, bar-fill, camera-pull, letterbox-banner, unroll, shake-group, plasma-orb, drift-cloud, tumble-3d, pile-lift, and crumple after M7

   Each batch is ported from the listed sources, gets a lab demo and contact sheet, and carries each game's look as a settings preset.
4. **Game retrofits, one game at a time,** each after asking that game's architect whether a build is running:
   - STCC first (the trigger): one beat per event or chunk, in event order; log lines revealed on `onBeatStart`; then delete `src/ui/motion`.
   - Then Warp's Edge, Imperium, Unstoppable, and 7th Inning Stretch (swaps its own effects for the kit's).

   Each retrofit ends with the owner approving a before-and-after recording of a full turn on real cards. The look should not change; the order should.
5. **Harvest survey of the remaining games:** EBR, Rome, Radiance, Rise of a Jarl, Under Falling Skies. Same method.
