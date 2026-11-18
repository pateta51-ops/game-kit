# Warp’s Edge motion settings

Source at `449af55`

- `src/ui/fx/flight.ts`
- `src/ui/fx/warpIn.ts`
- `src/ui/fx/timing.ts`
- `src/ui/fx/evasion.ts`
- `src/ui/fx/power/sortie.ts`

The pass coordinates and start offsets below are lab fixtures. Resolve the corresponding points and timings from the game at runtime.

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
const vortex = {
  stroke: '#ff7ac4', strokeWidth: 2.2, phoneStrokeWidth: 1.6, alpha: .42,
  background: 'radial-gradient(circle, rgba(229,0,125,.34), rgba(229,0,125,.1) 42%, transparent 66%)',
};
export const beams = {
  // warpLook.ts, warp.ts and timing.ts
  departStreaks: { t: 1880, dur: 440, count: 110, seed: 71, alpha: .9, palette: streakPalette },
  arriveStreaks: { t: 0, dur: 320, count: 90, seed: 72, alpha: .85, inward: true, palette: streakPalette },
  departMarker: { t: 1120, dur: 1200, mode: 'portal', glowColour: '#e5007d', liftAtUnit: 60,
    portal: { travelMs: 300, elapsed: 300, alpha: .5, collapse: [540, 780], vortex: { ...vortex, open: [80, 480] } } },
  arriveMarker: { t: 0, dur: 1800, mode: 'portal', glowColour: '#e5007d', liftAtUnit: 60,
    portal: { outward: true, travelAt: 1400, travelMs: 400, alpha: .5, growth: [80, 480], collapse: [1400, 1650], vortex: { ...vortex, open: [80, 480] } }, },
  spiral: {
    squash: .62, orbit: .2, liftAtUnit: 34, phoneSquash: 1, phoneLift: 14,
    tail: [120, 220, 255], tip: [255, 90, 190], engine: '120,220,255', phoneRibbonReach: 1.4,
    afterimageFilter: 'brightness(.7) sepia(1) hue-rotate(160deg) saturate(4)',
  },
  // power/pulseLook.ts and power/blocks.ts
  pulse: { liftAtUnit: 180, colour: '143,230,42', core: '240,252,255', tailMs: 200 },
  // tractor.ts and timing.ts
  curved: { dur: 1200, stagger: 120, colour: '127,230,255', moteColour: '200,250,255',
    sparkColour: 'rgba(170,240,255,1)', bag: { size: [40, 34], tuck: true, controlLift: 190 },
    rest: { size: [40, 72], tuck: false, controlLift: 140 } },
} as const;
```

For the spiral, derive the parked box and heading from `shipOf` in `warpLook.ts` and the artwork nose, mirror and aspect ratio from `src/ui/table/shipBoard.ts`. Schedule departure at the departure origin and arrival at the arrival origin.

Choose the curved beam control point halfway between the endpoints horizontally and `controlLift` above the higher endpoint. The original delays in a curved ride are scan 0–220 ms, lock 150–320, carry 260–860, inhale 820–980 and retract 860–1040. Counter updates, bag and landing element transforms and source visibility stay with the game.

The game assembles the departure, prompt hold, banner and arrival around the marker and streaks. Board and backdrop changes, flash and ring, banner, card flip and game-specific camera, marker and target selection stay in the game. Pulse rings, impact, damage and readout stay separate from its flight ribbon.

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
