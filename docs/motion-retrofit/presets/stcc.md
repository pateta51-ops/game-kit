# Star Trek: Captain’s Chair motion settings

Source at `a69c8dac` under `src/ui/motion/effects/`.

```ts
const transferColours = {
  dilithium: { colour: '232 160 224', glowColour: '#f5b8ee' },
  latinum: { colour: '245 210 71', glowColour: '#f5d247' },
  glory: { colour: '108 196 255', glowColour: '#6cc4ff' },
};

export const stcc = {
  // resourceWarp.ts, resources.ts, gloryPlaced.ts, dismissed.ts
  gain: { mode: 'column', stagger: 110, maxCopies: 4, lightColour: 'rgb(240 250 255)' },
  spend: { mode: 'zip', stagger: 60, maxCopies: 6 },
  totalLabel: { ms: 1700, gainColour: '#8be89c', spendColour: '#ff9a80',
    font: (size: number) => `700 ${size}px/1.15 var(--label-font, 'Antonio', 'Barlow Condensed', sans-serif)` },
  transferColours,
  gainBump: { mode: 'bump', dur: 300, counterColour: '#ffd36a' },
  gloryChipFadeMs: 140,
  dismissal: { liftMs: 160, liftShare: .06, afterPayMs: 250 },
  // actionIcons.ts
  action: { mode: 'rise', dur: 560, glowColour: '#9bd6ff', liftShare: .14,
    popMs: 300, greyMs: 300, spendGapMs: 300, phoneBumpMs: 420, phoneSpendColour: '#ff9a80' },
  // warp.ts
  jump: {
    dur: 1497, outMs: 640, gapMs: 140, inMs: 640, n: 16, reach: 2.4, length: 1.5,
    colour: 'rgb(255 255 255 / .95)',
    pointLight: 'radial-gradient(circle, rgb(255 255 255) 0 12%, rgb(190 225 255 / .75) 26%, rgb(127 200 255 / 0) 62%)',
  },
  // beam.ts, awayTeams.ts
  beam: {
    dur: 1000, colour: '127 231 255', glitter: 56,
    columnLight: 'radial-gradient(ellipse 46% 50% at 50% 55%, rgb(225 250 255 / 0.9), rgb(150 235 255 / 0.45) 45%, rgb(127 231 255 / 0.12) 70%, rgb(127 231 255 / 0) 85%)',
    coreLight: 'radial-gradient(ellipse 50% 50% at 50% 55%, rgb(255 255 255 / 0.95), rgb(200 245 255 / 0.6) 40%, rgb(127 231 255 / 0) 80%)',
    speckColour: 'rgb(240 250 255)', speckGlow: 'rgb(150 225 255 / 0.85)',
  },
  chipBeam: { dur: 800, glitter: 40, speck: 3, phoneSpeck: 3.4, core: true },
  crossing: { mode: 'crossing', dur: 532, colour: '127 231 255', lightColour: 'rgb(240 250 255)' },
  // incidentBeacon.ts
  beacon: { dur: 1600, turns: 2, beamDeg: 46, fadeMs: 160, colour: '255 40 28' },
} as const;
```

A resource gain drops the icon for 240 ms, holds for 60, starts the 420 ms source column, launches the crossing light 210 ms into that column and starts the 320 ms arrival column 336 ms later. The first landing label starts 179.2 ms into arrival. A spend runs a 200 ms zip with three ghosts at 22 ms intervals, a 130 ms icon flash and 250 ms sparks. The game supplies the artwork, count caps, source and destination boxes, and the total label's placement and sign. On desktop the total rises beside the row. On phone it drifts down below the counter.

The game still owns event filtering and ordering, counter writes, action row selection and look snapshots, phone tabs and pans, chip counts, lifted and tucked card geometry, dismissal sequencing, and the incident preview flip and slide. Use the existing scale, fade, flip and move verbs to stage these around the beams.
