# Warp’s Edge motion settings

Source at `449af55`

- `src/ui/fx/flight.ts`
- `src/ui/fx/warpIn.ts`
- `src/ui/fx/timing.ts`
- `src/ui/fx/evasion.ts`
- `src/ui/fx/power/sortie.ts`

The pass coordinates and start offsets below are lab fixtures. Resolve the corresponding points and timings from the game at runtime.
Place each evasion actor at its fixture's `from` point and pass `to` and
`quadratic` to `arc-move`. For `trail`, include that pass's `quadratic`
inside `ribbon`. Combine the sortie settings and the selected timing
profile with the game's `stops` inside the `multi-stop-path` step's `path`.

```ts
const pass = {
  blend: 0.85, lookAhead: 0.02, nose: 148, rollAxis: 148, rollSquash: 0.15,
  reverseBrightness: 0.62, juke: 26, fadeSlope: 6,
  afterimages: { count: 4, spacing: 28, opacity: 0.32, filter: 'brightness(.7) sepia(1) hue-rotate(160deg) saturate(4)' },
};

export const warpsEdge = {
  arrival: {
    dur: 560,
    cubic: {
      controls: [0.18, 0.75, 0.28, 0.7], minLift: 24, startScale: 0.14,
      bank: 70, lean: 38, levelFrom: 0.62, curvature: 14, leanIn: 0.2, fadeIn: 0.12, perspective: 700,
    },
  },
  evasion: [
    { t: 250, dur: 650, from: [930, 790], to: [760, 300], quadratic: { ...pass, control: [700, 560], roll: [0.35, 0.7], side: 1 } },
    { t: 1250, dur: 650, from: [430, 300], to: [330, 800], quadratic: { ...pass, control: [520, 560], roll: [0.3, 0.68], side: -1 } },
    { t: 2250, dur: 520, from: [900, 770], to: [470, 330], quadratic: { ...pass, control: [820, 280], roll: [0.25, 0.6], side: 1 } },
    { t: 2770, dur: 480, from: [470, 330], to: [1280, 110], quadratic: { ...pass, control: [280, 300], blend: 0.7, exitScale: 0.28, exitFade: 0.85 } },
  ],
  ribbon: { rear: 176 * 0.42, width: 12, tipWidth: 2, fade: 0.7, colour: '120,220,255', samples: 13, spacing: 12 },
  sortie: {
    padding: [52, 32], nose: 0, headingSample: 3, roll: 0.28,
    ghosts: { count: 4, spacing: 24, opacity: 0.18 },
  },
  sortieTimings: {
    overdrive: { launch: 640, travel: 300, lap: 560, hop: 260, back: 400 },
    outmaneuver: { launch: 1300, travel: 300, lap: 440, hop: 0, back: 380 },
    whirlwind: { launch: 700 * 1.3, travel: 0, lap: 300 * 1.3, hop: 0, back: 0 },
  },
} as const;
```

## Beams and transfers

Source at `449af55` under `src/ui/fx/`. Supply stage points, artwork, and the runtime scale from the game.

```ts
const streakPalette = ['255,140,210', '170,220,255', '235,245,255'] as const;
const vortex = (u: number, phone: boolean) => ({
  size: phone ? 390 : 820 * u,
  stroke: '#ff7ac4', strokeWidth: phone ? 1.6 : 2.2, alpha: .42,
  background: 'radial-gradient(circle, rgba(229,0,125,.34), rgba(229,0,125,.1) 42%, transparent 66%)',
});
const iconSize = (u: number, phone: boolean) => phone ? 170 : 340 * u;
export const beams = (u: number, phone: boolean, markerSize: number, flightMs: number) => ({
  // warpLook.ts, warp.ts and timing.ts
  departStreaks: { t: 1880, dur: 440, unit: u, count: 110, seed: 71, alpha: .9, palette: streakPalette },
  arriveStreaks: { t: 0, dur: 320, unit: u, count: 90, seed: 72, alpha: .85, inward: true, palette: streakPalette },
  departMarker: { t: 1120, dur: 1200, mode: 'portal', glowColour: '#e5007d', lift: 60 * u,
    portal: { startSize: markerSize, endSize: iconSize(u, phone), travelMs: 300, elapsed: 300,
      alpha: .5, collapse: [540, 780], vortex: { ...vortex(u, phone), open: [80, 480] } } },
  arriveMarker: { t: 0, dur: 1800, mode: 'portal', glowColour: '#e5007d', lift: 60 * u,
    portal: { startSize: iconSize(u, phone), endSize: markerSize, outward: true, travelAt: 1400, travelMs: 400,
      alpha: .5, growth: [80, 480], collapse: [1400, 1650], vortex: { ...vortex(u, phone), open: [80, 480] } } },
  spiral: {
    unit: u, squash: phone ? 1 : .62, orbit: .2, lift: phone ? 14 : 34 * u,
    tail: [120, 220, 255], tip: [255, 90, 190], engine: '120,220,255', ribbonReach: phone ? 1.4 : 1,
    afterimageFilter: 'brightness(.7) sepia(1) hue-rotate(160deg) saturate(4)',
  },
  // power/pulseLook.ts and power/blocks.ts
  pulse: { lift: 180 * u, flightMs, colour: '143,230,42', core: '240,252,255' },
} as const);
```

For the `warp-transfer` step's `spiral`, derive `parked` and `heading` from `shipOf` in `warpLook.ts` and `image`, `nose` and `flip` from the artwork in `src/ui/table/shipBoard.ts`. Schedule departure at the departure origin and arrival at the arrival origin. Pass `pulse` inside a `radial-streaks` step with `unit: u` and `dur: flightMs + 200`.

For the tractor ride from `tractor.ts` and `timing.ts`, stagger the starts by 120 ms using step `t` and set `dur: 1200`. In the step's `curve` set `unit: u`, `colour: '127,230,255'`, `moteColour: '200,250,255'`, and `sparkColour: 'rgba(170,240,255,1)'`. Choose `control` halfway between the endpoints horizontally and 190 × u above the higher endpoint for the bag, or 140 × u otherwise. Use `size: [40, 34], tuck: true` for the bag and `size: [40, 72], tuck: false` otherwise. The original delays are scan 0–220 ms, lock 150–320, carry 260–860, inhale 820–980 and retract 860–1040. Counter updates, bag and landing element transforms and source visibility stay with the game.

The game assembles the departure, prompt hold, banner and arrival around the marker and streaks. Board and backdrop changes, flash and ring, banner, card flip and game-specific camera, marker and target selection stay in the game. Pulse rings, impact, damage and readout stay separate from its flight ribbon.

## Signals

Sources under `src/ui/fx/` at `449af55`. The frame and other stun layers use their own source timings.

```ts
// power/frame.ts. Place the actor over the 54u-high top bar. The stamp is
// multiplied by the frame's opening/closing envelope.
const powerName = (name: string, u: number, ms: number) => {
  const seg = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  const n = Math.ceil(ms / 4);
  return {
    dur: ms, ease: 'linear', text: name.toUpperCase(),
    style: { inset: '0', width: '100%', height: '100%', border: 'none', background: 'transparent',
      font: `800 ${26 * u}px "Roboto Mono",monospace`, letterSpacing: '.3em', color: '#ffe600',
      textShadow: `0 0 ${14 * u}px rgba(255,230,0,.8),0 2px 3px #000` },
    frames: Array.from({ length: n + 1 }, (_, i) => {
      const t = ms * i / n;
      const k = seg(t, ms - 260, ms);
      const closing = k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      const frame = (1 - (1 - seg(t, 0, 260)) ** 3) * (1 - closing);
      return { opacity: seg(t, 80, 260) * (1 - seg(t, 900, 1100)) * frame };
    }),
  };
};

// idle.ts, timing.ts. Play for the duration of the stunned view.
// For continuously evolving noise, set the internal period and omit loop.
const idle = (dur: number, u: number) => ({
  dur, buzz: { period: 1700, window: [600, 740], peak: .2, brightness: [.79, 1.35],
    noiseMs: 18, saturation: .8, jitter: [.8 * u, 0] },
});

// looks.ts, timing.ts. Starts at 430 ms alongside the electrical arcs.
const stun = (u: number) => ({
  dur: 530, buzz: { window: [0, 530], power: .6, brightness: [.55, 1.9], threshold: .2,
    noiseMs: 22, hue: 10, jitter: [2.5 * u, 2 * u], jitterMs: [9, 11], timeOffset: 430 },
});

// looks.ts, timing.ts. Use measured pip boxes local to the actor. Resolve
// empty/lit/background from the skin, with #fe1a89, #07afea, #63bd04 as
// the lasers, maneuvers and energy fallbacks for lit. Start at the first sweep.
const fill = (from: number, to: number, boxes: readonly (readonly [number, number, number, number])[],
    radius: number, empty: string, lit: string, background: string, rgb: string, gap = 70) => {
  const u = (boxes[0]?.[3] ?? 12) / 12;
  return {
    from, to, dur: (Math.max(1, to - from) - 1) * gap + 323, colour: lit,
    pips: { boxes, empty, background, radius, gap, sweep: 91, edge: [.12, .02], edgeColour: '#fff',
      flash: { start: 63, end: 323, peak: .15, colour: 'rgba(255,255,255,.45)',
        outline: `rgba(${rgb},.9)`, blur: 10 * u, width: 3 * u } },
  };
};

// shield.ts, shieldLook.ts, timing.ts. The actor box is the pin centred on the
// starting cell. Hide the destination pin while the stand-in plays.
const shieldPin = (from: number, to: number, delta: readonly [number, number]) => ({
  from, to, dur: 770, colour: to > from ? 'rgb(99,189,4)' : 'rgb(120,220,255)',
  pin: { delta, window: [0, 420], glow: { radius: 46, alpha: .9, tail: 300, peak: .6 },
    ring: to < from ? { start: -100, end: 350, from: 14, to: 40, colour: 'rgb(255,60,60)', width: 3 } : undefined },
});
```

### Combat

Source `449af55`, `src/ui/fx/attack.ts`, `attackLook.ts`, `attackPlan.ts`, `timing.ts`, `blast.ts`, `shield.ts`, `shieldLook.ts`, and `power/{blocks,backlash,pulsePlan,sigPlan}.ts`.

- `projectile` with `bolt: 'streak'` starts at the source card midpoint and .35 of its height. Aim at the target's centre or at .97 of the bubble radii at the impact angle. `travelMs: 170`, `tail: .25`, `width: 13`, `coreWidth: 3.5`, `alpha: .6`, `colour: '255,60,50'`, `core: '#ffe9e0'`, `headColour: '255,80,60'`, `spotColour: '255,90,60'`. The first shot fires at 200 ms, the second at 330 and further shots every 70 ms. Single-damage shield attacks add a decorative shot at 270 ms. Use `unit: Math.min(2.8, sourceWidth / 148)`.
- For the power flight trail use `bolt: 'ribbon'`, `travelMs: 300`, `lift: 70 * unit`, and `core: 'rgb(240 252 255)'`. The default `alpha` and `coreAlpha` reproduce the outer and inner fade multipliers in `power/blocks.ts`. Supply the power's own RGB colour and override the path times and lift when its plan uses a different profile. The game draws the moving token and decides which phase to play.
- Removed-token `dissolve` uses `lift: { distance: 40 * unit, spin: 1.5, fade: [200,380], ms: 380, unit, colour: '255,122,46', smoke: { seed: 91 + i, rgb: '40,38,46' } }`. Start on the plan's removal time (760 ms in the full sequence) plus 60 ms per token. Keep the step alive for smoke through the last puff.
- `shatter` uses `count: 24`, `grid: [3,4]`, `jitter: [22,16]`, `seed: 42`, `motionSeed: 7`, `impact` at [.52,.46] of the card, `delay: 640`, `ms: 720`, `drag: 380`, `coolMs: 420`, `perspective: 1100`, `hotColour: '255 210 40'`, and `coolColour: '255 110 40'`. Pass the scan or cut-out as `clipSource`; the cut-out also supplies its local `sourceBox` and `flip`. Pass the scene scale as `unit`.
- The destroy shockwaves reach stage radii of `260 * unit` and `190 * unit` in `blast.ts`. Use `ring-pulse` centred on the blast impact with `delay: 660`, `dur: 1120`, `colour: '160 220 255'`, `unit`, and `shockwaves: [{ delay: 0, ms: 460, radius: 260, width: 22, alpha: .6, squash: .88 }, { delay: 60, ms: 400, radius: 190, width: 30, alpha: .3, squash: .88 }]`.
- `shield-bubble` uses `centre`, `radius` and `hex` from the visible bay fit. Before fitting, use .58 times each target dimension for radii and `Math.max(6, Math.min(width,height)/22)` for hex size. Set `hitAngle` with `atan2((fromY-cy)/ry, (fromX-cx)/rx)`, `hit` to shot arrival, `attack: true` for a regular attack, and `breaks` when a final hit breaks the shield. Set `outline: 1.4`, `colour: '92,201,255'`, `rimColour: '190,245,255'`, `cellColour: '140,230,255'`, `breakColour: '160,235,255'`, `glowColour: '120,220,255'`, `core: '255,255,255'`, and `sparkColours: ['180,240,255','255,200,170']`.

The game supplies the event-to-beat plan, audio cues, meters, stun and attack labels, geometry for the two board modes, scrolling anchors, and the discard and wreck destinations. Source lunge, vignette, hull scorch, breach overlays, recharge fill, the flash and tear anticipation, debris, and carry to the wreck pile remain companion drawing.

For the shield recharge field, use `recharge: { assemble: [520,1080], hum: [1000,1400], settle: [1080,1600], scanColour: '160,255,200', scanCore: '200,255,230' }` and `unit: hex / 15`. The game still owns the source token, meter stream and position.

### End-screen rings

At `449af55`, `src/ui/table/endscreen.css:650,897` brings vortex rings in from 320° and 1.3 scale over `3600 * k` ms with `cubic-bezier(.2,.6,.35,1)` and per-ring delays of `(200 + i * 350) * k` ms. For the ring’s relative entry rotation use `spin` with `turns: 320 / 360`, `direction: -1` and `scaleFrom: 1.3`. The separate vortex arms roll in from −540° over `5100 * k` ms with `cubic-bezier(.25,.6,.3,1)`. Both source animations are finite. For a continuous ring variant, use `endless: true`, `turns: 1` and a `period` in ms, with `dur` covering the time the ring is shown.
## Menu pulse and idle (K352)

All sources below are at `449af55`.

- `src/ui/theme/menus.css:181–209`: use `pulse` with `period: 5000`, `easing: 'ease-in-out'`, and `frames: [{}, { opacity: 0.6 }, {}]`. For live use, give the animated highlight its own element with the game's pseudo-element look (5.875 × 0.4375 rem, right 2.6875 rem, top 1.375 rem, skewX −35°, repeating horizontal gradient `#7ae6fb 0 1.5rem, #122b38 1.5rem 2.125rem`, shadow `0 0 0.875rem #4bcae977`).
- `src/ui/fx/idle.ts`, `looks.ts`, `kit.ts` and `timing.ts` supply the stun idle settings below. Apply the breathing keyframes to a separate glow element. The unit is card width ÷ 148, or min(width, height × 0.72) ÷ 148 for sections. The glow uses the original half-cosine curve, sampled into linear keyframes.

```ts
const breathe = (unit: number) => ({
  kind: 'breathe',
  period: 2400,
  easing: 'linear',
  frames: Array.from({ length: 25 }, (_, i) => {
    const breath = (1 - Math.cos(2 * Math.PI * i / 24)) / 2;
    const colour = `rgba(255,63,164,${String(0.3 + 0.3 * breath)})`;
    return {
      outline: `${String(2 * unit)}px solid ${colour}`,
      boxShadow: `0 0 ${String((10 + 14 * breath) * unit)}px ${colour}`,
    };
  }),
} as const);

const stunIdle = {
  kind: 'orbit', period: 2200,
  orbit: {
    referenceWidth: 148, radii: [70, 18], centerY: -4, phaseMs: 320, count: 3,
    size: [10, 15], alpha: [0.6, 1], twinkle: [0.75, 0.25, 90, 2], spin: 0.6,
    track: 'rgba(255,200,230,0.18)', trackWidth: 2, rgb: '255,236,150', glowRgb: '255,120,200',
    crackle: {
      period: 1700, at: 600, duration: 140, margin: 44,
      arc: { hz: 35, rgb: '255,63,164', jag: 7, segments: 6, width: 1.3, fork: false },
      sparkColour: 'rgba(255,200,240,1)',
    },
    copySaturation: 0.8, jitter: 0.8, popMs: 260,
  },
} as const;
```

Set `popMs: 0` when handing off from the 960 ms onset, which starts the stars at 640 ms and finishes their pop at 900 ms. For sections, use `count: 0` and `trackWidth: 0` and omit the copy and jitter settings. Warp’s 2D ships use their own arcs. Stop both idle loops when the stun ends.
## Target lock

Use `reticle` over the target box with `padding: [18, 6]`, `length: 16`, `width: 2`, `closeMs: 220`, `fade: [520, 660]`, and `dur: 660`. The original scales the bracket dimensions with the caller's unit. For the standard power look the unit clamps source box width divided by 148 to the range 0.45–2.5. Its RGB is `61,155,255` for Electro Bot, `25,195,255` for maneuver, and `255,42,143` for other tones. The signature look uses `255,230,0` and offsets the step start to its own lock cue.

Source: `src/ui/fx/power/blocks.ts`, `src/ui/fx/power/look.ts` and `src/ui/fx/power/sigLook.ts` at `449af55`.

## Endscreen fall

The cited keyframe at this revision moves one ship image. Use `debris` with one authored piece anchored at the centre of the fitted element. Set `delay: 600`, `backwards: true`, `ms: 4500`, `dur: 5100`, `spread: [0, 0]`, `gravity: 0`, `fade: false`, and a sampler for CSS `cubic-bezier(0.55, 0, 0.75, 1)` as `easeMotion`. The same eased progress drives translation, rotation, and scale. Set the piece's `offset` to `[-0.14 * width, -0.10 * height]`, `travel: [0, 0]`, `spin: -28`, and `scale: [1, 0.55]`.

In the piece's `paint` callback, draw the original image with centred contain sizing. Interpolate saturation from 1 to 0.7 and drop shadow from transparent `#e5007d00` to `#e5007d88` with blur of one endscreen unit. Backwards fill shows the initial pose during the delay. Resume the live image at its final transform and filter when the overlay ends. Its original opacity stays constant through the 600 ms hold and the full 4500 ms fall. The separate vortex spin takes 5100 ms from −540° with `cubic-bezier(0.25, 0.6, 0.3, 1)` and belongs to the game.

Source: `src/ui/table/endscreen.css` at `449af55` (ship styles, vortex variant, and `wend-fall`).

The wreck shards use the separate `wend-burst` rule. For each authored delay `d`, group its shards into a `debris` step with `delay: d`, `backwards: true`, `ms: 1600`, and `fade: false`. Sample `cubic-bezier(0.12, 0.75, 0.3, 1)` for motion, with `gravity: 0`. Each shard starts at its original position and ends at its CSS `[--dx, --dy]` offset with `spin` set to `--rot` in degrees. Draw each clipped shard about the wreck box centre. Keep its constant opacity and retain the final pose in the live wreck when the overlay ends.

### Camera, letterbox, orb and drift

- `src/ui/fx/power/push.ts` and `power/frame.ts` at `449af55`. Sample `cameraScaleAt` with `enter: 500` and `exit: 300`, passing the action's signature zoom (1.03–1.07) as `scale`. Use the original table focus and shake. The game's scale-changed callback sets its measurement metadata and invalidates the token layer.
- `src/ui/fx/power/frame.ts` at `449af55`. Pass the action's name as `text`, `barHeight: 54 * u`, `barBackground: 'linear-gradient(#000, #050402)'`, `lineWidth: 2 * u`, `lineColour: 'rgba(255,230,0,.55)'`, `vignetteBlur: 260 * u`, `vignetteSpread: 40 * u`, `vignetteColour: 'rgba(255,200,0,.28)'`. Set `textStyle` to the source font (800, 26 × u px, Roboto Mono then monospace), letter spacing `.3em`, colour `#ffe600` and shadows `0 0 <14 × u>px rgba(255,230,0,.8), 0 2px 3px #000`. Use `enter: 260`, `exit: 260`, `textIn: [80, 260]`, `textOut: [900, 1100]`, and pass the matching camera pose to counter-scale the HUD.
- `src/ui/fx/portal.ts` and `timing.ts` at `449af55`. Use `arcCount: 7`, `filaments: 6`, `motes: 15`, `pulsePeriod: 3000`, `pulseAmount: 0.055`, `swell: 0.12` and `plasmaSwellAt(sinceLaunch, 100, 200)`. Pass the geometry below. The game supplies its existing canvas radius, plate, lit state and cadence (33 ms between paints while lit, 500 ms covered poll, 150 ms launch clear).
- Orb geometry and palette from the same commit:

```ts
const geometry = {
  haloRadius: 1.9, coreX: -0.1, coreY: -0.14,
  ringWidth: 1.5, ringStroke: 0.045, ringRadius: 0.54, ringDash: 0.27,
  referenceRadius: 34, filamentSamples: 110, filamentTwist: 0.18, filamentSpacing: 0.79,
  filamentRadius: 0.73, filamentWave: 0.14, filamentLobes: 3, filamentAspect: 0.8,
  filamentRotation: 0.45, brightEvery: 3, brightWidth: 1.2, filamentWidth: 0.6,
  filamentBlur: 5, angleStep: 2.399, angleWave: 0.12, arcPoints: 8,
  arcStart: 0.38, arcStride: 0.115, jagPoint: 7, jagArc: 9,
  jagSize: 0.09, arcOpacity: 0.43, arcPulse: 0.22, arcBlur: 7,
  forkPoint: 4, forkAngle: 0.7, forkLength: 0.22, moteRadius: 1.12,
  moteBands: 4, moteStride: 0.12, moteSize: 0.55, moteSizes: 3,
  moteSizeStride: 0.25,
};
const palette = {
  ring: '#68818c',
  halo: [[0, '#388abe88'], [0.35, '#188cc852'], [0.65, '#3152ad20'], [1, '#12244700']],
  core: [[0, '#f1ffff'], [0.16, '#b4faff'], [0.46, '#328fbfc9'], [0.72, '#367be075'], [0.92, '#78e4ff70'], [1, '#469bff00']],
  bright: '#baf5ffb0', filament: '#5aa7ff60', shadow: '#5ccaff', arc: '175,242,255', mote: '#a1edff80',
};
```

- `src/ui/fx/wreck.ts`, `blast.ts` and `timing.ts` at `449af55`. Pass the shard geometry and survivor indices below, equivalent to `SHARDS` and the first eight `SURVIVORS` in the pinned `blast.ts`. The source image lookup returns each cohort's cutout with its drawing dimensions. Use `u: pileWidth * (2.45 / 92)` and the source pile clock and animation scale. Pass held ids to `syncDriftCloud`. Keep the plate and cadence in the game. The cloud settings use the kit’s `triangles` helper from `effect-library/break-effects.ts`:

```ts
{
  shards: triangles(3, 4, 42, [22, 16]), survivors: [14, 9, 12, 8, 7, 23, 20, 11],
  pieceCount: 6, cohortCount: 4, cohortPhase: 0.37, variation: 24, angleStep: 2.399,
  life: 6000, emerge: 650, fade: [3300, 6000], firstGroup: 3, stagger: 120, secondPhase: 0.5,
  speed: [2.5, 0.7], speedBands: 5, spin: [9.17, -12.61], firstSize: 25, size: 12, sizeBands: 3, sizeStep: 3,
  startRadius: 7, aspect: 0.72, initialSpin: 0.4, shrink: 0.055, opacity: 0.85, cohortDim: 0.1,
  cutoff: 0.004, edgeFade: 0.7, emberEvery: 3, emberColour: '#eeb17a', emberOpacity: 0.6,
  emberSize: 0.5, minEmberSize: 1, ring: [26 * 0.41, 11 * 0.41, 3 * 0.41],
  ringColour: '#526573', dashColour: '#728591', lineWidth: 0.5, minLineWidth: 1,
}
```

### Menu sheen and signature slashes

From `src/ui/theme/menus.css` and `src/ui/fx/power/sigLook.ts`
at `449af55`. The primary menu button holds before and after the sweep.

```ts
{ do: 'sheen', angle: 110, bandWidth: 100, stops: [35, 65],
  colour: '#b6f6ff22', travel: [-110, 110], loop: true, period: 9000,
  sweep: [.65, .95], easing: 'ease-in-out' }
```

Start the slash at 620 ms and allow 340 ms for all three strokes.
Here `u` is the game's stage unit.

```ts
{ do: 'slash', count: 3, angle: Math.atan2(.9, .4) * 180 / Math.PI,
  length: Math.hypot(.4, .9), spacing: .2, width: 16 * u,
  colour: ['255,42,143', '255,230,0', '255,42,143'], coreColour: '240,252,255',
  alpha: .32, coreWidth: .19, coreAlpha: .9, stagger: 40, drawMs: 100,
  fade: [120, 260] }
```

For Overwhelm's secondary targets, draw one `particles.arc` per target
from the blast centre. Stagger by 50 ms, grow toward each target with
`ease.out(seg(t, start, start + 160))` and fade over 180–320 ms.
Set `jag: 20`, `width: 4`, `seed: 13 + i * 5` and alternate `rgb`
between the pink and gold above. The arc already draws a seeded side fork.

### Entrap and Randomizer

From `src/ui/fx/power/utilityLook.ts` and `utilityPlan.ts`
at `449af55`.

- Entrap. Move the card and a game-supplied hex-net actor together
  during the 700–1180 ms haul. Use a `flip` on the card and a parallel
  `scale` on the net for the closing cue. The grid has 5 columns by 7 rows,
  radius `16*u`, hex vertices at `.9*radius`, horizontal spacing
  `1.73*radius` and vertical spacing `1.5*radius`. Offset odd rows by
  `.87*radius`. Use a `1.5*u` stroke in `rgba(191,230,255,.7)`.
  Fade the net to zero from 1060 to 1180 ms. Rotate each hex around its
  own centre. Set its starting angle in `style.rotate` to
  `30 + (700 / 900) * (180 / Math.PI)` with a `deg` suffix, then give each hex the step
  `{ do: 'spin', actor: hexId, t: 700, dur: 480, turns: 1, period: 2 * Math.PI * 900, endless: true }`.
  Match their movement, scale and fade to the net.
- Randomizer. Give the three game-supplied faces their own actors.
  Use simultaneous `pulse` steps with sampled `translate` keyframes.
  In spec time `t`, face `i` is centered at
  `hub + [80*u*cos(a), 52*u*sin(a)]` with
  `a = -Math.PI/2 + i*2.094 - t/160`. Sample one linear period
  into `frames` with `period: 2 * Math.PI * 160` and
  `easing: 'linear'`. Each face is `30*u` across.
  Fade in from 520 to 640 ms and out from 940 to 1100 ms in the
  choose beat. When the game has the result, sample the 160–300 ms
  lock into the chosen angle, scale that actor to 1.4, add a gold
  `glow` and fade the other faces to .3. Keep selection in the game.
