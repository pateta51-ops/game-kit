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
