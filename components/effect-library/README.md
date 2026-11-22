# effect-library

Sixteen verbs for the director's spec format as DOM effects for the motion frame: `move`, `arc-move`, `lift`, `settle`, `fade-in`, `fade-out`, `show`, `hide`, `flip`, `scale`, `shake`, `shake-group`, `glow`, `unroll`, `multi-stop-path`, `text`, and since K449 `count` and `banner`. Web Animations API; browser only. Beside them: canvas effects with a particle kit and `trail`, a count-up and a boxed ambience layer.

<!-- effects:start (written by catalog-sync.ts from catalog.json) -->
## Effects by group

**move-and-fly**

- `move`: Slides a piece straight to a place
- `arc-move`: Flies a piece over in an arc
- `round-trip`: Flies to each stop, then back home
- `lift`: Raises one piece and holds it up
- `settle`: Sets a raised piece back down
- `flip`: Turns a card over by squashing it flat
- `flip` (direction: 1): Turns a card over in 3D
- `scale`: Grows or shrinks a piece and holds
- `spin`: Spins a piece round a few turns
- `tap`: Turns a card sideways to show it used
- `untap`: Turns a sideways card upright again
- `flash-jump`: Vanishes in a flash, bursts out at target
- `light-teleport` (mode: "zip"): Zips a token across with afterimages
- `light-teleport` (mode: "rise"): Lifts a token, then flies it straight
- `light-teleport` (mode: "portal"): Sucks a token through a spinning vortex
- `light-teleport` (spiral: true): Spirals a ship off the board, trail behind
- `pileLift`: Raises the deck while a card leaves it
- `flight`: Moves a dialog card to its board spot

**appear-and-vanish**

- `light-teleport` (mode: "pop"): Pops an icon into view in place
- `fade-in`: Fades a piece into view
- `fade-in` (scale: 2): Drops in large and shrinks into place
- `fade-out`: Fades a piece out of view
- `show`: Shows a piece at once
- `hide`: Hides a piece at once
- `unroll`: Unrolls a panel open from one edge
- `unroll` (reverse: true): Shuts a panel down to a glowing line

**light**

- `glow`: Glows once, then fades back
- `glow` (latch: true): Lights a piece and keeps it lit
- `glow` (end: "dark"): Dims a lit piece to dark
- `glow` (end: "dark", start: "dark"): Flashes once and goes dark
- `radar-sweep`: Sweeps a turning wedge of light round
- `shield-bubble` (recharge: {}): Builds a hex shield up cell by cell
- `flicker`: Flickers a colour over a piece
- `flicker` (buzz: {}): Buzzes a piece like a bad signal
- `light-sweep`: Sweeps a band of light across a piece

**particles**

- `streak-burst`: Bursts streaks of light from a point
- `particles-rise`: Floats small lights up from a piece
- `debris`: Throws small bits out that fall
- `spark-burst`: Bursts sparks out from a piece
- `drawDriftCloud`: Drifts broken card shards across the screen

**beams**

- `light-teleport`: Beams a token up here, down there
- `light-teleport` (mode: "crossing"): Sends big glowing dots across to a piece
- `trail`: Leaves a thin line behind a flying piece
- `light-pillar`: Raises a pillar of light over a piece
- `light-pillar` (curve: true): Holds a glowing arc between two pieces
- `projectile`: Fires a steady beam at another piece
- `projectile` (bolt: "streak"): Shoots a fast bolt with a tail
- `projectile` (bolt: "ribbon"): Lobs a shot along a fading arc
- `dash-line`: Draws a marching dashed line between pieces

**hits-and-destruction**

- `shake`: Shakes a piece side to side
- `shake-group`: Shakes several pieces together
- `burn-away`: Heats up, breaks apart, embers rise
- `burn-away` (lift: true): Card tilts, lifts and burns to smoke
- `shatter`: Breaks the piece itself into flying shards
- `shimmer`: Flashes an oval glint over a hit piece
- `ring-pulse` (shockwaves: [{}]): Blasts wide rings far beyond the piece
- `shield-bubble`: Flashes a hex shield as a hit lands
- `shield-bubble` (breaks: true): Shield cracks away, the piece stays whole
- `fizzle`: Fizzles a piece out with grey static
- `slash`: Slashes strokes across a piece
- `crumple`: Crumples a card into a ball, throws it

**text-and-numbers**

- `light-teleport` (mode: "bump"): Bumps a counter as it changes
- `banner`: Unrolls a banner with text, then fades
- `text`: Fades in text rising into place
- `text` (typewriter: true): Types out text word by word
- `count`: Counts a number up to its new value
- `countUp`: Counts a number up in the game's text
- `bannerAt`: Shows banner lines one after another

**signals**

- `scale` (pulse: true): Swells a piece once and back
- `light-teleport` (mode: "grey"): Flashes a piece, then dims it in place
- `ring-pulse`: Sends a ring outward from a piece
- `stamp`: Stamps a label onto a piece
- `stamp` (cracked: true): Stamps a cracked label onto a piece
- `bar-fill`: Fills a bar from one level to another
- `bar-fill` (pin: {}): Moves a numbered pin along a track
- `refresh`: Clears a used card back to ready
- `target-brackets`: Closes target brackets in on a piece

**loops**

- `spin` (endless: true): Keeps a piece spinning until the step ends
- `pulse`: Pulses a piece in a steady rhythm
- `idle` (kind: "bob"): Bobs a piece gently up and down
- `idle` (kind: "breathe"): Breathes a piece softly in and out
- `idle` (kind: "orbit"): Circles little stars round a piece
- `idle` (kind: "drift"): Drifts a piece slowly away and back
- `createGlitch`: Glitches a logo with split colour bursts
- `drawPlasmaOrb`: Draws a crackling orb of energy
- `startPulse`: Pulses a live element until stopped
- `startIdle`: Keeps a live element bobbing or orbiting

**camera**

- `cameraPull`: Zooms the board in and dims around it
- `cameraPush`: Pushes the camera in and back
- `letterboxBanner`: Slides in cinema bars with a caption
- `shakeAt`: Shakes the screen harder for bigger hits

<!-- effects:end -->

## Rules for agents

**What it does:** Director-spec effects for the motion frame: sixteen DOM verbs (move, lift, flip, glow, text and more), canvas effects with a particle kit, `countUp`, ambience and many opt-in extras. Browser only.
- An object option given as `{}` or `true` takes its defaults.

**You must:**
1. Create verbs with `createVerbs<EffectCtx>()`, call `registerEffects(verbs, { resolve })` and pass the returned layer as the motion player's `context`, with `onBeatEnd: (run) => layer.end(run)`.
2. `resolve(id, run)` returns the real element; the kit animates a clone, never the original (a cloned canvas is blank: copy pixels in `onActor`).
3. Pass the player's `speed` from settings through `withReducedMotion(speed)`: reduced motion gives `'instant'`, no verb runs and no clone is made.
4. Call `layer.start(run)` from `onBeatStart` when actors must be cloned at the beat's start, and `layer.clear()` between beats.
5. Check specs with `validateSpecs(specs, stages, [...EFFECT_NAMES, ...gameVerbs])`, never `Object.keys(BUILT_IN)` (it lacks verbs registered by name: particles-rise, flicker, stamp, bar-fill).
6. Set `--fx-*` variables for the look; no colour comes from the kit. Opt-in looks: `looks/rise-pulse.css`, `looks/glitch.css`.
7. Add your own verbs with `registerEffect` (use `animate(keyframes, endStyle)` so a skip jumps to the end) or `registerCanvasEffect`.
8. Use `countUp({ value, speed, show })` for counting numbers in your own code, or the `count` verb in a spec; neither writes game state.
9. A step with `unroll` + `reverse: true` collapses the actor and ends it at opacity 0 (hidden): give a panel that leaves this, not `fade-out`. `glow` with `end: 'dark'` leaves the actor dark, and `stamp` with `cracked` leaves its crack on screen until the beat ends.
10. To choose an effect, read "Effects by group" above or `catalog.json` (K499), not the option lists below. A new effect (a registered verb, a look one verb hides behind an option, or a function effect a game calls) arrives with its `catalog.json` entry and demo in the same PR: write `id`, `option` (for a look behind an option), `was`, `title` (up to 8 words, with a verb, what the player sees, no game's name), `looks`, `use`, `tags` (3 to 8), `group`, `ends` (`as-started`, `changed`, `hidden`), the option names (up to five) and `demo` (a spec on the stage `demo`: zones `a`, `b`, `board`, actors `A` and `B`), then run `node components/effect-library/catalog-sync.ts`. It derives `needs`, `ms`, `fits` (up to 400 ms constant, 900 each round, else rare), `draws` (from how it is registered; WebGL is not phone-safe), the option defaults (`computed` when the code works one out, `none` when it has none: the option is off or must be passed), `since` (the first tag holding it; `--since` redoes them all) and, with `--games <dir>`, `usedBy`, and rewrites the list above. `catalog.test.ts` fails on a missing entry, a missing field, a bad demo, a game's name or a stale derived field.
11. To watch every effect play before choosing it, open `gallery/effects.html` in the game-kit checkout (K502). After changing `catalog.json` or this component's code, run `node gallery/build.mjs` and commit the page: `tests/gallery.test.ts` fails when it is stale or misses an entry.
    To see an effect as one picture before choosing it: `gallery/strips/<id>.png` (five frames with the time under each) and `gallery/strips/group-<group>.png` (one sheet per group); a new effect arrives with its strip (`node gallery/build.mjs --strips`).
12. K506: specs use the new ids; an old id (table "Old ids" below, `OLD_IDS`) stays registered forever beside its new id (both in `names()`) and plays the same kit verb with every option. Change a name in a spec only when you edit that spec for another reason. The last registration of a name wins, as before: a game's own verb under an old id registered after `registerEffects` wins for that old id; one under a new id registered before `registerEffects` is kept (the old id still plays the kit's). `catalog.json` entries also carry `notThis` (look-alikes, each `{ id, diff }`), `pairs` (effects that go with it) and `impactMs` (when the hit lands, `null` for none; 0 to `ms`); ids there may add an option after `--` as strip names do. `node kit.mjs effects --used <folder>...` prints `id: N uses, M registrations` for each id and old id in a game's specs and code.

**Common mistakes:**
- Reading `style.transform` for `move` or `scale`: they animate `translate` and `scale`.
- Setting your own CSS `scale` or `translate` on an actor.
- Using it in node: it is browser only (Web Animations).


```ts
const verbs = createVerbs<EffectCtx>();
const layer = registerEffects(verbs, { resolve: (id) => document.getElementById(id) ?? undefined });
const player = createMotionPlayer({ specs, stages, verbs, speed, context: layer, onBeatEnd: (run) => layer.end(run) });
```

- The layer is one `div.fx-layer` (fixed, full page, no pointer events). Stage rects are its pixels; a scaled stage sets a transform on `layer.el`.
- An actor or zone is a clone of `resolve(id)` (never the original; its `id` is removed) or a plain box. `onActor(source, clone, id, run)` in the layer options is called once per actor right after its clone is made (only when `resolve` found a source): a clone arrives with a blank canvas, so a game copies the pixels (`clone.getContext('2d').drawImage(source, 0, 0)`) or swaps the content there. Hidden actors start at opacity 0. A clone is made at the first verb that uses it, or for every actor of the beat at its start when the game calls `layer.start(run)` from `onBeatStart` (needed when a live piece is hidden at the start and the stand-in must cover it); `layer.end(run)` removes the run's clones.
- End state, set when the call ends or on `skipAll`: `move` at the target rect, `lift` lifted (`to` number = scale), `settle` at rest, `scale` at the number, `flip` toggled (`data-fx-flipped`; the game's CSS shows the other face), `text` shown (step `text`, else the number), `fade-out` at 0, `hide` hidden. `shake` (step `times`) and `glow` end at rest. `move` with `then: hide` ends hidden; `scale` with `pulse: true` returns to rest; `fade-out` ends at `to` (default 0); `flip` sets `data-fx-label` from `label` (the game's CSS shows it with `attr()`; the kit never writes a counter); `text` shows `text` or `label`, fading in over the first quarter of the call while it rises over all of it. A step's `ease` (`in`, `out`, `in-out`, `linear`, or any CSS easing) is the easing. An actor's `opacity` is applied; `veil: true` gives the clone class `fx-veil` and `background: var(--fx-veil)`.
- Entry scale: `move` and `fade-in` take an optional step `scale`: a number `n` animates the actor from scale `n` to 1 (`{ do: 'fade-in', scale: 2 }`: appears at twice its size and shrinks to normal), `[a, b]` from `a` to `b`. On `move` it runs with the translate, so a token lands as it shrinks; the end state is `style.scale` (empty for 1). To hold a size instead ("stay at 2, shrink in a later step"), give `hold: true` with the number (`{ do: 'fade-in', scale: 2, hold: true }` ends at 2) or write `[2, 2]`; the later step shrinks with `[2, 1]`. Without `scale` the verbs play as before. Do not combine it with a `scale` verb on the same actor at the same time.
- Verbs at the same time on one actor compose: `move` animates `translate` and `scale` animates `scale` (the end state is in `style.translate`, `style.scale`); `lift`, `settle`, `flip`, `shake`, `text` use `transform`, so after a kept `scale` they multiply with it. Breaking since v0.17.0: code reading `style.transform` for `move` or `scale`, or setting its own CSS `scale`/`translate` on the actor, must change. `resolve(id, run)` gets the run, so a game can tell two beats' actors of the same id apart.
- Reduced motion is the player's: `withReducedMotion(speed)` gives `'instant'`, no verb runs and no clone is made.
- Own effects: `registerEffect(verbs, 'name', ({ call, run, el, layer, animate }) => ...)`. `animate(keyframes, endStyle)` plays over the call's duration and jumps to `endStyle` on finish or skip; a returned function is called then too.
- Canvas effects: `registerCanvasEffect(verbs, 'burst', (ctx, t, { x, y, call }) => particles.sparks(ctx, t, { seed: 1, n: 12, x, y, t0: 0 }))`. One `canvas.fx-canvas` in the layer, there only while such a verb plays; no clone is made; `x`, `y` are the actor's centre and `t` is ms of the spec, so the picture is the same at any speed. `particles` holds `sparks`, `embers`, `smoke`, `arc`, `impact`, `landing`, `glow`, `star`, `edge`, `rng`, `noise`, `ease`, `pulse`, `seg`, `clamp`, `lerp`, `canDraw`: pure functions of time and a seed; colours are `'r,g,b'` strings the game passes; the last argument `u` scales sizes.
- `countUp({ value, from?, ms?, speed, show })` calls `show(n)` each frame, easing out to `value`; it never writes game state. `speed` is the player's: the factor scales `ms` (default 700), `'instant'` shows the value at once, also when it turns Off half way. The returned function jumps to the end. `countAt(value, k, from?)` is the pure part.
- `createAmbience({ target, speed, draw?, className?, parent? })`: a `div.fx-ambience` fixed over the box of `target()`, clipped to it, no pointer events; it follows resize and scroll, and is hidden with no frame drawn while `speed()` is `'instant'` or there is no target. `draw(ctx, t, w, h)` paints its canvas each frame; without it the game's CSS fills the box. Call `update()` when the settings or the screen change, `destroy()` to remove it.
- Impact feel (`feel.ts`, opt-in, pure): `stopTime(t, contact, holdMs(kill))` holds the picture at contact (100 ms, 160 on a kill; shorten the impact by the same); `shakeAt(t, trauma(damage, { kill, blocked }), { seed, max, speed })` is the trauma shake (x, y px, rot deg; wobbles capped at 25 Hz after `speed`); `afterimages(poseAt, t)` gives the poses 16, 32, 48 ms earlier with a fading `alpha`; `createFlashLimiter().allow(targetId, now)` keeps flashes under 3 a second (2) per target (flash the target only), `flashAt` is the bump.
- Slots and beats (`slots.ts`, `beats.ts`, opt-in, pure): `createSlotHold()` holds a slot empty until `latest` (`tighten`, `release`); `resolveRect(id, {card, pile, host})` is card, pile, host rect or none, `moveEnds` says move, appear, vanish; `entryMotions(prevLayout, nextLayout, opts)` gives a Motion per changed card (flip, 90 ms stagger over 5 places, 24 px arc, land) and the leaving ghosts; `beatsFromEvents(events, table, { fallback, rectOf })` is one table from events to `{anchor, text, tone}` (a beat with no rect is listed in `skipped`); `countDeltas(prev, next)` subtracts two states.
- Particles as data: `sparkPoints(t, opts)` is what `sparks` draws; `BUDGET` (70), `capN`, `max` in the opts cap what is alive; `hash(seed, i)` is the integer hash.
- K235: `placements(reg, ...)` / `movements(prev, next, ...)` (`movement.ts`, from board-registry (was `../kit/board-registry/index`), so a 1.0 board does not pull this component): the rect of each piece and a Motion for each that moved.
- Bands, banners, flight (`bands.ts`, opt-in): `flip` step `holdMs` holds the old face first, then turns at the edge-on midpoint; `phaseSweeps(order, prev, next, {quick, cardsMove})` is false on undo, with moving cards, under Quick; `createBandSlots()` keeps a level-up band apart from the phase band; `bannerAt(lines, t, opts)` shows a line per 650 ms, `ring` is the cards the newest names, `createRingStore()` hands them to the table; `flight(document, { name, from, to, swap, className })` moves the card by `startViewTransition` (the name leaves `from` and lands on `to` inside the callback; no API, it just swaps).

## Old ids

| Old id | New id |
| --- | --- |
| `multi-stop-path` | `round-trip` |
| `collapse-jump` | `flash-jump` |
| `warp-transfer` | `light-teleport` |
| `radial-streaks` | `streak-burst` |
| `column-beam` | `light-pillar` |
| `rotating-beam` | `radar-sweep` |
| `dissolve` | `burn-away` |
| `motes` | `particles-rise` |
| `reticle` | `target-brackets` |
| `sheen` | `light-sweep` |

## Look

CSS variables a game sets (fallbacks carry no colour): `--fx-z`, `--fx-lift-rise`, `--fx-lift-shadow`, `--fx-settle-shadow`, `--fx-glow`, `--fx-glow-off`, `--fx-shake`, `--fx-text`, `--fx-text-font`, `--fx-text-rise`, `--fx-veil`, `--fx-ambience-z`. The particle kit's colours are arguments (defaults: white arcs and stars, warm sparks and embers, dark smoke).

Tests: `particles.test.ts`, `count.test.ts` (node); `effects.e2e.test.ts` (Chromium via Playwright; skipped off CI when it is not installed).

### Hooks and defaults (K412)

- `collapse-jump` takes `holdBetween({ el, from, to })`: called once when the collapse ends and the hold begins (called at the end if the call is skipped first).
- `column-beam` takes `actorZ` (default 2; 3 puts the actor above the core, under the specks).
- `createEffectLayer({ zIndex, position })`: `zIndex` replaces `--fx-z`; `position: 'absolute'` fills a positioned `parent`.
- `registerCanvasEffect(verbs, name, draw, { host, zIndex })`: the canvas is made in `host` (default the layer's element) and sized to it; effects with one host share one canvas.
- `sheen` takes `background`, a CSS background for the band instead of the `colour`/`stops` gradient (the tuners and Warp's menu sheen: 110deg, 35/50/65%, #b6f6ff22).
- Defaults, exported: `GLITCH_DEFAULTS`, `COLUMN_BEAM_DEFAULTS`, `ROTATING_BEAM_DEFAULTS`, `RETICLE_DEFAULTS`, `PLASMA_ORB_DEFAULTS`, `DRIFT_CLOUD_DEFAULTS`, `COLLAPSE_DEFAULTS`, `SHEEN_DEFAULTS`; the effects read them.

### Verb options (K435)

- Step ends: a step whose animations started late (a slow frame) and still run for at most `min(250 ms, 40% of dur)` when the player ends it waits for their `finished` (time left + 100 ms as the fallback); a skip earlier, and the beat's last step, end at once as before; `layer.end(run)` and `layer.clear()` end a waiting step. `endOnFinished` and `flushEnds` are exported for a game's own context. Not here (motion-frame's player): the beat's end waiting on its last step, and start times free of timer drift.
- `playOn(el, steps, { speed, kind, register })` plays steps (actor `el`) on the page element itself, no layer and no clone, so a view transition carries it; returns `{ done, cancel }` (`cancel` jumps every verb to its end state; `done` resolves `done` or `skipped`). `kind` is written as `data-motion-fx` on each element a verb adds. `stamp`'s `press` then squeezes the real chip.
- `stamp`: `onParts({ label, ring })` hands over its parts (`data-fx-part` `label` and `ring`); `holdRing: true` leaves the ring at its last frame for the game to remove (across a later pan); `ringZ` gives the ring its own z-index; `target` (an element, or a selector in the actor, else the page) stamps an existing element: no default look, never removed.
- `motes`: `easings: [toPeak, toEnd]`, `holdStart` (offset the start transform is held to), `seed`, `direction` (degrees, 90 = down; default up), `gravity` (px added downward).
- `settle`: `frames` (the last is the end state), or `fromScale`, `rise` (px), `dip`, `dipAt`.
- `lift`: `scale: false`, `shadow: false`. `pileLift`: `scale: null`, `shadow: null` (no inline filter), `transform: true` (one transform instead of translate and scale), `liftShare` (lift in px = share of the measured height; STCC dismissed: 0.06, `liftMs` 160, no settle, `end()` when the game is done).
- `ring-pulse` shockwaves: `alphaAt(k)`, `radiusAt(k)` (px before `unit`), `widthAt(k)` (Warp's breach: `1 - k`, `30 + 330 * outExpo(k)`, `24`).
- `debris` with `dom: true`: one element per piece in the layer (`z`; a piece `shape` is its clip-path, `paint` is canvas only).
- `shakeAt(t, t0, { sine: { amplitude, frequency, decay }, decayMs })`: x = amplitude * (1 - t/decayMs)^decay * sin(2 pi f t); y and rot 0.
- `hideSource` with `hideParts` (a selector, `.class`): hides only those descendants of the source.
- `startPulse` / `pulse`: `pseudo` (`::before`, `::after`), `delay`, `once`, `keepReduced`.
- `bannerAt(lines, t, { frames })` adds the newest line's `opacity` and `scale` (`frames`: `{ at, opacity, scale }`, `at` ms since it appeared); `letterboxBanner({ textFrames })` drives the text the same way from the banner's start. `bannerKeyAt(frames, t)` is the interpolation.

### More options (K436)

All opt-in; without them every verb plays as before.
- `bar-fill` `pin`: `glowUnder` (the number draws over the glow), `ringCentred` (the ring's radius is the middle of its stroke), `clock(draw)` (the caller's frame clock drives the pin with step ms and returns its stop; default the kit's rAF), `onEnd()` (once, on the end or a skip).
- `idle` orbit `twinkleMs`: ms added to the twinkle's clock only, apart from the pop and the orbit (Warp's stun stars).
- Layer: `createEffectLayer({ isolate: false })` is no stacking context (`display: contents`; parts place against `parent`), so parts blend with the board; an `EffectActor`'s `zIndex` and `blend` (via `layer.start(run, actors)`), or step `zIndex` and `blend`, set them on the clone.
- `projectile` `headEarly` shows the head at the source during `delay`; `shimmer` `rippleEarly` shows the ripple ring's first frame during `delay`; `ring-pulse` `boxSizing`.
- `fizzle` (new; STCC's fizzled card): the actor shakes (`shake` % offsets, `shakeMs` 520), greys (`saturate` 0.3, `brightness` 0.85, `greyMs` 1000) and a clipped, screen-blended noise sputter crosses it (`colour` RGB, `grain` tile size, `sputterMs` 520). All ms are spec ms.
- `spark-burst` (new): `count` sparks fly out of the middle of `box` (default the actor) and fade: `colour`, `ms`, `delay`, `reach`, `size`, `fall` (px), `z`, `seed`. Presets from STCC's mission fanfare: `missionSparks(chipBox)` gives the gold and pale bursts; `MISSION_SHINE` is `sheen` settings (play over `MISSION_MS.shine`, 650 ms).
- `createAmbience`: `fps` caps the drawn frames, `covered()` true draws nothing and holds `t`, `still: true` shows one frame drawn at t = 0 at speed `'instant'` and stops.
- Defaults, exported: `WARP_TRANSFER_DEFAULTS`, `SPIRAL_DEFAULTS`, `PROJECTILE_DEFAULTS`, `SHIELD_BUBBLE_DEFAULTS`, `CURVED_BEAM_DEFAULTS`; the effects and the energy tuner read them.
- `move`: `frames` (caller keyframes, the last is the end style), `scaleX` / `scaleY` (curves: numbers spread over the step), `percent: true` (translate in % of the actor's size), `rotate` (deg: a number ends there, `[from, to]`), `resize: true` (centre to centre onto the target's size; `[w, h]` a size of its own), `output: 'transform'` (writes only `transform`, never left/top, `translate`, `rotate` or `scale`, so a separate hover `scale` composes; the end state keeps the last transform).
- `flip`: `frames` (caller keyframes), `scaleX` / `scaleY` curves (on `scale`), `faces: [front, back]` (selectors in the actor; the back shows from the swap), `pivot` (transform-origin, e.g. `0 50%`), `eases: [first half, second half]`, `overshoot` (deg past flat before it settles), `glow` (a CSS box-shadow peaking edge-on), `filter` (CSS filters over the turn, or `{ frames, ms, delay, easing }`), `turnMs` and `turnDelay` (the turn's own time in the step), and with `direction`, `continuous: true` (one ease from 0 to 180 deg; ends turned).
- `glow`: `latch: true` turns on and stays on; a later `glow` step with `release: true` fades it.
- `dissolve` `standInAt`: ms from the step start before the stand-in shows (the live piece shows until the break).
- `cameraPull` `easeOnCut: true`: the returned cut eases back over `releaseMs` from where it is, so the dim eases out.
- `dash-line` `loop: true`: the line stays past its step until `signal` aborts or the layer is cleared.
- `sheen`: `pseudo` (`::before` / `::after`: animates the actor's own pseudo-element, the game's CSS draws the band), `hover: true` (plays while the pointer is over the actor, pauses where it is when it leaves), `blend`.
- `fizzle` and `spark-burst` draw nothing at speed 0 (a call of no duration). `rotate` and transform-only output for `arc-move` and the other flights: row K438.

## Use it in 10 lines

```ts
import { createEffectLayer, missionSparks, MISSION_SHINE } from '../kit/effect-library/index'

const layer = createEffectLayer() // the DOM layer the motion frame draws the twelve verbs on
document.body.append(layer.el)
layer.clear() // empties it between beats
const blended = createEffectLayer({ isolate: false }) // K436: parts may screen-blend with the board
const [gold, pale] = missionSparks([0, 0, 200, 56]) // `spark-burst` steps; MISSION_SHINE is a `sheen` step
console.log(blended.el, gold.count, pale.colour, MISSION_SHINE.blend)
```

Look file (opt-in): `looks/rise-pulse.css`, class `fx-rise-pulse` on a positioned element over a card plays a red-orange pulse once (none under reduced motion); variables `--buff-ms`, `--card-w`, `--motion-scale`.

## Additional DOM effects and settings

- `glow` accepts a CSS `colour` and a centred `hold` fraction from 0 to 1. With a colour, optional `shadows` lists CSS shadow geometry without colour.
- `glow` with `end: 'dark'` and `start: 'dark'` (K694) is a single flash: dark at 0, full at `rise` (0 to 1 of the call, default 0.5), dark at the end, and the actor is left dark. `hold` is a plateau centred on `rise`; 0 peaks once. Speed 0 shows the final (dark) state at once. Without `start`, `end: 'dark'` is unchanged (starts lit, fades).
- `flip` squashes horizontally with `axis: 'x'` (default) or vertically with `axis: 'y'`.
- Set `direction: 1` or `-1` for a 3D turn with `perspective` in pixels (default 800).
  `holdMs` delays the turn and the face swaps at the edge. `squash: false` swaps immediately.
- `shake-group` accepts `actors` (ids of beat actors, animated as clones; K460: an id the spec did not declare gets its own stand-in at the step's rect) or a CSS `selector` (live elements). `amplitude` and `crossAmplitude` are horizontal and vertical offsets in pixels, and `frames` sets the number of keyframes.
- `unroll` reveals an actor from scale zero on `axis: 'x'` or `'y'` with a CSS `origin` (left for x, top for y by default).
- Pass the actors to `layer.start(run, actors)` in `onBeatStart`. An `EffectActor` with `hideSource: 'start'` hides its resolved source at beat start. With `hideSource: 'step'`, it hides the source at the actor's first step. `layer.end(run)` or `layer.clear()` restores the source.

The game passes its flight and look settings with each step. The defaults are game-free. The [motion lab](fake/retrofit/index.html?flights) supplies neutral demo values.

### Flight settings

- `arc-move` uses `to` like `move`. A separate `scale` step can run alongside the three-keyframe arc. Sampled cubic and quadratic flights accept `then: hide` to hide the clone at landing. The three-keyframe arc uses `arcHeight` (pixels above the midpoint), `bank` and `lean` (apex offsets as fractions of vertical travel), and `apex` (time fraction, default 0.5) for a three-keyframe arc. The offsets default to zero.
- `clipPath` applies a CSS clip to the clone during the flight and restores its previous clip on finish or skip. `landingWidth` changes the destination width in pixels, keeping the source aspect ratio.
- `glide.anchor: 'destination'` positions the clone at the landing box before animating and otherwise keeps transforms are relative to the source. `liftRatio` sets lift as a fraction of distance, capped by `arcHeight` when supplied. `progress` sets midpoint progress along the path (default 0.5). `swell` adds to the midpoint scale, and `relativeSwell` uses the mean of the endpoint scales as its base instead of 1. `round` rounds transform numbers to multiples of its reciprocal. `baseTransform` appends a CSS transform and retains it at landing. `opaque` makes the keyframes fully opaque. `plainEnds` omits the scale function at the endpoints.
- `via: { point, rest: [arrival, departure], width? }` holds the flight at a stage point. The rest times are fractions of flight duration and the optional width is in pixels. The step's `ease` applies to each leg.
- `stagger` sets the gap in ms between simultaneous arcs. `staggerMax` caps the stagger index, `staggerGroup` scopes it, and `staggerUnscaled` keeps the gap fixed at any player speed. `flightMs` sets the individual flight duration. Set `dur` to cover the flight plus its stagger.
- `cubic.controls` gives the two horizontal fractions of travel and the two vertical multiples of lift as `[firstX, firstY, secondX, secondY]`. Lift is the destination height with a floor of `minLift` pixels. `startScale` is relative to the landing size. `bank` limits the screen-plane rotation in degrees, and `lean` limits the Y rotation in degrees. `curvature` multiplies signed curvature scaled by the path span. `leanIn` and `fadeIn` are time fractions marking the end of lean and opacity buildup, and `levelFrom` is the time fraction when leveling begins. `perspective` is the CSS perspective distance in stage pixels. The cubic curve and pose come from Warp’s Edge `src/ui/fx/flight.ts`, and the CSS transform order and perspective come from `src/ui/fx/warpIn.ts` at `449af55`.
- `quadratic.control` is a stage point. `blend` mixes linear time with the eased profile. `lookAhead` is the curve parameter increment used to estimate heading. `nose` is the artwork's facing and `rollAxis` is the squash axis, both in degrees. `rollSquash` sets the minimum thickness during a roll, and `reverseBrightness` sets brightness on the reverse face. `roll` is the start and end time fractions, `side` selects its direction (default 1), and `juke` is the sideways displacement in pixels. `fadeSlope` sets the opacity ramp rate. `exitScale` sets the final relative scale and switches to exit easing, and `exitFade` sets the time fraction when the exit fade begins. `afterimages` supplies `count`, `spacing` in ms, `opacity` and a CSS `filter`.
- `multi-stop-path` takes `path` with ordered `stops` (stage `box` rectangles, optional `laps` and `dwell` in ms). `launch`, `travel`, `lap`, `hop` and `back` are ms for the launch wait, first leg, each lap, travel between stops and return home. `padding` expands the orbit radii in stage pixels. `nose` sets the artwork facing in degrees, `flip` mirrors it, `headingSample` sets the heading look-back in ms, and `roll` sets the amount of horizontal squash. `ghosts` supplies `count`, `spacing` in ms and `opacity`.
- `trail` (K460: only `width`, `tipWidth`, `colour` and `fade` are needed; `quadratic` defaults to a curve through the paired `arc-move` step's `arcHeight` (same `t` and `to`), `rear` 0, `samples` 24, `spacing` 28) takes `to` and `ribbon` with the flight's `quadratic` settings, `rear` offset, `width` and `tipWidth` in pixels, `fade` as an opacity multiplier, `colour` as a comma-separated RGB string, `samples` as the maximum sample count, and `spacing` in ms. Use a separate actor at the same origin so both steps share the same path.

From `power/sortie.ts` and `evasion.ts`, these effects carry the flight paths, clone afterimages and quadratic ribbon. Launch and return bursts, glow, speed lines, home-image hiding, thruster flare, sparks, bolts, stamp and ring are left to later effect batches.

### Beam and transfer settings

The [beam lab](fake/retrofit/index.html?beams) shows all five verbs. Coordinates are stage pixels and timings are spec milliseconds. Pass `dur` long enough for the last staggered phase, including any label.

- `warp-transfer` uses the actor and step `to` as anchors. `from` and `destination` override them with rectangles, and `from: null` plays only the arrival column. `count` and `stagger` control overlapping copies, and `image` replaces the actor artwork. `colour` is a space-separated RGB triplet, `glowColour` and `lightColour` are CSS colours, and `columnLight` is a CSS background or `false`. `crossing: false` omits the light between columns. Modes are `column`, `crossing` (light only, width from the source rectangle), `zip` (afterimages and landing burst), `rise` (rise and straight flight, with `lift` in pixels), and `portal`.
- `columnUp` and `columnDown` each take `width` and `height` multipliers and a `bottom` offset from the centre in icon heights. Defaults are 1.44, 4.23, .65 for up and 1.45, 4.3, .72 for down.
- Column `frames` replace the seven built-in poses. Each frame takes `offset`, column transform `col`, column opacity `colOp`, token transform `tok` and token opacity `tokOp`. Column `sparks` default to 16 up and 8 down.
- `crossingDots` defaults to 5. `zipGhosts`, `zipSparks` and `zipPopMs` default to 3, 8 and 130.
- `riseMs` and `riseTravelMs` default to 260 and 300. `popOffsets` sets the peak and rebound as step fractions, defaulting to `[.45, .75]`.
- `warp-transfer` also supports `pop` for a revealed icon, `grey` with `beforeLook` and `afterLook` (each takes `opacity` and `filter`), and `bump` with a CSS `counterColour`. Each animates the actor at its anchor for the step duration.
- `portal` takes `outward`, `startSize`, `endSize`, `alpha`, `travelAt`, `travelMs`, `elapsed` (spin time offset), and optional `collapse` and `growth` time pairs. `lift` sets the arc height. Optional `vortex` takes `size`, an `open` time pair, `background`, `stroke`, `strokeWidth` and `alpha`. `totalLabel` takes `text`, `at` (top-left point), `font`, `colour`, `travel` (signed vertical distance), `ms`, `delay` and optional `image`.
- `portal.spin` sets the linear and quadratic coefficients in degrees per ms and degrees per ms². Defaults are `[.25, .00042]` inward and `[-1.25, .00035]` outward.
- Vortex `armCount`, `armSegments`, `armTurns`, `armRadius`, `armExponent` and `armSpin` default to 4, 50, 1.6, 48 SVG units, 1.6 and .7 times the portal spin.
- Vortex image rings use `ringMs`, `ringTurns`, `ringSpacing` in degrees, `ringScale` from start to end and `ringAlpha`. Defaults are 1100, ⅔, 60, `[1.15, .05]` and .5.
- `warp-transfer` with `spiral` takes an `image`, `centre`, `outward`, `lift` in pixels, `squash` and `orbit` fractions, parked `heading` and artwork `nose` in degrees, `flip`, `unit`, `afterimageFilter`, RGB triplets `tail` and `tip`, comma-separated RGB `engine` and a `ribbonReach` multiplier. Use `parked` to override the stage rectangle at the parked end and set the artwork size.
- `radial-streaks` takes `count`, `centre`, `inward`, `unit`, `seed`, `alpha` and a three-colour RGB `palette` (comma-separated triplets). Optional `pulse` draws a flight ribbon from `centre` to `to` with `lift`, `flightMs`, `colour` and `core`.
- `collapse-jump` collapses the actor and expands it at `to`. `colour` is a CSS streak colour, `n` sets the streak count, and `reach` and `length` are multiples of the larger actor dimension. `pointLight` is the flash background. `outMs`, `gapMs` and `inMs` default to 640, 140 and 640. Allow up to another 12% of `inMs` for the delayed streaks.
- `column-beam` takes `way` (in or out), `colour` (space-separated RGB), `tuck` (pixels clipped from the bottom), optional `column` rectangle, `glitter` count, `speck` size multiplier, `core` toggle, `columnLight` and `coreLight` backgrounds, `speckColour` and `speckGlow`. With `curve`, the beam follows a quadratic to `to` using a stage `control` point, `unit`, comma-separated `colour` and `moteColour`, CSS `sparkColour`, optional `image`, start/end `size` and a boolean `tuck` for shrinking into the emitter. The curved sequence uses a 1,200 ms step.
- `rotating-beam` takes `colour` (space-separated RGB), `turns`, `beamDeg` and `fadeMs`. The wedge is centred on the actor; use `dur` to set its turn rate. `clip: true` (K462) keeps the wedge and glow inside the actor's box; off by default.

### Signals

See the [signals lab](fake/retrofit/index.html?signals). Style fields take inline CSS and frame arrays take Web Animations keyframes. Dimensions are stage pixels unless given as CSS lengths. Times are spec milliseconds.

- `stamp` applies `text` or an `image` to the actor (K460: an `image` fills the actor, `objectFit: contain`, no box; `text` keeps the boxed label, and `look: 'bare'` makes it lettering centred over the actor in the inherited colour, `700 4em`; `style` overrides either; a `ring` with no `frames` or `style` spreads and fades a `currentColor` circle, `scale(.6)` to `scale(1.6)`). `tilt` sets the default press angle in degrees. `style` positions and paints the label. `frames` overrides the press. Optional `press` animates the actor and `ring` animates a second element behind the stamp, each with `delay`, `ms` and `frames`. The ring also takes `style`. Use `ms` for the press time when `dur` also covers a longer accent. Set `ease` (default `ease-in`), three `scales` and `pressOffset` for the default stamp frames. `press.ease` and `ring.ease` default to linear. Override the label inset with `style.left`, `top`, `width` and `height`, and its colours with `style.background`, `color` and `border`. The label stays on the actor until the beat ends unless its final opacity is zero.
- `motes` sends `count` seeded particles of `colour` up from the actor or a stage `box`. Set `size`, `rise`, horizontal `spread`, particle `radius`, `z` and `glow` (blur as a multiple of size). `lag` is the maximum start delay as a fraction of `ms` (base life). With the default life jitter, allow `ms * (1 + lag)` in `dur`. `colour` accepts one CSS colour or a seeded palette, and `glowColour` overrides the glow tint. `minSize` is a pixel floor. `sizeJitter`, `lifeJitter` and `riseFactor` each take a base multiplier and a random multiplier range. Use `peakOffset`, `startTransform` and `endScale` to shape the frames. `ease` defaults to `ease-out`. Optional `dissolve` frames fade the actor for `ms` with `dissolveEase` (default `ease-in`).
- `flicker` breathes a `colour` overlay `times` per cycle. Set `style` for its shape and `frames` for exact levels and offsets. `loop` repeats until the step ends. `period` sets cycle length. `ease` defaults to linear for the overlay and buzz. Optional `grey` animates the clone’s filter in sync with overlay opacity, with peak `grayscale` and `brightness` both defaulting to 1. `buzz` replaces the overlay with a seeded actor filter and jitter. Set its active `window`, optional internal `period`, `sampleMs`, `timeOffset` for the noise clock, `peak` or sine-envelope `power`, two `brightness` levels, `noiseMs`, `threshold`, `saturation`, `hue`, `jitter` distances and `jitterMs` frequencies in milliseconds.
- `bar-fill` animates `from` to `to` as fractions and paints the fill with `colour`. Use a registered numeric CSS `property` to animate raw values and an optional `marker` with `selector`, `lift`, `base` transform, four `scales` and two intermediate `offsets`. `ease` defaults to `ease-out` for the fill and marker, and `marker.ease` overrides it for the hop. Use `pips` for local `boxes`, `sweep`, `gap`, `empty` colour, cover `background`, `radius`, gradient `edge` offsets and `edgeColour`. Its optional `flash` takes `start`, `end`, `peak`, `colour`, `outline`, `blur` and `width`. Use `pin` for a numbered marker with pixel `delta`, `lift` and time `window`. `liftFactor` scales the actor height when no pixel lift is supplied (default .25). Its optional `glow` takes `radius`, `alpha`, `tail`, `peak` and a CSS `gradient`. Its optional `ring` takes times `start` and `end` relative to landing, radii `from` and `to`, `colour` and `width`. When covering an already updated source, use the layer's `hideSource` option.
### Rotation settings

The [rotation lab](fake/retrofit/index.html?rotations) shows all three verbs. They animate CSS `rotate` on the actor clone, alongside `move` and `scale`. Use `dur` for timing, `direction: 1` for clockwise (default) or `-1` for counterclockwise, and `pivot` for a CSS transform origin. The pivot defaults to the actor's inline origin or its centre.

- `spin` takes `turns` (default 1, fractions allowed) and `ease` (default linear). It adds the signed turns to the actor's held rotation. Whole turns return to the starting pose. Fractional turns hold the new pose. Set `scaleFrom` for a roll-in that ends at the resting angle and scale.
- Set `endless: true` to repeat until step end or skip, then restore the resting pose. `period` is the cycle duration in spec ms and defaults to `dur`. Use whole turns for a seamless ring. The motion player’s reduced-motion setting also governs loops.
- `tap` holds the signed `angle` (default 90 degrees) for the rest of the beat. Set `ease` to override the shared ease-in-out default. Set `overshoot` in degrees to pass the target at offset .78 with EBR’s easing.
- `untap` returns a held rotation to 0. For a fresh clone of upright artwork, `angle` and `direction` describe its starting pose. It accepts the same `ease` and `overshoot` as tap.

### Combat settings

The [combat lab](fake/retrofit/index.html?combat) shows the six verbs. Coordinates are stage pixels and times are spec milliseconds. Set `dur` to include the last visible phase. The [game presets](../../docs/motion-retrofit/presets/) record the matching game values and choreography.

- `projectile` uses the actor and `to` as anchors, with optional absolute `fromPoint` and `toPoint`. Set `speed` in pixels per ms or `travelMs`, and `delay` before launch. The sustained beam accepts space-separated RGB `colour`, `core`, `headColour`, `spotColour`, and pixel `width` and `spotSize`. `headScale` is in beam widths. `flicker` entries give time after arrival, width multiplier, opacity and easing. `miss` extends travel by `past` times its original length, retracts in `fadeMs` and accepts a CSS `mask`.
- `projectile` with `bolt: 'streak'` draws the travelling tail and hot head, and `bolt: 'ribbon'` draws a curved, trailing shot with `lift` in pixels, `launchMs` and `fadeMs`. Both take `unit` for width scaling, `coreWidth`, `alpha`, comma-separated RGB `colour`, `headColour` and `spotColour`, and CSS `core`. `tail` is the streak length as a fraction of the path.
- `dissolve` heats and breaks its actor. `shown` clips to the visible height, `cols` sets the grid width, `hit` is a pair of fractions from the visible top-left, and `embers` sets the particle count. Set `delay`, `heatMs`, `breakMs`, and space-separated RGB `heat`, `emberColour`, `core`, and `glow`. With `lift`, set `distance` in pixels, `spin` in radians, `fade` as a pair of ms and `ms` for the lift. The lift also accepts `unit`, comma-separated RGB `colour` and `smoke` overrides from the particle kit.
- `shatter` hides the actor under triangular shards. `count`, `grid` (columns and rows), `jitter` (percentage points), `seed` and `motionSeed` set the mesh and scatter. Use an absolute `impact` point for radial travel or a `direction` vector for parallel travel. `clipSource` is the image URL, `sourceBox` is its actor-local placement, and `flip` mirrors it vertically. Set `delay`, `ms`, `unit`, `perspective` in pixels, `drag` and `coolMs`, and space-separated RGB `hotColour` and `coolColour`. For both destructive verbs, `hideSource: 'step'` on the actor lets the stand-in cover the live source until beat end.
- `shimmer` draws an elliptical shimmer and a ring. `pad` and `rippleSize` are fractions of target width, `hit` is an actor-relative fractional point, and `rippleWidth` is in pixels. Set `delay`, `ms` and `rippleMs`, space-separated RGB `colour`, `rim`, `core` and CSS `rippleColour`. `frames` and `rippleFrames` can replace the keyframes.
- `shield-bubble` draws the hex field and waves around `centre` with two pixel `radius` values, `hex` cell size, `outline` stroke multiplier, `hitAngle` in radians and `hit` in ms. `breaks` scatters the field and `attack` selects shorter impact timing. `unit` scales the particles and wave travel. Set comma-separated RGB `colour`, `rimColour`, `cellColour`, `breakColour`, `glowColour`, `core` and two `sparkColours`.
- `ring-pulse` accepts a stage `box`, CSS border `radius`, spaced RGB `colour`, pixel border `width`, CSS `shadow` and `background`, `frames`, `easing`, `delay`, `ms`, `count` and repeat `period`. Alternatively pass `shockwaves` with per-wave delay, ms, radius and width in pixels, alpha and squash. Shockwaves use the same colour plus a spaced RGB `outline`, `unit` and optional stage `clip`.

- Optional `projectile.sourceLight` adds the source overlay with CSS `background`, `shadow`, `radius` and replacement `frames`. `headFadeMs` sets the fade after contact.
- `dissolve.heatEdge` sets the outer heat colour. `shimmer.jolt` takes a stage-pixel `vector` and optional `ms` for the actor's recoil.
- `shield-bubble.recharge` builds the hex field with `assemble`, `hum` and `settle` time pairs and comma-separated RGB `scanColour` and `scanCore`.

- Bolt `sourceGlowRadius` and `headGlowRadius` are scaled by `unit`; set `sourceGlowMs`, `sourceGlowPeak`, and `headGlowAlpha` for the flashes.
  Ribbon `trailMs` and `trailPoints` set the sampling window and count. `coreAlpha` controls the inner stroke. `lift` defaults to 70 px.
- Shimmer `hitStops` and `rimStops` take alpha fractions and stop positions in percent.
  Shockwave entries take `borderWidth`, `outlineWidth` and `outlineOffset` scaled by `unit`.
- Dissolve `cutAt` and `heatTail` are fractions of `heatMs` and `breakMs`. Use `heatFrames` and `heatBackground` to replace the overlay look.
  `emberSize` takes `min` pixels, a width `divisor` and multiplier `range`. `emberDrift`, `emberRise`, `emberSpan` and `emberShadow` are pairs for radial/random drift, rise range, duration range and blur/spread. `lift.glowRadius` scales with `unit`.
- Shatter `travel` and `zRange` are scaled by `unit`. `speedRange` multiplies travel.
  `rotateX`, `rotateY` and `rotateZ` are degree ranges. `brightness` and `shadowSize` run from cool to hot.
- Shield `sparks` takes `count` per direction, `life` in ms, `speed`, `spread` in radians and `width`.
  `glowRadii` gives outer/core radii scaled by `unit`. `visibleIn` and `impact.fade` are ms pairs relative to hit.
  `impact` also takes `flashMs`, `waveCount`, `waveGap` in ms and `waveSpeed` in units/ms.
  `flashPeak`, `flashRadius`, `flashStrength`, `glowAlpha`, `fieldAlpha` and `impactPointScale` tune the hit.
  `waveWidth`, `waveReach` and `waveStrength` tune the wave band, reach and first/later strengths.
  `field` tunes gradient and hexes, `scatter` tunes the break, and `recharge` tunes the sweep.
### Refresh and loops

- `refresh` takes a ready card actor and an optional `banner` selector inside its clone. It lifts and removes that banner and sweeps a filtered copy away from bottom to top. `face` selects the artwork descendants to copy and filter. Omit it for a card whose artwork is the actor’s own CSS background. `filter` is a CSS filter (default grayscale). The banner copy clips to the card radius until it lifts. After finish or skip, the clone shows the ready face without the banner. Resolve the actor from the ready state and supply the outgoing banner in `onActor`.
- Set `liftMs` and `drainMs` (500 and 400 ms), `drainAt` (0.25 of the lift, or 0 without a banner), and `liftEase` / `drainEase`. Give the step at least `max(liftMs, liftMs * drainAt + drainMs)` with a banner or `drainMs` without one. Stagger using step start times. `liftMiddle` sets the intermediate time fraction. `liftRise` sets intermediate and final fractions of card height and `liftScale` gives the two scales. `textShadow` optionally animates a pair of CSS shadows on the banner's first child.
- `lineBackground`, `lineShadow`, and `lineRadius` are CSS values. The default line colour is `#e0e0e0`. `lineHeight` is a fraction of card height, with `lineMinHeight` in pixels. `lineFade` gives the two time fractions where the sweep is fully opaque.
- `pulse` repeats `frames` (WAAPI keyframes with optional offsets and per-frame easing) every `period` ms (1500 by default, scaled by beat speed). The default animates opacity. Set `easing` for each interval (default `ease-in-out`) or specify it on individual frames. Put the still outline or glow in the game's CSS.
- `idle` takes `kind: 'bob' | 'breathe' | 'orbit'`. Bob sets the midpoint to `rise` pixels up (8 by default). Breathe varies opacity by default. Both accept pulse settings with a 2400 ms default period. Orbit draws on a canvas at the top of a positioned target and defaults to 2200 ms.
- `orbit` settings use pixels at `referenceWidth` and scale with the target's width when supplied. Set `radii` (x and y), `centerY` (offset from the top), `phaseMs`, `count`, `size` and `alpha` (back and front values), `twinkle` (base, amplitude, ms per radian, phase step per star), and `spin` (rotation as a multiple of the orbit angle). `track` and `trackWidth` style the ellipse. `rgb` and `glowRgb` are comma-separated RGB channels.
- Optional orbit settings add `crackle: { period, at, duration, margin?, arc?, sparkColour? }` for a seeded burst of arcs and sparks on each cycle, in milliseconds. Set `copySaturation` to overlay a decorative filtered copy, `jitter` to move that copy horizontally during each burst, and `popMs` for a one-time star entrance. Omit these settings to disable them. The margin and jitter use the same units as the orbit radii.
- Beat loops run for the step's `dur` and cancel on skip. `target` optionally selects a descendant of the clone, and `signal` lets the game stop the loop early. For a live element, `startPulse(el, settings, { speed, signal })` and `startIdle(el, settings, { speed, signal })` return stop functions. Stopping removes the animation and any canvas. Reduced motion and `'instant'` keep the game's still state.

### Text, line, reticle and debris settings

The [lab panels](fake/retrofit/index.html?lines) show the four effects. Times are spec milliseconds.

- `text` with `typewriter: true` reveals words over `dur` in proportion to their length. Use `typewriter: { unit, pace, progress }` for `'word'` or `'letter'`, fixed milliseconds per word or non-whitespace letter, or a narration progress callback returning 0–1. Returning undefined uses timed pacing. Text keeps its centring and rise by default. Set `textAlign` or `rise: false` to match the source layout. K460: a plain `text` step takes `colour` (else `--fx-text`) and `rise: false` too. Unread text stays in layout, painted transparent. Browsers without CSS Custom Highlights show all text immediately.
- `dash-line` follows the live elements from the layer's `resolve`. Without it, the line uses timeline rectangles. Pass the stage lookup as `stage` in the layer options for the target's original dimensions or a separate source zone. Set `hideInsideTarget: true` to hide the line when the source centre is inside the target. `from` defaults to the actor id. `to` is the other id. Set `dash`, `gap` and `width` in stage pixels, `speed` in stage pixels per second, CSS `colour`, stroke `cap` and optional CSS `filter`. It runs for `dur`.
- `reticle` closes four brackets on the actor or a stage `box`. Set comma-separated RGB `colour`, initial/final `padding`, bracket `length` and stroke `width` in pixels before scaling by `unit`. Set `closeMs` and the `fade` start/end pair.
- `debris` takes a `count`, deterministic `seed`, `unit` scale, horizontal/upward `spread`, downward `gravity` as the distance at the end of the fall, `spin` in degrees, rectangle `size`, CSS `colour`, `delay`, motion `ms` and the `fade` pair measured after the delay. `fade: false` holds full opacity. `groupFade: true` fades the composited pieces together. `backwards: true` paints the starting pose during the delay. Optional `easeMotion` maps normalized motion time. Authored `pieces` can set a local pivot `at`, starting `offset`, ending offset `travel`, `spin`, start/end `scale`, `growOpacity`, and a CSS `colour`, SVG path `shape` or local canvas `paint(ctx, progress)`.
- End and skip clear the line and canvas effects and reveal the whole text. At instant speed the player omits these overlays, so keep the finished text in the live UI and hide its source only during the beat. For a held reduced-motion variant, use the `text` option with `progress: () => 1`.
### WebGL and crumple

- `registerGlEffect(verbs, name, draw, fallback?)` shares one `canvas.fx-gl` per effect layer while its verbs run. `draw(gl, t, fx)` gets WebGL2, spec milliseconds, the actor centre and the layer's CSS-pixel `width` and `height`. Set your program and bindings on each draw. The layer clears colour once per frame and depth between effects. Register buffer, texture and program disposal with `fx.onCleanup(fn)`. Natural end, skip, `layer.end(run)` and `layer.clear()` release live calls and the last call releases the context.
- `fallback(ctx, t, fx)` draws in CSS pixels on the shared canvas when WebGL2 is unavailable or lost. The layer isolates each 2D draw with save and restore.
- `crumple` takes same-origin `image` artwork as a URL, loaded image or canvas. Use a loaded image or canvas for the first frame. Set `hideSource` on the actor if needed and supply `to` or a stage `destination` rect to throw the folded piece. `meshSize` overrides the actor's dimensions. The 2D path scales and rotates the artwork through the same choreography.
- `seed`, `grid`, `creases` and `jitter` set the mesh. `creaseReach`, `creaseSlope` and `creaseWidth` set crease placement and shape (pairs are base and random range). `creaseStart` is the base, stagger and random range in progress fractions, and `creaseRamp` sets the time each crease takes. `creasePull`, `footprint`, `cornerPull` (base and edge), `edgeDepth`, `dent` (depth and plane) and `depthCap` control compression and relief.
- `radius` is a fraction of image height. `perspective` is in mesh heights. `back` is RGB in 0–1, and `backGradient` adds brightness down the back face. `light` is a direction, `diffuse` is ambient and directional strength, `shine` is exponent and strength, and `alphaCutoff` clips the texture's transparent edges.
- `foldMs`, `holdMs`, `throwMs`, `squashMs`, `settleDelay` and `settleMs` control timing in spec ms. `foldPower` eases fold progress. `tilt` sets x/y/z angles in degrees, `initialTilt` applies the full tilt from the first frame, `turn` sets throw rotations and `wobble` adds degrees during the hold.
- `lift` is preflight scale gain and duration in ms. `arc` is the rise in actor heights and `airScale` adds scale at the apex. `endScale` overrides the destination width ratio. `squash` sets width gain, height loss and drop in actor heights, and `sink` sets final scale loss and drop in destination heights. `jiggle` takes a duration `ms` and `frames` as pairs of time fraction and offset in destination widths.
- `fadeOut` defaults to off. Use `true` to disappear at landing (or at fold end without a throw), or `[start, end]` in spec ms for a linear fade. Optional `shadow` takes a CSS `colour`, `blur` and ground/air `offset` in mesh heights, horizontal `side` as a fraction of offset, ground/air-loss `alpha` and a `width` multiplier.
- `crumpleStill(image, width, height, settings)` returns a PNG data URL for a landed piece from loaded artwork. The game can cache and display it at the destination. Its `tilt` sets final x/y/z degrees, and its `sink` sets final scale loss and drop. See the [crumple lab](fake/retrofit/index.html?crumple).
### Staging

- `cameraPull(root, overlay, settings)` holds the camera's `scale` about CSS `origin` and a shade with opacity `dim` and CSS `dimBackground`. `pullMs`, `dimMs` and `releaseMs` are ms at `speed: 1`. The returned function skips and restores the board immediately. Await `dimmed` to cue the next beat. Its `release()` eases the board and shade back, then cleans up.
- `cameraScaleAt(t, at, end, { scale, enter, exit })` samples a push that returns to 1, with times in ms. `cameraPush(root, onChange?)` applies that scale with `frame(scale, focus, shake?)`, using root coordinates and px. Call `end()` to restore the root.
- `letterboxBanner(parent, settings)` adds a HUD to a positioned parent. Set `barHeight`, `lineWidth`, `vignetteBlur` and `vignetteSpread` in px, and provide CSS `barBackground`, `lineColour`, `vignetteColour` and `textStyle`. `text` goes in the top bar, with `enter`, `exit`, `textIn` and `textOut` in ms. Call `frame(t, at, end, camera?)` to sample it, optionally countering the supplied camera scale, focus and shake. Call `end()` to remove it.
- `drawPlasmaOrb(ctx, x, y, radius, t, empty, boost?, settings?)` draws a canvas frame in px at time `t` in ms. `arcCount`, `filaments` and `motes` set counts. `pulsePeriod` is ms, `pulseAmount` and `swell` are scale fractions, and `plasmaSwellAt(since, peak?, half?)` computes the boost with all times in ms. `palette` supplies CSS colours, gradient stops and comma-separated RGB for arcs. `geometry` supplies radii, offsets, sampling counts, line widths and arc shape relative to `orbGeometry`.
- `drawDriftCloud(ctx, options)` takes canvas dimensions `w` and `h`, pixels per unit `u`, time `now` in ms, playback `scale`, `cohorts`, a source image lookup `art(id)` returning `{ img, w, h }`, and `empty`. `syncDriftCloud` retains cohorts by id, delays held ids and retires older ones. Settings cover `pieceCount`, `cohortCount`, cohort phase, source `shards` (triangle coordinates in percent) and `survivors` (indices), fragment sizes, angles, drift speeds in units/s, spin in degrees/s, lifecycle times in ms, opacity and edge fade, ember look and idle ring geometry. Use the same settings for drawing and cohort sync.
- `pileLift(el, settings)` holds the live pile at CSS `lift` (translate), `scale` and `shadow` (filter). Set `liftMs`, `settleMs`, `liftEase`, `settleEase` and playback `speed`. The controller exposes the `lift` animation during animated playback. The caller cues `settle()` when the card arrives and calls `end()` after settling or on skip.
- For instant playback (`0` or `'instant'`), pass `speed` to the camera pull, camera scale sampler, letterbox, orb and pile settings, or as the third argument to `cameraPush` in `{ speed }`. The camera stays at rest, the HUD is skipped, the orb keeps its steady active or empty appearance, and the pile lifts and settles immediately. Pass the same value as the cloud playback `scale` to skip fragments while preserving the empty outline.
- Use `createAmbience` to host the orb and cloud and `destroy()` to remove either canvas. Closing-scene callers can use the existing banner, stamp and particle helpers for the adjoining beats. See the [staging lab](fake/retrofit/index.html?staging).

### Sheen, drift and slash

- `sheen` sweeps a clipped gradient over the actor. Set `angle` in degrees,
  `bandWidth` as a percentage of the actor and `colour` as CSS colour.
  `stops` gives the two transparent gradient stops in percent. `travel`
  gives the start and end translation along the gradient axis as percentages of the band.
  Set `loop: true` and `period` in ms to repeat within the step.
  `sweep` gives the start and end fractions of the cycle and `easing`
  applies during the sweep. The game triggers the step.
- `idle` with `kind: 'drift'` travels from rest to `drift: { x, y, scale }`
  and back over `period` (default 40000 ms). Offsets are in pixels.
- `slash` grows and fades `count` strokes over `to` or the actor's rect.
  `angle` (degrees) and `length` use the normalized target box.
  `spacing` is a fraction of its width. `colour` accepts an RGB triplet
  string or a list of triplets, one per stroke, repeating as needed.
  `width` is in pixels. Set `stagger`, `drawMs` and the two `fade`
  times in ms. `coreColour`, `coreWidth` (a fraction of `width`),
  `alpha` and `coreAlpha` set the two stroke passes.

## Glitch (opt-in)

`createGlitch(el, opts)` plays a broadcast-style burst (a two-colour split, slices at random positions per burst from `seed`, a dropout frame, an optional repeat) on a wordmark every few seconds, and a longer `tear` (8 frames) by hand for victory or defeat. Look: `looks/glitch.css` (class `fx-glitch` is added to `el`); the colour copies and slices are copies of the element's own content (text or markup, ids removed), coloured by `--glitch-a` and `--glitch-b`. Give the `mask` option (or `--glitch-mask`) only when the face is an image or SVG that a copy cannot recolour: the layers then become flat colour cut to that shape. Options: `colours`, `slices`, `idleMs`, `burstMs`, `tearMs`, `dropout`, `repeat`, `repeatGapMs`, `split`, `jump`, `burstSteps`, `jumpRange`, `skewDeg`, `blankLetters`, all also CSS variables (`--glitch-a`, `--glitch-b`, `--glitch-split`, `--glitch-jump`, `--glitch-dropout`). `burstMs` may be `[min, max]` (drawn per burst from the seed); `burstSteps` (number or `[min, max]`) makes a burst that many hard steps driven by one timer each (every step redraws slices, jumps and the split side); `jumpRange` `[min, max]` (% of width) draws each slice jump exactly in that range, sign random. `skewDeg` `[min, max]` (degrees) skews exactly one frame per burst by an angle in that range, sign random (stepped or plain burst); `blankLetters` `[min, max]` swaps that many letters of the text face for a non-breaking space on one frame, restored on the next frame, at the burst's end, on motion off and on `destroy()` (text faces only; ignored with `mask`). Without them the burst is as before. Import `looks/glitch.css`, or the layers sit in the page flow. While `speed()` is `'instant'` no timer is scheduled at all and `burst()` / `tear()` do nothing; call `update()` when the setting changes and it restarts. Under `prefers-reduced-motion` the CSS shows nothing. `destroy()` clears everything.

```ts
import { createGlitch } from '../kit/effect-library/index'

const logo = document.querySelector<HTMLElement>('#logo')! // e.g. <h1 id="logo">SIGNAL</h1>
const glitch = createGlitch(logo, {
  speed: () => 1, // the player's speed; 'instant' stops every timer
  colours: ['#e5484d', '#74b9e5'],
  seed: 7,
})
glitch.tear() // victory or defeat; glitch.burst() plays one on demand
glitch.update() // after the speed setting changed
glitch.destroy()
```

## K449: collapse, count, banner, glow end, cracked stamp

- `unroll` with `reverse: true` collapses the actor on `axis` (`origin` default centre) to a line and ends at opacity 0. `colour` lights the line (brightness and a glow), `lineMs` holds it, `gutter` flickers it that many times before it goes out; `lineMs` scales with the speed. Without `reverse` it is unchanged.
- `count` shows a number on the actor counting from `from` (default 0) to the step's `to` over the call, easing out (the same `countUp`); `prefix`, `suffix`, `colour` (default `var(--fx-text)`). A skip shows `to`.
- `banner` unrolls the actor on `axis` (default `x`), shows `text` in a centred child (`data-fx-part` `banner-text`), holds, then fades the actor out; it ends at opacity 0 with the child removed. `unrollMs` and `fadeMs` default to 30% of the step each; `textAt` is when the text shows; `textFrames` (`{ at, opacity, scale }`, `at` ms from the step's start, as in `letterboxBanner`) drive the text instead.
- `glow` with `end: 'dark'` starts lit and dims to off, and ends dark (inline shadow `0 0 0 0`), where a plain `glow` ends at rest.
- `stamp` with `cracked: true` (or `{ colour }`) adds a crack overlay (`data-fx-part` `crack`, an SVG of jagged lines in `currentColor`) over the label that appears at the press and stays with the label.
- Lab: `fake/retrofit/index.html?herald`; `node fake/retrofit/herald-sheet.mjs out.png` makes a contact sheet.
