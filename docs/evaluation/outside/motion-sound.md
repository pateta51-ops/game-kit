# Outside repositories: motion, effects, sound, haptics, voice (survey of 15 Nov 2026)

Read-only survey. Nothing was built or run. Clones were deleted afterwards, so paths below are relative to each repository's root at its default branch head on 15 Nov 2026.

## What was read, and what was not

Kit baseline (C:/projects/game-kit): the first ~3,500 characters of each README and ~800 characters of each component.json for `motion-frame`, `effect-library`, `sound-player`, `voice`, `phone-mode`; the file names in `docs/patterns/`; the first ~7,000 characters of "Harvest from outside repositories" in `docs/PLAN.md` (rows K77 to K109; the table was cut off in K109). **The READMEs were cut off**, so a "kit lacks" claim below means "not in the part read" (most of each README, but not the tail). A worker should check the README tail before building. No haptics appeared in the phone-mode part read.

| Repo | Read in full | Read in part (header, comments, signatures) | Not read |
|---|---|---|---|
| marvel-champions-digital-game | `view/beats.ts`, `view/sound-effects.ts`, `ui/bound-tween.ts`, `view/motion-math.ts`, `view/hp-motion.ts`, `view/status-motion.ts`, `audio/sfx/README.md`, `music/README.md` (all under `packages/client/src/` except the last) | `scenes/board/motion.ts` (comments and signatures of 1,040 lines), `audio/music-controller.ts`, `audio/music-catalog.ts`, `view/music-player.ts`, `ui/transitions.ts`, `view/travel.ts`, `view/phase-wipe.ts`, `view/villain-phase-reveal.ts`, `scripts/trim-mp3.mjs`, `docs/music-prompts-ready.md` (first 30 lines) | all tests, `exhaust-motion`, `threat-motion`, `first-player-token-motion`, `guide-spotlight`, `comic-pan`, the Tauri native audio, `docs/design-reference.md` |
| middle-earth-player | `src/play/motion/kind.ts`, `update-log.ts`, `token-deltas.ts`, `src/ui/haptics.ts`, `src/play/store/beat-store.ts`, `src/play/readouts/banner-time.ts`, `src/play/spotlight/handoff.ts`, `gate.ts`; `docs/design-system-table.md` sections Motion, Spotlight, Haptics, Banner, Screen reader (lines cut at 520 characters) | `src/play/motion/motion.ts` (70 lines), `src/ui/motion-run.ts` (70), `src/play/spotlight/plan.ts` (40), `fx.ts` (lines 55-100 and exports), `particles.ts` (hash and exports), `beats.ts` (header and exports), `src/ui/motion-tokens.ts` (grep only) | `pose.ts`, `curves.ts`, `card-motion.native.tsx`, `token-fx*`, `burn.ts`, `src/ui/fog/*`, every `.native.tsx`, all tests, `docs/design-system.md` |
| netrunner | `src/cljs/nr/sounds.cljs`, `resources/public/sound/attributions.txt` | grep of sound use in `account.cljs`, `gameboard/board.cljs`, `gameboard/actions.cljs`, and of `play-sfx` in `src/clj/game/core` | `src/clj/game/core/say.clj` body, any CSS |
| forge | `forge-gui/src/main/java/forge/sound/SoundEffectType.java`, `MusicPlaylist.java`, `forge-gui-mobile/src/forge/animation/ForgeAnimation.java`, `forge-gui/res/music/Credit.txt` | `SoundSystem.java`, `EventVisualizer.java` (signatures and comments) | `AltSoundSystem`, `SoftwareMixer`, `FlipOntoBattlefieldAnimation.java`, `ForgeTransition.java`, the desktop `Animation.java` |
| ArkhamHorror | `frontend/src/arkham/components/ChaosTokenMorph.vue`, `frontend/src/arkham/cardFlight.ts` (first 110 lines, most of it) | `frontend/src/arkham/rainAudio.ts` (60 lines), `components/DrawSpotlight.vue` (script, 90 lines) | `RainOverlay.vue`, `effects/confetti.ts` (932 lines), `PendingDamageTokens.vue`, `EventStartBarrier.vue`, `styles/base.css` |
| terraforming-mars | `src/client/utils/SoundManager.ts` | grep of its callers | everything else (nothing else on the topic) |

## Verdict per repo

- **middle-earth-player (MIT): real craft, the best source here.** A full motion token table, a combat "spotlight" with charge, lunge, hit stop, trauma shake, seeded particles and a burn, haptics with caps, a hurry gesture, and a screen-reader path that replaces motion with words. Everything is pure arithmetic on a time and tested. No sound at all (no audio package in `package.json`).
- **marvel-champions-digital-game (AGPL, ideas only): solid, restrained craft.** Motion is deliberately "readable, not spectacle": floating beats, ghost travels, counting numbers, a phase band, staged villain-phase reveal. Good rules about timing against overlays. Sound is small (9 effects) but its rules are well thought out; the music side (folder convention, jukebox, shuffle) is thorough. No screen shake, no particles on the board.
- **netrunner (MIT): basic.** No card-move animation found in what was read. Sound is a Howler bank; two small ideas worth having.
- **forge (GPL, ideas only): a mature but plain sound system.** One event-to-sound visitor, one "synced" flag, user sound profiles, playlists with a shelf. Animation is basic (a card flips onto the battlefield, screen transitions).
- **ArkhamHorror (no licence, ideas only): a few good pieces.** Card flight by the View Transitions API, a gapless ambient loop, a token flip. Otherwise ordinary CSS transitions.
- **terraforming-mars (GPL): almost nothing.** Two synthesized beeps ("your turn", "new log line"). Skipped; the kit's `synth` cues already do more.

## Findings

Size: S under a day, M a few days, L more. "Kit" names the component it would extend.

### A. Events to a sequence: pacing, gates, skip

**A1. Spotlight gate: a big beat that never blocks input** (middle-earth-player, MIT, M, `motion-frame`)
The store opens a "gate" for each accepted intent that resolved attacks; it carries the two states the attacks were resolved between, so later answers in the same tap do not move it. Everything that should wait for the big beat (banner, ordinary card motions, token pops, the settle delay) reads the gate; the gate itself never holds an intent, and a tap skips it and is still handled. `ended` is `done` or `skipped`; a separate `leaving` flag lets the scrim fade with the return.
Verified in `src/play/spotlight/gate.ts`, `docs/design-system-table.md` (Spotlight, "Never gates").
Why: the kit's `busy()` covers "a rare beat is playing"; it does not show a way for smaller beats to queue behind a big one while input stays live, nor before/after snapshots held for the beat.

**A2. Hurry: one touch finishes card motion, small feedback keeps running** (middle-earth-player, MIT, S, `motion-frame`)
A touch on the table snaps running card moves and skips a spotlight, but token pops and floating numbers keep playing, and the pending landing haptic is dropped so no tick follows a snapped card. It never swallows the tap.
Verified in `docs/design-system-table.md` (Motion, "Hurry").
Why: the kit's `skipAll` ends everything. A skip class per beat (snap on hurry / keep) and "drop cues tied to a snapped motion" are small additions.

**A3. Several big beats under one stage: enter once, swap, leave once** (middle-earth-player, MIT, M, `motion-frame`)
Three attacks do not play three full sequences: the first enters (2,700 ms), later ones swap in over 200 ms with a shortened read and charge, only the last returns. A chip reads "2 of 3 · Tap to skip". Lone attack 3,200 ms, three attacks 7,600 ms.
Verified in `src/play/spotlight/beats.ts` (header, `beatsAt(k, place)`, `runStart`, `spotlightRun`), `docs/design-system-table.md`.
Why: a spec variant by place in a run (`first`, `last`) would stop repeated rare beats from feeling slow. Not seen in the kit's spec format.

**A4. Staged reveal of a burst of events** (marvel-champions-digital-game, AGPL idea, M, `motion-frame` or a pattern note)
The engine resolves a whole villain phase in one command; the screen reveals it one beat at a time with a "revealed so far" count kept apart from where the engine really is, inventing no information.
Verified in `packages/client/src/view/villain-phase-reveal.ts` (header).
Why: a pure "reveal cursor" over an event list is the automated-opponent case every solo game in the kit has.

**A5. Announcement clocks start when visible, not when queued** (marvel-champions-digital-game, AGPL idea, S, `motion-frame`)
A table banner or phase band whose time comes while an overlay covers the table is held and plays from its start once uncovered; the opening band waits out the screen fade and holds longer. Every band is also written to a durable log so an end-to-end test need not catch it mid-flight.
Verified in `packages/client/src/scenes/board/motion.ts` (comments at lines 26-35, 172-187, 598-624), `view/phase-wipe.ts`.
Why: the kit queues beats in order but nothing read says a beat can wait for its stage to be visible. The durable "beats played" log is a cheap test aid.

**A6. Motion kind: peek, handoff, ordinary; one update used once** (middle-earth-player, MIT, S, `motion-frame`)
A pure function decides whether a new layout plays motion at all: looking at another seat or a seat handoff is drawn at rest; only a real state change animates. An update log makes each store update drive at most one layout's motion, so a later resize or peek never replays a stale change.
Verified in `src/play/motion/kind.ts`, `src/play/motion/update-log.ts`.
Why: prevents the "everything re-animates on a view switch" bug in pass-and-play and replay scrubbing. Liftable nearly as is (about 60 lines).

**A7. Sounds only from the command trail, never from the last state** (marvel-champions-digital-game AGPL idea; netrunner MIT, S, `sound-player` pattern)
Marvel reads the appended command trail so an undo or a resumed game stays silent. Netrunner gives each server sound a rising id and the client remembers the last id played, skipping everything older, and plays nothing on the first state it sees.
Verified in `packages/client/src/audio/sfx/README.md` (step 4), `src/cljs/nr/sounds.cljs` (`update-audio`).
Why: the kit dedupes within 40 ms but nothing read covers "no cacophony on load, undo or reconnect". A cue-id watermark is a few lines.

### B. Pieces moving between zones

**B1. Motion held as data with a start time, re-derived on every draw** (marvel-champions-digital-game, AGPL idea, S pattern note)
Beats, ghost travels, counts and bands are records `{start, from, to}`; any redraw recreates them partway along. Tweens that drive a number are tied to their owner's life (a tween outliving its target froze the game once).
Verified in `packages/client/src/scenes/board/motion.ts` (header), `view/travel.ts` (header), `ui/bound-tween.ts`, `view/motion-math.ts`.
Why: the kit's clones on an overlay layer solve the same thing for DOM; this matters for the canvas games. Worth a paragraph in a pattern note, no code.

**B2. Hand slot stays empty until its ghost lands; piles as anchors** (marvel-champions-digital-game, AGPL idea, S to M, `effect-library`)
A drawn card's slot is held empty until its ghost arrives (with a latest-landing time known up front, tightened later, and released if no ghost could be placed). A zone with no per-card rect resolves to a coarser pile rect; an attachment resolves to its host. A move with no rect at either end simply appears. Ghost art is only used if already loaded.
Verified in `packages/client/src/scenes/board/motion.ts` (lines 159-167, 733-760, 790-823, 964-1009), `view/travel.ts`.
Why: the kit has `layer.start(run)` to cover a hidden live piece; the fallback chain (card rect, pile rect, host rect, none) and "release the hold if the ghost cannot be drawn" are the parts worth writing down.

**B3. Card flight by the View Transitions API with a strict name handover** (ArkhamHorror, no licence, idea only, M, `effect-library`)
A card shown large in a reveal overlay flies to wherever it ended up using `view-transition-name`. The overlay holds the name while it is up; the board element takes it only inside the transition callback, because a duplicate name aborts the whole transition. While previewed the board copy is `visibility: hidden` (keeps its layout box); a pile takes the name only during flight and is never hidden. `view-transition-class` styles every flight with one rule.
Verified in `frontend/src/arkham/cardFlight.ts`, `frontend/src/arkham/components/DrawSpotlight.vue`.
Why: for the DOM games this is a shared-element move with no clone bookkeeping, and the browser handles size and position. The kit's `move` verb clones; a `flight` helper for overlay-to-board would be a real addition. Chromium has it; check Safari before relying on it.

**B4. Per-card entry description: flip at the midpoint, arc, delay, land type** (middle-earth-player, MIT, M, `effect-library`)
One pure function turns two layouts into a `Motion` per card: start offset and scale, flip face-down to face-up at the midpoint, wait its turn (90 ms stagger, at most five places), rise on a 24 pt arc, land as "squash" (played, 0.96 and spring back) or "pop" (revealed, 1.12, hold, spring). Leaving cards are ghosts with three styles: shake then shrink to pile (destroyed), glide (discarded from hand), fade (set aside).
Verified in `src/play/motion/motion.ts` (types and header), `docs/design-system-table.md` (Move, Draw, Reveal, Play, Leave).
Why: the kit has the verbs; it does not show a layout-diff that picks them. Arc on `move`, a capped stagger and the three leave styles are concrete gaps. `pose.ts` (the actual interpolation) was not read.

### C. Feedback vocabulary

**C1. Motion token table with named springs and one scale** (middle-earth-player, MIT, M, `motion-frame` or a new `motion-tokens`)
About 60 named durations and curves in one file, each documented in a table; springs named by damping ratio and settle time; `motionScale(speed, reduced)` is 1 / 0.6 Quick / 1.5 Slow / 0 reduced. A separate `paceScale` applies to reading timers (banner beats and holds): Slow lengthens them, Quick does not shorten them, reduced motion does not snap them. Rule: every token at most 500 ms; sequences run longer but the player never waits.
Verified in `docs/design-system-table.md` (Motion table), `src/ui/motion-tokens.ts` (grep of `motionScale`, `paceScale`, `ms`, `springTune`), `src/ui/motion-run.ts`, `src/play/readouts/banner-time.ts`.
Why: the kit has a speed factor and instant; it shows no Slow, no split between motion time and reading time, and no shared token names. The split is the valuable part: speeding animation must not shorten the time to read text.

**C2. Trauma shake with a frequency cap** (middle-earth-player, MIT, S, `effect-library`)
Shake is Eiserloh's trauma model: trauma starts from damage (0.55 + 0.12 per damage, 1 on a kill, 0.35 when blocked), decays linearly, offset = max × trauma² × a seeded wobble of two sines (5-8 Hz and 9-13 Hz) with a small rotation. The fastest sine stays under 25 Hz even at Quick so it never aliases.
Verified in `src/play/spotlight/fx.ts` (lines 55-100).
Why: the kit's `shake` verb takes `times`. A trauma-driven, seeded shake scaled by the event's number reads far better and is about 40 lines, liftable with the MIT notice.

**C3. Hit stop, afterimages, flash limit** (middle-earth-player, MIT, S each, `effect-library`)
Everything holds for 100 ms at contact (160 ms on a kill, taken out of the impact so the total is unchanged); the lunging card leaves three fading afterimages (its pose 16, 32, 48 ms earlier); the flash is warm white over the target only, one bump per attack, kept under 3 a second and never saturated red (WCAG 2.3.1).
Verified in `docs/design-system-table.md` (Spotlight table, Flash), `src/play/spotlight/beats.ts` (header).
Why: no hold, trail or flash verb appeared in the kit's twelve. The flash-rate rule belongs in the kit's check.

**C4. Beats as "a number and a place", derived from events by one table** (marvel-champions-digital-game, AGPL idea, S, `effect-library`)
One pure function maps events to `{anchor, text, tone}`: "−4", "+2 THREAT", "STUNNED", "TOUGH", "BLOCKED", "DEFEATED", with five tones. Events that did nothing still get a word ("PREVENTED", "NO DAMAGE", "CRISIS"), and an ability that changes no tracked number gets "RESOLVED" so nothing fires silently. A beat whose anchor is off screen is not drawn (a tab badge reports it).
Verified in `packages/client/src/view/beats.ts`.
Why: fits the kit's `BeatTable<Kind>`; the idea to keep is "a prevented or blocked effect is a beat too". Pairs with K86 (log lines from the same events).

**C5. Deltas by subtracting two states; the UI never computes a number** (middle-earth-player MIT; marvel-champions-digital-game AGPL idea, S, `effect-library`)
ME diffs counts per card between the before and after states (a card new to the table is not a change) and returns the words and tone ("+2" gain, "−1" loss; healing is a gain). MC recovers a count-up's starting value from the event's amount. A removed status leaves a fading ghost pip, because the real one is already gone by the redraw.
Verified in `src/play/motion/token-deltas.ts`, `packages/client/src/view/hp-motion.ts`, `view/status-motion.ts`.
Why: the kit has a count-up; a generic `countDeltas(prev, next)` and the ghost-of-a-removed-marker effect are small, reusable pieces. `token-deltas.ts` is liftable (35 lines).

**C6. Banner lines resolve in beats and ring the cards they name** (middle-earth-player, MIT, M, new or `effect-library`)
After each intent a banner says what happened; its lines appear one every 650 ms and each rings the cards it names on the table through a tiny store only the canvas reads. Hold is 4.5 s plus a beat per line, or "until tapped" by setting. When a spotlight plays, the banner waits for it. Reduced motion shows all lines at once and rings none.
Verified in `src/play/store/beat-store.ts`, `src/play/readouts/banner-time.ts`, `docs/design-system-table.md` (Banner).
Why: ties text to the table, a link the kit's parts do not show. Pairs with K86.

**C7. Phase band details** (both, S, `effect-library`)
MC: a full-width band slides in, holds, slides out; taps pass through; a second slot for a hero's "level up" band so it never replaces the phase band; the round chip pops with it. ME: the phase title sweep is skipped when the phase went backward (undo), when the new state already moves cards, and under Quick.
Verified in `packages/client/src/scenes/board/motion.ts` (lines 532-578), `docs/design-system-table.md` (Phase title sweep).
Why: the skip rules are the lesson: a stinger that plays on undo or on top of card motion is noise.

**C8. Token face flips at the edge-on midpoint** (ArkhamHorror, idea only, S, `effect-library`)
Hold the old face 900 ms, rotate to 90 degrees, swap the image, rotate back (450 ms).
Verified in `frontend/src/arkham/components/ChaosTokenMorph.vue`.
Why: the kit's `flip` already toggles; only the "hold first so the old value is read" beat is new. Minor.

### D. Sound

**D1. Cue choice by a fallback chain, card's own sound first** (marvel-champions-digital-game AGPL idea; forge GPL idea, S, `sound-player`)
MC: a played card plays its own sound if it has one, else a trait sound (Spell), else the generic card sound; then its attack or thwart; then the hand refill; in that fixed order. Forge: a card script may name its own sound (`SVar:SoundEffect`), used only if the file exists; lands pick a sound by colour, falling back to "other land" when the specific file is missing.
Verified in `packages/client/src/view/sound-effects.ts` (`tableSoundsOf`, `CARD_SOUNDS`), `forge-gui/src/main/java/forge/sound/EventVisualizer.java` (lines 124-229, signatures).
Why: the kit's table maps cue names to files; a `resolveCue([specific, family, generic])` using `canPlay` gives card-specific sounds with safe fallbacks. Small.

**D2. A command's sounds play in sequence with a cap on the gap** (marvel-champions-digital-game, AGPL idea, S, `sound-player`)
Several sounds from one command play one after another, each starting when the one before ends or 600 ms in, whichever is first.
Verified in `packages/client/src/audio/music-controller.ts` (`playEffects`, `EFFECT_GAP_MAX_MS`), `audio/sfx/README.md`.
Why: the kit has `times` and `delayMs` but no "chain these cues, overlap after N ms". Useful when events have no motion spec to carry cue times.

**D3. Front-silence rule and a no-re-encode trim tool** (marvel-champions-digital-game, AGPL idea, S, `sound-player` check + `tooling-scripts`)
Every effect must start within about 60 ms of the file's start, because a sound that waits lands late on the action; a script trims an MP3 by whole frames, front and back, without ffmpeg or re-encoding, dropping the ID3 and Xing frames.
Verified in `packages/client/src/audio/sfx/README.md`, `scripts/trim-mp3.mjs` (header).
Why: the kit's `check.ts` covers missing, format and size. A leading-silence check (decode, find first sample over a threshold) and a loudness reading are missing from what was read. No repo surveyed normalises loudness or uses audio sprites.

**D4. Music by folder convention with a most-specific-first chain** (marvel-champions-digital-game, AGPL idea, M, `sound-player`)
The folder a track sits in says where it plays: `scenarios/<id>/battle`, then `campaigns/<id>/battle`, then `packs/<code>/battle`, then `gameplay/`; the same for win and loss. Suffixes (`battle-2`) make a playlist. `_pending/` holds tracks for content not yet playable. A test fails if a slotted track has no title. Pure functions over a path-to-URL map.
Verified in `music/README.md`, `packages/client/src/audio/music-catalog.ts` (header).
Why: the kit's music is layers and states of one piece. A slot resolver ("which piece for this scenario and outcome") sits above that and is absent.

**D5. Jukebox, earned songs, shuffle without repeats** (marvel-champions-digital-game, AGPL idea, M, low priority)
Songs are earned by play; shuffle plays each earned song once before any repeat and never the same twice in a row; a "now playing" notice; pause follows the system mute and app background.
Verified in `packages/client/src/view/music-player.ts` (header, `nextShuffled`), `audio/music-controller.ts` (comments).
Why: a nice extra for a finished game, not kit core.

**D6. Shelved track: resume the earlier music where it stopped** (forge, GPL idea, S, `sound-player`)
Switching to a temporary playlist shelves the current track and position; switching back resumes it; switching to a third discards the shelf. Random pick never repeats the last track.
Verified in `forge-gui/src/main/java/forge/sound/SoundSystem.java` (lines 171-230, comments), `MusicPlaylist.java`.
Why: for the kit's `once` states and any interlude: return to the main music at the bar it left rather than restarting.

**D7. Gapless ambient loop with a crossfaded seam, loaded on first use** (ArkhamHorror, idea only, S, `sound-player`)
Decode once into a buffer and loop a buffer source (an `<audio loop>` is never gapless); crossfade the last 0.25 s into the head so an arbitrary recording loops without a tick; fetch only when first switched on; fade in and out over 1.6 s.
Verified in `frontend/src/arkham/rainAudio.ts` (lines 1-60).
Why: the kit loops buffers already; the seam crossfade for noise-like ambience is a ten-line addition if `ambience` does not have it.

**D8. "Only one of this kind at a time" flag** (forge, GPL idea, none needed)
Each sound type has an `isSynced` flag: damage, counters, life change, token play only if no instance is already playing.
Verified in `forge-gui/src/main/java/forge/sound/SoundEffectType.java`.
Why: the kit's `max` per cue with fade-out is better. Listed only to say it is covered.

**D9. Opt-in novelty sound groups, and a sample on the volume slider** (netrunner, MIT, S, settings pattern)
Card-specific "bespoke" sounds belong to groups the player can switch off; each has a default to fall back to. Releasing the volume slider plays a random sound at the new level.
Verified in `src/cljs/nr/sounds.cljs` (`bespoke-sounds`, `pick-sound`), `src/cljs/nr/account.cljs` (lines 352, 765).
Why: the slider sample is a tiny, good touch for the kit's settings.

**D10. User sound sets** (forge, GPL idea, not recommended)
Sound and music are looked up through a chain of override folders (user custom, adventure, profile, default).
Verified in `forge-gui/src/main/java/forge/sound/SoundSystem.java` (lines 347-460, comments). Not needed for personal single-owner games.

### E. Haptics

**E1. A five-tick vocabulary with caps** (middle-earth-player, MIT, S, `phone-mode`)
`tickArmed` (a button armed for its second tap), `tickSent` (intent accepted or undone), `tickRefused` (reducer refused), `tickLand` (a played card lands; at most one per new state), `tickImpact` (at the hit stop; at most one per strike). A Haptics setting; failures are swallowed; a snapped motion drops its pending tick. Ticks add to what the screen shows and never replace it.
Verified in `src/ui/haptics.ts`, `docs/design-system-table.md` (Haptics, Hurry).
Why: no haptics appeared in the kit parts read, and `tickArmed` matches `useSecondTap` exactly. On the web this is `navigator.vibrate` (Android Chrome only; iOS Safari has none), so it is a small, Android-only gain; the vocabulary and caps are what to take, the expo calls are not.

### F. Reduced motion and accessibility

**F1. "Keep the information, drop the movement", applied per effect** (marvel-champions-digital-game AGPL idea; middle-earth-player MIT, S, `motion-frame` doc rule)
MC: under reduced motion a beat still appears, held still then gone; the phase band appears in place with its own hold; travels are dropped because the card is already there. ME: scale 0 snaps motion, but reading timers keep their hold; a setting can force reduced motion on.
Verified in `packages/client/src/scenes/board/motion.ts` (lines 364-369, 547-559, 852, 875-880), `ui/transitions.ts` (header), `src/ui/motion-run.ts`.
Why: the kit's reduced motion is `'instant'`: no verb runs, cues still fire. That loses information beats (a floating "−4", a phase caption). A per-spec `reduced` variant (static caption with a hold) is the gap.

**F2. Screen-reader path: the big beat becomes spoken lines** (middle-earth-player, MIT, M, outside the kit's stated scope)
With a reader on, the spotlight never plays; the banner speaks its title then each line through one announcement queue that waits for each to finish.
Verified in `docs/design-system-table.md` (Spotlight "A reader hears it", Banner, Screen reader). Note: the owner's STCC rule is "no a11y", so this is recorded, not recommended.

### G. Testing and preview

**G1. Effects as closed-form functions of time and a seed** (middle-earth-player, MIT, S to M, `effect-library`)
Every spotlight value (`frameAt`, `shakeAt`, `flashAt`, `ringAt`, `numberAt`, `particleAt`) is pure arithmetic on elapsed ms, the scale and a seed (`seq × 31 + index`); an integer hash with `Math.imul` gives the same numbers on every engine. Particle budget: at most 70 alive. Tests read the functions directly.
Verified in `src/play/spotlight/fx.ts`, `particles.ts` (hash), `beats.ts` (exports), `plan.ts` (seed).
Why: the kit's particles already take `t` and a seed; the same discipline for shake, flash and number pops would make screenshot bursts repeatable. The `hash` function is liftable.

**G2. Pure view-model per motion, each with its own test file** (marvel-champions-digital-game, AGPL idea, pattern)
Each motion's "what and when" is a pure module beside a test (`beats`, `travel`, `phase-wipe`, `hp-motion`, `status-motion`, `sound-effects`); scenes only draw. A debug object on `window` exposes rects and the band log to end-to-end tests.
Verified by file list under `packages/client/src/view/` and grep of `__mcBoardDebug` in `packages/client/e2e/`. Tests themselves not read.
Why: matches the kit's approach; nothing to take beyond A5's durable log.

No repo has an effects lab screen or a screenshot-burst tool; the kit is ahead there.

### H. Asset pipeline and sources

- Netrunner ships each sound as `.ogg` and `.mp3` and lists sources in `resources/public/sound/attributions.txt`: freesound.org items under CC0, Attribution 3.0 and 4.0, one used by permission. Only the bespoke sounds are attributed; the main set is not.
- Forge music: Kevin MacLeod (incompetech.com), CC BY 3.0 (`forge-gui/res/music/Credit.txt`).
- Marvel: one effect credited to Pixabay (Universfield, "Level Complete"); music is AI-generated from prompts kept in `docs/music-prompts-ready.md` (one paste-ready block per track; the three tracks of a scenario made in one chat so they share a melody).
- ArkhamHorror: rain loop CC0 (a licence file beside it, not read).
- Nobody uses audio sprites, loudness normalisation or a build step for audio.

## Not worth taking

- **Marvel's Phaser code** (tweens, scene transitions, `OverlayMotion`): tied to a redraw-everything Phaser scene and AGPL. The ideas above are the value.
- **Marvel's native audio shell** (Tauri, Linux audio, mixer watch): desktop packaging concerns.
- **Middle-earth's Skia and Reanimated layers** (`*.native.tsx`, atlas draws, the SkSL burn shader, fog): React Native only. The burn (noise-threshold dissolve with an ember rim) is a nice idea for a canvas effect but would be written new.
- **Netrunner's Howler bank and Forge's Java mixer**: the kit's player is already better (tiers, caps, ducking, fades).
- **Forge's sound-per-land-colour enum**: a table of 70 near-identical entries; the kit's data table with a fallback (D1) does it in one line.
- **Forge's continuous-rendering switch** (`ForgeAnimation`): a libGDX concern.
- **Terraforming Mars**: two sine beeps.
- **ArkhamHorror's confetti** (932 lines, not read): the kit has a particle kit.
- **Jukebox and unlockable songs** (D5): pleasant, but game-level, not kit-level.

## Suggested order

1. C1 (motion scale with Slow, and reading time split from motion time) and F1 (reduced variant keeps information): both change how every game feels and are small.
2. C2 + C3 (trauma shake, hit stop, flash limit) and G1 (seeded hash): MIT, about a day, visible at once.
3. A1 + A2 + A3 (gate, hurry classes, multi-beat run): the main structural gain for `motion-frame`.
4. A7 + D2 + D3 (no sound on load or undo, chained cues, front-silence check): cheap sound correctness.
5. C4 + C5 + C6 (beats from events, state deltas, banner lines ringing cards): best built with K86.
6. B3 (view-transition flight) as an experiment in one DOM game before it goes in the kit.
7. E1 (haptics): small, Android only.
