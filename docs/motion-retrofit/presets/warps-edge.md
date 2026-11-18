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
